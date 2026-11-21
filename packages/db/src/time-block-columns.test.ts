import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withNotifierContext, withRequestContext, withSchedulerContext } from './context';
import { materializeRoutine } from './scheduler';
import { purgeHouseholds, seedHousehold, seedRoutine, type SeededHousehold } from './testing';

// Time blocks (20261121000500): a task's length needs its time, a routine's length needs its
// time of day, and clearing a task's time (as the previous release does) clears its length.
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 4 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

const asMember = (h: SeededHousehold, member: SeededHousehold['owner']) => ({
  userId: member.userId ?? randomUUID(),
  householdId: h.id,
  memberId: member.id,
});

describe.skipIf(!db)('time block columns', () => {
  let h: SeededHousehold;

  const task = (values: { due_at?: string | null; due_on?: string | null; duration?: number }) =>
    requireDb()
      .insertInto('app.work_item')
      .values({
        household_id: h.id,
        title: 'Walk the dog',
        created_by_member_id: h.owner.id,
        owner_member_id: h.owner.id,
        due_at: values.due_at ?? null,
        due_on: values.due_on ?? null,
        ...(values.duration !== undefined && { duration_minutes: values.duration }),
      })
      .returning(['id', 'duration_minutes'])
      .executeTakeFirstOrThrow();

  const lengthOf = async (id: string) =>
    (
      await requireDb()
        .selectFrom('app.work_item')
        .select(['duration_minutes', 'due_at', 'due_on'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).duration_minutes;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Time Blocks');
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('leaves existing tasks without a length', async () => {
    const plain = await task({ due_at: '2026-11-21T01:30:00Z' });
    expect(plain.duration_minutes).toBeNull();
  });

  it('refuses a length without a time', async () => {
    await expect(task({ duration: 30 })).rejects.toThrow(/work_item_duration_with_time/);
    await expect(task({ due_on: '2026-11-21', duration: 30 })).rejects.toThrow(
      /work_item_duration_with_time/,
    );
  });

  it('keeps a length between 5 minutes and 12 hours', async () => {
    const at = '2026-11-21T01:30:00Z';
    await expect(task({ due_at: at, duration: 4 })).rejects.toThrow(/work_item_duration_range/);
    await expect(task({ due_at: at, duration: 721 })).rejects.toThrow(/work_item_duration_range/);
    expect((await task({ due_at: at, duration: 5 })).duration_minutes).toBe(5);
    expect((await task({ due_at: at, duration: 720 })).duration_minutes).toBe(720);
  });

  it('refuses a length on a task whose time is already gone', async () => {
    const allDay = await task({ due_on: '2026-11-21' });
    await expect(
      requireDb()
        .updateTable('app.work_item')
        .set({ duration_minutes: 30 })
        .where('id', '=', allDay.id)
        .execute(),
    ).rejects.toThrow(/work_item_duration_with_time/);
  });

  it('clears the length when the time is cleared, as the previous release does it', async () => {
    // The previous release moves a timed task to a day with due_on set and due_at null, and
    // knows nothing of the length: as the API role, under row-level security.
    const walk = await task({ due_at: '2026-11-21T01:30:00Z', duration: 30 });
    await withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
      trx
        .updateTable('app.work_item')
        .set({ due_on: '2026-11-22', due_at: null, version: sql`version + 1` })
        .where('id', '=', walk.id)
        .execute(),
    );
    expect(await lengthOf(walk.id)).toBeNull();
    // "No date" (both cleared) too.
    const run = await task({ due_at: '2026-11-21T01:30:00Z', duration: 45 });
    await requireDb()
      .updateTable('app.work_item')
      .set({ due_on: null, due_at: null })
      .where('id', '=', run.id)
      .execute();
    expect(await lengthOf(run.id)).toBeNull();
  });

  it('keeps the length when the time moves, and refuses a new length with no time', async () => {
    const walk = await task({ due_at: '2026-11-21T01:30:00Z', duration: 30 });
    await requireDb()
      .updateTable('app.work_item')
      .set({ due_at: '2026-11-22T01:30:00Z' })
      .where('id', '=', walk.id)
      .execute();
    expect(await lengthOf(walk.id)).toBe(30);
    await expect(
      requireDb()
        .updateTable('app.work_item')
        .set({ due_at: null, duration_minutes: 60 })
        .where('id', '=', walk.id)
        .execute(),
    ).rejects.toThrow(/work_item_duration_with_time/);
  });

  it('gives a routine a length only with a time of day, and its turns carry it', async () => {
    await expect(
      seedRoutine(requireDb(), h, {
        rule: { freq: 'daily', interval: 1 },
        startOn: '2026-11-21',
        durationMinutes: 30,
      }),
    ).rejects.toThrow(/recurrence_rule_duration_with_time/);
    await expect(
      seedRoutine(requireDb(), h, {
        rule: { freq: 'daily', interval: 1 },
        startOn: '2026-11-21',
        time: '17:30',
        durationMinutes: 721,
      }),
    ).rejects.toThrow(/recurrence_rule_duration_range/);

    // The worker's own role (table-wide grants) creates the turns with the length.
    const { routineId, ruleId } = await seedRoutine(requireDb(), h, {
      title: 'Evening walk',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-21',
      time: '17:30',
      durationMinutes: 30,
      ownerMemberId: h.owner.id,
    });
    const created = await withSchedulerContext(requireDb(), h.id, (trx) =>
      materializeRoutine(trx, {
        householdId: h.id,
        routineId,
        now: new Date('2026-11-21T17:00:00Z'),
        requestId: 'test',
      }),
    );
    expect(created).toBe(2);
    const turns = await requireDb()
      .selectFrom('app.work_item')
      .select(['due_at', 'duration_minutes'])
      .where('recurrence_rule_id', '=', ruleId)
      .orderBy('occurrence_index')
      .execute();
    expect(turns.map((t) => [new Date(t.due_at ?? 0).toISOString(), t.duration_minutes])).toEqual([
      ['2026-11-22T01:30:00.000Z', 30],
      ['2026-11-23T01:30:00.000Z', 30],
    ]);
  });

  it('lets the notifier read a task’s length (and still not its description)', async () => {
    const walk = await task({ due_at: '2026-11-21T01:30:00Z', duration: 30 });
    const rows = await withNotifierContext(requireDb(), h.id, (trx) =>
      trx
        .selectFrom('app.work_item')
        .select(['id', 'duration_minutes'])
        .where('id', '=', walk.id)
        .execute(),
    );
    expect(rows).toEqual([{ id: walk.id, duration_minutes: 30 }]);
    await expect(
      withNotifierContext(requireDb(), h.id, (trx) =>
        trx.selectFrom('app.work_item').select('description').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
