// Encrypted logical backup of FamilyOS data (plan M4, gate G4). This is the second, independent
// copy beside the host's daily backups, and the file the restore drill proves can be restored.
//
//   BACKUP_DATABASE_URL=postgresql://... BACKUP_PUBLIC_KEY=key.asc node scripts/ops/backup.mjs DIR
//
// Writes DIR/familyos-<UTC timestamp>.tar.gpg containing:
//   data.dump      pg_dump custom format, data only: schema `app` plus auth.users/identities
//   manifest.json  migration versions, and row count and checksum per table
// The dump and the manifest come from one snapshot, so the checksums match the dump exactly.
// Plaintext never leaves a private temporary directory; only the GPG public key is needed here.
//
// PG_DUMP may name another command (for example `docker exec -i supabase_db_familyos pg_dump`)
// with PG_DUMP_DATABASE_URL as the address that command sees.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// Recreated by migrations, so restoring their rows would conflict.
export const SKIPPED_TABLES = ['app.schema_info', 'app.service_heartbeat'];
export const AUTH_TABLES = ['auth.users', 'auth.identities'];

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Runs a command; stdout goes to `stdout` (a file path) if given. Rejects on a non-zero exit. */
export function run(command, args, { stdout, stdin, envExtra } = {}) {
  return new Promise((resolve, reject) => {
    const [bin, ...prefix] = command.split(' ').filter(Boolean);
    const child = spawn(bin, [...prefix, ...args], {
      stdio: [stdin ? 'pipe' : 'ignore', stdout ? 'pipe' : 'inherit', 'inherit'],
      env: { ...process.env, ...envExtra },
    });
    if (stdout) child.stdout.pipe(createWriteStream(stdout, { mode: 0o600 }));
    if (stdin) stdin.pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited with code ${code}`)),
    );
  });
}

/** Row count and an order-independent checksum of every row, per table, in the current snapshot. */
export async function tableChecksums(client, tables) {
  await client.query(`set local timezone = 'UTC'`);
  const result = {};
  for (const table of tables) {
    const { rows } = await client.query(
      `select count(*)::int as rows, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as md5
       from ${table} t`,
    );
    result[table] = rows[0];
  }
  return result;
}

export async function appTables(client) {
  const { rows } = await client.query(
    `select format('%I.%I', schemaname, tablename) as name from pg_tables
     where schemaname = 'app' order by tablename`,
  );
  return rows.map((r) => r.name).filter((name) => !SKIPPED_TABLES.includes(name));
}

export async function migrationVersions(client) {
  // A project that has never been migrated has no history table yet (the first run of
  // *Migrate production* backs up before `supabase db push` creates it).
  const { rows: found } = await client.query(
    `select to_regclass('supabase_migrations.schema_migrations') is not null as present`,
  );
  if (!found[0].present) return [];
  const { rows } = await client.query(
    'select version from supabase_migrations.schema_migrations order by version',
  );
  return rows.map((r) => r.version);
}

async function main() {
  const databaseUrl = env('BACKUP_DATABASE_URL');
  const publicKey = env('BACKUP_PUBLIC_KEY');
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage: backup.mjs OUTPUT_DIR');
  const pgDump = process.env.PG_DUMP ?? 'pg_dump';
  const dumpUrl = process.env.PG_DUMP_DATABASE_URL ?? databaseUrl;

  const work = await mkdtemp(join(tmpdir(), 'familyos-backup-'));
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const { rows } = await client.query('select pg_export_snapshot() as id');
    const tables = await appTables(client);

    await run(
      pgDump,
      [
        '--data-only',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--snapshot=${rows[0].id}`,
        ...[...tables, ...AUTH_TABLES].map((t) => `--table=${t}`),
        dumpUrl,
      ],
      { stdout: join(work, 'data.dump') },
    );

    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      migrations: await migrationVersions(client),
      tables: await tableChecksums(client, [...tables, ...AUTH_TABLES]),
    };
    await client.query('commit');
    await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });

    const stamp = manifest.createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const target = join(outDir, `familyos-${stamp}.tar.gpg`);
    const tar = spawn('tar', ['-C', work, '-cf', '-', 'data.dump', 'manifest.json'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await run(
      'gpg',
      [
        '--batch',
        '--yes',
        '--quiet',
        '--trust-model',
        'always',
        '--recipient-file',
        publicKey,
        '--encrypt',
        '--output',
        target,
      ],
      { stdin: tar.stdout },
    );
    const counts = Object.entries(manifest.tables)
      .map(([table, { rows: n }]) => `${table}=${n}`)
      .join(' ');
    console.log(`backup written: ${target}`);
    console.log(`rows: ${counts}`);
  } finally {
    await client.end();
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`backup failed: ${error.message}`);
    process.exit(1);
  });
}
