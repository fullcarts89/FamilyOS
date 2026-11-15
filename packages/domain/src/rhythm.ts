import { Temporal } from 'temporal-polyfill';
import {
  startOfLocalDay,
  type CareAction,
  type EventOccurrence,
} from './events';
import { isCaredFor, type MemberRole } from './permissions';
import { localDueDate } from './today';
import type { WorkItemStatus } from './work-item';

/**
 * The family's rhythm for one local day (Family Rhythm, Today): a lane per member with their
 * events, where each child or pet is through the day (derived from drop-offs and pick-ups), the
 * handoffs between adults and places, each adult's tasks for the day, and deterministic
 * heads-ups computed from the data. No model call anywhere: every heads-up is a rule.
 *
 * Pure: the caller passes the date, today's date and the household's timezone.
 */

export interface RhythmMember {
  id: string;
  role: MemberRole;
  displayName: string;
}

export interface RhythmTask {
  id: string;
  title: string;
  status: WorkItemStatus;
  ownerMemberId: string | null;
  subjectMemberId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  /** Set on routine occurrences. */
  recurrenceRuleId: string | null;
}

/**
 * An open household decision with a due date. Decisions don't exist yet (Weekly Reset
 * milestone); the shape is fixed here so the heads-up rule is ready when they do.
 */
export interface RhythmDecision {
  id: string;
  title: string;
  dueOn: string;
}

export interface RhythmInput<T extends RhythmTask> {
  /** The local date the rhythm is for. */
  date: string;
  /** Today's local date, for what's overdue. */
  today: string;
  timeZone: string;
  /** Active members, in display order. */
  members: readonly RhythmMember[];
  /** Occurrences overlapping `date` (skipped ones are ignored). */
  occurrences: readonly EventOccurrence[];
  /** Tasks due on `date`, plus open routine occurrences that may be overdue. */
  tasks: readonly T[];
  decisions?: readonly RhythmDecision[];
}

export type Location = { kind: 'home' } | { kind: 'away'; place: string | null };

export interface LocationSegment {
  startsAt: string;
  endsAt: string;
  location: Location;
  /** Adults they're with at home: whoever brought them home or takes them out. */
  withMemberIds: string[];
}

export type HandoffParty =
  | { kind: 'member'; memberId: string }
  | { kind: 'place'; place: string | null }
  | { kind: 'nobody' };

export interface Handoff {
  time: string;
  occurrenceKey: string;
  eventId: string;
  careMemberId: string;
  action: CareAction;
  from: HandoffParty;
  to: HandoffParty;
  place: string | null;
  /** Every adult down for it, after any cover. */
  byMemberIds: string[];
}

export interface RhythmLane<T> {
  memberId: string;
  role: MemberRole;
  caredFor: boolean;
  occurrences: EventOccurrence[];
  /** Children and pets with handoffs that day; empty otherwise. */
  segments: LocationSegment[];
  /** Adults: tasks they own. Children and pets: tasks about them. */
  tasks: { timed: T[]; dueToday: T[] };
}

export type HeadsUp =
  | {
      id: string;
      type: 'handoff_conflict';
      memberId: string;
      occurrenceKey: string;
      eventId: string;
      conflictingOccurrenceKey: string;
      conflictingEventId: string;
      time: string;
      text: string;
    }
  | {
      id: string;
      type: 'care_unassigned';
      occurrenceKey: string;
      eventId: string;
      careMemberId: string;
      time: string;
      text: string;
    }
  | {
      id: string;
      type: 'overdue_routine';
      workItemId: string;
      recurrenceRuleId: string;
      ownerMemberId: string | null;
      dueOn: string;
      text: string;
    }
  | {
      id: string;
      type: 'decision_due';
      decisionId: string;
      dueOn: string;
      text: string;
    };

export type HeadsUpType = HeadsUp['type'];

export interface RhythmView<T> {
  date: string;
  timezone: string;
  lanes: RhythmLane<T>[];
  handoffs: Handoff[];
  /** Tasks for the day that nobody owns yet. */
  unassignedTasks: T[];
  headsUps: HeadsUp[];
}

const OPEN_EXCLUDED: readonly WorkItemStatus[] = [
  'new',
  'cancelled',
  'verified_complete',
  'done_unverified',
];
const NOT_SHOWN: readonly WorkItemStatus[] = ['new', 'cancelled'];
const ROLE_ORDER: Readonly<Record<MemberRole, number>> = {
  owner: 0,
  adult: 0,
  caregiver: 1,
  child: 2,
  pet: 3,
};
const TYPE_ORDER: Readonly<Record<HeadsUpType, number>> = {
  handoff_conflict: 0,
  care_unassigned: 1,
  overdue_routine: 2,
  decision_due: 3,
};

const instant = (iso: string) => Temporal.Instant.from(iso);
const cmp = (a: string, b: string) => Temporal.Instant.compare(instant(a), instant(b));
const byStart = (a: EventOccurrence, b: EventOccurrence) =>
  cmp(a.startsAt, b.startsAt) || a.key.localeCompare(b.key);

/** "5:30 PM", in the household's timezone. */
export function formatClock(iso: string, timeZone: string): string {
  const t = instant(iso).toZonedDateTimeISO(timeZone);
  const hour = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${hour}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed, Nov 11". */
export function formatDay(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return `${WEEKDAYS[d.dayOfWeek - 1] ?? ''}, ${MONTHS[d.month - 1] ?? ''} ${d.day}`;
}

const CARE_WORDS: Readonly<Record<CareAction, string>> = {
  drop_off: 'drop-off',
  pick_up: 'pickup',
};

/** Two occurrences overlap in time; one with no duration overlaps where it falls. */
function overlap(a: EventOccurrence, b: EventOccurrence): boolean {
  const aPoint = cmp(a.startsAt, a.endsAt) === 0;
  const bPoint = cmp(b.startsAt, b.endsAt) === 0;
  if (aPoint && bPoint) return cmp(a.startsAt, b.startsAt) === 0;
  if (aPoint) return cmp(a.startsAt, b.startsAt) >= 0 && cmp(a.startsAt, b.endsAt) < 0;
  if (bPoint) return cmp(b.startsAt, a.startsAt) >= 0 && cmp(b.startsAt, a.endsAt) < 0;
  return cmp(a.startsAt, b.endsAt) < 0 && cmp(b.startsAt, a.endsAt) < 0;
}

export function buildRhythm<T extends RhythmTask>(input: RhythmInput<T>): RhythmView<T> {
  const { date, today, timeZone } = input;
  const members = [...input.members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id: string) => byId.get(id)?.displayName ?? 'Someone';
  const adultsOf = (o: EventOccurrence) =>
    o.memberIds.filter((id) => {
      const m = byId.get(id);
      return m !== undefined && !isCaredFor(m.role);
    });
  const dayStart = startOfLocalDay(date, timeZone).toString();
  const dayEnd = startOfLocalDay(
    Temporal.PlainDate.from(date).add({ days: 1 }).toString(),
    timeZone,
  ).toString();
  const clamp = (iso: string) =>
    cmp(iso, dayStart) < 0 ? dayStart : cmp(iso, dayEnd) > 0 ? dayEnd : iso;

  const occurrences = input.occurrences.filter((o) => !o.skipped).sort(byStart);
  const careHandoffs = occurrences.filter(
    (o): o is EventOccurrence & { careMemberId: string; careAction: CareAction } =>
      o.careMemberId !== null && o.careAction !== null && !o.allDay,
  );

  // Handoffs: a drop-off goes from the adult to the place; a pick-up from the place to the adult.
  const handoffs: Handoff[] = careHandoffs.map((o) => {
    const adults = adultsOf(o);
    const adult: HandoffParty = adults[0]
      ? { kind: 'member', memberId: adults[0] }
      : { kind: 'nobody' };
    const place: HandoffParty = { kind: 'place', place: o.carePlace };
    return {
      time: o.startsAt,
      occurrenceKey: o.key,
      eventId: o.eventId,
      careMemberId: o.careMemberId,
      action: o.careAction,
      from: o.careAction === 'drop_off' ? adult : place,
      to: o.careAction === 'drop_off' ? place : adult,
      place: o.carePlace,
      byMemberIds: adults,
    };
  });

  // Where each child or pet is: home until a drop-off, at the place until a pick-up, home after.
  const segmentsFor = (memberId: string): LocationSegment[] => {
    const moves = handoffs.filter((h) => h.careMemberId === memberId);
    const first = moves[0];
    if (!first) return [];
    const segments: LocationSegment[] = [];
    let current: LocationSegment = {
      startsAt: dayStart,
      endsAt: dayStart,
      location:
        first.action === 'pick_up' ? { kind: 'away', place: first.place } : { kind: 'home' },
      withMemberIds: [],
    };
    const close = (at: string) => {
      current.endsAt = at;
      if (cmp(current.endsAt, current.startsAt) > 0) segments.push(current);
    };
    for (const move of moves) {
      const at = clamp(move.time);
      if (move.action === 'drop_off' && current.location.kind === 'home') {
        current.withMemberIds = [...new Set([...current.withMemberIds, ...move.byMemberIds])];
      }
      close(at);
      current =
        move.action === 'drop_off'
          ? { startsAt: at, endsAt: at, location: { kind: 'away', place: move.place }, withMemberIds: [] }
          : { startsAt: at, endsAt: at, location: { kind: 'home' }, withMemberIds: [...move.byMemberIds] };
    }
    close(dayEnd);
    return segments;
  };

  // Tasks for the day, by owner (adults) and by subject (children and pets).
  const shown = input.tasks.filter((t) => !NOT_SHOWN.includes(t.status));
  const timedToday = shown.filter(
    (t) => t.dueAt !== null && localDueDate(t, timeZone)?.toString() === date,
  );
  const allDayToday = shown.filter((t) => t.dueOn === date);
  const byDueAt = (a: T, b: T) => cmp(a.dueAt ?? '', b.dueAt ?? '') || a.id.localeCompare(b.id);
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

  const lanes: RhythmLane<T>[] = members.map((m) => {
    const caredFor = isCaredFor(m.role);
    const mine = (t: T) => (caredFor ? t.subjectMemberId === m.id : t.ownerMemberId === m.id);
    return {
      memberId: m.id,
      role: m.role,
      caredFor,
      occurrences: occurrences.filter(
        (o) => o.memberIds.includes(m.id) || (caredFor && o.careMemberId === m.id),
      ),
      segments: caredFor ? segmentsFor(m.id) : [],
      tasks: {
        timed: timedToday.filter(mine).sort(byDueAt),
        dueToday: allDayToday.filter(mine).sort(byTitle),
      },
    };
  });

  const unassignedTasks = [
    ...timedToday.filter((t) => t.ownerMemberId === null).sort(byDueAt),
    ...allDayToday.filter((t) => t.ownerMemberId === null).sort(byTitle),
  ];

  // ------------------------------------------------------------------------------------------
  // Heads-ups
  // ------------------------------------------------------------------------------------------
  const headsUps: HeadsUp[] = [];
  const careLabel = (o: EventOccurrence) =>
    o.careMemberId && o.careAction
      ? `${nameOf(o.careMemberId)}’s ${CARE_WORDS[o.careAction]}`
      : o.careMemberId
        ? `“${o.title}” with ${nameOf(o.careMemberId)}`
        : `“${o.title}”`;

  // (a) An adult's handoff overlaps another event of theirs.
  const seen = new Set<string>();
  for (const h of careHandoffs) {
    for (const memberId of adultsOf(h)) {
      for (const other of occurrences) {
        if (other.key === h.key || other.allDay || !other.memberIds.includes(memberId)) continue;
        if (!overlap(h, other)) continue;
        const pair = [h.key, other.key].sort().join('|');
        if (seen.has(`${memberId}|${pair}`)) continue;
        seen.add(`${memberId}|${pair}`);
        const during =
          other.careMemberId && other.careAction ? careLabel(other) : `“${other.title}”`;
        headsUps.push({
          id: `handoff_conflict:${memberId}:${h.key}:${other.key}`,
          type: 'handoff_conflict',
          memberId,
          occurrenceKey: h.key,
          eventId: h.eventId,
          conflictingOccurrenceKey: other.key,
          conflictingEventId: other.eventId,
          time: h.startsAt,
          text: `${nameOf(memberId)} has ${during} during ${careLabel(h)} at ${formatClock(h.startsAt, timeZone)}.`,
        });
      }
    }
  }

  // (d) A care event nobody is down for.
  for (const o of occurrences) {
    if (o.careMemberId === null || adultsOf(o).length > 0) continue;
    const when = o.allDay ? 'today' : `at ${formatClock(o.startsAt, timeZone)}`;
    headsUps.push({
      id: `care_unassigned:${o.key}`,
      type: 'care_unassigned',
      occurrenceKey: o.key,
      eventId: o.eventId,
      careMemberId: o.careMemberId,
      time: o.startsAt,
      text: `Nobody is down for ${careLabel(o)} ${when}.`,
    });
  }

  // (b) A routine occurrence still open after its day.
  for (const t of input.tasks) {
    if (t.recurrenceRuleId === null || OPEN_EXCLUDED.includes(t.status)) continue;
    const due = localDueDate(t, timeZone)?.toString();
    if (!due || due >= today) continue;
    headsUps.push({
      id: `overdue_routine:${t.id}`,
      type: 'overdue_routine',
      workItemId: t.id,
      recurrenceRuleId: t.recurrenceRuleId,
      ownerMemberId: t.ownerMemberId,
      dueOn: due,
      text: t.ownerMemberId
        ? `“${t.title}” was due ${formatDay(due)} and is still open for ${nameOf(t.ownerMemberId)}.`
        : `“${t.title}” was due ${formatDay(due)} and nobody has it yet.`,
    });
  }

  // (c) An open decision due today or tomorrow (or already past due).
  const tomorrow = Temporal.PlainDate.from(today).add({ days: 1 }).toString();
  for (const d of input.decisions ?? []) {
    if (d.dueOn > tomorrow) continue;
    const by =
      d.dueOn === today
        ? 'Decide today'
        : d.dueOn === tomorrow
          ? 'Decide by tomorrow'
          : `Was due ${formatDay(d.dueOn)}`;
    headsUps.push({
      id: `decision_due:${d.id}`,
      type: 'decision_due',
      decisionId: d.id,
      dueOn: d.dueOn,
      text: `${by}: “${d.title}”.`,
    });
  }

  const sortKey = (h: HeadsUp) =>
    h.type === 'handoff_conflict' || h.type === 'care_unassigned'
      ? instant(h.time).epochMilliseconds
      : Temporal.PlainDate.from(h.dueOn).toZonedDateTime({ timeZone: 'UTC' }).epochMilliseconds;
  headsUps.sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || sortKey(a) - sortKey(b) || a.id.localeCompare(b.id),
  );

  return { date, timezone: timeZone, lanes, handoffs, unassignedTasks, headsUps };
}
