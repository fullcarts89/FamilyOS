import { createDb, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  seedRoutine,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Weekly Reset, carry-forward (bulk changes, undoing a completion) and routine turns, through
// the HTTP API.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Monday 2026-11-16, 07:00 in Los Angeles. The Reset plans this week; it looks back on 9–15 Nov.
const NOW = new Date('2026-11-16T15:00:00Z');
const WEEK = '2026-11-16';
const la = (date: string, time: string) => new Date(`${date}T${time}:00-08:00`).toISOString();

interface Item {
  id: string;
  version: number;
  status: string;
  ownerMemberId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  routineId: string | null;
  isCurrentTurn: boolean | null;
  recurrenceRuleId: string | null;
  occurrenceIndex: number | null;
}

describe.skipIf(!db)('Weekly Reset', () => {
  const { request, tokenFor } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;
  const ids: Record<string, string> = {};

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;

  const task = async (values: Record<string, unknown>) =>
    (
      await requireDb()
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title: 'task',
          status: 'ready',
          created_by_member_id: h.owner.id,
          ...values,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Reset');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
    caregiver = await tokenOf(h.caregiver);

    // Last week: what got done.
    ids.registration = await task({
      title: 'Renew car registration',
      priority: 1,
      status: 'done_unverified',
      completed_at: la('2026-11-12', '12:00'),
      completed_by_member_id: h.adult.id,
    });
    ids.reno = await task({ title: 'Hall bathroom', type: 'project' });
    ids.quotes = await task({
      title: 'Get three quotes',
      parent_id: ids.reno,
      status: 'done_unverified',
      completed_at: la('2026-11-10', '09:00'),
      completed_by_member_id: h.owner.id,
    });
    await task({ title: 'Order vanity', parent_id: ids.reno });
    ids.library = await task({
      title: 'Return library books',
      status: 'done_unverified',
      completed_at: la('2026-11-11', '09:00'),
      completed_by_member_id: h.owner.id,
    });
    // Loose ends and this week's items.
    ids.filter = await task({
      title: 'Replace furnace filter',
      due_on: '2026-11-13',
      owner_member_id: h.adult.id,
    });
    ids.sitter = await task({ title: 'Find a sitter', due_on: '2026-11-18' });
    ids.later = await task({ title: 'Plan spring garden', due_on: '2026-12-15' });

    // The week ahead: Thursday's pickup runs into the owner's planning; the vet has nobody.
    await seedEvent(requireDb(), h, {
      title: 'Daycare pickup',
      kind: 'childcare',
      startsAt: la('2026-11-16', '17:30'),
      endsAt: la('2026-11-16', '17:50'),
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] },
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'pick_up',
      carePlace: 'Little Oaks',
    });
    await seedEvent(requireDb(), h, {
      title: 'Quarterly planning',
      kind: 'work',
      startsAt: la('2026-11-19', '14:00'),
      endsAt: la('2026-11-19', '18:00'),
      memberIds: [h.owner.id],
    });
    await seedEvent(requireDb(), h, {
      title: 'Vet',
      kind: 'appointment',
      startsAt: la('2026-11-21', '10:00'),
      endsAt: la('2026-11-21', '10:45'),
      careMemberId: h.pet.id,
    });
    await seedRoutine(requireDb(), h, {
      title: 'Trash to the curb',
      rule: { freq: 'weekly', interval: 1, weekdays: [3] },
      startOn: '2026-11-04',
      rotation: [h.owner.id, h.adult.id],
    });
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('returns everything the session needs in one read', async () => {
    await call('/decisions', {
      method: 'POST',
      body: { question: 'Which preschool?', dueOn: '2026-11-20', options: [{ label: 'A' }] },
    });
    await call('/meals', { method: 'POST', body: { onDate: '2026-11-17', title: 'Tacos' } });
    await call('/groceries', { method: 'POST', body: { name: 'Tortillas', aisle: 'bakery' } });

    const res = await call(`/reset?week=${WEEK}`, { token: adult });
    expect(res.status).toBe(200);
    const reset = await json<{
      week: { start: string; end: string };
      plan: unknown;
      lookBack: {
        from: string;
        to: string;
        byMember: {
          memberId: string | null;
          entries: { kind: string; id?: string; reason: string }[];
        }[];
        projects: { id: string; completed: boolean; progress: { done: number; total: number } }[];
      };
      unfinished: Item[];
      dueThisWeek: Item[];
      events: {
        days: { date: string }[];
        conflicts: { memberId: string; occurrenceKey: string }[];
        needsOwner: { careMemberId: string }[];
      };
      decisions: { question: string }[];
      meals: { title: string }[];
      groceries: { name: string }[];
      routines: { title: string; turns: { date: string; ownerMemberId: string | null }[] }[];
      unresolved: { type: string }[];
      allClear: boolean;
    }>(res);
    expect(reset.week).toEqual({ start: WEEK, end: '2026-11-22', timezone: 'America/Los_Angeles' });
    expect(reset.plan).toBeNull();
    expect(reset.lookBack).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    // What mattered, by who did it: the library books were an ordinary errand.
    expect(
      reset.lookBack.byMember.map((g) => ({
        memberId: g.memberId,
        items: g.entries.map((e) => `${e.id}:${e.reason}`),
      })),
    ).toEqual([
      { memberId: h.owner.id, items: [`${ids.quotes}:subtask`] },
      { memberId: h.adult.id, items: [`${ids.registration}:priority`] },
    ]);
    expect(reset.lookBack.projects).toEqual([
      expect.objectContaining({ id: ids.reno, completed: false, progress: { done: 1, total: 2 } }),
    ]);
    expect(reset.unfinished.map((i) => i.id)).toEqual([ids.filter]);
    expect(reset.dueThisWeek.map((i) => i.id)).toEqual([ids.sitter]);
    expect(reset.events.days).toHaveLength(7);
    expect(reset.events.conflicts).toEqual([
      expect.objectContaining({
        memberId: h.owner.id,
        occurrenceKey: expect.stringContaining('2026-11-19'),
      }),
    ]);
    expect(reset.events.needsOwner).toEqual([expect.objectContaining({ careMemberId: h.pet.id })]);
    expect(reset.decisions.map((d) => d.question)).toEqual(['Which preschool?']);
    expect(reset.meals.map((m) => m.title)).toEqual(['Tacos']);
    expect(reset.groceries.map((g) => g.name)).toEqual(['Tortillas']);
    expect(reset.routines).toEqual([
      expect.objectContaining({
        title: 'Trash to the curb',
        turns: [expect.objectContaining({ date: '2026-11-18' })],
      }),
    ]);
    expect(reset.unresolved.map((u) => u.type)).toEqual([
      'handoff_conflict',
      'care_unassigned',
      'decision_open',
      'overdue',
    ]);
    expect(reset.allClear).toBe(false);
    expect(JSON.stringify(reset.lookBack)).not.toMatch(/"count"|"score"/);
  });

  it('defaults to the week the Reset plans and refuses a week that does not start on Monday', async () => {
    const res = await json<{ week: { start: string }; today: string }>(await call('/reset'));
    expect(res).toMatchObject({ today: '2026-11-16', week: { start: WEEK } });
    expect(await json(await call('/reset?week=2026-11-17'))).toEqual({ error: 'invalid_week' });
    expect((await call('/reset', { token: caregiver })).status).toBe(403);
  });

  it('commits the plan idempotently and returns its summary', async () => {
    const commit = (body: Record<string, unknown>, token = owner) =>
      call('/reset/commit', { method: 'POST', token, body });
    const first = await commit({ week: WEEK, notes: 'Theo covers Thursday.' });
    expect(first.status).toBe(200);
    const one = await json<{
      plan: { committedAt: string; committedByMemberId: string; version: number; notes: string };
      summary: { allClear: boolean; unresolved: unknown[]; meals: unknown[] };
    }>(first);
    expect(one.plan).toMatchObject({
      committedByMemberId: h.owner.id,
      version: 1,
      notes: 'Theo covers Thursday.',
    });
    expect(one.summary.allClear).toBe(false);
    expect(one.summary.unresolved.length).toBeGreaterThan(0);

    const again = await json<typeof one>(await commit({ week: WEEK }, adult));
    expect(again.plan).toEqual(one.plan);
    const edited = await json<typeof one>(
      await commit({ week: WEEK, notes: 'Maya covers Thursday.' }, adult),
    );
    expect(edited.plan).toMatchObject({
      committedAt: one.plan.committedAt,
      committedByMemberId: h.owner.id,
      version: 2,
      notes: 'Maya covers Thursday.',
    });
    expect((await commit({ week: '2026-11-18' })).status).toBe(422);
    expect((await commit({ week: WEEK }, caregiver)).status).toBe(403);
    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload'])
      .where('household_id', '=', h.id)
      .where('entity_type', '=', 'weekly_plan')
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(['weekly_plan.committed', 'weekly_plan.updated']);
    expect(JSON.stringify(audit)).not.toContain('covers');
  });

  it('lets both adults commit the same week at once: both succeed, one commit is recorded', async () => {
    const week = '2026-11-30';
    const [a, b] = await Promise.all([
      call('/reset/commit', { method: 'POST', body: { week } }),
      call('/reset/commit', { method: 'POST', token: adult, body: { week } }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const plans = await requireDb()
      .selectFrom('app.weekly_plan')
      .select('id')
      .where('household_id', '=', h.id)
      .where('week_start', '=', week)
      .execute();
    expect(plans).toHaveLength(1);
    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select('action')
      .where('household_id', '=', h.id)
      .where('entity_id', '=', plans[0]?.id ?? '')
      .execute();
    expect(audit.map((r) => r.action)).toEqual(['weekly_plan.committed']);
  });

  describe('carry-forward', () => {
    it('moves, clears, assigns and cancels in one all-or-nothing request', async () => {
      const items = await json<{ items: Item[] }>(await call('/work-items'));
      const version = (id: string | undefined) =>
        items.items.find((i) => i.id === id)?.version ?? 0;
      const failing = await call('/work-items/bulk', {
        method: 'POST',
        body: {
          items: [
            {
              id: ids.filter,
              expectedVersion: version(ids.filter),
              action: 'due',
              value: '2026-11-17',
            },
            { id: ids.sitter, expectedVersion: version(ids.sitter) + 5, action: 'cancel' },
          ],
        },
      });
      expect(failing.status).toBe(409);
      expect(await failing.json()).toEqual({ error: 'version_conflict', itemId: ids.sitter });
      const unchanged = await json<{ item: Item }>(await call(`/work-items/${ids.filter}`));
      expect(unchanged.item.dueOn).toBe('2026-11-13');

      const badOwner = await call('/work-items/bulk', {
        method: 'POST',
        body: {
          items: [{ id: ids.filter, expectedVersion: 1, action: 'assign', value: h.child.id }],
        },
      });
      expect(await badOwner.json()).toEqual({ error: 'invalid_owner', itemId: ids.filter });

      const ok = await call('/work-items/bulk', {
        method: 'POST',
        body: {
          items: [
            { id: ids.filter, expectedVersion: 1, action: 'due', value: '2026-11-17' },
            { id: ids.sitter, expectedVersion: 1, action: 'assign', value: h.adult.id },
            { id: ids.later, expectedVersion: 1, action: 'clear_due' },
          ],
        },
      });
      expect(ok.status).toBe(200);
      const { items: changed } = await json<{ items: Item[] }>(ok);
      expect(changed.map((i) => [i.dueOn, i.ownerMemberId, i.version])).toEqual([
        ['2026-11-17', h.adult.id, 2],
        ['2026-11-18', h.adult.id, 2],
        [null, null, 2],
      ]);
      const timed = await call('/work-items/bulk', {
        method: 'POST',
        body: {
          items: [
            { id: ids.later, expectedVersion: 2, action: 'due', value: '2026-11-20T17:00:00Z' },
            { id: ids.sitter, expectedVersion: 2, action: 'cancel' },
          ],
        },
      });
      const { items: final } = await json<{ items: Item[] }>(timed);
      expect(final.map((i) => [i.dueAt, i.status])).toEqual([
        ['2026-11-20T17:00:00.000Z', 'ready'],
        [null, 'cancelled'],
      ]);
      expect(
        (
          await call('/work-items/bulk', {
            method: 'POST',
            body: {
              items: [
                { id: ids.filter, expectedVersion: 2, action: 'clear_due' },
                { id: ids.filter, expectedVersion: 2, action: 'cancel' },
              ],
            },
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await call('/work-items/bulk', {
            method: 'POST',
            token: caregiver,
            body: { items: [{ id: ids.filter, expectedVersion: 2, action: 'clear_due' }] },
          })
        ).status,
      ).toBe(403);
    });

    it('undoes a completion back to the status it had', async () => {
      const id = await task({ title: 'Call the insurer', status: 'needs_you' });
      const patch = (body: Record<string, unknown>) =>
        call(`/work-items/${id}`, { method: 'PATCH', body });
      expect(await json(await patch({ expectedVersion: 1, undoComplete: true }))).toEqual({
        error: 'not_completed',
      });
      const done = await json<{ item: Item & { completedAt: string | null } }>(
        await patch({ expectedVersion: 1, status: 'done_unverified' }),
      );
      expect(done.item.completedAt).not.toBeNull();
      expect((await patch({ expectedVersion: 1, undoComplete: true })).status).toBe(409);
      expect(
        (await patch({ expectedVersion: 2, undoComplete: true, status: 'ready' })).status,
      ).toBe(422);
      const undone = await json<{ item: Item & { completedAt: string | null } }>(
        await patch({ expectedVersion: 2, undoComplete: true }),
      );
      expect(undone.item).toMatchObject({ status: 'needs_you', completedAt: null, version: 3 });
      const timeline = await json<{
        timeline: { action: string; payload: Record<string, unknown> }[];
      }>(await call(`/work-items/${id}`));
      expect(timeline.timeline.at(-1)).toMatchObject({
        action: 'work_item.completion_undone',
        payload: { fromStatus: 'done_unverified', toStatus: 'needs_you' },
      });
    });

    it('undoes a routine turn, withdrawing the next one it brought due', async () => {
      const created = await json<{ routine: { id: string } }>(
        await call('/routines', {
          method: 'POST',
          body: {
            title: 'Water the plants',
            rule: { freq: 'after_completion', intervalDays: 3 },
            startOn: '2026-11-16',
            ownerMemberId: h.adult.id,
          },
        }),
      );
      const occurrences = async () =>
        requireDb()
          .selectFrom('app.work_item as w')
          .innerJoin('app.recurrence_rule as r', 'r.id', 'w.recurrence_rule_id')
          .select(['w.id', 'w.status', 'w.version', 'w.occurrence_index'])
          .where('r.routine_id', '=', created.routine.id)
          .orderBy('w.occurrence_index')
          .execute();
      const [first] = await occurrences();
      const patch = (body: Record<string, unknown>) =>
        call(`/work-items/${first?.id}`, { method: 'PATCH', token: adult, body });
      await patch({ expectedVersion: 1, status: 'done_unverified' });
      expect((await occurrences()).map((o) => o.status)).toEqual(['done_unverified', 'ready']);
      const undone = await patch({ expectedVersion: 2, undoComplete: true });
      expect(undone.status).toBe(200);
      expect((await occurrences()).map((o) => o.status)).toEqual(['ready', 'cancelled']);
      // Done again: the next turn comes due once more, as a new occurrence.
      await patch({ expectedVersion: 3, status: 'done_unverified' });
      expect((await occurrences()).map((o) => o.status)).toEqual([
        'done_unverified',
        'cancelled',
        'ready',
      ]);
    });

    it("marks each routine's current turn, and lists what Done, Skip and Swap need", async () => {
      const created = await json<{ routine: { id: string; version: number } }>(
        await call('/routines', {
          method: 'POST',
          body: {
            title: 'Feed the fish',
            rule: { freq: 'daily', interval: 1 },
            startOn: '2026-11-15',
            ownerMemberId: h.owner.id,
          },
        }),
      );
      const { items } = await json<{ items: Item[] }>(await call('/work-items'));
      const turns = items
        .filter((i) => i.routineId === created.routine.id)
        .sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));
      expect(turns.map((t) => [t.occurrenceIndex, t.isCurrentTurn])).toEqual([
        [1, true],
        [2, false],
      ]);
      expect(items.find((i) => i.id === ids.filter)?.isCurrentTurn).toBeNull();

      const { routines } = await json<{
        routines: {
          id: string;
          nextOccurrenceIndex: number | null;
          next: { id: string; index: number; version: number; dueOn: string | null } | null;
        }[];
      }>(await call('/routines'));
      const fish = routines.find((r) => r.id === created.routine.id);
      expect(fish).toMatchObject({
        nextOccurrenceIndex: 1,
        next: { id: turns[0]?.id, index: 1, version: 1, dueOn: '2026-11-16' },
      });
      // Done: the next turn becomes the current one.
      await call(`/work-items/${turns[0]?.id}`, {
        method: 'PATCH',
        body: { expectedVersion: 1, status: 'done_unverified' },
      });
      const after = await json<{ items: Item[] }>(await call('/work-items'));
      expect(after.items.find((i) => i.id === turns[1]?.id)?.isCurrentTurn).toBe(true);
      expect(after.items.find((i) => i.id === turns[0]?.id)?.isCurrentTurn).toBe(false);
    });
  });
});
