import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Personal state, one-time acknowledgments and household activity, through the HTTP API.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

interface State {
  lastSeenAt: string | null;
  notifications: Record<string, boolean>;
  quietHours: { start: string; end: string } | null;
  haptics: boolean;
  sound: boolean;
  version: number;
}
interface Activity {
  id: string;
  at: string;
  actorMemberId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  title: string;
  memberId: string | null;
}

describe.skipIf(!db)('me and activity', () => {
  let clock = new Date('2026-11-16T15:00:00Z');
  const { request, tokenFor } = db ? createTestApp({ db, now: () => clock }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Me');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('state', () => {
    it('starts from defaults and saves changes, versioned', async () => {
      const initial = await json<{ state: State }>(await call('/me/state'));
      expect(initial.state).toEqual({
        lastSeenAt: null,
        notifications: {
          morningCheckin: true,
          handoffReminders: true,
          partnerChanges: true,
          weeklyResetReminder: true,
        },
        quietHours: null,
        haptics: true,
        sound: false,
        version: 0,
      });
      const patch = (body: Record<string, unknown>, token = owner) =>
        call('/me/state', { method: 'PATCH', body, token });
      const saved = await patch({
        expectedVersion: 0,
        notifications: { partnerChanges: false },
        quietHours: { start: '21:30', end: '07:00' },
        sound: true,
      });
      expect(saved.status).toBe(200);
      expect((await json<{ state: State }>(saved)).state).toMatchObject({
        notifications: { partnerChanges: false, morningCheckin: true },
        quietHours: { start: '21:30', end: '07:00' },
        sound: true,
        version: 1,
      });
      expect((await patch({ expectedVersion: 0, haptics: false })).status).toBe(409);
      expect((await patch({ expectedVersion: 1, quietHours: null })).status).toBe(200);
      for (const body of [
        { expectedVersion: 2 },
        { expectedVersion: 2, notifications: { marketing: true } },
        { expectedVersion: 2, notifications: { morningCheckin: 'yes' } },
        { expectedVersion: 2, quietHours: { start: '25:00', end: '07:00' } },
        { expectedVersion: 2, quietHours: { start: '22:00' } },
      ]) {
        expect((await patch(body)).status).toBe(422);
      }
      // The other adult's state is their own.
      expect(
        (await json<{ state: State }>(await call('/me/state', { token: adult }))).state.version,
      ).toBe(0);
    });

    it('marks when the member last looked and returns the previous time', async () => {
      const first = await json<{ previousSeenAt: string | null; seenAt: string }>(
        await call('/me/seen', { method: 'POST', token: adult }),
      );
      expect(first).toEqual({ previousSeenAt: null, seenAt: clock.toISOString() });
      const earlier = clock;
      clock = new Date(clock.getTime() + 3600 * 1000);
      const second = await json<{ previousSeenAt: string | null }>(
        await call('/me/seen', { method: 'POST', token: adult }),
      );
      expect(second.previousSeenAt).toBe(earlier.toISOString());
    });
  });

  describe('acknowledgments', () => {
    it('records a moment once per member, idempotently', async () => {
      const ack = (key: string, token = owner) =>
        call('/me/acknowledgments', { method: 'POST', body: { key }, token });
      const key = 'milestone:project_done:3f1c';
      const first = await ack(key);
      expect(first.status).toBe(201);
      const again = await ack(key);
      expect(again.status).toBe(200);
      expect((await json<{ acknowledgment: unknown }>(again)).acknowledgment).toEqual(
        (await json<{ acknowledgment: unknown }>(first)).acknowledgment,
      );
      const listed = await json<{ acknowledgments: { key: string }[] }>(
        await call(`/me/acknowledgments?keys=${key},milestone:other`),
      );
      expect(listed.acknowledgments.map((a) => a.key)).toEqual([key]);
      // Per person: the other adult hasn't seen it.
      const theirs = await json<{ acknowledgments: unknown[] }>(
        await call(`/me/acknowledgments?keys=${key}`, { token: adult }),
      );
      expect(theirs.acknowledgments).toEqual([]);
      for (const bad of ['', 'has spaces', 'x'.repeat(121), 'émoji']) {
        expect((await ack(bad)).status).toBe(422);
      }
      expect((await call('/me/acknowledgments')).status).toBe(422);
    });
  });

  describe('activity', () => {
    // Audit rows carry the database's clock, not the test's.
    const recent = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();
    it("shows the partner's recent changes with current titles, not the caller's own", async () => {
      const create = async (body: Record<string, unknown>, token: string) => {
        const res = await request(`/households/${h.id}/work-items`, {
          method: 'POST',
          token,
          body,
        });
        return (await json<{ item: { id: string; version: number } }>(res)).item;
      };
      const patch = (id: string, body: Record<string, unknown>, token: string) =>
        call(`/work-items/${id}`, { method: 'PATCH', body, token });

      const shared = await create({ title: 'Renew car registration', inbox: false }, owner);
      // The adult takes it, then finishes it.
      await patch(shared.id, { expectedVersion: 1, ownerMemberId: h.adult.id }, adult);
      await patch(shared.id, { expectedVersion: 2, status: 'done_unverified' }, adult);
      // The adult hands one to the owner.
      const handed = await create({ title: 'Call the plumber', inbox: false }, adult);
      await patch(handed.id, { expectedVersion: 1, ownerMemberId: h.owner.id }, adult);
      // A private item of the adult's: its activity never reaches the owner.
      const secret = await create(
        { title: 'Surprise gift', inbox: false, visibility: 'private' },
        adult,
      );
      await patch(secret.id, { expectedVersion: 1, status: 'done_unverified' }, adult);
      // The owner's own change.
      const mine = await create({ title: 'My thing', inbox: false }, owner);
      await patch(mine.id, { expectedVersion: 1, status: 'done_unverified' }, owner);
      // Renamed after the fact: the current title shows.
      await requireDb()
        .updateTable('app.work_item')
        .set({ title: 'Renew car registration (done online)' })
        .where('id', '=', shared.id)
        .execute();

      const res = await call(`/activity?since=${recent()}`);
      expect(res.status).toBe(200);
      const { activity } = await json<{ activity: Activity[] }>(res);
      expect(activity.map((a) => [a.action, a.title, a.actorMemberId, a.memberId])).toEqual([
        ['task.assigned', 'Call the plumber', h.adult.id, h.owner.id],
        ['task.completed', 'Renew car registration (done online)', h.adult.id, null],
        ['task.taken', 'Renew car registration (done online)', h.adult.id, h.adult.id],
      ]);
      expect(JSON.stringify(activity)).not.toContain('Surprise');
      const withMine = await json<{ activity: Activity[] }>(
        await call(`/activity?since=${recent()}&includeMine=true`),
      );
      expect(withMine.activity.map((a) => a.title)).toContain('My thing');
      // The adult sees their own private item's activity only with includeMine.
      const adultView = await json<{ activity: Activity[] }>(
        await call(`/activity?since=${recent()}&includeMine=true`, { token: adult }),
      );
      expect(adultView.activity.map((a) => a.title)).toContain('Surprise gift');
    });

    it('limits how far back it looks', async () => {
      const old = new Date(clock.getTime() - 8 * 24 * 3600 * 1000).toISOString();
      expect(await json(await call(`/activity?since=${old}`))).toEqual({ error: 'since_too_old' });
      expect((await call('/activity?since=yesterday')).status).toBe(422);
    });
  });

  it('adds a factual summary to the rhythm', async () => {
    const view = await json<{
      summary: { dueToday: number; overdue: number; byMember: unknown[] };
    }>(await call('/rhythm?date=2026-11-16'));
    expect(view.summary).toMatchObject({ dueToday: 0, overdue: 0 });
    expect(view.summary.byMember).toHaveLength(5);
  });
});
