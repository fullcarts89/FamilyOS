import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext } from './context';
import { materializeHousehold, materializeRoutine } from './scheduler';
import { purgeHouseholds, seedHousehold, seedRoutine, type SeededHousehold } from './testing';

// Gate G3: the scheduler creates each occurrence once, in the right household, with the right owner.
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 4 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Sunday 2026-11-08, 09:00 in Los Angeles.
const NOW = new Date('2026-11-08T17:00:00Z');
const at = (iso: string) => new Date(iso);

describe.skipIf(!db)('routine scheduler', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;

  const occurrences = async (ruleId: string) =>
    requireDb()
      .selectFrom('app.work_item')
      .select([
        'occurrence_index as index',
        'occurrence_on as date',
        'owner_member_id as owner',
        'due_at as dueAt',
        'due_on as dueOn',
        'status',
        'household_id as householdId',
      ])
      .where('recurrence_rule_id', '=', ruleId)
      .orderBy('occurrence_index')
      .execute();

  const run = (h: SeededHousehold, routineId: string, now = NOW) =>
    materializeRoutine(requireDb(), { householdId: h.id, routineId, now, requestId: 'test' });

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Sched A');
    b = await seedHousehold(requireDb(), 'Sched B');
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
    await db?.destroy();
  });

  it('creates today’s occurrence and the next one, once, however often it runs', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
      ownerMemberId: a.adult.id,
    });
    expect(await run(a, routineId)).toBe(2);
    expect(await run(a, routineId)).toBe(0);
    expect((await occurrences(ruleId)).map((o) => [o.index, o.date, o.owner])).toEqual([
      [0, '2026-11-08', a.adult.id],
      [1, '2026-11-09', a.adult.id],
    ]);
    // One audit row per occurrence, written by the system.
    const audits = await requireDb()
      .selectFrom('app.audit_event')
      .select(['actor_member_id', 'payload'])
      .where('household_id', '=', a.id)
      .where('action', '=', 'routine.occurrence_created')
      .execute();
    expect(audits).toHaveLength(2);
    expect(audits.every((e) => e.actor_member_id === null)).toBe(true);
  });

  it('backfills missed days honestly after downtime, and leaves them open', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
    });
    await run(a, routineId);
    // The worker was down for three days.
    await run(a, routineId, at('2026-11-12T17:00:00Z'));
    const rows = await occurrences(ruleId);
    expect(rows.map((o) => o.date)).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(rows.every((o) => o.status === 'ready')).toBe(true);
  });

  it('turns a local time into the right instant, through DST', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'weekly', interval: 1, weekdays: [7] },
      startOn: '2027-03-07',
      time: '02:30',
    });
    await run(a, routineId, at('2027-03-07T17:00:00Z'));
    const rows = await occurrences(ruleId);
    // 07 Mar is still PST (-08:00); 14 Mar is spring-forward day, so 02:30 becomes 03:30 PDT.
    expect(rows.map((o) => [o.date, new Date(o.dueAt ?? '').toISOString(), o.dueOn])).toEqual([
      ['2027-03-07', '2027-03-07T10:30:00.000Z', null],
      ['2027-03-14', '2027-03-14T10:30:00.000Z', null],
    ]);
  });

  it('never creates a skipped occurrence, and brings the one after it into view', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'weekly', interval: 1, weekdays: [7] },
      startOn: '2026-11-08',
    });
    await requireDb()
      .insertInto('app.occurrence_exception')
      .values({
        household_id: a.id,
        recurrence_rule_id: ruleId,
        occurrence_index: 1,
        kind: 'skip',
        reason: 'member',
      })
      .execute();
    await run(a, routineId);
    expect((await occurrences(ruleId)).map((o) => [o.index, o.date])).toEqual([
      [0, '2026-11-08'],
      [2, '2026-11-22'],
    ]);
  });

  it('rotates owners and leaves a removed member’s turn unassigned', async () => {
    const extra = await requireDb()
      .insertInto('app.member')
      .values({
        household_id: a.id,
        user_id: randomUUID(),
        display_name: 'Leaving',
        role: 'adult',
        status: 'removed',
        removed_at: NOW,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-06',
      generateFrom: '2026-11-06',
      rotation: [a.owner.id, a.adult.id, extra.id],
    });
    await run(a, routineId);
    expect((await occurrences(ruleId)).map((o) => o.owner)).toEqual([
      a.owner.id,
      a.adult.id,
      null,
      a.owner.id,
    ]);
  });

  it('schedules after-completion routines from the day the last one closed', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'after_completion', intervalDays: 3 },
      startOn: '2026-11-08',
    });
    await run(a, routineId);
    await run(a, routineId);
    expect((await occurrences(ruleId)).map((o) => [o.index, o.date])).toEqual([[0, '2026-11-08']]);

    // Done on 10 Nov (local), early in the UTC day.
    await requireDb()
      .updateTable('app.work_item')
      .set({ status: 'verified_complete', completed_at: at('2026-11-11T05:00:00Z') })
      .where('recurrence_rule_id', '=', ruleId)
      .execute();
    await run(a, routineId, at('2026-11-11T06:00:00Z'));
    expect((await occurrences(ruleId)).map((o) => [o.index, o.date, o.status])).toEqual([
      [0, '2026-11-08', 'verified_complete'],
      [1, '2026-11-13', 'ready'],
    ]);
  });

  it('does nothing for paused or ended routines', async () => {
    const paused = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
    });
    await requireDb()
      .updateTable('app.recurrence_rule')
      .set({ paused_at: NOW })
      .where('id', '=', paused.ruleId)
      .execute();
    expect(await run(a, paused.routineId)).toBe(0);

    const ended = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
    });
    await requireDb()
      .updateTable('app.work_item')
      .set({ status: 'cancelled' })
      .where('id', '=', ended.routineId)
      .execute();
    expect(await run(a, ended.routineId)).toBe(0);
  });

  it('only touches the household it is asked about', async () => {
    const inA = await seedRoutine(requireDb(), a, {
      rule: { freq: 'weekly', interval: 1, weekdays: [1] },
      startOn: '2026-11-08',
    });
    const inB = await seedRoutine(requireDb(), b, {
      rule: { freq: 'weekly', interval: 1, weekdays: [1] },
      startOn: '2026-11-08',
    });
    // Asking household B to run A's routine finds nothing.
    expect(await run(b, inA.routineId)).toBe(0);
    await materializeHousehold(requireDb(), { householdId: b.id, now: NOW, requestId: 'test' });
    expect(await occurrences(inA.ruleId)).toHaveLength(0);
    const rowsB = await occurrences(inB.ruleId);
    expect(rowsB).toHaveLength(1);
    expect(rowsB.every((o) => o.householdId === b.id)).toBe(true);
  });

  it('keeps a private routine’s schedule private under row-level security', async () => {
    const { routineId, ruleId } = await seedRoutine(requireDb(), a, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
      visibility: 'private',
    });
    await run(a, routineId);
    await requireDb()
      .insertInto('app.occurrence_exception')
      .values({
        household_id: a.id,
        recurrence_rule_id: ruleId,
        occurrence_index: 5,
        kind: 'skip',
        reason: 'member',
      })
      .execute();
    const seen = (member: SeededHousehold['owner']) =>
      withRequestContext(
        requireDb(),
        { userId: member.userId ?? '', householdId: a.id, memberId: member.id },
        async (trx) => ({
          rules: (
            await trx
              .selectFrom('app.recurrence_rule')
              .select('id')
              .where('id', '=', ruleId)
              .execute()
          ).length,
          exceptions: (
            await trx
              .selectFrom('app.occurrence_exception')
              .select('id')
              .where('recurrence_rule_id', '=', ruleId)
              .execute()
          ).length,
          occurrences: (
            await trx
              .selectFrom('app.work_item')
              .select('id')
              .where('recurrence_rule_id', '=', ruleId)
              .execute()
          ).length,
        }),
      );
    // The owner seeded it, so the owner sees it; the other adult sees none of it.
    expect(await seen(a.owner)).toEqual({ rules: 1, exceptions: 1, occurrences: 2 });
    expect(await seen(a.adult)).toEqual({ rules: 0, exceptions: 0, occurrences: 0 });
  });
});
