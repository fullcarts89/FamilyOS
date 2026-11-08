import { createDb, materializeHousehold, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Gate G3 through the HTTP API: journeys J3 (HVAC filter) and J3b (trash rotation).
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Sunday 2026-11-08, 09:00 in Los Angeles (seeded households use America/Los_Angeles).
const NOW = new Date('2026-11-08T17:00:00Z');

interface Routine {
  id: string;
  version: number;
  ownerMemberId: string | null;
  rotation: string[];
  paused: boolean;
  ended: boolean;
  summary: string;
}

interface Upcoming {
  index: number;
  date: string;
  ownerMemberId: string | null;
  skipped: boolean;
  itemId: string | null;
  status: string | null;
}

interface Detail {
  routine: Routine;
  upcoming: Upcoming[];
  history: { id: string; status: string; occurrenceOn: string }[];
  fairness: { days: number; counts: { memberId: string | null; completed: number }[] };
}

interface Item {
  id: string;
  status: string;
  version: number;
  ownerMemberId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  occurrenceOn: string | null;
  completedByMemberId: string | null;
}

describe.skipIf(!db)('routines (G3)', () => {
  let clock = NOW;
  const { request, tokenFor } = db ? createTestApp({ db, now: () => clock }) : createTestApp();
  let h: SeededHousehold;
  let sam: string;
  let alex: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const base = () => `/households/${h.id}`;
  const json = async <T>(res: Response) => (await res.json()) as T;

  const create = async (body: Record<string, unknown>, token = sam) => {
    const res = await request(`${base()}/routines`, { method: 'POST', token, body });
    expect(res.status).toBe(201);
    return (await json<{ routine: Routine }>(res)).routine;
  };
  const detail = async (id: string) =>
    json<Detail>(await request(`${base()}/routines/${id}`, { token: sam }));
  const post = (path: string, body: unknown, token = sam) =>
    request(`${base()}/routines/${path}`, { method: 'POST', token, body });
  const rows = async (routineId: string) => {
    const rule = await requireDb()
      .selectFrom('app.recurrence_rule')
      .select('id')
      .where('routine_id', '=', routineId)
      .executeTakeFirstOrThrow();
    return requireDb()
      .selectFrom('app.work_item')
      .select([
        'id',
        'occurrence_index as index',
        'occurrence_on as date',
        'status',
        'owner_member_id as owner',
        'version',
      ])
      .where('recurrence_rule_id', '=', rule.id)
      .orderBy('occurrence_index')
      .execute();
  };

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Routines');
    sam = await tokenOf(h.owner);
    alex = await tokenOf(h.adult);
  });

  beforeEach(() => {
    clock = NOW;
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('J3: HVAC filter every 3 months on the 1st at 09:00', () => {
    it('skips one, takes a reassignment, rejects a stale edit, and flags a missed one', async () => {
      const routine = await create({
        title: 'Replace HVAC filter',
        rule: { freq: 'monthly', interval: 3, dayOfMonth: 1 },
        startOn: '2026-12-01',
        time: '09:00',
        ownerMemberId: h.owner.id,
      });
      expect(routine.summary).toBe('Every 3 months on the 1st at 09:00');

      const first = await rows(routine.id);
      expect(first.map((r) => [r.index, r.date, r.owner])).toEqual([[0, '2026-12-01', h.owner.id]]);
      const item = await json<{ item: Item }>(
        await request(`${base()}/work-items/${first[0]?.id}`, { token: sam }),
      );
      // 09:00 in Los Angeles on 1 Dec is 17:00 UTC.
      expect(new Date(item.item.dueAt ?? '').toISOString()).toBe('2026-12-01T17:00:00.000Z');

      // Skip writes an exception; the rule itself is untouched.
      const ruleBefore = await requireDb()
        .selectFrom('app.recurrence_rule')
        .select(['rule', 'start_on', 'local_time', 'generate_from', 'rotation'])
        .where('routine_id', '=', routine.id)
        .executeTakeFirstOrThrow();
      const skipped = await post(`${routine.id}/occurrences/0/skip`, {
        expectedVersion: routine.version,
      });
      expect(skipped.status).toBe(200);
      const ruleAfter = await requireDb()
        .selectFrom('app.recurrence_rule')
        .select(['rule', 'start_on', 'local_time', 'generate_from', 'rotation'])
        .where('routine_id', '=', routine.id)
        .executeTakeFirstOrThrow();
      expect(ruleAfter).toEqual(ruleBefore);
      expect((await rows(routine.id)).map((r) => [r.index, r.date, r.status])).toEqual([
        [0, '2026-12-01', 'cancelled'],
        [1, '2027-03-01', 'ready'],
      ]);
      const afterSkip = await detail(routine.id);
      // The skipped one stays listed (so it can be undone); the next one to do is 1 Mar.
      expect(afterSkip.upcoming[0]).toMatchObject({ index: 0, skipped: true });
      expect(afterSkip.upcoming.find((u) => !u.skipped)).toMatchObject({
        index: 1,
        date: '2027-03-01',
      });

      // Alex reassigns the routine to themself; Sam's edit from the old version is refused.
      const v = afterSkip.routine.version;
      const mine = await request(`${base()}/routines/${routine.id}`, {
        method: 'PATCH',
        token: alex,
        body: { expectedVersion: v, ownerMemberId: h.adult.id },
      });
      expect(mine.status).toBe(200);
      const stale = await request(`${base()}/routines/${routine.id}`, {
        method: 'PATCH',
        token: sam,
        body: { expectedVersion: v, title: 'Replace furnace filter' },
      });
      expect(stale.status).toBe(409);
      expect(await json<{ error: string }>(stale)).toEqual({ error: 'version_conflict' });
      // The open occurrence follows the new owner.
      expect((await rows(routine.id)).find((r) => r.index === 1)?.owner).toBe(h.adult.id);

      // 1 Mar passes unfinished: it is overdue in Needs you, never auto-completed.
      clock = new Date('2027-03-02T17:00:00Z');
      await materializeHousehold(requireDb(), { householdId: h.id, now: clock, requestId: 't' });
      const missed = (await rows(routine.id)).find((r) => r.index === 1);
      expect(missed?.status).toBe('ready');
      const today = await json<{ needsYou: Item[] }>(
        await request(`${base()}/today`, { token: alex }),
      );
      expect(today.needsYou.map((i) => i.id)).toContain(missed?.id);
    });
  });

  describe('J3b: trash out every Sunday at 19:00, Sam and Alex taking turns', () => {
    it('alternates, swaps one turn, credits the person who did it, and counts fairly', async () => {
      const routine = await create(
        {
          title: 'Trash and recycling out',
          rule: { freq: 'weekly', interval: 1, weekdays: [7] },
          startOn: '2026-11-08',
          time: '19:00',
          rotation: [h.owner.id, h.adult.id],
        },
        alex,
      );
      const start = await detail(routine.id);
      expect(start.upcoming.slice(0, 4).map((u) => [u.date, u.ownerMemberId])).toEqual([
        ['2026-11-08', h.owner.id],
        ['2026-11-15', h.adult.id],
        ['2026-11-22', h.owner.id],
        ['2026-11-29', h.adult.id],
      ]);
      // Tonight's and next week's exist; later ones are shown from the rule.
      expect(start.upcoming.slice(0, 3).map((u) => u.itemId !== null)).toEqual([true, true, false]);

      // Sam is away tonight: swap with Alex. Alex's next turn (15 Nov) comes back to Sam.
      const swapped = await post(`${routine.id}/occurrences/0/swap`, {
        expectedVersion: start.routine.version,
        withMemberId: h.adult.id,
      });
      expect(swapped.status).toBe(200);
      const afterSwap = await detail(routine.id);
      expect(afterSwap.upcoming.slice(0, 8).map((u) => u.ownerMemberId)).toEqual([
        h.adult.id,
        h.owner.id,
        h.owner.id,
        h.adult.id,
        h.owner.id,
        h.adult.id,
        h.owner.id,
        h.adult.id,
      ]);
      expect((await rows(routine.id)).map((r) => r.owner)).toEqual([h.adult.id, h.owner.id]);

      // A stale swap is refused.
      const stale = await post(`${routine.id}/occurrences/2/swap`, {
        expectedVersion: start.routine.version,
        withMemberId: h.adult.id,
      });
      expect(stale.status).toBe(409);

      // Alex takes it out and confirms with one tap.
      const tonight = afterSwap.upcoming[0];
      const current = await json<{ item: Item }>(
        await request(`${base()}/work-items/${tonight?.itemId}`, { token: alex }),
      );
      const done = await request(`${base()}/work-items/${tonight?.itemId}`, {
        method: 'PATCH',
        token: alex,
        body: {
          expectedVersion: current.item.version,
          status: 'verified_complete',
          confirmed: true,
        },
      });
      expect(done.status).toBe(200);
      expect((await json<{ item: Item }>(done)).item.completedByMemberId).toBe(h.adult.id);

      const today = await json<{ handled: Item[] }>(
        await request(`${base()}/today`, { token: alex }),
      );
      expect(today.handled.map((i) => i.id)).toContain(tonight?.itemId);

      // Fairness view matches the event log.
      const fair = (await detail(routine.id)).fairness;
      expect(fair.counts).toEqual([{ memberId: h.adult.id, completed: 1 }]);
      const fromLog = await requireDb()
        .selectFrom('app.audit_event')
        .select(['actor_member_id'])
        .where('household_id', '=', h.id)
        .where(
          'entity_id',
          'in',
          (await rows(routine.id)).map((r) => r.id),
        )
        .where('action', '=', 'work_item.updated')
        .execute();
      expect(fromLog.map((e) => e.actor_member_id)).toEqual([h.adult.id]);
    });
  });

  it('schedules the next one a fixed number of days after each completion', async () => {
    const routine = await create({
      title: 'Water the plants',
      rule: { freq: 'after_completion', intervalDays: 3 },
      startOn: '2026-11-08',
      ownerMemberId: h.adult.id,
    });
    const [first] = await rows(routine.id);
    clock = new Date('2026-11-09T17:00:00Z');
    const res = await request(`${base()}/work-items/${first?.id}`, {
      method: 'PATCH',
      token: alex,
      body: { expectedVersion: first?.version, status: 'done_unverified' },
    });
    expect(res.status).toBe(200);
    expect((await rows(routine.id)).map((r) => [r.index, r.date, r.status])).toEqual([
      [0, '2026-11-08', 'done_unverified'],
      [1, '2026-11-12', 'ready'],
    ]);
    expect(routine.summary).toBe('3 days after each time it’s done');
  });

  it('pauses (clearing what’s coming) and resumes (bringing it back)', async () => {
    const routine = await create({
      title: 'Feed the fish',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
      ownerMemberId: h.owner.id,
    });
    const paused = await request(`${base()}/routines/${routine.id}`, {
      method: 'PATCH',
      token: sam,
      body: { expectedVersion: routine.version, paused: true },
    });
    expect(paused.status).toBe(200);
    expect((await rows(routine.id)).map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    const whilePaused = await detail(routine.id);
    expect(whilePaused.routine.paused).toBe(true);
    expect(whilePaused.upcoming).toEqual([]);

    clock = new Date('2026-11-09T17:00:00Z');
    const resumed = await request(`${base()}/routines/${routine.id}`, {
      method: 'PATCH',
      token: sam,
      body: { expectedVersion: whilePaused.routine.version, paused: false },
    });
    expect(resumed.status).toBe(200);
    // 8 Nov passed while paused and stays cleared; 9 Nov comes back and 10 Nov is added.
    expect((await rows(routine.id)).map((r) => [r.date, r.status])).toEqual([
      ['2026-11-08', 'cancelled'],
      ['2026-11-09', 'ready'],
      ['2026-11-10', 'ready'],
    ]);
  });

  it('undoes a skip, whether or not the occurrence existed yet', async () => {
    const routine = await create({
      title: 'Mow the lawn',
      rule: { freq: 'weekly', interval: 1, weekdays: [6] },
      startOn: '2026-11-08',
    });
    // Index 0 is 14 Nov (exists); index 2 is 28 Nov (not yet created).
    let v = routine.version;
    for (const index of [0, 2]) {
      const res = await post(`${routine.id}/occurrences/${index}/skip`, { expectedVersion: v });
      expect(res.status).toBe(200);
      v = (await json<{ routine: Routine }>(res)).routine.version;
    }
    expect((await post(`${routine.id}/occurrences/0/skip`, { expectedVersion: v })).status).toBe(
      422,
    );
    const skippedView = await detail(routine.id);
    expect(skippedView.upcoming.slice(0, 3).map((u) => u.skipped)).toEqual([true, false, true]);

    for (const index of [0, 2]) {
      const res = await post(`${routine.id}/occurrences/${index}/unskip`, { expectedVersion: v });
      expect(res.status).toBe(200);
      v = (await json<{ routine: Routine }>(res)).routine.version;
    }
    const restored = await detail(routine.id);
    expect(restored.upcoming.slice(0, 3).map((u) => u.skipped)).toEqual([false, false, false]);
    expect((await rows(routine.id)).find((r) => r.index === 0)?.status).toBe('ready');
  });

  it('ends a routine: nothing new, and nobody’s unstarted turn left behind', async () => {
    const routine = await create({
      title: 'Wipe the counters',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
    });
    const ended = await post(`${routine.id}/end`, { expectedVersion: routine.version });
    expect(ended.status).toBe(200);
    const { routine: after } = await json<{ routine: Routine }>(ended);
    expect(after.ended).toBe(true);
    expect((await rows(routine.id)).every((r) => r.status === 'cancelled')).toBe(true);
    const again = await request(`${base()}/routines/${routine.id}`, {
      method: 'PATCH',
      token: sam,
      body: { expectedVersion: after.version, title: 'x' },
    });
    expect(await json<{ error: string }>(again)).toEqual({ error: 'routine_ended' });
  });

  it('validates schedules and people', async () => {
    const bad = async (body: Record<string, unknown>) =>
      (await request(`${base()}/routines`, { method: 'POST', token: sam, body })).status;
    const ok = { title: 'x', rule: { freq: 'daily', interval: 1 }, startOn: '2026-11-08' };
    expect(await bad({ ...ok, rule: { freq: 'yearly', interval: 1 } })).toBe(422);
    expect(await bad({ ...ok, rule: { freq: 'weekly', interval: 1, weekdays: [] } })).toBe(422);
    expect(await bad({ ...ok, time: '25:00' })).toBe(422);
    expect(await bad({ ...ok, rotation: [h.owner.id] })).toBe(422);
    expect(await bad({ ...ok, rotation: [h.owner.id, h.owner.id] })).toBe(422);
    expect(
      await bad({ ...ok, ownerMemberId: h.owner.id, rotation: [h.owner.id, h.adult.id] }),
    ).toBe(422);
    expect(await bad({ ...ok, rotation: [h.owner.id, h.child.id] })).toBe(422);
  });

  it('keeps routine rows out of task lists and refuses direct edits to them', async () => {
    const routine = await create({
      title: 'Clean the gutters',
      rule: { freq: 'monthly_weekday', interval: 6, nth: 1, weekday: 6 },
      startOn: '2026-11-08',
    });
    const list = await json<{ items: { id: string }[] }>(
      await request(`${base()}/work-items`, { token: sam }),
    );
    expect(list.items.map((i) => i.id)).not.toContain(routine.id);
    const today = await json<Record<string, { id: string }[]>>(
      await request(`${base()}/today`, { token: sam }),
    );
    const onToday = ['needsYou', 'inProgress', 'thisWeek', 'handled'].flatMap(
      (k) => today[k]?.map((i) => i.id) ?? [],
    );
    expect(onToday).not.toContain(routine.id);
    const direct = await request(`${base()}/work-items/${routine.id}`, {
      method: 'PATCH',
      token: sam,
      body: { expectedVersion: routine.version, title: 'tampered' },
    });
    expect(await json<{ error: string }>(direct)).toEqual({ error: 'use_routine' });
  });

  it('records every routine write in the audit log, with no titles', async () => {
    const audit = () =>
      requireDb()
        .selectFrom('app.audit_event')
        .select(['id', 'action', 'payload'])
        .where('household_id', '=', h.id)
        .orderBy('id')
        .execute();
    const before = await audit();
    const routine = await create({
      title: 'Secret chore name',
      rule: { freq: 'weekly', interval: 2, weekdays: [3] },
      startOn: '2026-11-08',
    });
    const seen = new Set(before.map((e) => e.id));
    const added = (await audit()).filter((e) => !seen.has(e.id));
    expect(added.map((e) => e.action)).toEqual(['routine.created', 'routine.occurrence_created']);
    expect(JSON.stringify(added)).not.toContain('Secret');
    expect(routine.summary).toBe('Every 2 weeks on Wednesday');
  });
});
