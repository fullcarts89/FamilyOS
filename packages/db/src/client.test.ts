import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './client';

// Runs against the local Supabase database when DATABASE_URL is set (CI's db job does this).
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 2 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

describe.skipIf(!db)('database baseline', () => {
  afterAll(async () => {
    await db?.destroy();
  });

  it('has applied the baseline migration', async () => {
    const row = await requireDb()
      .selectFrom('app.schema_info')
      .select('value')
      .where('key', '=', 'baseline')
      .executeTakeFirst();
    expect(row?.value).toBe('m0');
  });

  it('returns calendar dates as YYYY-MM-DD strings, not shifted Date objects', async () => {
    const { rows } = await sql<{ d: unknown }>`select date '2026-11-10' as d`.execute(requireDb());
    expect(rows[0]?.d).toBe('2026-11-10');
  });

  it('gives anon and authenticated no access to schema app', async () => {
    const { rows } = await sql<{ role: string; usage: boolean }>`
      select r.rolname as role, has_schema_privilege(r.rolname, 'app', 'USAGE') as usage
      from pg_roles r
      where r.rolname in ('anon', 'authenticated')
      order by 1
    `.execute(requireDb());
    expect(rows).toEqual([
      { role: 'anon', usage: false },
      { role: 'authenticated', usage: false },
    ]);
  });
});
