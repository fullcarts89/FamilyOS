import { createDb, type Database } from '@familyos/db';
import { randomUUID } from 'node:crypto';
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
  morningTime: string;
  weeklyReset: { weekday: number; time: string };
  hideDetails: boolean;
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
          partnerChanges: false,
          weeklyResetReminder: true,
        },
        quietHours: null,
        haptics: true,
        sound: false,
        morningTime: '07:30',
        weeklyReset: { weekday: 7, time: '19:00' },
        hideDetails: true,
        version: 0,
      });
      const patch = (body: Record<string, unknown>, token = owner) =>
        call('/me/state', { method: 'PATCH', body, token });
      const saved = await patch({
        expectedVersion: 0,
        notifications: { partnerChanges: true },
        quietHours: { start: '21:30', end: '07:00' },
        sound: true,
      });
      expect(saved.status).toBe(200);
      expect((await json<{ state: State }>(saved)).state).toMatchObject({
        notifications: { partnerChanges: true, morningCheckin: true },
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
        { expectedVersion: 2, morningTime: '7:30' },
        { expectedVersion: 2, weeklyReset: { weekday: 0, time: '19:00' } },
        { expectedVersion: 2, weeklyReset: { weekday: 8, time: '19:00' } },
        { expectedVersion: 2, weeklyReset: { weekday: 7 } },
        { expectedVersion: 2, hideDetails: 'yes' },
      ]) {
        expect((await patch(body)).status).toBe(422);
      }
      // The other adult's state is their own.
      expect(
        (await json<{ state: State }>(await call('/me/state', { token: adult }))).state.version,
      ).toBe(0);
    });

    it('saves when notifications come and whether they show details', async () => {
      const current = (await json<{ state: State }>(await call('/me/state'))).state;
      const res = await call('/me/state', {
        method: 'PATCH',
        body: {
          expectedVersion: current.version,
          morningTime: '06:45',
          weeklyReset: { weekday: 5, time: '20:30' },
          hideDetails: false,
        },
      });
      expect(res.status).toBe(200);
      expect((await json<{ state: State }>(res)).state).toMatchObject({
        morningTime: '06:45',
        weeklyReset: { weekday: 5, time: '20:30' },
        hideDetails: false,
        version: current.version + 1,
      });
      const audit = await requireDb()
        .selectFrom('app.audit_event')
        .select('payload')
        .where('household_id', '=', h.id)
        .where('action', '=', 'member.preferences_updated')
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow();
      expect(audit.payload).toEqual({ fields: ['morningTime', 'weeklyReset', 'hideDetails'] });
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

  describe('push tokens', () => {
    const device = () => `ExponentPushToken[${randomUUID().replaceAll('-', '').slice(0, 22)}]`;
    const register = (token: string, as = owner, platform = 'ios') =>
      call('/me/push-tokens', { method: 'POST', token: as, body: { token, platform } });
    const remove = (token: string, as = owner) =>
      call('/me/push-tokens', { method: 'DELETE', token: as, body: { token } });
    const stored = (memberId: string) =>
      requireDb()
        .selectFrom('app.device_push_token')
        .select('expo_push_token')
        .where('member_id', '=', memberId)
        .execute();

    it('registers this device once, never echoing the token, and removes it', async () => {
      const token = device();
      const first = await register(token);
      expect(first.status).toBe(201);
      const body = await json<{ pushToken: { id: string; platform: string } }>(first);
      expect(body.pushToken).toMatchObject({ platform: 'ios' });
      expect(JSON.stringify(body)).not.toContain(token);
      const again = await register(token);
      expect(again.status).toBe(200);
      expect((await json<typeof body>(again)).pushToken.id).toBe(body.pushToken.id);
      expect(await stored(h.owner.id)).toEqual([{ expo_push_token: token }]);

      expect((await remove(token)).status).toBe(204);
      expect(await stored(h.owner.id)).toEqual([]);
      expect((await remove(token)).status).toBe(204);
    });

    it('validates the token and platform', async () => {
      for (const [token, platform] of [
        ['not-a-token', 'ios'],
        ['ExponentPushToken[]', 'ios'],
        ['ExponentPushToken[abc def]', 'ios'],
        [device(), 'android'],
      ] as const) {
        expect((await register(token, owner, platform)).status).toBe(422);
      }
      expect((await call('/me/push-tokens', { method: 'DELETE', body: {} })).status).toBe(422);
      expect(
        (await call('/me/push-tokens', { method: 'POST', body: { token: device() } })).status,
      ).toBe(422);
    });

    it("can't remove another member's device, and a caregiver registers their own", async () => {
      const theirs = device();
      expect((await register(theirs, adult)).status).toBe(201);
      expect((await remove(theirs, owner)).status).toBe(204);
      expect(await stored(h.adult.id)).toEqual([{ expo_push_token: theirs }]);
      const sitter = await tokenOf(h.caregiver);
      expect((await register(device(), sitter)).status).toBe(201);
      // A phone that changes hands in the family moves with it.
      expect((await register(theirs, owner)).status).toBe(201);
      expect(await stored(h.adult.id)).toEqual([]);
    });

    it('refuses a device registered in another household', async () => {
      const other = await seedHousehold(requireDb(), 'Me Other');
      try {
        const token = device();
        const res = await request(`/households/${other.id}/me/push-tokens`, {
          method: 'POST',
          token: await tokenOf(other.owner),
          body: { token, platform: 'ios' },
        });
        expect(res.status).toBe(201);
        const taken = await register(token);
        expect(taken.status).toBe(409);
        expect(await json(taken)).toEqual({ error: 'token_in_use' });
        expect(await stored(other.owner.id)).toEqual([{ expo_push_token: token }]);
      } finally {
        await purgeHouseholds(requireDb(), [other.id]);
      }
    });

    it('audits additions and removals without the token', async () => {
      const token = device();
      await register(token);
      await remove(token);
      const rows = await requireDb()
        .selectFrom('app.audit_event')
        .select(['action', 'payload'])
        .where('household_id', '=', h.id)
        .where('action', 'like', 'member.push_token_%')
        .orderBy('id', 'desc')
        .limit(2)
        .execute();
      expect(rows).toEqual([
        { action: 'member.push_token_removed', payload: {} },
        { action: 'member.push_token_added', payload: { platform: 'ios' } },
      ]);
      expect(JSON.stringify(rows)).not.toContain('ExponentPushToken');
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
