// Restores a backup made by backup.mjs and proves it is identical (plan M4, gate G4).
//
//   RESTORE_DATABASE_URL=postgresql://... node scripts/ops/restore.mjs familyos-<stamp>.tar.gpg
//
// The target must be a freshly migrated database at the same migration versions with no household
// data. RESTORE_DATABASE_URL needs a superuser (pg_restore --disable-triggers), which is why this
// refuses anything but a local database unless RESTORE_ALLOW_REMOTE=yes. Decrypting uses the
// private key in your GPG keyring; plaintext stays in a private temporary directory.
//
// PG_RESTORE may name another command, with PG_RESTORE_DATABASE_URL as the address it sees.
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { migrationVersions, run, tableChecksums } from './backup.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

async function main() {
  const databaseUrl = process.env.RESTORE_DATABASE_URL;
  if (!databaseUrl) throw new Error('RESTORE_DATABASE_URL is not set');
  const file = process.argv[2];
  if (!file) throw new Error('usage: restore.mjs BACKUP_FILE');
  if (
    !LOCAL_HOSTS.has(new URL(databaseUrl).hostname) &&
    process.env.RESTORE_ALLOW_REMOTE !== 'yes'
  ) {
    throw new Error('refusing to restore into a non-local database (set RESTORE_ALLOW_REMOTE=yes)');
  }
  const pgRestore = process.env.PG_RESTORE ?? 'pg_restore';
  const restoreUrl = process.env.PG_RESTORE_DATABASE_URL ?? databaseUrl;

  const work = await mkdtemp(join(tmpdir(), 'familyos-restore-'));
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    const gpg = spawn('gpg', ['--batch', '--quiet', '--decrypt', file], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const decrypted = new Promise((resolve, reject) =>
      gpg.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('gpg could not decrypt the backup')),
      ),
    );
    await run('tar', ['-C', work, '-xf', '-'], { stdin: gpg.stdout });
    await decrypted;
    const manifest = JSON.parse(await readFile(join(work, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1) throw new Error(`unknown backup format ${manifest.format}`);

    await client.connect();
    const target = await migrationVersions(client);
    if (target.join() !== manifest.migrations.join()) {
      throw new Error(
        `migration mismatch: backup has ${manifest.migrations.at(-1)}, target has ${target.at(-1)}; ` +
          'check out the matching commit and reset the target first',
      );
    }
    const { rows } = await client.query('select count(*)::int as n from app.household');
    if (rows[0].n > 0)
      throw new Error('target already has household data; restore into an empty database');

    await run(
      pgRestore,
      [
        '--data-only',
        '--single-transaction',
        '--exit-on-error',
        '--disable-triggers',
        '--dbname',
        restoreUrl,
      ],
      { stdin: createReadStream(join(work, 'data.dump')) },
    );

    await client.query('begin isolation level repeatable read read only');
    const restored = await tableChecksums(client, Object.keys(manifest.tables));
    await client.query('commit');
    const mismatched = Object.keys(manifest.tables).filter(
      (t) =>
        restored[t].rows !== manifest.tables[t].rows || restored[t].md5 !== manifest.tables[t].md5,
    );
    if (mismatched.length > 0)
      throw new Error(`restored data differs in: ${mismatched.join(', ')}`);
    const total = Object.values(restored).reduce((sum, t) => sum + t.rows, 0);
    console.log(
      `restore verified: ${Object.keys(restored).length} tables, ${total} rows, checksums match ` +
        `(backup of ${manifest.createdAt}, migrations through ${manifest.migrations.at(-1)})`,
    );
  } finally {
    await client.end().catch(() => {});
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`restore failed: ${error.message}`);
  process.exit(1);
});
