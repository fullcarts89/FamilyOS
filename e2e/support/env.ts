import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, e2e folder and where generated files go (all gitignored). */
export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(E2E_DIR, '..');
export const CACHE_DIR = resolve(E2E_DIR, '.cache');
export const WEB_DIST_DIR = resolve(CACHE_DIR, 'web-dist');
export const ARTIFACTS_DIR = resolve(E2E_DIR, 'artifacts');
export const VIDEO_DIR = resolve(CACHE_DIR, 'videos');

/** The local stack runs on 553xx (supabase/config.toml); the E2E server on 8799. */
export const API_PORT = Number(process.env.E2E_PORT ?? 8799);
export const BASE_URL = `http://127.0.0.1:${API_PORT}`;
export const API_URL = `${BASE_URL}/api`;
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
/** The local stack's Mailpit (supabase/config.toml [local_smtp]): every email Auth sends. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55324';

/** Synthetic demo family from `pnpm demo:seed` (apps/api/src/cli/seed-demo.ts). */
export const DEMO_PASSWORD = 'familyos-demo-1';
export const MAYA = { email: 'maya@familyos.test', name: 'Maya' } as const;
export const THEO = { email: 'theo@familyos.test', name: 'Theo' } as const;
export const DEMO_HOUSEHOLD = 'The Rivera household';
export const TIME_ZONE = 'America/Los_Angeles';
/** Accounts the suite creates itself: removed before and after each run. */
export const E2E_EMAIL_PREFIX = 'e2e-';
export const E2E_EMAIL_DOMAIN = 'familyos.test';

export const RECORD = process.env.E2E_RECORD === '1';

/** Values from the repository's `.env` (gitignored), if there is one. */
function dotenv(): Record<string, string> {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2]) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** `supabase status -o json`, as CI reads it, when the CLI is installed. */
function supabaseStatus(): Record<string, string> {
  try {
    return JSON.parse(
      execFileSync('supabase', ['status', '-o', 'json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

let cached: { secretKey: string; publishableKey: string } | null = null;

/**
 * The local stack's keys: from the environment, else the repository's `.env`, else
 * `supabase status`. Never committed: they differ per machine and the secret key is server-only.
 */
export function stackKeys(): { secretKey: string; publishableKey: string } {
  if (cached) return cached;
  const file = dotenv();
  let secretKey = process.env.SUPABASE_SECRET_KEY ?? file.SUPABASE_SECRET_KEY;
  let publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    file.SUPABASE_PUBLISHABLE_KEY ??
    file.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    const status = supabaseStatus();
    secretKey ??= status.SECRET_KEY;
    publishableKey ??= status.PUBLISHABLE_KEY;
  }
  if (!secretKey || !publishableKey) {
    throw new Error(
      'E2E needs the local stack keys: set SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY ' +
        '(from `supabase status`), or put them in .env. See e2e/README.md.',
    );
  }
  cached = { secretKey, publishableKey };
  return cached;
}
