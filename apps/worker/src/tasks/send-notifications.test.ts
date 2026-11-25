import { createDb, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { JobHelpers } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PushMessage, PushSender, PushTicket } from '../push';
import { sendNotifications } from './send-notifications';

const url = process.env.DATABASE_URL;

/** Records what would have gone to Expo, and answers with tickets it's told to. */
class FakeSender implements PushSender {
  sent: PushMessage[][] = [];
  failWith: Error | null = null;
  unregistered = new Set<string>();
  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (this.failWith) throw this.failWith;
    this.sent.push([...messages]);
    return messages.map((m) =>
      this.unregistered.has(m.to) ? { ok: false, error: 'DeviceNotRegistered' } : { ok: true },
    );
  }
}

const OWNER_PHONE = 'ExponentPushToken[ownerphone00000000000]';
const ADULT_PHONE = 'ExponentPushToken[adultphone00000000000]';
const ADULT_OLD_PHONE = 'ExponentPushToken[adultoldphone000000000]';

describe.skipIf(!url)('send_notifications', () => {
  let db: Kysely<Database>;
  let h: SeededHousehold;
  let dropOffId: string;
  let itemId: string;
  const sender = new FakeSender();
  let clock = new Date('2026-11-16T15:30:00Z'); // Monday 07:30 in Los Angeles.
  const info = vi.fn();
  const error = vi.fn();
  const helpers = { logger: { info, error }, job: { id: '9' } } as unknown as JobHelpers;
  const task = () =>
    sendNotifications(db, { sender, now: () => clock, households: async () => [{ id: h.id }] });
  const log = () =>
    db
      .selectFrom('app.notification_log')
      .select(['member_id', 'kind', 'status'])
      .where('household_id', '=', h.id)
      .orderBy('id')
      .execute();
  const lastBatch = () => sender.sent.at(-1) ?? [];

  beforeAll(async () => {
    db = createDb({ connectionString: url ?? '', maxConnections: 3 });
    h = await seedHousehold(db, 'Worker Notify');
    await db
      .updateTable('app.household')
      .set({ timezone: 'America/Los_Angeles' })
      .where('id', '=', h.id)
      .execute();
    dropOffId = await seedEvent(db, h, {
      title: 'Daycare drop-off',
      startsAt: '2026-11-16T16:15:00Z',
      endsAt: '2026-11-16T16:35:00Z',
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'drop_off',
      carePlace: 'Little Oaks',
    });
    for (const title of ['Pay daycare', 'Book dentist']) {
      await db
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title,
          status: 'ready',
          owner_member_id: h.owner.id,
          due_on: '2026-11-16',
          created_by_member_id: h.owner.id,
        })
        .execute();
    }
    itemId = (
      await db
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title: 'Renew car registration',
          status: 'ready',
          owner_member_id: h.adult.id,
          created_by_member_id: h.owner.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    await db
      .insertInto('app.meal')
      .values({
        household_id: h.id,
        on_date: '2026-11-16',
        title: 'Salmon',
        cook_member_id: h.adult.id,
        created_by_member_id: h.owner.id,
      })
      .execute();
    // The owner wants partner changes and details on the lock screen; the adult keeps the
    // defaults (generic text).
    await db
      .insertInto('app.member_state')
      .values({
        member_id: h.owner.id,
        household_id: h.id,
        notifications: {
          morning_checkin: true,
          handoff_reminders: true,
          partner_changes: true,
          weekly_reset_reminder: true,
        },
        quiet_hours_start: '22:00',
        quiet_hours_end: '06:30',
        hide_details: false,
        updated_at: clock,
      })
      .execute();
    await db
      .insertInto('app.device_push_token')
      .values([
        {
          household_id: h.id,
          member_id: h.owner.id,
          expo_push_token: OWNER_PHONE,
          platform: 'ios',
        },
        {
          household_id: h.id,
          member_id: h.adult.id,
          expo_push_token: ADULT_PHONE,
          platform: 'ios',
        },
        {
          household_id: h.id,
          member_id: h.adult.id,
          expo_push_token: ADULT_OLD_PHONE,
          platform: 'ios',
        },
      ])
      .execute();
    sender.unregistered.add(ADULT_OLD_PHONE);
  });

  afterAll(async () => {
    await purgeHouseholds(db, [h.id]);
    await db.destroy();
  });

  it('sends each member their morning check-in, once, and forgets gone devices', async () => {
    await task()({}, helpers);
    const byToken = Object.fromEntries(lastBatch().map((m) => [m.to, m]));
    expect(byToken[OWNER_PHONE]).toEqual({
      to: OWNER_PHONE,
      title: 'Good morning',
      body: 'Today: drop-off 8:15 AM (you), 2 things due, dinner: Salmon (Worker Notify Adult)',
      data: { kind: 'morning_checkin', householdId: h.id },
      urgent: false,
    });
    expect(byToken[ADULT_PHONE]).toMatchObject({
      title: 'Good morning',
      body: 'Your morning check-in is ready.',
    });
    expect(byToken[ADULT_OLD_PHONE]).toBeDefined();
    const rows = await log();
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { member_id: h.owner.id, kind: 'morning_checkin', status: 'sent' },
        { member_id: h.adult.id, kind: 'morning_checkin', status: 'sent' },
      ]),
    );
    const tokens = await db
      .selectFrom('app.device_push_token')
      .select('expo_push_token')
      .where('household_id', '=', h.id)
      .execute();
    expect(tokens.map((t) => t.expo_push_token).sort()).toEqual([ADULT_PHONE, OWNER_PHONE].sort());

    // Five minutes later: nothing new is due, nothing is sent again.
    const before = sender.sent.length;
    clock = new Date('2026-11-16T15:35:00Z');
    await task()({}, helpers);
    expect(sender.sent.length).toBe(before);
    expect(info).toHaveBeenLastCalledWith(
      'notifications',
      expect.objectContaining({ sent: 0, failed: 0, householdsFailed: 0 }),
    );
  });

  it('reminds the member covering a handoff, and batches what their partner did', async () => {
    // The adult took something off the owner's plate a few minutes ago.
    clock = new Date('2026-11-16T15:45:00Z');
    await db
      .insertInto('app.audit_event')
      .values({
        household_id: h.id,
        actor_member_id: h.adult.id,
        entity_type: 'work_item',
        entity_id: itemId,
        action: 'work_item.updated',
        payload: {
          fields: ['owner_member_id'],
          ownerMemberId: h.adult.id,
          fromOwnerMemberId: h.owner.id,
          version: 2,
        },
        created_at: new Date('2026-11-16T15:40:00Z'),
      })
      .execute();
    await task()({}, helpers);
    const batch = lastBatch();
    expect(batch.map((m) => [m.to, m.data.kind, m.title, m.body, m.urgent])).toEqual([
      [
        OWNER_PHONE,
        'handoff_reminder',
        'Worker Notify Child’s drop-off at 8:15 AM',
        'In 30 minutes, at Little Oaks.',
        true,
      ],
      [
        OWNER_PHONE,
        'partner_changes',
        'From Worker Notify Adult',
        'Took “Renew car registration” off your plate.',
        false,
      ],
    ]);
  });

  it('records a failed send and never retries it', async () => {
    clock = new Date('2026-11-17T15:46:00Z'); // Tuesday 07:46: the check-in is due.
    sender.failWith = new TypeError('fetch failed');
    const sentBefore = sender.sent.length;
    await task()({}, helpers);
    sender.failWith = null;
    expect(error).toHaveBeenCalledWith('push request failed', {
      householdId: h.id,
      errorName: 'TypeError',
    });
    // The owner still has Monday's two tasks open; the adult has nothing today (skipped).
    const tuesday = (await log()).slice(-2);
    expect(tuesday).toEqual(
      expect.arrayContaining([
        { member_id: h.owner.id, kind: 'morning_checkin', status: 'failed' },
        { member_id: h.adult.id, kind: 'morning_checkin', status: 'skipped' },
      ]),
    );
    clock = new Date('2026-11-17T15:50:00Z');
    await task()({}, helpers);
    expect(sender.sent.length).toBe(sentBefore);
  });

  it('tells the adult asked to cover, then the asker their answer', async () => {
    // Monday 07:55: the owner asks the adult to take the 08:15 drop-off.
    clock = new Date('2026-11-16T15:55:00Z');
    const { id } = await db
      .insertInto('app.cover_request')
      .values({
        household_id: h.id,
        event_id: dropOffId,
        occurrence_date: '2026-11-16',
        asked_member_id: h.adult.id,
        asked_by_member_id: h.owner.id,
        created_at: new Date('2026-11-16T15:54:00Z'),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const before = sender.sent.length;
    await task()({}, helpers);
    expect(sender.sent.length).toBe(before + 1);
    // The adult keeps the defaults: generic text (their old phone was forgotten earlier).
    expect(lastBatch().map((m) => [m.to, m.data.kind, m.title, m.body])).toEqual([
      [ADULT_PHONE, 'cover_request', 'Cover request', 'You’ve been asked to cover a handoff.'],
    ]);

    // They accept: the owner (who shows details) hears so, and the adult now gets the reminder.
    clock = new Date('2026-11-16T16:00:00Z');
    await db
      .insertInto('app.event_exception')
      .values({
        household_id: h.id,
        event_id: dropOffId,
        occurrence_date: '2026-11-16',
        kind: 'cover',
        cover_member_id: h.adult.id,
        created_by_member_id: h.adult.id,
      })
      .execute();
    await db
      .updateTable('app.cover_request')
      .set({ status: 'accepted', responded_at: new Date('2026-11-16T15:58:00Z'), version: 2 })
      .where('id', '=', id)
      .execute();
    await task()({}, helpers);
    const batch = lastBatch().map((m) => [m.to, m.data.kind, m.title, m.body]);
    expect(batch).toContainEqual([
      OWNER_PHONE,
      'cover_response',
      'Worker Notify Adult will cover',
      'Worker Notify Child’s drop-off on Mon, Nov 16 at 8:15 AM.',
    ]);
    expect(batch).toContainEqual([
      ADULT_PHONE,
      'handoff_reminder',
      'Handoff soon',
      'You have a handoff in 15 minutes.',
    ]);
    expect(batch.filter((m) => m[1] === 'cover_request')).toEqual([]);
  });

  it('while the owner is away: the adult covering gets the handoff reminder, and hears once', async () => {
    // Wednesday: the owner is away that day; the adult covers. The owner handed a task over.
    const wednesdayDrop = await seedEvent(db, h, {
      title: 'Daycare drop-off',
      startsAt: '2026-11-18T16:15:00Z',
      endsAt: '2026-11-18T16:35:00Z',
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'drop_off',
      carePlace: 'Little Oaks',
    });
    const { id: periodId } = await db
      .insertInto('app.away_period')
      .values({
        household_id: h.id,
        member_id: h.owner.id,
        starts_on: '2026-11-18',
        ends_on: '2026-11-18',
        cover_member_id: h.adult.id,
        created_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    clock = new Date('2026-11-18T15:50:00Z'); // 07:50 in Los Angeles.
    await db
      .insertInto('app.away_handover')
      .values({
        household_id: h.id,
        away_period_id: periodId,
        work_item_id: itemId,
        from_member_id: h.owner.id,
        to_member_id: h.adult.id,
        outcome: 'moved',
        created_by_member_id: h.owner.id,
        created_at: new Date('2026-11-18T15:40:00Z'),
      })
      .execute();
    const before = sender.sent.length;
    await task()({}, helpers);
    const sent = sender.sent.slice(before).flat();
    const about = (kind: string) => sent.filter((m) => m.data.kind === kind).map((m) => m.to);
    expect(about('handoff_reminder')).toEqual([ADULT_PHONE]);
    expect(about('away_handover')).toEqual([ADULT_PHONE]);
    expect(sent.find((m) => m.data.kind === 'away_handover')).toMatchObject({
      title: 'While someone’s away',
      body: 'Some things moved to you.',
    });

    // Once per away period.
    clock = new Date('2026-11-18T15:55:00Z');
    const again = sender.sent.length;
    await task()({}, helpers);
    expect(
      sender.sent
        .slice(again)
        .flat()
        .filter((m) => m.data.kind === 'away_handover'),
    ).toEqual([]);
    await db.deleteFrom('app.away_period').where('id', '=', periodId).execute();
    await db.deleteFrom('app.event').where('id', '=', wednesdayDrop).execute();
  });

  it('logs counts only: no text, titles or tokens', () => {
    const logged = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    for (const secret of [
      'Salmon',
      'drop-off',
      'car registration',
      'ExponentPushToken',
      'Little Oaks',
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe('send_notifications with sending off', () => {
  it('logs why and plans, records and sends nothing', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const households = vi.fn(async () => [{ id: 'h' }]);
    const task = sendNotifications({} as Kysely<Database>, { sender: null, households });
    await task({}, { logger: { info, error }, job: { id: '1' } } as unknown as JobHelpers);
    expect(households).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('EXPO_ACCESS_TOKEN is not set'));
  });
});
