import { Temporal } from 'temporal-polyfill';

/**
 * Routine schedules (PRD WF-02, ADR-001 §3.3): a constrained, deterministic subset instead of
 * full RFC 5545. Dates are local calendar dates (YYYY-MM-DD) in the routine's timezone; an
 * optional local time turns a date into an instant only at the edge (`occurrenceDue`).
 *
 * Every occurrence has an index: its position in the series counted from the start date.
 * Skips and one-off owner changes are stored against that index, so they never edit the rule.
 */

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Which week of the month: first to fourth, or -1 for the last. */
export type NthWeek = 1 | 2 | 3 | 4 | -1;

export type CalendarRule =
  | { freq: 'daily'; interval: number }
  | { freq: 'weekly'; interval: number; weekdays: Weekday[] }
  /** Day 29–31 falls on the last day of shorter months. */
  | { freq: 'monthly'; interval: number; dayOfMonth: number }
  | { freq: 'monthly_weekday'; interval: number; nth: NthWeek; weekday: Weekday };

/** The next one is due a fixed number of days after the previous one is done or skipped. */
export interface AfterCompletionRule {
  freq: 'after_completion';
  intervalDays: number;
}

export type RecurrenceRule = CalendarRule | AfterCompletionRule;

export const RULE_LIMITS = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  monthly_weekday: 12,
  after_completion: 365,
} as const;

export const isCalendarRule = (rule: RecurrenceRule): rule is CalendarRule =>
  rule.freq !== 'after_completion';

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** Structural check for rules read from storage or sent by a client. */
export function isValidRule(rule: unknown): rule is RecurrenceRule {
  if (typeof rule !== 'object' || rule === null) return false;
  const r = rule as Record<string, unknown>;
  switch (r.freq) {
    case 'daily':
      return isInt(r.interval, 1, RULE_LIMITS.daily);
    case 'weekly':
      return (
        isInt(r.interval, 1, RULE_LIMITS.weekly) &&
        Array.isArray(r.weekdays) &&
        r.weekdays.length > 0 &&
        r.weekdays.every((d) => isInt(d, 1, 7)) &&
        new Set(r.weekdays).size === r.weekdays.length
      );
    case 'monthly':
      return isInt(r.interval, 1, RULE_LIMITS.monthly) && isInt(r.dayOfMonth, 1, 31);
    case 'monthly_weekday':
      return (
        isInt(r.interval, 1, RULE_LIMITS.monthly_weekday) &&
        (r.nth === -1 || isInt(r.nth, 1, 4)) &&
        isInt(r.weekday, 1, 7)
      );
    case 'after_completion':
      return isInt(r.intervalDays, 1, RULE_LIMITS.after_completion);
    default:
      return false;
  }
}

export interface Occurrence {
  index: number;
  /** Local date, YYYY-MM-DD. */
  date: string;
}

const D = Temporal.PlainDate;
const pick = <T>(list: readonly T[], i: number): T => {
  const value = list[i];
  if (value === undefined) throw new RangeError(`no element ${i}`);
  return value;
};
const daysBetween = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
  a.until(b, { largestUnit: 'days' }).days;
const maxDate = (a: Temporal.PlainDate, b: Temporal.PlainDate) => (D.compare(a, b) >= 0 ? a : b);

/** The rule's date within a month, for the two monthly kinds. */
function monthlyDate(
  rule: Extract<CalendarRule, { freq: 'monthly' | 'monthly_weekday' }>,
  month: Temporal.PlainYearMonth,
): Temporal.PlainDate {
  if (rule.freq === 'monthly') {
    return month.toPlainDate({ day: Math.min(rule.dayOfMonth, month.daysInMonth) });
  }
  if (rule.nth === -1) {
    const last = month.toPlainDate({ day: month.daysInMonth });
    return last.subtract({ days: (last.dayOfWeek - rule.weekday + 7) % 7 });
  }
  const first = month.toPlainDate({ day: 1 });
  return first.add({ days: ((rule.weekday - first.dayOfWeek + 7) % 7) + (rule.nth - 1) * 7 });
}

/**
 * Occurrences on or after `from` (and never before `startOn`), in order, without end.
 * Each kind jumps straight to the period containing `from`, so cost doesn't grow with the
 * routine's age.
 */
export function* occurrencesFrom(
  rule: CalendarRule,
  startOn: string,
  from: string,
): Generator<Occurrence> {
  const start = D.from(startOn);
  const first = maxDate(D.from(from), start);

  if (rule.freq === 'daily') {
    let k = Math.ceil(daysBetween(start, first) / rule.interval);
    for (;;) {
      yield { index: k, date: start.add({ days: k * rule.interval }).toString() };
      k++;
    }
  }

  if (rule.freq === 'weekly') {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    const monday = start.subtract({ days: start.dayOfWeek - 1 });
    const inFirstWeek = days.filter((d) => d >= start.dayOfWeek).length;
    let period = Math.floor(Math.floor(daysBetween(monday, first) / 7) / rule.interval);
    let index = period === 0 ? 0 : inFirstWeek + (period - 1) * days.length;
    for (;;) {
      const weekStart = monday.add({ days: period * rule.interval * 7 });
      for (const day of days) {
        if (period === 0 && day < start.dayOfWeek) continue;
        const date = weekStart.add({ days: day - 1 });
        if (D.compare(date, first) >= 0) yield { index, date: date.toString() };
        index++;
      }
      period++;
    }
  }

  const startMonth = start.toPlainYearMonth();
  const skipsFirstMonth = D.compare(monthlyDate(rule, startMonth), start) < 0;
  const monthsToFirst = (first.year - start.year) * 12 + (first.month - start.month);
  let period = Math.floor(monthsToFirst / rule.interval);
  for (;;) {
    if (!(period === 0 && skipsFirstMonth)) {
      const date = monthlyDate(rule, startMonth.add({ months: period * rule.interval }));
      if (D.compare(date, first) >= 0)
        yield { index: period - (skipsFirstMonth ? 1 : 0), date: date.toString() };
    }
    period++;
  }
}

/** Occurrences with `from <= date <= to`. */
export function occurrencesBetween(
  rule: CalendarRule,
  startOn: string,
  from: string,
  to: string,
): Occurrence[] {
  const end = D.from(to);
  const out: Occurrence[] = [];
  for (const occurrence of occurrencesFrom(rule, startOn, from)) {
    if (D.compare(D.from(occurrence.date), end) > 0) break;
    out.push(occurrence);
  }
  return out;
}

/** The first occurrence strictly after `after`. */
export function nextOccurrenceAfter(
  rule: CalendarRule,
  startOn: string,
  after: string,
): Occurrence {
  const next = occurrencesFrom(rule, startOn, D.from(after).add({ days: 1 }).toString()).next();
  if (next.done) throw new Error('unreachable: calendar rules never end');
  return next.value;
}

/** The date of the occurrence with this index. */
export function occurrenceDate(rule: CalendarRule, startOn: string, index: number): string {
  const start = D.from(startOn);
  if (rule.freq === 'daily') return start.add({ days: index * rule.interval }).toString();
  if (rule.freq === 'weekly') {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    const monday = start.subtract({ days: start.dayOfWeek - 1 });
    const firstWeek = days.filter((d) => d >= start.dayOfWeek);
    if (index < firstWeek.length)
      return monday.add({ days: pick(firstWeek, index) - 1 }).toString();
    const rest = index - firstWeek.length;
    const period = 1 + Math.floor(rest / days.length);
    return monday
      .add({ days: period * rule.interval * 7 + pick(days, rest % days.length) - 1 })
      .toString();
  }
  const startMonth = start.toPlainYearMonth();
  const skipsFirstMonth = D.compare(monthlyDate(rule, startMonth), start) < 0;
  const period = index + (skipsFirstMonth ? 1 : 0);
  return monthlyDate(rule, startMonth.add({ months: period * rule.interval })).toString();
}

export type OccurrenceDue = { dueOn: string; dueAt: null } | { dueOn: null; dueAt: string };

/**
 * When an occurrence is due. Without a time it is an all-day date. With one, the local
 * wall-clock time becomes an instant in the routine's timezone. DST policy (J3): a time that
 * doesn't exist on spring-forward day moves forward by the gap (02:30 → 03:30); a time that
 * happens twice on fall-back day uses the first one. The local date never changes.
 */
export function occurrenceDue(
  date: string,
  localTime: string | null,
  timeZone: string,
): OccurrenceDue {
  if (!localTime) return { dueOn: date, dueAt: null };
  const zoned = D.from(date)
    .toPlainDateTime(Temporal.PlainTime.from(localTime))
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' });
  return { dueOn: null, dueAt: zoned.toInstant().toString() };
}

/** The household-local calendar date of an instant. */
export function localDateOf(instant: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

/** A local date plus some days. */
export const addDays = (date: string, days: number): string =>
  D.from(date).add({ days }).toString();

/** After-completion rules: the next one is due this many days after the last was closed. */
export function dueAfterCompletion(rule: AfterCompletionRule, closedOn: string): string {
  return D.from(closedOn).add({ days: rule.intervalDays }).toString();
}

// ---------------------------------------------------------------------------------------------
// Who does which occurrence
// ---------------------------------------------------------------------------------------------

export interface OccurrenceException {
  index: number;
  kind: 'skip' | 'owner';
  ownerMemberId?: string | null;
}

export interface Assignment {
  /** Members taking turns, in order. Empty when one person (or nobody) owns every occurrence. */
  rotation: readonly string[];
  ownerMemberId: string | null;
}

/** The owner an occurrence gets: a one-off override, else its turn in the rotation, else the routine's owner. */
export function plannedOwner(
  assignment: Assignment,
  index: number,
  exceptions: readonly OccurrenceException[],
): string | null {
  const override = exceptions.find((e) => e.index === index && e.kind === 'owner');
  if (override) return override.ownerMemberId ?? null;
  if (assignment.rotation.length > 0)
    return assignment.rotation[index % assignment.rotation.length] ?? null;
  return assignment.ownerMemberId;
}

export const isSkipped = (index: number, exceptions: readonly OccurrenceException[]) =>
  exceptions.some((e) => e.index === index && e.kind === 'skip');

export class SwapError extends Error {
  constructor(readonly code: 'same_owner' | 'no_turn_found') {
    super(code);
    this.name = 'SwapError';
  }
}

/**
 * Swapping a turn (J3b): this occurrence goes to `withMemberId`, and their next turn after it
 * comes back to this occurrence's owner. Everything else in the rotation stays as it was.
 * Returns the two owner overrides to store.
 */
export function planSwap(
  assignment: Assignment,
  exceptions: readonly OccurrenceException[],
  index: number,
  withMemberId: string,
  horizon = 400,
): { index: number; ownerMemberId: string }[] {
  const from = plannedOwner(assignment, index, exceptions);
  if (from === null || from === withMemberId) throw new SwapError('same_owner');
  for (let j = index + 1; j <= index + horizon; j++) {
    if (isSkipped(j, exceptions)) continue;
    if (plannedOwner(assignment, j, exceptions) === withMemberId) {
      return [
        { index, ownerMemberId: withMemberId },
        { index: j, ownerMemberId: from },
      ];
    }
  }
  throw new SwapError('no_turn_found');
}

export interface PlannedOccurrence extends Occurrence {
  ownerMemberId: string | null;
  skipped: boolean;
}

/** The next `count` occurrences on or after `from`, with owners and skips applied. */
export function upcomingOccurrences(
  schedule: { rule: CalendarRule; startOn: string },
  assignment: Assignment,
  exceptions: readonly OccurrenceException[],
  from: string,
  count: number,
): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  for (const occurrence of occurrencesFrom(schedule.rule, schedule.startOn, from)) {
    if (out.length >= count) break;
    out.push({
      ...occurrence,
      ownerMemberId: plannedOwner(assignment, occurrence.index, exceptions),
      skipped: isSkipped(occurrence.index, exceptions),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Plain-language summary
// ---------------------------------------------------------------------------------------------

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NTH_NAMES: Record<NthWeek, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const listOf = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

const every = (interval: number, unit: string) =>
  interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;

/** "Every Sunday at 19:00", "Every 3 months on the 1st", "3 days after each time it’s done". */
export function describeSchedule(rule: RecurrenceRule, localTime: string | null = null): string {
  let text: string;
  switch (rule.freq) {
    case 'daily':
      text = every(rule.interval, 'day');
      break;
    case 'weekly': {
      const days = [...rule.weekdays].sort((a, b) => a - b);
      const names =
        days.length === 1
          ? pick(WEEKDAY_NAMES, pick(days, 0) - 1)
          : listOf(days.map((d) => pick(WEEKDAY_SHORT, d - 1)));
      text = rule.interval === 1 ? `Every ${names}` : `Every ${rule.interval} weeks on ${names}`;
      break;
    }
    case 'monthly':
      text = `${rule.interval === 1 ? 'Monthly' : `Every ${rule.interval} months`} on the ${ordinal(rule.dayOfMonth)}${rule.dayOfMonth >= 29 ? ' (or the last day)' : ''}`;
      break;
    case 'monthly_weekday':
      text = `${rule.interval === 1 ? 'Monthly' : `Every ${rule.interval} months`} on the ${NTH_NAMES[rule.nth]} ${pick(WEEKDAY_NAMES, rule.weekday - 1)}`;
      break;
    case 'after_completion':
      text = `${rule.intervalDays === 1 ? '1 day' : `${rule.intervalDays} days`} after each time it’s done`;
      break;
  }
  return localTime ? `${text} at ${localTime.slice(0, 5)}` : text;
}
