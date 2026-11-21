import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withNotifierContext, withRequestContext, withSchedulerContext } from './context';
import { claimNotifications, loadNotificationData, recordDeliveries } from './notifier';
import type { Database } from './schema';
import {
  enableLogin,
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  type SeededHousehold,
} from './testing';

// Notifications: push tokens, the log, and the notifier role's narrow view.
type Trx = Transaction<Database>;
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
const token = (n: number | string) => `ExponentPushToken[test-${n}-${randomUUID().slice(0, 8)}]`;
const register = (h: SeededHousehold, member: SeededHousehold['owner'], value: string) =>
  withRequestContext(requireDb(), asMember(h, member), async (trx) => {
    const { rows } = await sql<{
      token_id: string;
      created: boolean;
    }>`select * from app.register_push_token(${value}, 'ios')`.execute(trx);
    return rows[0];
  });
const tokensOf = (memberId: string) =>
  requireDb()
    .selectFrom('app.device_push_token')
    .select(['expo_push_token', 'household_id'])
    .where('member_id', '=', memberId)
    .orderBy('created_at')
    .execute();

describe.skipIf(!db)('push tokens', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Tokens A');
    b = await seedHousehold(requireDb(), 'Tokens B');
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
  });

  it('registers once per device, idempotently, through the function only', async () => {
    const value = token('owner');
    expect(await register(a, a.owner, value)).toMatchObject({ created: true });
    expect(await register(a, a.owner, value)).toMatchObject({ created: false });
    expect(await tokensOf(a.owner.id)).toEqual([{ expo_push_token: value, household_id: a.id }]);
    await expect(
      withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
        trx
          .insertInto('app.device_push_token')
          .values({
            member_id: a.owner.id,
            household_id: a.id,
            expo_push_token: token('direct'),
            platform: 'ios',
          })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(register(a, a.owner, 'not-a-token')).rejects.toThrow(/check constraint/);
  });

  it('shows and removes only the member’s own tokens', async () => {
    const theirs = token('adult');
    await register(a, a.adult, theirs);
    const seen = await withRequestContext(requireDb(), asMember(a, a.owner), async (trx) => ({
      rows: await trx.selectFrom('app.device_push_token').select('member_id').execute(),
      deleted: (
        await trx
          .deleteFrom('app.device_push_token')
          .where('expo_push_token', '=', theirs)
          .executeTakeFirst()
      ).numDeletedRows,
    }));
    expect(seen.rows.every((r) => r.member_id === a.owner.id)).toBe(true);
    expect(seen.deleted).toBe(0n);
    expect(await tokensOf(a.adult.id)).toHaveLength(1);
  });

  it('moves a device within a household, refuses one held in another, keeps five', async () => {
    const shared = token('shared');
    await register(a, a.adult, shared);
    // The caregiver signs in on the adult's old phone.
    expect(await register(a, a.caregiver, shared)).toMatchObject({ created: true });
    expect((await tokensOf(a.adult.id)).map((t) => t.expo_push_token)).not.toContain(shared);
    // Someone in another household can't take it over.
    await expect(register(b, b.owner, shared)).rejects.toThrow(/push token in use/);
    expect((await tokensOf(a.caregiver.id)).map((t) => t.expo_push_token)).toContain(shared);

    for (let i = 0; i < 7; i++) await register(b, b.adult, token(`many-${i}`));
    expect(await tokensOf(b.adult.id)).toHaveLength(5);
  });

  it('lets only active members with an account register', async () => {
    await expect(
      withRequestContext(
        requireDb(),
        { userId: randomUUID(), householdId: a.id, memberId: a.child.id },
        (trx) => sql`select * from app.register_push_token(${token('child')}, 'ios')`.execute(trx),
      ),
    ).rejects.toThrow(/not an active member/);
    await expect(
      withRequestContext(
        requireDb(),
        { userId: a.owner.userId ?? '', householdId: b.id, memberId: a.owner.id },
        (trx) => sql`select * from app.register_push_token(${token('x')}, 'ios')`.execute(trx),
      ),
    ).rejects.toThrow(/not an active member/);
  });
});

describe.skipIf(!db)('the notifier role', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;
  let careEvent: string;
  let ownEvent: string;
  let importedEvent: string;
  const now = new Date('2026-11-16T15:30:00Z'); // Monday 07:30 in Los Angeles.

  beforeAll(async () => {
    const d = requireDb();
    a = await seedHousehold(d, 'Notifier A');
    b = await seedHousehold(d, 'Notifier B');
    careEvent = await seedEvent(d, a, {
      title: 'Daycare drop-off',
      startsAt: '2026-11-16T16:15:00Z',
      endsAt: '2026-11-16T16:35:00Z',
      memberIds: [a.owner.id, a.child.id],
      careMemberId: a.child.id,
      careAction: 'drop_off',
      carePlace: 'Little Oaks',
    });
    ownEvent = await seedEvent(d, a, {
      title: 'Therapy',
      startsAt: '2026-11-16T18:00:00Z',
      endsAt: '2026-11-16T19:00:00Z',
      memberIds: [a.owner.id],
    });
    const source = await d
      .insertInto('app.calendar_source')
      .values({
        household_id: a.id,
        member_id: a.adult.id,
        label: 'Work',
        url_ciphertext: Buffer.alloc(40, 1),
        url_nonce: Buffer.alloc(12, 2),
        url_hint: 'calendar.example.test/…',
        created_by_member_id: a.adult.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    importedEvent = (
      await d
        .insertInto('app.event')
        .values({
          household_id: a.id,
          title: 'Imported',
          starts_at: '2026-11-16T20:00:00Z',
          ends_at: '2026-11-16T21:00:00Z',
          timezone: 'UTC',
          source_calendar_id: source.id,
          external_uid: 'x',
          external_recurrence_id: 'single',
          created_by_member_id: a.adult.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    await d
      .insertInto('app.work_item')
      .values({
        household_id: a.id,
        title: 'Pay daycare',
        status: 'ready',
        owner_member_id: a.owner.id,
        due_on: '2026-11-16',
        created_by_member_id: a.owner.id,
      })
      .execute();
    await d
      .insertInto('app.meal')
      .values({
        household_id: a.id,
        on_date: '2026-11-16',
        title: 'Salmon',
        cook_member_id: a.adult.id,
        created_by_member_id: a.owner.id,
      })
      .execute();
    await d
      .insertInto('app.member_state')
      .values({
        member_id: a.owner.id,
        household_id: a.id,
        quiet_hours_start: '22:00',
        quiet_hours_end: '06:30',
        morning_time: '07:15',
        last_seen_at: now,
        updated_at: now,
      })
      .execute();
    await register(a, a.owner, token('notifier-a'));
    await register(b, b.owner, token('notifier-b'));
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
  });

  it('sees care events of one household only, never their titles, notes or other events', async () => {
    const seen = await withNotifierContext(requireDb(), a.id, async (trx) => ({
      events: (await trx.selectFrom('app.event').select('id').execute()).map((e) => e.id),
      attendance: (
        await trx.selectFrom('app.event_member').select('event_id').distinct().execute()
      ).map((r) => r.event_id),
      tokens: (await trx.selectFrom('app.device_push_token').select('household_id').execute()).map(
        (t) => t.household_id,
      ),
    }));
    expect(seen.events).toEqual([careEvent]);
    expect(seen.attendance).toEqual([careEvent]);
    expect(seen.events).not.toContain(ownEvent);
    expect(seen.events).not.toContain(importedEvent);
    expect(new Set(seen.tokens)).toEqual(new Set([a.id]));
    const attempts: ((trx: Trx) => Promise<unknown>)[] = [
      (trx: Trx) => trx.selectFrom('app.event').select('title').execute(),
      (trx: Trx) => trx.selectFrom('app.event').select('notes').execute(),
      (trx: Trx) => trx.selectFrom('app.work_item').select('description').execute(),
      // When a member last looked is readable (their first partner batch starts there); their
      // other preferences outside notifications are not.
      (trx: Trx) => trx.selectFrom('app.member_state').select('sound').execute(),
      (trx: Trx) => trx.selectFrom('app.weekly_plan').select('notes').execute(),
      (trx: Trx) => trx.selectFrom('app.contact').select('id').execute(),
      (trx: Trx) => trx.selectFrom('app.calendar_source').select('id').execute(),
      (trx: Trx) => trx.selectFrom('app.budget_snapshot').select('id').execute(),
      (trx: Trx) => trx.selectFrom('app.grocery_item').select('id').execute(),
      (trx: Trx) => trx.selectFrom('app.household').select('name').execute(),
      (trx: Trx) => trx.updateTable('app.work_item').set({ title: 'x' }).execute(),
      (trx: Trx) =>
        trx
          .insertInto('app.audit_event')
          .values({
            household_id: a.id,
            actor_member_id: null,
            entity_type: 'member',
            entity_id: a.owner.id,
            action: 'x',
          })
          .execute(),
      (trx: Trx) => trx.deleteFrom('app.notification_log').execute(),
    ];
    for (const forbidden of attempts) {
      await expect(withNotifierContext(requireDb(), a.id, forbidden)).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("can't write another household's log or touch its tokens", async () => {
    await expect(
      withNotifierContext(requireDb(), a.id, (trx) =>
        trx
          .insertInto('app.notification_log')
          .values({
            household_id: b.id,
            member_id: b.owner.id,
            kind: 'morning_checkin',
            dedupe_key: 'morning_checkin:2026-11-16',
            status: 'pending',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
    const deleted = await withNotifierContext(requireDb(), a.id, (trx) =>
      trx.deleteFrom('app.device_push_token').where('household_id', '=', b.id).executeTakeFirst(),
    );
    expect(deleted.numDeletedRows).toBe(0n);
    expect(await tokensOf(b.owner.id)).toHaveLength(1);
  });

  it('is not the scheduler: the scheduler still sees no tokens, preferences or log', async () => {
    for (const table of ['app.device_push_token', 'app.notification_log'] as const) {
      await expect(
        withSchedulerContext(requireDb(), a.id, (trx) =>
          trx.selectFrom(table).select('household_id').execute(),
        ),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx.selectFrom('app.member_state').select('member_id').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('is available to the worker login, which still cannot act as the API', async () => {
    const login = await enableLogin(url ?? '', 'familyos_worker_login');
    const worker = createDb({ connectionString: login.url, maxConnections: 1 });
    try {
      const data = await withNotifierContext(worker, a.id, (trx) =>
        loadNotificationData(trx, a.id, now),
      );
      expect(data?.recipients.map((r) => r.memberId)).toEqual([a.owner.id]);
      await expect(sql`set role familyos_api`.execute(worker)).rejects.toThrow(
        /permission denied|must be able to SET ROLE/,
      );
    } finally {
      await worker.destroy();
      await login.disable();
    }
  });

  it('loads what one household needs to plan, with preferences and nothing private', async () => {
    const data = await withNotifierContext(requireDb(), a.id, (trx) =>
      loadNotificationData(trx, a.id, now),
    );
    expect(data).toMatchObject({
      timeZone: 'America/Los_Angeles',
      today: '2026-11-16',
      dinner: { title: 'Salmon', cookMemberId: a.adult.id },
      committedWeeks: [],
    });
    expect(data?.recipients).toEqual([
      {
        memberId: a.owner.id,
        tokens: [{ id: expect.any(String), token: expect.stringMatching(/^ExponentPushToken/) }],
        settings: expect.objectContaining({
          morningTime: '07:15',
          quietHours: { start: '22:00', end: '06:30' },
          partnerChanges: false,
          weeklyReset: { weekday: 7, time: '19:00' },
          // Lock-screen details stay hidden unless the member turns them on.
          hideDetails: true,
        }),
        lastSeenAt: now.toISOString(),
      },
    ]);
    expect(data?.occurrences.map((o) => [o.eventId, o.title, [...o.memberIds].sort()])).toEqual([
      [careEvent, '', [a.owner.id, a.child.id].sort()],
    ]);
    expect(data?.tasks.map((t) => t.title)).toEqual(['Pay daycare']);
    // Nobody in B has a device registered in A's transaction: B is loaded on its own.
    expect(
      await withNotifierContext(requireDb(), a.id, (trx) => loadNotificationData(trx, b.id, now)),
    ).toBeNull();
  });

  it('records each notification once, and its outcome', async () => {
    const claim = (status: 'pending' | 'skipped') =>
      withNotifierContext(requireDb(), a.id, (trx) =>
        claimNotifications(
          trx,
          a.id,
          [
            {
              memberId: a.owner.id,
              kind: 'morning_checkin',
              dedupeKey: 'morning_checkin:2026-11-16',
              status,
            },
          ],
          now,
        ),
      );
    const first = await claim('pending');
    expect([...first.keys()]).toEqual([`${a.owner.id}|morning_checkin:2026-11-16`]);
    expect((await claim('pending')).size).toBe(0);
    const [logId] = [...first.values()];
    const [tokenRow] = await requireDb()
      .selectFrom('app.device_push_token')
      .select('id')
      .where('member_id', '=', a.owner.id)
      .execute();
    await withNotifierContext(requireDb(), a.id, (trx) =>
      recordDeliveries(
        trx,
        a.id,
        {
          sent: logId ? [logId] : [],
          failed: [],
          usedTokenIds: [],
          unregisteredTokenIds: tokenRow ? [tokenRow.id] : [],
        },
        now,
      ),
    );
    expect(
      await requireDb()
        .selectFrom('app.notification_log')
        .select(['status', 'kind'])
        .where('member_id', '=', a.owner.id)
        .execute(),
    ).toEqual([{ status: 'sent', kind: 'morning_checkin' }]);
    expect(await tokensOf(a.owner.id)).toEqual([]);
  });

  it('defaults partner changes to off and validates the new preferences', async () => {
    const row = await requireDb()
      .insertInto('app.member_state')
      .values({
        member_id: a.adult.id,
        household_id: a.id,
        quiet_hours_start: null,
        quiet_hours_end: null,
        updated_at: now,
      })
      .returning(['notifications', 'morning_time', 'weekly_reset_day', 'weekly_reset_time'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      notifications: {
        morning_checkin: true,
        handoff_reminders: true,
        partner_changes: false,
        weekly_reset_reminder: true,
      },
      morning_time: '07:30:00',
      weekly_reset_day: 7,
      weekly_reset_time: '19:00:00',
    });
    await expect(
      requireDb()
        .updateTable('app.member_state')
        .set({ weekly_reset_day: 8 })
        .where('member_id', '=', a.adult.id)
        .execute(),
    ).rejects.toThrow(/check constraint/);
  });
});
