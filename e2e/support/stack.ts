import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  API_PORT,
  API_URL,
  BASE_URL,
  CACHE_DIR,
  DATABASE_URL,
  E2E_EMAIL_DOMAIN,
  E2E_EMAIL_PREFIX,
  ROOT,
  SUPABASE_URL,
  TIME_ZONE,
  WEB_DIST_DIR,
  stackKeys,
} from './env';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** The suite resets and creates data: it only ever runs against a stack on this machine. */
export function assertLocalStack(): void {
  for (const [name, value] of [
    ['DATABASE_URL', DATABASE_URL],
    ['SUPABASE_URL', SUPABASE_URL],
  ] as const) {
    if (!LOCAL_HOSTS.has(new URL(value).hostname)) {
      throw new Error(`${name} is not on this machine; E2E only runs against a local stack.`);
    }
  }
}

/** Fails early, with the fix, when the local Supabase stack isn't up. */
export async function assertStackRunning(): Promise<void> {
  const health = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: stackKeys().publishableKey },
  }).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `Supabase Auth isn't answering at ${SUPABASE_URL}. Start the local stack: pnpm stack:up`,
    );
  }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query('select 1 from app.household limit 1');
  } catch {
    throw new Error(
      `The database at ${DATABASE_URL} isn't reachable or has no migrations. Run pnpm stack:up.`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function serverEnv(): NodeJS.ProcessEnv {
  const { secretKey } = stackKeys();
  return {
    ...process.env,
    DATABASE_URL,
    SUPABASE_URL,
    SUPABASE_SECRET_KEY: secretKey,
  };
}

/** Runs a command to completion, with its output kept for the error if it fails. */
function run(cmd: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return new Promise<void>((done, fail) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${cmd} ${args.join(' ')} failed (${code}):\n${out}`)),
    );
  });
}

const tsx = resolve(ROOT, 'node_modules/.bin/tsx');

/**
 * `pnpm demo:seed`: replaces the Rivera household (and only it) with a fresh copy, relative to
 * today. Idempotent: it purges the previous demo household by name and Maya's or Theo's account.
 */
export async function seedDemo(): Promise<void> {
  await run(process.execPath, [tsx, 'src/cli/seed-demo.ts'], {
    cwd: resolve(ROOT, 'apps/api'),
    env: serverEnv(),
  });
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function admin(method: string, path: string, body?: unknown) {
  const { secretKey } = stackKeys();
  return fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

/** A unique address for an account this run creates (removed by `removeE2eAccounts`). */
export function e2eEmail(label: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${E2E_EMAIL_PREFIX}${label}-${stamp}@${E2E_EMAIL_DOMAIN}`;
}

/** Creates a confirmed account with this password, as the household bootstrap does. */
export async function createAccount(email: string, password: string): Promise<string> {
  const res = await admin('POST', '/users', { email, password, email_confirm: true });
  const body = (await res.json()) as { id?: string };
  if (!res.ok || !body.id) throw new Error(`couldn't create ${email}: ${res.status}`);
  return body.id;
}

/**
 * A second household with one owner, the way `household:bootstrap` creates one, for the
 * isolation journey. Removed with `removeE2eAccounts`.
 */
export async function createHousehold(opts: {
  name: string;
  ownerUserId: string;
  ownerName: string;
}): Promise<{ householdId: string; memberId: string }> {
  return withDb(async (db) => {
    await db.query('begin');
    try {
      const h = await db.query<{ id: string }>(
        'insert into app.household (name, timezone) values ($1, $2) returning id',
        [opts.name, TIME_ZONE],
      );
      const householdId = h.rows[0]?.id ?? '';
      const m = await db.query<{ id: string }>(
        `insert into app.member (household_id, user_id, display_name, role, color)
         values ($1, $2, $3, 'owner', '#2E8A86') returning id`,
        [householdId, opts.ownerUserId, opts.ownerName],
      );
      // A child too, so the owner isn't alone (which would start the first-time setup).
      await db.query(
        `insert into app.member (household_id, user_id, display_name, role, color)
         values ($1, null, 'Ada', 'child', '#8A5A9E')`,
        [householdId],
      );
      await db.query(
        `insert into app.work_item (household_id, type, title, status, owner_member_id, created_by_member_id)
         values ($1, 'task', 'Water the fern', 'ready', $2, $2)`,
        [householdId, m.rows[0]?.id],
      );
      await db.query('commit');
      return { householdId, memberId: m.rows[0]?.id ?? '' };
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  });
}

/**
 * A new, empty household and the one-time link for its first owner, exactly as the operator's
 * `household:invite-owner` makes them (app.create_household_with_owner_invite, the token's
 * SHA-256 stored). Returns the link's path. Removed with `removeE2eAccounts` once claimed.
 */
export async function createOwnerInvite(opts: { name: string; email: string }): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest();
  await withDb((db) =>
    db.query('select app.create_household_with_owner_invite($1, $2, $3, $4, $5)', [
      opts.name,
      TIME_ZONE,
      opts.email.toLowerCase(),
      hash,
      new Date(Date.now() + 48 * 3600 * 1000),
    ]),
  );
  return `/invite?token=${encodeURIComponent(token)}`;
}

/**
 * Removes every household an `e2e-…@familyos.test` account belongs to (never the demo household
 * unless one joined it; the demo seed recreates that), then those accounts.
 */
export async function removeE2eAccounts(): Promise<void> {
  const pattern = `${E2E_EMAIL_PREFIX}%@${E2E_EMAIL_DOMAIN}`;
  const users = await withDb(async (db) => {
    const households = await db.query<{ household_id: string }>(
      `select distinct m.household_id from app.member m join auth.users u on u.id = m.user_id
       where u.email like $1`,
      [pattern],
    );
    for (const { household_id } of households.rows) {
      await db.query('select app.purge_household($1::uuid)', [household_id]);
    }
    return (
      await db.query<{ id: string }>('select id from auth.users where email like $1', [pattern])
    ).rows;
  });
  for (const { id } of users) {
    const res = await admin('DELETE', `/users/${id}`);
    if (!res.ok && res.status !== 404)
      throw new Error(`couldn't remove an E2E account: ${res.status}`);
  }
}

/** Builds the web app the way production does (deploy/api.Dockerfile): same-origin /api. */
export async function buildWeb(): Promise<void> {
  if (process.env.E2E_SKIP_BUILD === '1' && existsSync(resolve(WEB_DIST_DIR, 'index.html'))) return;
  rmSync(WEB_DIST_DIR, { recursive: true, force: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  const { publishableKey } = stackKeys();
  await run(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/.bin/expo'),
      'export',
      '--platform',
      'web',
      '--output-dir',
      WEB_DIST_DIR,
    ],
    {
      cwd: resolve(ROOT, 'apps/mobile'),
      env: {
        ...process.env,
        CI: '1',
        EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        EXPO_PUBLIC_API_URL: '/api',
      },
    },
  );
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((answer) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      answer(true);
    });
    socket.once('error', () => answer(false));
  });
}

async function waitForHealth(child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the API exited (${child.exitCode}); see ${LOG}`);
    const ok = await fetch(`${API_URL}/health/ready`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the API didn't become ready on ${BASE_URL}; see ${LOG}`);
}

const LOG = resolve(CACHE_DIR, 'api.log');

/**
 * Starts the API serving the web export beside it under /api, like production (apps/api/src/web.ts).
 * Returns a stop function that stops only the process group started here.
 */
export async function startServer(): Promise<() => Promise<void>> {
  if (await portInUse(API_PORT)) {
    // Opt-in for quick local loops: use a server you started yourself (and leave it running).
    if (process.env.E2E_REUSE_SERVER === '1') {
      const ok = await fetch(`${API_URL}/health`)
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) return async () => undefined;
    }
    throw new Error(
      `Port ${API_PORT} is already in use. Stop whatever is listening there, or set E2E_PORT.`,
    );
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const log = createWriteStream(LOG);
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const child = spawn(process.execPath, [tsx, 'src/server.ts'], {
    cwd: resolve(ROOT, 'apps/api'),
    env: {
      ...serverEnv(),
      API_PORT: String(API_PORT),
      SUPABASE_JWKS_URL: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      CALENDAR_ENCRYPTION_KEY: key,
      WEB_DIST_DIR,
      INVITE_LINK_BASE: `${BASE_URL}/invite`,
      CORS_ORIGINS: '',
    },
    // Its own process group, so stopping it also stops tsx's child and nothing else.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  await waitForHealth(child, 60_000);

  return async () => {
    if (child.exitCode !== null || child.pid === undefined) return;
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    process.kill(-child.pid, 'SIGTERM');
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
    }, 5000);
    await exited;
    clearTimeout(timer);
    log.end();
  };
}
