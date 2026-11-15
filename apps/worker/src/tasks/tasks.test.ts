import { createDb, workerLastSeen } from '@familyos/db';
import { enableLogin, purgeHouseholds, seedHousehold, seedRoutine } from '@familyos/db/testing';
import { runMigrations, type JobHelpers } from 'graphile-worker';
import { sql } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import { heartbeat } from './heartbeat';
import { CRONTAB, createTaskList } from './index';
import { materializeRoutines } from './materialize-routines';

const helpersWith = (info = vi.fn(), error = vi.fn()) =>
  ({ logger: { info, error }, job: { id: '42' } }) as unknown as JobHelpers;

describe('worker tasks', () => {
  it('registers the heartbeat, the hourly routine scheduler, calendar sync and notifications', () => {
    const db = createDb({ connectionString: 'postgresql://unused@127.0.0.1:1/unused' });
    expect(Object.keys(createTaskList(db))).toEqual([
      'heartbeat',
      'materialize_routines',
      'sync_calendars',
      'send_notifications',
    ]);
    expect(CRONTAB.split('\n')).toEqual([
      '*/10 * * * * heartbeat',
      expect.stringMatching(/^\d+ \* \* \* \* materialize_routines$/),
      '*/15 * * * * sync_calendars',
      '*/5 * * * * send_notifications',
    ]);
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('worker login', () => {
  it('can install the job queue schema on a fresh database', async () => {
    const admin = createDb({ connectionString: url ?? '', maxConnections: 1 });
    const login = await enableLogin(url ?? '', 'familyos_worker_login');
    const asWorker = createDb({ connectionString: login.url, maxConnections: 1 });
    const schema = 'graphile_worker_login_test';
    try {
      await runMigrations({ connectionString: login.url, schema });
      const { rows } = await sql<{ owner: string }>`
        select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = ${schema}
      `.execute(admin);
      expect(rows).toEqual([{ owner: 'familyos_worker_login' }]);
    } finally {
      await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(asWorker);
      await asWorker.destroy();
      await login.disable();
      await admin.destroy();
    }
  });
});

describe.skipIf(!url)('heartbeat', () => {
  it('records when the worker last ran, which the API can read', async () => {
    const db = createDb({ connectionString: url ?? '', maxConnections: 2 });
    try {
      const seenAt = new Date('2026-11-08T17:00:00Z');
      const info = vi.fn();
      await heartbeat(db, () => seenAt)({ ignored: true }, helpersWith(info));
      expect(info).toHaveBeenCalledWith('heartbeat');
      expect(await workerLastSeen(db)).toEqual(seenAt);
    } finally {
      await db.destroy();
    }
  });
});

describe.skipIf(!url)('materialize_routines', () => {
  it('creates due occurrences in every household and logs counts only', async () => {
    const db = createDb({ connectionString: url ?? '', maxConnections: 2 });
    const a = await seedHousehold(db, 'Worker A');
    const b = await seedHousehold(db, 'Worker B');
    try {
      for (const h of [a, b]) {
        await seedRoutine(db, h, {
          title: 'Private-sounding chore title',
          rule: { freq: 'daily', interval: 1 },
          startOn: '2026-11-08',
        });
      }
      const info = vi.fn();
      // Scoped to this test's households: other suites share the database.
      const task = materializeRoutines(db, {
        now: () => new Date('2026-11-08T17:00:00Z'),
        households: async () => [{ id: a.id }, { id: b.id }],
      });
      await task({}, helpersWith(info));
      await task({}, helpersWith(info));

      const created = await db
        .selectFrom('app.work_item')
        .select(['household_id'])
        .where('household_id', 'in', [a.id, b.id])
        .where('recurrence_rule_id', 'is not', null)
        .execute();
      expect(created.filter((r) => r.household_id === a.id)).toHaveLength(2);
      expect(created.filter((r) => r.household_id === b.id)).toHaveLength(2);
      expect(JSON.stringify(info.mock.calls)).not.toContain('Private-sounding');
      expect(info.mock.calls.at(-1)?.[1]).toMatchObject({ failed: 0 });
    } finally {
      await purgeHouseholds(db, [a.id, b.id]);
      await db.destroy();
    }
  });
});
