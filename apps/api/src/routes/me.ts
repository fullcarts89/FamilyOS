import type { Database, NotificationPrefs } from '@familyos/db';
import { Hono } from 'hono';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict } from '../http/errors';
import { parseBody } from '../http/validation';

const DEFAULT_NOTIFICATIONS: Required<NotificationPrefs> = {
  morning_checkin: true,
  handoff_reminders: true,
  // Opt-in: the plan asks for notifications that never exist to drive engagement.
  partner_changes: false,
  weekly_reset_reminder: true,
};
const DEFAULT_MORNING_TIME = '07:30';
const DEFAULT_WEEKLY_RESET = { weekday: 7, time: '19:00' };

const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Notifications = z
  .object({
    morningCheckin: z.boolean().optional(),
    handoffReminders: z.boolean().optional(),
    partnerChanges: z.boolean().optional(),
    weeklyResetReminder: z.boolean().optional(),
  })
  .strict();

const UpdateState = z
  .object({
    /** 0 before the member has saved anything. */
    expectedVersion: z.number().int().min(0),
    notifications: Notifications.optional(),
    quietHours: z.object({ start: LocalTime, end: LocalTime }).strict().nullable().optional(),
    haptics: z.boolean().optional(),
    sound: z.boolean().optional(),
    /** When the morning check-in comes, local time. */
    morningTime: LocalTime.optional(),
    /** When the Weekly Reset reminder comes: ISO weekday (1 = Monday … 7 = Sunday), local time. */
    weeklyReset: z
      .object({ weekday: z.number().int().min(1).max(7), time: LocalTime })
      .strict()
      .optional(),
    /** Generic notification text on the lock screen. */
    hideDetails: z.boolean().optional(),
  })
  .strict();

/** An Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
const PushToken = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/);
const RegisterPushToken = z.object({ token: PushToken, platform: z.literal('ios') }).strict();
const RemovePushToken = z.object({ token: PushToken }).strict();
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** The app's own keys for one-time moments; never free text. */
const AckKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/);
const Acknowledge = z.object({ key: AckKey }).strict();

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

async function loadState(trx: Transaction<Database>, member: CurrentMember) {
  return trx
    .selectFrom('app.member_state')
    .selectAll()
    .where('member_id', '=', member.id)
    .where('household_id', '=', member.householdId)
    .executeTakeFirst();
}

function stateView(row: Awaited<ReturnType<typeof loadState>>) {
  const prefs = { ...DEFAULT_NOTIFICATIONS, ...(row?.notifications ?? {}) };
  return {
    lastSeenAt: iso(row?.last_seen_at ?? null),
    notifications: {
      morningCheckin: prefs.morning_checkin,
      handoffReminders: prefs.handoff_reminders,
      partnerChanges: prefs.partner_changes,
      weeklyResetReminder: prefs.weekly_reset_reminder,
    },
    quietHours:
      row?.quiet_hours_start && row.quiet_hours_end
        ? { start: row.quiet_hours_start.slice(0, 5), end: row.quiet_hours_end.slice(0, 5) }
        : null,
    haptics: row?.haptics ?? true,
    sound: row?.sound ?? false,
    morningTime: row?.morning_time.slice(0, 5) ?? DEFAULT_MORNING_TIME,
    weeklyReset: row
      ? { weekday: row.weekly_reset_day, time: row.weekly_reset_time.slice(0, 5) }
      : DEFAULT_WEEKLY_RESET,
    hideDetails: row?.hide_details ?? true,
    version: row?.version ?? 0,
  };
}

/**
 * The signed-in member's own state: preferences, when they last looked, and which one-time
 * moments they've already seen. Nobody else can read or change these (row-level security).
 */
export function meRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  app.get('/state', async (c) => {
    authorize(c, 'household.read');
    return c.json({ state: stateView(await loadState(c.get('trx'), c.get('member'))) });
  });

  app.patch('/state', async (c) => {
    authorize(c, 'household.read');
    const body = await parseBody(c.req.raw, UpdateState);
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await loadState(trx, member);
    if ((current?.version ?? 0) !== body.expectedVersion) throw conflict();

    const n = body.notifications;
    const notifications: NotificationPrefs = {
      ...DEFAULT_NOTIFICATIONS,
      ...(current?.notifications ?? {}),
      ...(n?.morningCheckin !== undefined && { morning_checkin: n.morningCheckin }),
      ...(n?.handoffReminders !== undefined && { handoff_reminders: n.handoffReminders }),
      ...(n?.partnerChanges !== undefined && { partner_changes: n.partnerChanges }),
      ...(n?.weeklyResetReminder !== undefined && { weekly_reset_reminder: n.weeklyResetReminder }),
    };
    const changes = {
      ...(n && { notifications }),
      ...(body.quietHours !== undefined && {
        quiet_hours_start: body.quietHours?.start ?? null,
        quiet_hours_end: body.quietHours?.end ?? null,
      }),
      ...(body.haptics !== undefined && { haptics: body.haptics }),
      ...(body.sound !== undefined && { sound: body.sound }),
      ...(body.morningTime !== undefined && { morning_time: body.morningTime }),
      ...(body.weeklyReset !== undefined && {
        weekly_reset_day: body.weeklyReset.weekday,
        weekly_reset_time: body.weeklyReset.time,
      }),
      ...(body.hideDetails !== undefined && { hide_details: body.hideDetails }),
    };
    const fields = [
      ...(n ? ['notifications'] : []),
      ...(body.quietHours !== undefined ? ['quietHours'] : []),
      ...(body.haptics !== undefined ? ['haptics'] : []),
      ...(body.sound !== undefined ? ['sound'] : []),
      ...(body.morningTime !== undefined ? ['morningTime'] : []),
      ...(body.weeklyReset !== undefined ? ['weeklyReset'] : []),
      ...(body.hideDetails !== undefined ? ['hideDetails'] : []),
    ];
    if (fields.length === 0) throw new ApiError(422, 'no_changes');

    if (current) {
      await trx
        .updateTable('app.member_state')
        .set({ ...changes, version: current.version + 1, updated_at: now() })
        .where('member_id', '=', member.id)
        .where('household_id', '=', member.householdId)
        .where('version', '=', current.version)
        .execute();
    } else {
      await trx
        .insertInto('app.member_state')
        .values({
          member_id: member.id,
          household_id: member.householdId,
          notifications,
          quiet_hours_start: null,
          quiet_hours_end: null,
          ...changes,
          updated_at: now(),
        })
        .execute();
    }
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'member',
      entityId: member.id,
      action: 'member.preferences_updated',
      payload: { fields },
      requestId: c.get('requestId'),
    });
    return c.json({ state: stateView(await loadState(trx, member)) });
  });

  // Marks now as seen and says when the member last looked (for "since you last looked").
  app.post('/seen', async (c) => {
    authorize(c, 'household.read');
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await loadState(trx, member);
    const seenAt = now();
    await trx
      .insertInto('app.member_state')
      .values({
        member_id: member.id,
        household_id: member.householdId,
        last_seen_at: seenAt,
        quiet_hours_start: null,
        quiet_hours_end: null,
        updated_at: seenAt,
      })
      .onConflict((oc) => oc.column('member_id').doUpdateSet({ last_seen_at: seenAt }))
      .execute();
    return c.json({ previousSeenAt: iso(current?.last_seen_at ?? null), seenAt: iso(seenAt) });
  });

  // This device's push token (iPhone). One device belongs to one member at a time: registering
  // a token another member of the household had moves it here; one held in another household
  // is refused (409). 201 when added, 200 when it was already this member's. The token is never
  // returned or audited.
  app.post('/push-tokens', async (c) => {
    authorize(c, 'household.read');
    const body = await parseBody(c.req.raw, RegisterPushToken);
    const trx = c.get('trx');
    const member = c.get('member');
    let row: { token_id: string; created: boolean } | undefined;
    try {
      ({
        rows: [row],
      } = await sql<{
        token_id: string;
        created: boolean;
      }>`select * from app.register_push_token(${body.token}, ${body.platform})`.execute(trx));
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('token_in_use');
      throw error;
    }
    if (!row) throw new Error('push token not registered');
    const token = await trx
      .selectFrom('app.device_push_token')
      .select(['id', 'platform', 'created_at', 'last_used_at'])
      .where('id', '=', row.token_id)
      .where('member_id', '=', member.id)
      .executeTakeFirstOrThrow();
    if (row.created) {
      await recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'member',
        entityId: member.id,
        action: 'member.push_token_added',
        payload: { platform: body.platform },
        requestId: c.get('requestId'),
      });
    }
    return c.json(
      {
        pushToken: {
          id: token.id,
          platform: token.platform,
          createdAt: iso(token.created_at),
          lastUsedAt: iso(token.last_used_at),
        },
      },
      row.created ? 201 : 200,
    );
  });

  // Stop notifications on this device (sign-out, or the member turned them off in iOS).
  // The token goes in the body, never the URL. 204 whether or not it was registered.
  app.delete('/push-tokens', async (c) => {
    authorize(c, 'household.read');
    const body = await parseBody(c.req.raw, RemovePushToken);
    const trx = c.get('trx');
    const member = c.get('member');
    const removed = await trx
      .deleteFrom('app.device_push_token')
      .where('household_id', '=', member.householdId)
      .where('member_id', '=', member.id)
      .where('expo_push_token', '=', body.token)
      .executeTakeFirst();
    if (removed.numDeletedRows > 0n) {
      await recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'member',
        entityId: member.id,
        action: 'member.push_token_removed',
        payload: {},
        requestId: c.get('requestId'),
      });
    }
    return c.body(null, 204);
  });

  app.get('/acknowledgments', async (c) => {
    authorize(c, 'household.read');
    const keys = (c.req.query('keys') ?? '').split(',').filter(Boolean);
    if (keys.length === 0 || keys.length > 50 || keys.some((k) => !AckKey.safeParse(k).success)) {
      throw new ApiError(422, 'invalid_keys');
    }
    const member = c.get('member');
    const rows = await c
      .get('trx')
      .selectFrom('app.member_acknowledgment')
      .select(['key', 'acknowledged_at'])
      .where('member_id', '=', member.id)
      .where('household_id', '=', member.householdId)
      .where('key', 'in', keys)
      .orderBy('key')
      .execute();
    return c.json({
      acknowledgments: rows.map((r) => ({ key: r.key, acknowledgedAt: iso(r.acknowledged_at) })),
    });
  });

  // Idempotent: the first time records it (201); later calls return the original (200).
  app.post('/acknowledgments', async (c) => {
    authorize(c, 'household.read');
    const body = await parseBody(c.req.raw, Acknowledge);
    const trx = c.get('trx');
    const member = c.get('member');
    const created = await trx
      .insertInto('app.member_acknowledgment')
      .values({
        member_id: member.id,
        household_id: member.householdId,
        key: body.key,
        acknowledged_at: now(),
      })
      .onConflict((oc) => oc.columns(['member_id', 'key']).doNothing())
      .returning('acknowledged_at')
      .executeTakeFirst();
    const row =
      created ??
      (await trx
        .selectFrom('app.member_acknowledgment')
        .select('acknowledged_at')
        .where('member_id', '=', member.id)
        .where('household_id', '=', member.householdId)
        .where('key', '=', body.key)
        .executeTakeFirstOrThrow());
    return c.json(
      { acknowledgment: { key: body.key, acknowledgedAt: iso(row.acknowledged_at) } },
      created ? 201 : 200,
    );
  });

  return app;
}
