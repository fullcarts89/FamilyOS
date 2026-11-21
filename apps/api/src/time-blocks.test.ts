import { createDb, materializeHousehold, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HouseholdExportSchema } from './export-schema';
import { createTestApp } from './testing/harness';

// Time blocks through the HTTP API: a task's time with a length ("Walk Biscuit, 5:30–6pm"), and
// a routine's length beside its time, copied onto its turns. Skipped without DATABASE_URL.
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
// 5:30pm that Sunday, and the same time on Monday.
const AT = '2026-11-09T01:30:00.000Z';
const NEXT_DAY = '2026-11-10T01:30:00.000Z';

interface Item {
  id: string;
  version: number;
  status: string;
  dueOn: string | null;
  dueAt: string | null;
  durationMinutes: number | null;
}

interface Routine {
  id: string;
  version: number;
  time: string | null;
  durationMinutes: number | null;
}

describe.skipIf(!db)('time blocks (tasks and routines)', () => {
  let clock = NOW;
  const { request, tokenFor } = db ? createTestApp({ db, now: () => clock }) : createTestApp();
  let h: SeededHousehold;
  let token: string;

  const base = () => `/households/${h.id}`;
  const json = async <T>(res: Response) => (await res.json()) as T;
  const post = (path: string, body: unknown) =>
    request(`${base()}${path}`, { method: 'POST', token, body });
  const patch = (path: string, body: unknown) =>
    request(`${base()}${path}`, { method: 'PATCH', token, body });

  const create = async (body: Record<string, unknown>) => {
    const res = await post('/work-items', { title: 'Walk Biscuit', inbox: false, ...body });
    expect(res.status).toBe(201);
    return (await json<{ item: Item }>(res)).item;
  };
  const edit = async (item: Item, body: Record<string, unknown>, status = 200) => {
    const res = await patch(`/work-items/${item.id}`, {
      expectedVersion: item.version,
      ...body,
    });
    expect(res.status).toBe(status);
    return json<{ item: Item; error?: string }>(res);
  };
  const lastAudit = async (id: string) =>
    requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload'])
      .where('household_id', '=', h.id)
      .where('entity_id', '=', id)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Time Blocks API');
    token = await tokenFor({
      userId: h.owner.userId ?? '',
      email: `${h.owner.id}@example.test`,
    });
  });

  beforeEach(() => {
    clock = NOW;
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('tasks', () => {
    it('creates a task with a time and a length, and reads it back', async () => {
      const item = await create({ dueAt: AT, durationMinutes: 30 });
      expect(item).toMatchObject({ dueAt: AT, dueOn: null, durationMinutes: 30 });
      const read = await json<{ item: Item }>(
        await request(`${base()}/work-items/${item.id}`, { token }),
      );
      expect(read.item.durationMinutes).toBe(30);
      const list = await json<{ items: Item[] }>(await request(`${base()}/work-items`, { token }));
      expect(list.items.find((i) => i.id === item.id)?.durationMinutes).toBe(30);
      // Without a length it's a moment, as before.
      expect((await create({ dueAt: AT })).durationMinutes).toBeNull();
    });

    it('refuses a length without a time, or one that isn’t 5–720 in steps of 5', async () => {
      const refused = async (body: Record<string, unknown>, code: string) => {
        const res = await post('/work-items', { title: 'Walk Biscuit', ...body });
        expect(res.status).toBe(422);
        expect(await json<{ error: string }>(res)).toEqual({ error: code });
      };
      await refused({ durationMinutes: 30 }, 'duration_needs_time');
      await refused({ dueOn: '2026-11-08', durationMinutes: 30 }, 'duration_needs_time');
      for (const minutes of [0, 4, 7, 22.5, 725, -30]) {
        await refused({ dueAt: AT, durationMinutes: minutes }, 'invalid_duration');
      }
      await refused({ dueAt: AT, durationMinutes: '30' }, 'invalid_body');
    });

    it('sets, changes and clears a length with the usual version and audit', async () => {
      let item = await create({ dueAt: AT });
      item = (await edit(item, { durationMinutes: 45 })).item;
      expect(item).toMatchObject({ durationMinutes: 45, version: 2 });
      // The audit names the field and nothing else (no title, no free text).
      const audit = await lastAudit(item.id);
      expect(audit).toEqual({
        action: 'work_item.updated',
        payload: { fields: ['duration_minutes'], version: 2 },
      });
      // A stale edit is refused, as for every other field.
      const stale = await patch(`/work-items/${item.id}`, {
        expectedVersion: 1,
        durationMinutes: 60,
      });
      expect(stale.status).toBe(409);
      // Moving the time keeps the length.
      item = (await edit(item, { dueAt: NEXT_DAY })).item;
      expect(item).toMatchObject({ dueAt: NEXT_DAY, durationMinutes: 45 });
      // Null clears it and keeps the time.
      item = (await edit(item, { durationMinutes: null })).item;
      expect(item).toMatchObject({ dueAt: NEXT_DAY, durationMinutes: null });
    });

    it('clears the length when the time is cleared or the task moves to a day', async () => {
      let item = await create({ dueAt: AT, durationMinutes: 30 });
      item = (await edit(item, { dueOn: '2026-11-09' })).item;
      expect(item).toMatchObject({ dueOn: '2026-11-09', dueAt: null, durationMinutes: null });
      expect((await lastAudit(item.id)).payload).toMatchObject({
        fields: ['due_at', 'due_on', 'duration_minutes'],
      });

      item = (await edit(item, { dueAt: AT, durationMinutes: 60 })).item;
      expect(item).toMatchObject({ dueOn: null, dueAt: AT, durationMinutes: 60 });
      item = (await edit(item, { dueAt: null })).item;
      expect(item).toMatchObject({ dueOn: null, dueAt: null, durationMinutes: null });
    });

    it('refuses a length on a task with no time, and with a time being cleared', async () => {
      const allDay = await create({ dueOn: '2026-11-08' });
      expect((await edit(allDay, { durationMinutes: 30 }, 422)).error).toBe('duration_needs_time');
      const timed = await create({ dueAt: AT });
      expect((await edit(timed, { dueAt: null, durationMinutes: 30 }, 422)).error).toBe(
        'duration_needs_time',
      );
      expect((await edit(timed, { durationMinutes: 13 }, 422)).error).toBe('invalid_duration');
    });

    it('clears the length when Weekly Reset or the inbox moves it to a day', async () => {
      const timed = await create({ dueAt: AT, durationMinutes: 30 });
      const moved = await post('/work-items/bulk', {
        items: [
          { id: timed.id, expectedVersion: timed.version, action: 'due', value: '2026-11-10' },
        ],
      });
      expect(moved.status).toBe(200);
      expect((await json<{ items: Item[] }>(moved)).items[0]).toMatchObject({
        dueOn: '2026-11-10',
        durationMinutes: null,
      });

      const captured = (
        await json<{ item: Item }>(
          await post('/work-items', { title: 'Walk Biscuit', dueAt: AT, durationMinutes: 30 }),
        )
      ).item;
      expect(captured).toMatchObject({ status: 'new', durationMinutes: 30 });
      const accepted = await post(`/work-items/${captured.id}/accept`, {
        expectedVersion: captured.version,
        dueOn: '2026-11-09',
      });
      expect(accepted.status).toBe(200);
      expect((await json<{ item: Item }>(accepted)).item).toMatchObject({
        dueOn: '2026-11-09',
        dueAt: null,
        durationMinutes: null,
      });
    });

    it('puts the block on the day’s rhythm, in the owner’s lane', async () => {
      const item = await create({
        title: 'Walk Biscuit at dusk',
        dueAt: AT,
        durationMinutes: 30,
        ownerMemberId: h.owner.id,
      });
      const rhythm = await json<{
        lanes: {
          memberId: string;
          tasks: { timed: (Item & { block: { startsAt: string; endsAt: string } | null })[] };
        }[];
      }>(await request(`${base()}/rhythm?date=2026-11-08`, { token }));
      const mine = rhythm.lanes.find((l) => l.memberId === h.owner.id)?.tasks.timed ?? [];
      const timed = mine.find((t) => t.id === item.id);
      expect(timed?.block).toEqual({
        startsAt: '2026-11-09T01:30:00Z',
        endsAt: '2026-11-09T02:00:00Z',
        minutes: 30,
      });
    });
  });

  describe('routines', () => {
    const routine = async (body: Record<string, unknown>, status = 201) => {
      const res = await post('/routines', {
        title: 'Walk Biscuit',
        rule: { freq: 'daily', interval: 1 },
        startOn: '2026-11-08',
        ownerMemberId: h.owner.id,
        ...body,
      });
      expect(res.status).toBe(status);
      return json<{ routine: Routine; error?: string }>(res);
    };
    const turns = async (routineId: string) =>
      requireDb()
        .selectFrom('app.work_item as w')
        .innerJoin('app.recurrence_rule as r', 'r.id', 'w.recurrence_rule_id')
        .select(['w.occurrence_on as on', 'w.status', 'w.due_at as dueAt', 'w.duration_minutes'])
        .where('r.routine_id', '=', routineId)
        .orderBy('w.occurrence_index')
        .execute();

    it('takes a length with its time, and every turn it creates carries it', async () => {
      const { routine: walk } = await routine({ time: '17:30', durationMinutes: 30 });
      expect(walk).toMatchObject({ time: '17:30', durationMinutes: 30 });
      const detail = await json<{ routine: Routine }>(
        await request(`${base()}/routines/${walk.id}`, { token }),
      );
      expect(detail.routine.durationMinutes).toBe(30);
      expect((await turns(walk.id)).map((t) => [t.on, t.duration_minutes])).toEqual([
        ['2026-11-08', 30],
        ['2026-11-09', 30],
      ]);
      // Two days on, the scheduler (the worker's own run) adds the next turns with it too.
      clock = new Date('2026-11-10T17:00:00Z');
      await materializeHousehold(requireDb(), { householdId: h.id, now: clock, requestId: 't' });
      const later = await turns(walk.id);
      expect(later.map((t) => t.on)).toEqual([
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
      ]);
      expect(later.every((t) => t.duration_minutes === 30)).toBe(true);
    });

    it('refuses a length without a time, or a bad one', async () => {
      expect((await routine({ durationMinutes: 30 }, 422)).error).toBe('duration_needs_time');
      expect((await routine({ time: '17:30', durationMinutes: 8 }, 422)).error).toBe(
        'invalid_duration',
      );
    });

    it('changes the length for the routine and its open turns, and needs a time', async () => {
      const { routine: walk } = await routine({ title: 'Evening walk', time: '18:00' });
      const changed = await patch(`/routines/${walk.id}`, {
        expectedVersion: walk.version,
        durationMinutes: 45,
      });
      expect(changed.status).toBe(200);
      const after = (await json<{ routine: Routine }>(changed)).routine;
      expect(after).toMatchObject({ durationMinutes: 45, version: walk.version + 1 });
      expect((await turns(walk.id)).every((t) => t.duration_minutes === 45)).toBe(true);
      const audit = await requireDb()
        .selectFrom('app.audit_event')
        .select('payload')
        .where('entity_id', '=', walk.id)
        .where('action', '=', 'routine.updated')
        .executeTakeFirstOrThrow();
      expect(audit.payload).toEqual({ fields: ['duration'], version: walk.version + 1 });

      const cleared = await patch(`/routines/${walk.id}`, {
        expectedVersion: after.version,
        durationMinutes: null,
      });
      expect((await json<{ routine: Routine }>(cleared)).routine.durationMinutes).toBeNull();
      expect((await turns(walk.id)).every((t) => t.duration_minutes === null)).toBe(true);

      const { routine: laundry } = await routine({ title: 'Laundry' });
      const refused = await patch(`/routines/${laundry.id}`, {
        expectedVersion: laundry.version,
        durationMinutes: 30,
      });
      expect(refused.status).toBe(422);
      expect(await json<{ error: string }>(refused)).toEqual({ error: 'duration_needs_time' });
    });
  });

  it('exports the lengths of tasks and routines', async () => {
    const res = await request(`${base()}/export`, { token });
    expect(res.status).toBe(200);
    const parsed = HouseholdExportSchema.parse(await res.json());
    expect(parsed.workItems.some((i) => i.durationMinutes === 30)).toBe(true);
    expect(parsed.recurrenceRules.some((r) => r.durationMinutes === 30)).toBe(true);
  });
});
