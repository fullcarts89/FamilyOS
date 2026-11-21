import { Temporal } from 'temporal-polyfill';
import type { CareAction, EventOccurrence } from './events';
import { isCaredFor } from './permissions';
import { addDays, localDateOf } from './recurrence';
import { defaultResetWeek } from './reset';
import { buildRhythm, formatClock, formatDay, type RhythmMember, type RhythmTask } from './rhythm';
import type { WorkItemStatus } from './work-item';

/**
 * Notifications (plan "Emotional design and interaction quality": healthy reasons to return).
 * Timely, actionable and controllable; none exist to drive engagement, so every one is about
 * something real that concerns the member, and each kind is behind their own switch:
 *
 * - morning check-in at their chosen local time, built from today's rhythm (handoffs they're
 *   down for, care nobody is down for yet, their tasks due, tonight's dinner when they cook or
 *   alongside something else); not sent when nothing concerns them.
 * - handoff reminder 30 minutes before a care handoff they cover (covers and skips applied).
 * - partner changes, at most one batch an hour: took something off your plate, completed
 *   something of yours, covered your handoff, settled a decision you voted on.
 * - Weekly Reset reminder at a chosen weekly time, only while that week isn't planned.
 *
 * Quiet hours are always respected. A check-in, Weekly Reset reminder or partner batch that
 * falls in them waits for their end. A handoff reminder is never deferred, because after the
 * handoff it is useless: it is sent only while the member is outside quiet hours and the
 * handoff is still ahead (so quiet hours ending at 07:00 before a 07:15 drop-off still give a
 * reminder at 07:00; a 06:15 drop-off gives none).
 *
 * Pure: the caller passes the instant, the household's timezone and the data. Every
 * notification has a dedupe key, and the caller records each key once, so none is sent twice.
 */

export const NOTIFICATION_KINDS = [
  'morning_checkin',
  'handoff_reminder',
  'partner_changes',
  'weekly_reset_reminder',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Local wall-clock times, 'HH:MM', in the household's timezone. */
export interface QuietHours {
  start: string;
  end: string;
}

export interface NotificationSettings {
  morningCheckin: boolean;
  handoffReminders: boolean;
  partnerChanges: boolean;
  weeklyResetReminder: boolean;
  morningTime: string;
  /** ISO weekday (1 = Monday … 7 = Sunday) and local time. */
  weeklyReset: { weekday: number; time: string };
  quietHours: QuietHours | null;
  /** Generic text on the lock screen: no names, titles or places. */
  hideDetails: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  morningCheckin: true,
  handoffReminders: true,
  partnerChanges: false,
  weeklyResetReminder: true,
  morningTime: '07:30',
  weeklyReset: { weekday: 7, time: '19:00' },
  quietHours: null,
  // Push text passes through Expo and Apple and shows on lock screens: no children's names or
  // places unless the member asks for them.
  hideDetails: true,
};

/** A notification due longer ago than this (the worker was down) is dropped, not sent late. */
export const SEND_WINDOW_MINUTES = 120;
export const HANDOFF_LEAD_MINUTES = 30;
/** Partner changes go out at most once in this many minutes. */
export const PARTNER_BATCH_MINUTES = 60;
/** How far back partner changes are collected after the last batch (a night's quiet hours). */
export const PARTNER_LOOKBACK_HOURS = 24;

const MINUTE_MS = 60_000;

type InstantLike = string | Temporal.Instant;
const toInstant = (at: InstantLike) => (typeof at === 'string' ? Temporal.Instant.from(at) : at);
const minutesOf = (time: string) => {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
};
const plusMinutes = (at: Temporal.Instant, minutes: number) =>
  at.add({ milliseconds: minutes * MINUTE_MS });
const before = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b) < 0;

/**
 * A local date and wall-clock time as an instant, with the same daylight-saving policy as
 * routines and events: a time in a spring-forward gap moves forward (02:30 → 03:30); a time
 * that happens twice in the fall takes the first.
 */
export function localInstant(date: string, time: string, timeZone: string): Temporal.Instant {
  const minutes = minutesOf(time);
  return Temporal.PlainDate.from(date)
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .toInstant();
}

function localClock(at: Temporal.Instant, timeZone: string) {
  const zoned = at.toZonedDateTimeISO(timeZone);
  return { date: zoned.toPlainDate().toString(), minutes: zoned.hour * 60 + zoned.minute };
}

/**
 * Whether `at` falls in quiet hours (start inclusive, end exclusive), which may span midnight
 * (22:00–07:00). Equal start and end mean none.
 */
export function inQuietHours(at: InstantLike, timeZone: string, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) return false;
  const { minutes } = localClock(toInstant(at), timeZone);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** `at` itself outside quiet hours; otherwise the instant they end. */
export function afterQuietHours(
  at: InstantLike,
  timeZone: string,
  quiet: QuietHours | null,
): Temporal.Instant {
  const instant = toInstant(at);
  if (!quiet || !inQuietHours(instant, timeZone, quiet)) return instant;
  const { date, minutes } = localClock(instant, timeZone);
  const spansMidnight = minutesOf(quiet.start) > minutesOf(quiet.end);
  const endDate = spansMidnight && minutes >= minutesOf(quiet.start) ? addDays(date, 1) : date;
  return localInstant(endDate, quiet.end, timeZone);
}

// ---------------------------------------------------------------------------------------------
// Partner changes, from the audit trail
// ---------------------------------------------------------------------------------------------

/** An audit row as the notifier reads it: IDs, statuses and field names only. */
export interface NotifierAuditRow {
  /** bigint, as a string. */
  id: string;
  actorMemberId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface NotifierItem {
  id: string;
  title: string;
  ownerMemberId: string | null;
  createdByMemberId: string;
  visibility: 'household' | 'private';
}

export interface PartnerContext {
  items: ReadonlyMap<string, NotifierItem>;
  /** Decisions that were settled, with who voted on them. */
  decisions: ReadonlyMap<string, { question: string; voterIds: readonly string[] }>;
  /** Care events: who is down for them (before any cover) and what they are. */
  careEvents: ReadonlyMap<
    string,
    { memberIds: readonly string[]; careMemberId: string; careAction: CareAction | null }
  >;
}

export type PartnerChange =
  | {
      auditId: string;
      actorMemberId: string;
      type: 'took_over' | 'completed';
      /** Null when the member can't see the item (a private one). */
      title: string | null;
    }
  | { auditId: string; actorMemberId: string; type: 'decided'; title: string }
  | {
      auditId: string;
      actorMemberId: string;
      type: 'covered';
      date: string;
      careMemberId: string;
      careAction: CareAction | null;
    };

const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const str = (value: unknown) => (typeof value === 'string' ? value : null);
const fields = (payload: Record<string, unknown>) =>
  Array.isArray(payload.fields) ? payload.fields.filter((f) => typeof f === 'string') : [];

/** Exactly what row-level security shows the member: shared items, or private ones of theirs. */
export const canSeeItem = (item: NotifierItem, memberId: string) =>
  item.visibility === 'household' ||
  item.createdByMemberId === memberId ||
  item.ownerMemberId === memberId;

/**
 * The meaningful changes another adult made that concern `memberId`, oldest first. Anything
 * the member did themselves, the system did, or that was undone in the same rows is left out.
 */
export function partnerChangesFor(
  memberId: string,
  rows: readonly NotifierAuditRow[],
  context: PartnerContext,
  partners: ReadonlySet<string>,
): PartnerChange[] {
  const sorted = [...rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const undone = new Map<string, bigint>();
  for (const row of sorted) {
    if (row.action === 'work_item.completion_undone') undone.set(row.entityId, BigInt(row.id));
  }
  const changes: PartnerChange[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    const actor = row.actorMemberId;
    if (!actor || actor === memberId || !partners.has(actor)) continue;
    const p = row.payload;

    if (row.entityType === 'work_item' && row.action === 'work_item.updated') {
      const item = context.items.get(row.entityId);
      if (!item) continue;
      const title = canSeeItem(item, memberId) ? item.title : null;
      const ownerChanged = fields(p).includes('owner_member_id');
      if (ownerChanged && str(p.fromOwnerMemberId) === memberId && str(p.ownerMemberId) === actor) {
        const key = `took_over:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          changes.push({ auditId: row.id, actorMemberId: actor, type: 'took_over', title });
        }
      }
      const toStatus = str(p.toStatus);
      const ownerThen = ownerChanged ? str(p.ownerMemberId) : item.ownerMemberId;
      const later = undone.get(item.id);
      if (
        toStatus &&
        DONE.includes(toStatus as WorkItemStatus) &&
        ownerThen === memberId &&
        !(later !== undefined && later > BigInt(row.id))
      ) {
        const key = `completed:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          changes.push({ auditId: row.id, actorMemberId: actor, type: 'completed', title });
        }
      }
    } else if (row.entityType === 'event' && row.action === 'event.occurrence_covered') {
      const event = context.careEvents.get(row.entityId);
      const date = str(p.date);
      if (!event || !date || str(p.coverMemberId) !== actor) continue;
      if (!event.memberIds.includes(memberId)) continue;
      const key = `covered:${row.entityId}:${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push({
        auditId: row.id,
        actorMemberId: actor,
        type: 'covered',
        date,
        careMemberId: event.careMemberId,
        careAction: event.careAction,
      });
    } else if (row.entityType === 'decision' && row.action === 'decision.decided') {
      const decision = context.decisions.get(row.entityId);
      if (!decision || !decision.voterIds.includes(memberId)) continue;
      const key = `decided:${row.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push({
        auditId: row.id,
        actorMemberId: actor,
        type: 'decided',
        title: decision.question,
      });
    }
  }
  return changes;
}

const PARTNER_KEY = /^partner_changes:(\d{1,19})$/;

/** The last audit row a partner batch included, from its dedupe key. */
export function partnerBatchCursor(dedupeKey: string): bigint | null {
  const match = PARTNER_KEY.exec(dedupeKey);
  return match?.[1] ? BigInt(match[1]) : null;
}

// ---------------------------------------------------------------------------------------------
// Planning what's due for one member
// ---------------------------------------------------------------------------------------------

export interface NotificationLogEntry {
  kind: NotificationKind;
  dedupeKey: string;
  sentAt: string;
}

export interface NotificationPlanInput {
  memberId: string;
  now: string;
  /** The household's. */
  timeZone: string;
  settings: NotificationSettings;
  /** Active members. */
  members: readonly RhythmMember[];
  /** Care occurrences around today and tomorrow, covers and skips applied (expandEvents). */
  occurrences: readonly EventOccurrence[];
  /** Tasks the member owns that are due today, or still open from before. */
  tasks: readonly RhythmTask[];
  /** Today's dinner. */
  dinner: { title: string; cookMemberId: string | null } | null;
  /** Week starts (Mondays) whose plan is committed. */
  committedWeeks: readonly string[];
  /** Recent audit rows of the household, and what they refer to. */
  audit: readonly NotifierAuditRow[];
  partnerContext: PartnerContext;
  /** This member's recent log: what has been sent or considered already. */
  log: readonly NotificationLogEntry[];
}

export interface PlannedNotification {
  kind: NotificationKind;
  dedupeKey: string;
  /** False: record the key (considered, nothing to say) and send nothing. */
  send: boolean;
  message: { title: string; body: string } | null;
  /** Time-sensitive (a handoff): sent with sound and high priority. */
  urgent: boolean;
}

const ADULT_ROLES = new Set(['owner', 'adult']);
const CARE_WORDS: Readonly<Record<CareAction, string>> = {
  drop_off: 'drop-off',
  pick_up: 'pickup',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "June’s drop-off", or just "drop-off" when only one child or pet has handoffs that day. */
function careLabel(
  careMemberId: string,
  action: CareAction | null,
  nameOf: (id: string) => string,
  withName: boolean,
) {
  const what = action ? CARE_WORDS[action] : 'care';
  return withName ? `${nameOf(careMemberId)}’s ${what}` : what;
}

export function planNotifications(input: NotificationPlanInput): PlannedNotification[] {
  const { memberId, timeZone, settings } = input;
  const now = Temporal.Instant.from(input.now);
  const today = localDateOf(new Date(now.epochMilliseconds), timeZone);
  const me = input.members.find((m) => m.id === memberId);
  if (!me || isCaredFor(me.role)) return [];
  const isAdult = ADULT_ROLES.has(me.role);
  const nameOf = (id: string) => input.members.find((m) => m.id === id)?.displayName ?? 'Someone';
  const logged = new Set(input.log.map((l) => l.dedupeKey));
  const quiet = settings.quietHours;
  const generic = settings.hideDetails;
  const windowEnd = (at: Temporal.Instant) => plusMinutes(at, SEND_WINDOW_MINUTES);
  const isDue = (at: Temporal.Instant) => !before(now, at) && before(now, windowEnd(at));
  const occurrencesOn = (date: string) =>
    input.occurrences.filter(
      (o) =>
        localDateOf(new Date(Temporal.Instant.from(o.startsAt).epochMilliseconds), timeZone) ===
        date,
    );
  const rhythmOn = (date: string, tasks: readonly RhythmTask[]) =>
    buildRhythm({
      date,
      today,
      now: input.now,
      timeZone,
      members: input.members,
      occurrences: occurrencesOn(date),
      tasks,
    });
  const planned: PlannedNotification[] = [];

  // Handoff reminders: never deferred, only outside quiet hours and before the handoff.
  if (settings.handoffReminders && !inQuietHours(now, timeZone, quiet)) {
    for (const date of [today, addDays(today, 1)]) {
      const rhythm = rhythmOn(date, []);
      for (const h of rhythm.handoffs) {
        if (!h.byMemberIds.includes(memberId)) continue;
        const at = Temporal.Instant.from(h.time);
        if (before(now, plusMinutes(at, -HANDOFF_LEAD_MINUTES)) || !before(now, at)) continue;
        const dedupeKey = `handoff_reminder:${h.occurrenceKey}`;
        if (logged.has(dedupeKey)) continue;
        const minutes = Math.max(1, Math.ceil(at.since(now).total('minutes')));
        const label = careLabel(h.careMemberId, h.action, nameOf, true);
        const place = h.place ? `, ${h.action === 'pick_up' ? 'from' : 'at'} ${h.place}` : '';
        planned.push({
          kind: 'handoff_reminder',
          dedupeKey,
          send: true,
          urgent: true,
          message: generic
            ? { title: 'Handoff soon', body: `You have a handoff in ${minutes} minutes.` }
            : {
                title: `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} at ${formatClock(h.time, timeZone)}`,
                body: `In ${minutes} minutes${place}.`,
              },
        });
      }
    }
  }

  // Morning check-in: at the chosen time (or when quiet hours end, the same day).
  if (settings.morningCheckin) {
    const sendAt = afterQuietHours(
      localInstant(today, settings.morningTime, timeZone),
      timeZone,
      quiet,
    );
    const dedupeKey = `morning_checkin:${today}`;
    if (
      !logged.has(dedupeKey) &&
      localClock(sendAt, timeZone).date === today &&
      isDue(sendAt) &&
      !inQuietHours(now, timeZone, quiet)
    ) {
      const body = morningLine({
        memberId,
        isAdult,
        nowIso: input.now,
        timeZone,
        nameOf,
        rhythm: rhythmOn(
          today,
          input.tasks.filter((t) => t.ownerMemberId === memberId),
        ),
        dinner: input.dinner,
      });
      planned.push({
        kind: 'morning_checkin',
        dedupeKey,
        send: body !== null,
        urgent: false,
        message:
          body === null
            ? null
            : generic
              ? { title: 'Good morning', body: 'Your morning check-in is ready.' }
              : { title: 'Good morning', body },
      });
    }
  }

  // Weekly Reset reminder: the chosen weekday and time, while that week isn't planned. Adults
  // only: caregivers don't plan the week.
  if (settings.weeklyResetReminder && isAdult) {
    for (let back = 0; back < 7; back++) {
      const date = addDays(today, -back);
      if (Temporal.PlainDate.from(date).dayOfWeek !== settings.weeklyReset.weekday) continue;
      const sendAt = afterQuietHours(
        localInstant(date, settings.weeklyReset.time, timeZone),
        timeZone,
        quiet,
      );
      const dedupeKey = `weekly_reset_reminder:${date}`;
      if (logged.has(dedupeKey) || !isDue(sendAt) || inQuietHours(now, timeZone, quiet)) continue;
      const week = defaultResetWeek(date);
      const alreadyPlanned = input.committedWeeks.includes(week);
      planned.push({
        kind: 'weekly_reset_reminder',
        dedupeKey,
        send: !alreadyPlanned,
        urgent: false,
        message: alreadyPlanned
          ? null
          : generic
            ? { title: 'Weekly Reset', body: 'Ready when you are.' }
            : {
                title: 'Weekly Reset',
                body: `The week of ${formatDay(week)} doesn’t have a plan yet. Ready when you are.`,
              },
      });
    }
  }

  // Partner changes: batched, at most once an hour, waiting out quiet hours.
  if (settings.partnerChanges && !inQuietHours(now, timeZone, quiet)) {
    const batches = input.log.filter((l) => l.kind === 'partner_changes');
    const lastAt = batches.reduce<Temporal.Instant | null>((latest, l) => {
      const at = Temporal.Instant.from(l.sentAt);
      return latest === null || before(latest, at) ? at : latest;
    }, null);
    const cursor = batches.reduce<bigint | null>((max, l) => {
      const c = partnerBatchCursor(l.dedupeKey);
      return c !== null && (max === null || c > max) ? c : max;
    }, null);
    if (lastAt === null || !before(now, plusMinutes(lastAt, PARTNER_BATCH_MINUTES))) {
      const since =
        cursor === null
          ? plusMinutes(now, -PARTNER_BATCH_MINUTES)
          : plusMinutes(now, -PARTNER_LOOKBACK_HOURS * 60);
      const rows = input.audit.filter(
        (r) =>
          !before(Temporal.Instant.from(r.createdAt), since) &&
          (cursor === null || BigInt(r.id) > cursor),
      );
      const partners = new Set(
        input.members.filter((m) => !isCaredFor(m.role) && m.id !== memberId).map((m) => m.id),
      );
      const changes = partnerChangesFor(memberId, rows, input.partnerContext, partners);
      const last = changes.reduce<bigint | null>(
        (max, c) => (max === null || BigInt(c.auditId) > max ? BigInt(c.auditId) : max),
        null,
      );
      if (last !== null) {
        const dedupeKey = `partner_changes:${last}`;
        if (!logged.has(dedupeKey)) {
          planned.push({
            kind: 'partner_changes',
            dedupeKey,
            send: true,
            urgent: false,
            message: generic
              ? { title: 'FamilyOS', body: 'There are changes that affect you.' }
              : partnerMessage(changes, nameOf),
          });
        }
      }
    }
  }

  return planned;
}

/** "Today: drop-off 8:15 AM (you), 2 things due, dinner: salmon (Theo)", or null. */
function morningLine(input: {
  memberId: string;
  isAdult: boolean;
  nowIso: string;
  timeZone: string;
  nameOf: (id: string) => string;
  rhythm: ReturnType<typeof buildRhythm>;
  dinner: { title: string; cookMemberId: string | null } | null;
}): string | null {
  const { memberId, rhythm, nameOf, timeZone } = input;
  const now = Temporal.Instant.from(input.nowIso);
  const upcoming = rhythm.handoffs.filter((h) => !before(Temporal.Instant.from(h.time), now));
  const relevant = upcoming.filter(
    (h) => h.byMemberIds.includes(memberId) || (input.isAdult && h.byMemberIds.length === 0),
  );
  const withNames = new Set(rhythm.handoffs.map((h) => h.careMemberId)).size > 1;
  const parts: string[] = [];
  for (const h of relevant.slice(0, 2)) {
    const who = h.byMemberIds.includes(memberId) ? 'you' : 'nobody yet';
    parts.push(
      `${careLabel(h.careMemberId, h.action, nameOf, withNames)} ${formatClock(h.time, timeZone)} (${who})`,
    );
  }
  if (relevant.length > 2) parts.push(plural(relevant.length - 2, 'more handoff', 'more handoffs'));
  const { dueToday, overdue } = rhythm.summary;
  if (dueToday > 0) parts.push(`${plural(dueToday, 'thing', 'things')} due`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  const cooking = input.dinner?.cookMemberId === memberId;
  // Dinner alone isn't a reason to write, unless they're the one cooking.
  if (parts.length === 0 && !cooking) return null;
  if (input.dinner) {
    const cook = input.dinner.cookMemberId;
    parts.push(
      `dinner: ${input.dinner.title}${cook ? ` (${cook === memberId ? 'you' : nameOf(cook)})` : ''}`,
    );
  }
  return `Today: ${parts.join(', ')}`;
}

const quote = (title: string | null, fallback: string) => (title ? `“${title}”` : fallback);

function changeSentence(change: PartnerChange, nameOf: (id: string) => string): string {
  switch (change.type) {
    case 'took_over':
      return `took ${quote(change.title, 'something')} off your plate`;
    case 'completed':
      return `completed ${quote(change.title, 'something of yours')}`;
    case 'covered': {
      const what = change.careAction ? CARE_WORDS[change.careAction] : 'care';
      return `covered ${nameOf(change.careMemberId)}’s ${what} on ${formatDay(change.date)}`;
    }
    case 'decided':
      return `settled “${change.title}”, which you voted on`;
  }
}

const capitalize = (s: string) => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

/** One sentence per change, the first three, then how many more. */
function partnerMessage(
  changes: readonly PartnerChange[],
  nameOf: (id: string) => string,
): { title: string; body: string } {
  const actors = [...new Set(changes.map((c) => c.actorMemberId))];
  const single = actors.length === 1;
  const shown = changes.slice(0, 3).map((c) => {
    const sentence = changeSentence(c, nameOf);
    return single ? `${capitalize(sentence)}.` : `${nameOf(c.actorMemberId)} ${sentence}.`;
  });
  const rest = changes.length - shown.length;
  const more = rest > 0 ? ` And ${plural(rest, 'more change', 'more changes')}.` : '';
  return {
    title: single ? `From ${nameOf(actors[0] ?? '')}` : 'Changes for you',
    body: `${shown.join(' ')}${more}`,
  };
}
