import { Temporal } from 'temporal-polyfill';
import { startOfLocalDay, type EventOccurrence } from './events';
import { addDays } from './recurrence';
import {
  buildRhythm,
  type Handoff,
  type HeadsUp,
  type RhythmMember,
  type RhythmTask,
} from './rhythm';
import type { AwayPeriod } from './presence';
import { localDueDate } from './today';
import { isDone, type WorkItemStatus } from './work-item';

/**
 * Weekly Reset (plan "Weekly Reset as the signature ritual"): the week a session plans, the
 * rhythm rules applied across all seven days (handoffs that need an owner, conflicts), and the
 * look back at what the household got done, described as items per person. Nothing here counts
 * one person's work against another's: groups list what each person did, never a score.
 *
 * Pure and deterministic: callers pass local dates and the household's timezone.
 */

const isoWeekday = (date: string) => Temporal.PlainDate.from(date).dayOfWeek;

/** The Monday of the week `date` falls in. */
export const weekStartOf = (date: string): string => addDays(date, 1 - isoWeekday(date));

export const isWeekStart = (date: string): boolean => isoWeekday(date) === 1;

/**
 * The week a Reset opened today plans: early in the week it's this week; from Friday on it's the
 * coming one (the ritual usually happens on the weekend).
 */
export const defaultResetWeek = (today: string): string =>
  isoWeekday(today) >= 5 ? addDays(weekStartOf(today), 7) : weekStartOf(today);

/** The seven local dates of the week starting `weekStart`. */
export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

// ---------------------------------------------------------------------------------------------
// The week ahead: rhythm rules over seven days
// ---------------------------------------------------------------------------------------------

export interface WeekRhythmInput<O extends EventOccurrence> {
  weekStart: string;
  timeZone: string;
  members: readonly RhythmMember[];
  /** Occurrences overlapping the week (skipped ones are ignored), away routing applied. */
  occurrences: readonly O[];
  /** Away periods around the week. */
  away?: readonly AwayPeriod[];
}

export interface WeekDay<O extends EventOccurrence> {
  date: string;
  occurrences: O[];
  handoffs: Handoff[];
  headsUps: HeadsUp[];
}

export interface WeekRhythm<O extends EventOccurrence> {
  weekStart: string;
  days: WeekDay<O>[];
  /** Care events nobody is down for yet, across the week (each once). */
  needsOwner: Extract<HeadsUp, { type: 'care_unassigned' }>[];
  /** An adult's handoff overlapping another of their events, across the week (each once). */
  conflicts: Extract<HeadsUp, { type: 'handoff_conflict' }>[];
  /** A child's or pet's handoff still on while they're away, across the week (each once). */
  whileAway: Extract<HeadsUp, { type: 'care_while_away' }>[];
}

const instant = (iso: string) => Temporal.Instant.from(iso);

/** Whether an occurrence overlaps the local day `date` (one with no duration: starts in it). */
function overlapsDay(o: EventOccurrence, date: string, timeZone: string): boolean {
  const dayStart = startOfLocalDay(date, timeZone);
  const dayEnd = startOfLocalDay(addDays(date, 1), timeZone);
  const start = instant(o.startsAt);
  const end = instant(o.endsAt);
  if (Temporal.Instant.compare(start, dayEnd) >= 0) return false;
  if (Temporal.Instant.compare(start, end) === 0) {
    return Temporal.Instant.compare(start, dayStart) >= 0;
  }
  return Temporal.Instant.compare(end, dayStart) > 0;
}

/**
 * The same rules as Today's rhythm, day by day across the week. A heads-up about an occurrence
 * that spans midnight appears on each day it touches but once in the week-level lists.
 */
export function buildWeekRhythm<O extends EventOccurrence>(
  input: WeekRhythmInput<O>,
): WeekRhythm<O> {
  const needsOwner = new Map<string, Extract<HeadsUp, { type: 'care_unassigned' }>>();
  const conflicts = new Map<string, Extract<HeadsUp, { type: 'handoff_conflict' }>>();
  const whileAway = new Map<string, Extract<HeadsUp, { type: 'care_while_away' }>>();
  const days = weekDates(input.weekStart).map((date) => {
    const occurrences = input.occurrences.filter(
      (o) => !o.skipped && overlapsDay(o, date, input.timeZone),
    );
    const view = buildRhythm<RhythmTask, O>({
      date,
      today: date,
      timeZone: input.timeZone,
      members: input.members,
      occurrences,
      tasks: [],
      away: input.away ?? [],
    });
    for (const h of view.headsUps) {
      if (h.type === 'care_unassigned') needsOwner.set(h.id, h);
      if (h.type === 'handoff_conflict') conflicts.set(h.id, h);
      if (h.type === 'care_while_away') whileAway.set(h.id, h);
    }
    // Handoffs belong to the day they happen on.
    const handoffs = view.handoffs.filter(
      (h) => localDueDate({ dueOn: null, dueAt: h.time }, input.timeZone)?.toString() === date,
    );
    return { date, occurrences, handoffs, headsUps: view.headsUps };
  });
  const byTime = (a: { time: string; id: string }, b: { time: string; id: string }) =>
    Temporal.Instant.compare(instant(a.time), instant(b.time)) || a.id.localeCompare(b.id);
  return {
    weekStart: input.weekStart,
    days,
    needsOwner: [...needsOwner.values()].sort(byTime),
    conflicts: [...conflicts.values()].sort(byTime),
    whileAway: [...whileAway.values()].sort(byTime),
  };
}

// ---------------------------------------------------------------------------------------------
// Looking back: what got done that mattered, by who did it
// ---------------------------------------------------------------------------------------------

export interface LookBackSourceItem {
  id: string;
  title: string;
  type: 'task' | 'project' | 'issue';
  status: WorkItemStatus;
  priority: number | null;
  parentId: string | null;
  subjectMemberId: string | null;
  recurrenceRuleId: string | null;
  completedAt: string | null;
  completedByMemberId: string | null;
}

export interface LookBackRoutine {
  ruleId: string;
  routineId: string;
  title: string;
  subjectMemberId: string | null;
}

/** Why a finished item is worth reflecting on. */
export type LookBackReason = 'project' | 'subtask' | 'priority' | 'care';

export type LookBackEntry =
  | {
      kind: 'item';
      id: string;
      title: string;
      type: 'task' | 'project' | 'issue';
      reason: LookBackReason;
      completedOn: string;
      parentId: string | null;
      parentTitle: string | null;
      subjectMemberId: string | null;
    }
  | {
      kind: 'routine';
      routineId: string;
      title: string;
      reason: 'care';
      subjectMemberId: string | null;
      /** The local dates they took their turn, oldest first. */
      dates: string[];
      itemIds: string[];
    };

export interface LookBackGroup {
  /** Who did it; null for things marked done without a name (older rows, imports). */
  memberId: string | null;
  entries: LookBackEntry[];
}

export interface LookBackInput {
  /** Local dates, inclusive. */
  from: string;
  to: string;
  timeZone: string;
  /** Display order of the members; groups follow it. */
  memberIds: readonly string[];
  items: readonly LookBackSourceItem[];
  routines: readonly LookBackRoutine[];
  /** Titles of the projects subtasks belong to. */
  parents: readonly { id: string; title: string }[];
}

/** High-priority items, projects and their steps, and care of a child or pet. */
export function lookBackReason(
  item: LookBackSourceItem,
  routine: LookBackRoutine | undefined,
): LookBackReason | null {
  if (item.recurrenceRuleId !== null) {
    // Recurring chores are the background of the week; care routines are worth naming.
    return routine && (routine.subjectMemberId ?? item.subjectMemberId) ? 'care' : null;
  }
  if (item.type === 'project') return 'project';
  if (item.parentId !== null) return 'subtask';
  if (item.priority === 1) return 'priority';
  if (item.subjectMemberId !== null) return 'care';
  return null;
}

/**
 * Finished items that mattered, completed between `from` and `to`, grouped by who finished them
 * in member order. Routine turns collapse into one entry per routine and person, with the dates.
 * Groups carry entries only; nothing is counted or ranked.
 */
export function buildLookBack(input: LookBackInput): LookBackGroup[] {
  const routineByRule = new Map(input.routines.map((r) => [r.ruleId, r]));
  const parentTitle = new Map(input.parents.map((p) => [p.id, p.title]));
  const groups = new Map<string | null, LookBackEntry[]>();
  const entriesOf = (memberId: string | null) => {
    let list = groups.get(memberId);
    if (!list) {
      list = [];
      groups.set(memberId, list);
    }
    return list;
  };

  const done = input.items
    .filter((i) => isDone(i.status) && i.completedAt !== null)
    .map((i) => ({
      item: i,
      on: localDueDate({ dueOn: null, dueAt: i.completedAt }, input.timeZone)?.toString() ?? '',
    }))
    .filter(({ on }) => on >= input.from && on <= input.to)
    .sort(
      (a, b) =>
        Temporal.Instant.compare(
          instant(a.item.completedAt ?? ''),
          instant(b.item.completedAt ?? ''),
        ) || a.item.id.localeCompare(b.item.id),
    );

  for (const { item, on } of done) {
    const routine =
      item.recurrenceRuleId !== null ? routineByRule.get(item.recurrenceRuleId) : undefined;
    const reason = lookBackReason(item, routine);
    if (!reason) continue;
    const entries = entriesOf(item.completedByMemberId);
    if (routine) {
      const existing = entries.find(
        (e): e is Extract<LookBackEntry, { kind: 'routine' }> =>
          e.kind === 'routine' && e.routineId === routine.routineId,
      );
      if (existing) {
        if (!existing.dates.includes(on)) existing.dates.push(on);
        existing.itemIds.push(item.id);
      } else {
        entries.push({
          kind: 'routine',
          routineId: routine.routineId,
          title: routine.title,
          reason: 'care',
          subjectMemberId: routine.subjectMemberId ?? item.subjectMemberId,
          dates: [on],
          itemIds: [item.id],
        });
      }
      continue;
    }
    entries.push({
      kind: 'item',
      id: item.id,
      title: item.title,
      type: item.type,
      reason,
      completedOn: on,
      parentId: item.parentId,
      parentTitle: item.parentId ? (parentTitle.get(item.parentId) ?? null) : null,
      subjectMemberId: item.subjectMemberId,
    });
  }

  const order = [
    ...input.memberIds,
    ...[...groups.keys()].filter((k) => k !== null && !input.memberIds.includes(k)),
    null,
  ];
  return order.flatMap((memberId) => {
    const entries = groups.get(memberId);
    return entries && entries.length > 0 ? [{ memberId, entries }] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// What's still open, so the plan never claims everything is handled when it isn't
// ---------------------------------------------------------------------------------------------

export type Unresolved =
  | { type: 'decision_open'; decisionId: string; dueOn: string | null }
  | { type: 'care_unassigned'; occurrenceKey: string; eventId: string; time: string }
  | { type: 'handoff_conflict'; occurrenceKey: string; memberId: string; time: string }
  | { type: 'overdue'; workItemId: string; dueOn: string };

export interface PlanCheckInput<O extends EventOccurrence> {
  week: WeekRhythm<O>;
  openDecisions: readonly { id: string; dueOn: string | null }[];
  /** Open items due before the week starts. */
  overdue: readonly Pick<RhythmTask, 'id' | 'dueOn' | 'dueAt'>[];
  timeZone: string;
}

/** Everything important that's still open for the week, in a fixed order. */
export function unresolvedForWeek<O extends EventOccurrence>(
  input: PlanCheckInput<O>,
): Unresolved[] {
  return [
    ...input.week.conflicts.map((h): Unresolved => ({
      type: 'handoff_conflict',
      occurrenceKey: h.occurrenceKey,
      memberId: h.memberId,
      time: h.time,
    })),
    ...input.week.needsOwner.map((h): Unresolved => ({
      type: 'care_unassigned',
      occurrenceKey: h.occurrenceKey,
      eventId: h.eventId,
      time: h.time,
    })),
    ...input.openDecisions.map((d): Unresolved => ({
      type: 'decision_open',
      decisionId: d.id,
      dueOn: d.dueOn,
    })),
    ...input.overdue.map((t): Unresolved => ({
      type: 'overdue',
      workItemId: t.id,
      dueOn: localDueDate(t, input.timeZone)?.toString() ?? '',
    })),
  ];
}
