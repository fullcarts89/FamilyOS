import { Temporal } from 'temporal-polyfill';
import type { EventOccurrence } from './events';
import { isCaredFor, type MemberRole } from './permissions';
import {
  addDays,
  isSkipped,
  occurrencesFrom,
  plannedOwner,
  type Assignment,
  type CalendarRule,
  type OccurrenceException,
} from './recurrence';
import { localDueDate } from './today';
import { isDone, type WorkItemStatus } from './work-item';

/**
 * Who's in town (docs/plan/whos-in-town.md): members' away periods and the household's visitors,
 * and the rule that routes work while someone is away.
 *
 * - An away period is a first day and a last day away (inclusive local dates in the household's
 *   timezone), or a first day with no end yet. The day after the last day is the day they're
 *   back, and what's due that day stays theirs.
 * - An account holder's away period names who covers: an adult (owner or adult role). On a day
 *   the cover is away too, nothing routes to them.
 * - Tasks, issues and routine turns that already exist are suggested and move only when an adult
 *   confirms (owner decision 2026-11-24). Routine turns created later go to the cover as they're
 *   created, and a care handoff is the cover's on read, never stored.
 * - A routine turn the cover takes is paid back: the away member takes the cover's next turn
 *   after they're back (owner decision 2026-11-24).
 * - Private items never move: moving one would show it to someone who can't see it.
 *
 * Pure and deterministic: callers pass local dates.
 */

export interface AwayPeriod {
  id: string;
  memberId: string;
  /** First day away. */
  startsOn: string;
  /** Last day away; null while open-ended. */
  endsOn: string | null;
  /** The adult who takes what would land on them. Null for children, pets, or nobody. */
  coverMemberId: string | null;
}

export interface Visitor {
  id: string;
  name: string;
  arrivesOn: string;
  leavesOn: string;
  notes: string | null;
}

/** The longest away period or visit with an end, in days (inclusive). */
export const MAX_PRESENCE_DAYS = 366;
/** Visitors show this many days before they arrive. */
export const VISITOR_LEAD_DAYS = 7;

/** Roles that can cover: the adults who work on tasks (caregivers can't change them). */
export const COVER_ROLES = ['owner', 'adult'] as const satisfies readonly MemberRole[];
export const canCover = (role: string): boolean =>
  (COVER_ROLES as readonly string[]).includes(role);

const D = Temporal.PlainDate;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const daysBetween = (from: string, to: string) =>
  D.from(from).until(D.from(to), { largestUnit: 'days' }).days;

export type RangeProblem = 'invalid_date' | 'ends_before_start' | 'too_long';

/** Checks a first day and an optional last day. */
export function checkRange(startsOn: string, endsOn: string | null): RangeProblem | null {
  if (!isDate(startsOn) || (endsOn !== null && !isDate(endsOn))) return 'invalid_date';
  try {
    D.from(startsOn);
    if (endsOn !== null) D.from(endsOn);
  } catch {
    return 'invalid_date';
  }
  if (endsOn === null) return null;
  if (endsOn < startsOn) return 'ends_before_start';
  if (daysBetween(startsOn, endsOn) + 1 > MAX_PRESENCE_DAYS) return 'too_long';
  return null;
}

/** Whether `date` is one of the period's days away. */
export const isAwayDay = (period: Pick<AwayPeriod, 'startsOn' | 'endsOn'>, date: string) =>
  date >= period.startsOn && (period.endsOn === null || date <= period.endsOn);

/** The day they're back, or null while open-ended. */
export const backOn = (period: Pick<AwayPeriod, 'endsOn'>): string | null =>
  period.endsOn === null ? null : addDays(period.endsOn, 1);

/** Two of a member's periods share a day. */
export function periodsOverlap(
  a: Pick<AwayPeriod, 'startsOn' | 'endsOn'>,
  b: Pick<AwayPeriod, 'startsOn' | 'endsOn'>,
): boolean {
  const aEndsBeforeB = a.endsOn !== null && a.endsOn < b.startsOn;
  const bEndsBeforeA = b.endsOn !== null && b.endsOn < a.startsOn;
  return !aEndsBeforeB && !bEndsBeforeA;
}

/** The member's away period that covers `date`, if any. */
export function awayOn(
  periods: readonly AwayPeriod[],
  memberId: string,
  date: string,
): AwayPeriod | null {
  return periods.find((p) => p.memberId === memberId && isAwayDay(p, date)) ?? null;
}

export type Routing =
  | { kind: 'home' }
  /** Away, and the cover is home that day: it goes to them. */
  | { kind: 'covered'; periodId: string; coverMemberId: string }
  /** Away, and nobody can take it (no cover, or the cover is away too): it stays. */
  | { kind: 'uncovered'; periodId: string };

/** Where work that would land on `memberId` on `date` goes. Covers never chain. */
export function routeOn(periods: readonly AwayPeriod[], memberId: string, date: string): Routing {
  const period = awayOn(periods, memberId, date);
  if (!period) return { kind: 'home' };
  const cover = period.coverMemberId;
  if (cover === null || cover === memberId || awayOn(periods, cover, date)) {
    return { kind: 'uncovered', periodId: period.id };
  }
  return { kind: 'covered', periodId: period.id, coverMemberId: cover };
}

/**
 * The default cover for a member: the only other active adult. Null when there isn't exactly
 * one (then someone picks), or the member is a child or pet.
 */
export function defaultCover(
  members: readonly { id: string; role: string }[],
  memberId: string,
): string | null {
  const me = members.find((m) => m.id === memberId);
  if (!me || isCaredFor(me.role as MemberRole)) return null;
  const others = members.filter((m) => m.id !== memberId && canCover(m.role));
  return others.length === 1 ? (others[0]?.id ?? null) : null;
}

// ---------------------------------------------------------------------------------------------
// Hand-overs: what an away period suggests moving, and what it gives back
// ---------------------------------------------------------------------------------------------

export interface HandoverItem {
  id: string;
  type: 'task' | 'project' | 'issue' | 'routine';
  status: WorkItemStatus;
  ownerMemberId: string | null;
  visibility: 'household' | 'private';
  dueOn: string | null;
  dueAt: string | null;
}

const NOT_MOVED: readonly WorkItemStatus[] = ['new', 'cancelled'];

/** Open, household-visible tasks and issues (routine turns included), with a due date. */
const movable = (item: HandoverItem) =>
  (item.type === 'task' || item.type === 'issue') &&
  item.visibility === 'household' &&
  !NOT_MOVED.includes(item.status) &&
  !isDone(item.status);

export interface HandoverSuggestion<T extends HandoverItem> {
  item: T;
  /** Local due date. */
  date: string;
  coverMemberId: string;
}

/**
 * What an away period suggests handing to its cover: the member's open, household-visible
 * tasks, issues and routine turns due on a day they're away and the cover is home, from `today`
 * on. `decided` holds items this period already moved or kept, which aren't suggested again.
 */
export function handoverSuggestions<T extends HandoverItem>(input: {
  period: AwayPeriod;
  periods: readonly AwayPeriod[];
  items: readonly T[];
  decided: ReadonlySet<string>;
  today: string;
  timeZone: string;
}): HandoverSuggestion<T>[] {
  const { period, periods, today, timeZone } = input;
  const out: HandoverSuggestion<T>[] = [];
  for (const item of input.items) {
    if (item.ownerMemberId !== period.memberId || !movable(item) || input.decided.has(item.id))
      continue;
    const date = localDueDate(item, timeZone)?.toString();
    if (!date || date < today || !isAwayDay(period, date)) continue;
    const route = routeOn(periods, period.memberId, date);
    if (route.kind !== 'covered' || route.periodId !== period.id) continue;
    out.push({ item, date, coverMemberId: route.coverMemberId });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.item.id.localeCompare(b.item.id));
}

/**
 * Whether a hand-over due on `date` goes back when its period changes from `before` to `after`
 * (null: removed): its day is no longer one of the days away, or the cover changed, and it's
 * due from today on. What's already late stays with whoever has it.
 */
export function givesBack(
  date: string,
  before: Pick<AwayPeriod, 'startsOn' | 'endsOn' | 'coverMemberId'>,
  after: Pick<AwayPeriod, 'startsOn' | 'endsOn' | 'coverMemberId'> | null,
  today: string,
): boolean {
  if (date < today || !isAwayDay(before, date)) return false;
  if (after === null) return true;
  return !isAwayDay(after, date) || after.coverMemberId !== before.coverMemberId;
}

// ---------------------------------------------------------------------------------------------
// Paying a routine turn back
// ---------------------------------------------------------------------------------------------

/**
 * The cover's turn the away member takes in return for one the cover took: the cover's first
 * turn on or after the day they're back (and after the turn taken) that isn't skipped and falls
 * on a day the away member is home. Null when there is no end yet, the routine doesn't rotate
 * between them, or no such turn comes within the horizon. Apply each payback's override to
 * `exceptions` before planning the next, so two taken turns are paid back with two turns.
 */
export function planPayback(input: {
  rule: CalendarRule;
  startOn: string;
  assignment: Assignment;
  exceptions: readonly OccurrenceException[];
  takenIndex: number;
  awayMemberId: string;
  coverMemberId: string;
  periods: readonly AwayPeriod[];
  /** The day they're back. */
  backOn: string | null;
  horizon?: number;
}): { index: number; date: string; ownerMemberId: string } | null {
  const { assignment, awayMemberId, coverMemberId } = input;
  if (input.backOn === null) return null;
  if (!assignment.rotation.includes(awayMemberId) || !assignment.rotation.includes(coverMemberId))
    return null;
  let scanned = 0;
  for (const occurrence of occurrencesFrom(input.rule, input.startOn, input.backOn)) {
    if (scanned++ >= (input.horizon ?? 400)) break;
    if (occurrence.index <= input.takenIndex || isSkipped(occurrence.index, input.exceptions))
      continue;
    if (plannedOwner(assignment, occurrence.index, input.exceptions) !== coverMemberId) continue;
    if (awayOn(input.periods, awayMemberId, occurrence.date)) continue;
    return { index: occurrence.index, date: occurrence.date, ownerMemberId: awayMemberId };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Care handoffs while someone's away (on read)
// ---------------------------------------------------------------------------------------------

/** Set on an occurrence when someone down for it is away that day. */
export interface AwayCover {
  /** Adults down for it who are away. */
  awayMemberIds: string[];
  /** Who stepped in from an away period; null when another adult was already on it, or nobody can. */
  coverMemberId: string | null;
}

/**
 * Applies away periods to care occurrences: an away adult is no longer down for one on a day
 * they're away. Another adult already on it keeps it; otherwise the away period's cover takes
 * it, if they're home. If nobody can, nobody is down for it (and Today says so). A cover or skip
 * someone set on the occurrence wins, and events that aren't care handoffs are untouched.
 */
export function routeAwayOccurrences<O extends EventOccurrence>(
  occurrences: readonly O[],
  periods: readonly AwayPeriod[],
  isCaredForMember: (memberId: string) => boolean,
): (O & { away: AwayCover | null })[] {
  return occurrences.map((o) => {
    if (periods.length === 0 || o.careMemberId === null || o.skipped || o.cover !== null)
      return { ...o, away: null };
    const adults = o.memberIds.filter((id) => !isCaredForMember(id));
    const away = adults.filter((id) => awayOn(periods, id, o.date) !== null);
    if (away.length === 0) return { ...o, away: null };
    const kept = o.memberIds.filter((id) => isCaredForMember(id));
    const remaining = adults.filter((id) => !away.includes(id));
    if (remaining.length > 0) {
      return {
        ...o,
        memberIds: [...remaining, ...kept],
        away: { awayMemberIds: away, coverMemberId: null },
      };
    }
    let cover: string | null = null;
    for (const id of away) {
      const route = routeOn(periods, id, o.date);
      if (route.kind === 'covered') {
        cover = route.coverMemberId;
        break;
      }
    }
    return {
      ...o,
      memberIds: cover ? [cover, ...kept] : kept,
      away: { awayMemberIds: away, coverMemberId: cover },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Who's in town on a day, and over a week
// ---------------------------------------------------------------------------------------------

export interface PresenceView {
  /** Away periods covering the day(s), first day first. */
  away: AwayPeriod[];
  /** Away periods starting within VISITOR_LEAD_DAYS after the day(s). */
  leaving: AwayPeriod[];
  /** Visitors here on the day(s). */
  visiting: Visitor[];
  /** Visitors arriving within VISITOR_LEAD_DAYS after the day(s). */
  arriving: Visitor[];
}

const byStart =
  <T>(start: (t: T) => string) =>
  (a: T, b: T) =>
    start(a).localeCompare(start(b));

/** Who's away, leaving soon, here or arriving soon, for the local days `from`..`to` (inclusive). */
export function presenceBetween(
  from: string,
  to: string,
  periods: readonly AwayPeriod[],
  visitors: readonly Visitor[],
): PresenceView {
  const lead = addDays(to, VISITOR_LEAD_DAYS);
  return {
    away: periods
      .filter((p) => p.startsOn <= to && (p.endsOn === null || p.endsOn >= from))
      .sort(byStart((p) => p.startsOn)),
    leaving: periods
      .filter((p) => p.startsOn > to && p.startsOn <= lead)
      .sort(byStart((p) => p.startsOn)),
    visiting: visitors
      .filter((v) => v.arrivesOn <= to && v.leavesOn >= from)
      .sort(byStart((v) => v.arrivesOn)),
    arriving: visitors
      .filter((v) => v.arrivesOn > to && v.arrivesOn <= lead)
      .sort(byStart((v) => v.arrivesOn)),
  };
}
