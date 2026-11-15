import {
  DEFAULT_NOTIFICATION_SETTINGS,
  addDays,
  expandEvents,
  isCaredFor,
  localDateOf,
  startOfLocalDay,
  MAX_EVENT_DAYS,
  type EventOccurrence,
  type EventSeries,
  type NotificationKind,
  type NotificationLogEntry,
  type NotificationSettings,
  type NotifierAuditRow,
  type NotifierItem,
  type PartnerContext,
  type RhythmMember,
  type RhythmTask,
} from '@familyos/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database, NotificationLogStatus, NotificationPrefs } from './schema';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * What the notifier reads for one household, as `familyos_notifier` (see
 * withNotifierContext): every query names the household, and row-level security limits it to
 * that household's care events, tasks, dinner, decisions, plan and audit IDs. Nothing here
 * reads members' imported calendars, event notes or locations, or task descriptions.
 */

export interface Recipient {
  memberId: string;
  tokens: { id: string; token: string }[];
  settings: NotificationSettings;
}

export interface HouseholdNotificationData {
  timeZone: string;
  today: string;
  members: RhythmMember[];
  recipients: Recipient[];
  /** Care occurrences today and tomorrow, covers and skips applied. */
  occurrences: EventOccurrence[];
  /** Tasks the recipients own: due today, or still open from before. */
  tasks: RhythmTask[];
  dinner: { title: string; cookMemberId: string | null } | null;
  committedWeeks: string[];
  audit: NotifierAuditRow[];
  partnerContext: PartnerContext;
  logs: Map<string, NotificationLogEntry[]>;
}

/** Audit actions that can be a partner change (packages/domain/src/notifications.ts). */
const PARTNER_ACTIONS = [
  'work_item.updated',
  'work_item.completion_undone',
  'event.occurrence_covered',
  'decision.decided',
];
const CLOSED = ['new', 'cancelled', 'verified_complete', 'done_unverified'] as const;
const LOG_DAYS = 8;
const AUDIT_HOURS = 25;

const iso = (value: Date | string) => new Date(value).toISOString();
const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);

function settingsOf(
  row:
    | {
        notifications: NotificationPrefs;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        morning_time: string;
        weekly_reset_day: number;
        weekly_reset_time: string;
        hide_details: boolean;
      }
    | undefined,
): NotificationSettings {
  if (!row) return DEFAULT_NOTIFICATION_SETTINGS;
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const n = row.notifications;
  const start = hhmm(row.quiet_hours_start);
  const end = hhmm(row.quiet_hours_end);
  return {
    morningCheckin: n.morning_checkin ?? d.morningCheckin,
    handoffReminders: n.handoff_reminders ?? d.handoffReminders,
    partnerChanges: n.partner_changes ?? d.partnerChanges,
    weeklyResetReminder: n.weekly_reset_reminder ?? d.weeklyResetReminder,
    morningTime: hhmm(row.morning_time) ?? d.morningTime,
    weeklyReset: {
      weekday: row.weekly_reset_day,
      time: hhmm(row.weekly_reset_time) ?? d.weeklyReset.time,
    },
    quietHours: start && end ? { start, end } : null,
    hideDetails: row.hide_details,
  };
}

/** Everything needed to plan one household's notifications, or null if nobody has a device. */
export async function loadNotificationData(
  db: Db,
  householdId: string,
  now: Date,
): Promise<HouseholdNotificationData | null> {
  const household = await db
    .selectFrom('app.household')
    .select('timezone')
    .where('id', '=', householdId)
    .executeTakeFirst();
  if (!household) return null;
  const timeZone = household.timezone;

  const members = await db
    .selectFrom('app.member')
    .select(['id', 'role', 'display_name as displayName'])
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .execute();
  const active = new Set(members.filter((m) => !isCaredFor(m.role)).map((m) => m.id));

  const tokens = (
    await db
      .selectFrom('app.device_push_token')
      .select(['id', 'member_id', 'expo_push_token'])
      .where('household_id', '=', householdId)
      .orderBy('id')
      .execute()
  ).filter((t) => active.has(t.member_id));
  if (tokens.length === 0) return null;
  const recipientIds = [...new Set(tokens.map((t) => t.member_id))];

  const states = await db
    .selectFrom('app.member_state')
    .select([
      'member_id',
      'notifications',
      'quiet_hours_start',
      'quiet_hours_end',
      'morning_time',
      'weekly_reset_day',
      'weekly_reset_time',
      'hide_details',
    ])
    .where('household_id', '=', householdId)
    .where('member_id', 'in', recipientIds)
    .execute();
  const recipients: Recipient[] = recipientIds.map((memberId) => ({
    memberId,
    tokens: tokens
      .filter((t) => t.member_id === memberId)
      .map((t) => ({ id: t.id, token: t.expo_push_token })),
    settings: settingsOf(states.find((s) => s.member_id === memberId)),
  }));

  const today = localDateOf(now, timeZone);
  const tomorrow = addDays(today, 1);
  const todayStart = new Date(startOfLocalDay(today, timeZone).epochMilliseconds);
  const tomorrowStart = new Date(startOfLocalDay(tomorrow, timeZone).epochMilliseconds);
  const rangeEnd = new Date(startOfLocalDay(addDays(today, 2), timeZone).epochMilliseconds);

  // Care events overlapping today and tomorrow.
  const seriesFloor = addDays(today, -(MAX_EVENT_DAYS + 2));
  const events = await db
    .selectFrom('app.event')
    .select([
      'id',
      'kind',
      'starts_at',
      'ends_at',
      'all_day',
      'timezone',
      'recurrence',
      'recurs_until',
      'care_member_id',
      'care_action',
      'care_place',
    ])
    .where('household_id', '=', householdId)
    .where('care_member_id', 'is not', null)
    .where('starts_at', '<', rangeEnd)
    .where((eb) =>
      eb.or([
        eb.and([eb('recurrence', 'is', null), eb('ends_at', '>=', todayStart)]),
        eb.and([
          eb('recurrence', 'is not', null),
          eb.or([eb('recurs_until', 'is', null), eb('recurs_until', '>=', seriesFloor)]),
        ]),
      ]),
    )
    .limit(500)
    .execute();

  const audit = (
    await db
      .selectFrom('app.audit_event')
      .select([
        'id',
        'actor_member_id',
        'action',
        'entity_type',
        'entity_id',
        'payload',
        'created_at',
      ])
      .where('household_id', '=', householdId)
      .where('created_at', '>=', new Date(now.getTime() - AUDIT_HOURS * 3600 * 1000))
      .where('action', 'in', PARTNER_ACTIONS)
      .orderBy('id')
      .limit(1000)
      .execute()
  ).map((r): NotifierAuditRow => ({
    id: String(r.id),
    actorMemberId: r.actor_member_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    payload: r.payload,
    createdAt: iso(r.created_at),
  }));
  const referenced = (type: string, action?: string) => [
    ...new Set(
      audit
        .filter((r) => r.entityType === type && (!action || r.action === action))
        .map((r) => r.entityId),
    ),
  ];
  const coveredEventIds = referenced('event', 'event.occurrence_covered');
  const coveredEvents = coveredEventIds.length
    ? await db
        .selectFrom('app.event')
        .select(['id', 'care_member_id', 'care_action'])
        .where('household_id', '=', householdId)
        .where('id', 'in', coveredEventIds)
        .execute()
    : [];

  const eventIds = [...new Set([...events.map((e) => e.id), ...coveredEvents.map((e) => e.id)])];
  const attendance = eventIds.length
    ? await db
        .selectFrom('app.event_member')
        .select(['event_id', 'member_id'])
        .where('household_id', '=', householdId)
        .where('event_id', 'in', eventIds)
        .orderBy('member_id')
        .execute()
    : [];
  const exceptions = events.length
    ? await db
        .selectFrom('app.event_exception')
        .select(['event_id', 'occurrence_date', 'kind', 'cover_member_id'])
        .where('household_id', '=', householdId)
        .where(
          'event_id',
          'in',
          events.map((e) => e.id),
        )
        .execute()
    : [];
  const attendees = (id: string) =>
    attendance.filter((a) => a.event_id === id).map((a) => a.member_id);
  const series: EventSeries[] = events.map((e) => ({
    id: e.id,
    // Titles aren't the notifier's to read; handoffs are named by who and what.
    title: '',
    kind: e.kind,
    startsAt: iso(e.starts_at),
    endsAt: iso(e.ends_at),
    allDay: e.all_day,
    timezone: e.timezone,
    recurrence: e.recurrence,
    recursUntil: e.recurs_until,
    memberIds: attendees(e.id),
    careMemberId: e.care_member_id,
    careAction: e.care_action,
    carePlace: e.care_place,
    exceptions: exceptions
      .filter((x) => x.event_id === e.id)
      .map((x) => ({ date: x.occurrence_date, kind: x.kind, coverMemberId: x.cover_member_id })),
  }));
  const roles = new Map(members.map((m) => [m.id, m.role]));
  const occurrences = expandEvents(series, { from: today, to: tomorrow, timeZone }, (id) => {
    const role = roles.get(id);
    return role !== undefined && isCaredFor(role);
  });

  const taskRows = await db
    .selectFrom('app.work_item')
    .select([
      'id',
      'title',
      'status',
      'owner_member_id',
      'subject_member_id',
      'due_on',
      'due_at',
      'recurrence_rule_id',
    ])
    .where('household_id', '=', householdId)
    .where('type', 'in', ['task', 'issue'])
    .where('status', 'not in', ['new', 'cancelled'])
    .where('owner_member_id', 'in', recipientIds)
    .where((eb) =>
      eb.or([
        eb('due_on', '=', today),
        eb.and([eb('due_at', '>=', todayStart), eb('due_at', '<', tomorrowStart)]),
        eb.and([
          eb('status', 'not in', CLOSED),
          eb.or([eb('due_on', '<', today), eb('due_at', '<', todayStart)]),
        ]),
      ]),
    )
    .limit(2000)
    .execute();
  const tasks: RhythmTask[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    ownerMemberId: t.owner_member_id,
    subjectMemberId: t.subject_member_id,
    dueOn: t.due_on,
    dueAt: t.due_at === null ? null : iso(t.due_at),
    recurrenceRuleId: t.recurrence_rule_id,
  }));

  const dinner = await db
    .selectFrom('app.meal')
    .select(['title', 'cook_member_id'])
    .where('household_id', '=', householdId)
    .where('on_date', '=', today)
    .where('slot', '=', 'dinner')
    .executeTakeFirst();

  const committedWeeks = (
    await db
      .selectFrom('app.weekly_plan')
      .select('week_start')
      .where('household_id', '=', householdId)
      .where('committed_at', 'is not', null)
      .where('week_start', '>=', addDays(today, -14))
      .where('week_start', '<=', addDays(today, 14))
      .execute()
  ).map((w) => w.week_start);

  const itemIds = referenced('work_item');
  const items = itemIds.length
    ? await db
        .selectFrom('app.work_item')
        .select(['id', 'title', 'owner_member_id', 'created_by_member_id', 'visibility'])
        .where('household_id', '=', householdId)
        .where('id', 'in', itemIds)
        .execute()
    : [];
  const decisionIds = referenced('decision', 'decision.decided');
  const decisions = decisionIds.length
    ? await db
        .selectFrom('app.decision')
        .select(['id', 'question'])
        .where('household_id', '=', householdId)
        .where('id', 'in', decisionIds)
        .where('status', '=', 'decided')
        .execute()
    : [];
  const votes = decisions.length
    ? await db
        .selectFrom('app.decision_vote')
        .select(['decision_id', 'member_id'])
        .where('household_id', '=', householdId)
        .where(
          'decision_id',
          'in',
          decisions.map((d) => d.id),
        )
        .execute()
    : [];
  const partnerContext: PartnerContext = {
    items: new Map(
      items.map((i): [string, NotifierItem] => [
        i.id,
        {
          id: i.id,
          title: i.title,
          ownerMemberId: i.owner_member_id,
          createdByMemberId: i.created_by_member_id,
          visibility: i.visibility,
        },
      ]),
    ),
    decisions: new Map(
      decisions.map((d) => [
        d.id,
        {
          question: d.question,
          voterIds: votes.filter((v) => v.decision_id === d.id).map((v) => v.member_id),
        },
      ]),
    ),
    careEvents: new Map(
      coveredEvents.flatMap((e) =>
        e.care_member_id
          ? [
              [
                e.id,
                {
                  memberIds: attendees(e.id),
                  careMemberId: e.care_member_id,
                  careAction: e.care_action,
                },
              ] as const,
            ]
          : [],
      ),
    ),
  };

  const logRows = await db
    .selectFrom('app.notification_log')
    .select(['member_id', 'kind', 'dedupe_key', 'sent_at'])
    .where('household_id', '=', householdId)
    .where('member_id', 'in', recipientIds)
    .where('sent_at', '>=', new Date(now.getTime() - LOG_DAYS * 24 * 3600 * 1000))
    .execute();
  const logs = new Map<string, NotificationLogEntry[]>(
    recipientIds.map((id) => [
      id,
      logRows
        .filter((l) => l.member_id === id)
        .map((l) => ({ kind: l.kind, dedupeKey: l.dedupe_key, sentAt: iso(l.sent_at) })),
    ]),
  );

  return {
    timeZone,
    today,
    members,
    recipients,
    occurrences,
    tasks,
    dinner: dinner ? { title: dinner.title, cookMemberId: dinner.cook_member_id } : null,
    committedWeeks,
    audit,
    partnerContext,
    logs,
  };
}

export interface LogClaim {
  memberId: string;
  kind: NotificationKind;
  dedupeKey: string;
  status: Extract<NotificationLogStatus, 'pending' | 'skipped'>;
}

/**
 * Records each planned notification once. Returns the log IDs of the ones this call recorded
 * (by member and key); any already recorded, by an earlier run or a concurrent one, are left
 * out, so nothing is ever sent twice.
 */
export async function claimNotifications(
  db: Db,
  householdId: string,
  claims: readonly LogClaim[],
  now: Date,
): Promise<Map<string, string>> {
  const claimed = new Map<string, string>();
  if (claims.length === 0) return claimed;
  const rows = await db
    .insertInto('app.notification_log')
    .values(
      claims.map((c) => ({
        household_id: householdId,
        member_id: c.memberId,
        kind: c.kind,
        dedupe_key: c.dedupeKey,
        status: c.status,
        sent_at: now,
      })),
    )
    .onConflict((oc) => oc.columns(['member_id', 'dedupe_key']).doNothing())
    .returning(['id', 'member_id', 'dedupe_key'])
    .execute();
  for (const r of rows) claimed.set(`${r.member_id}|${r.dedupe_key}`, r.id);
  return claimed;
}

/** Records how sending went: each claimed log row's status, and the tokens' housekeeping. */
export async function recordDeliveries(
  db: Db,
  householdId: string,
  outcome: {
    sent: readonly string[];
    failed: readonly string[];
    usedTokenIds: readonly string[];
    unregisteredTokenIds: readonly string[];
  },
  now: Date,
): Promise<void> {
  const setStatus = async (ids: readonly string[], status: NotificationLogStatus) => {
    if (ids.length === 0) return;
    await db
      .updateTable('app.notification_log')
      .set({ status })
      .where('household_id', '=', householdId)
      .where('id', 'in', [...ids])
      .where('status', '=', 'pending')
      .execute();
  };
  await setStatus(outcome.sent, 'sent');
  await setStatus(outcome.failed, 'failed');
  if (outcome.usedTokenIds.length > 0) {
    await db
      .updateTable('app.device_push_token')
      .set({ last_used_at: now })
      .where('household_id', '=', householdId)
      .where('id', 'in', [...outcome.usedTokenIds])
      .execute();
  }
  if (outcome.unregisteredTokenIds.length > 0) {
    await db
      .deleteFrom('app.device_push_token')
      .where('household_id', '=', householdId)
      .where('id', 'in', [...outcome.unregisteredTokenIds])
      .execute();
  }
}
