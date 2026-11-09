import { createDb } from '@familyos/db';
import { purgeHouseholds, seedHousehold, seedRoutine } from '@familyos/db/testing';
import type { JobHelpers } from 'graphile-worker';
import { describe, expect, it, vi } from 'vitest';
import { heartbeat } from './heartbeat';
import { CRONTAB, createTaskList } from './index';
import { materializeRoutines } from './materialize-routines';

const helpersWith = (info = vi.fn(), error = vi.fn()) =>
  ({ logger: { info, error }, job: { id: '42' } }) as unknown as JobHelpers;

describe('worker tasks', () => {
  it('registers heartbeat and the hourly routine scheduler', () => {
    const db = createDb({ connectionString: 'postgresql://unused@127.0.0.1:1/unused' });
    expect(Object.keys(createTaskList(db))).toEqual(['heartbeat', 'materialize_routines']);
    expect(CRONTAB).toMatch(/^\d+ \* \* \* \* materialize_routines$/);
  });

  it('runs heartbeat without touching its payload', async () => {
    const info = vi.fn();
    await heartbeat({ ignored: true }, helpersWith(info));
    expect(info).toHaveBeenCalledWith('heartbeat');
  });
});

const url = process.env.DATABASE_URL;

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
