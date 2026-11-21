import { Temporal } from 'temporal-polyfill';
import { isCalendarRule, isValidRule, occurrencesFrom, type CalendarRule } from './recurrence';

/**
 * Events (Family Rhythm, milestone 2): appointments, childcare, work and family plans. A series
 * uses the same constrained rule subset as routines (calendar kinds only) and expands on read.
 * Every occurrence keeps the first one's local wall-clock times in the event's timezone, so a
 * 08:15 drop-off stays at 08:15 across daylight-saving changes. Exceptions change one occurrence
 * without editing the series: skip it, or cover it (a different adult handles that one).
 *
 * Pure and deterministic: callers pass dates, instants and timezones explicitly.
 */

export const EVENT_KINDS = [
  'appointment',
  'childcare',
  'work',
  'family',
  'home',
  'meal',
  'other',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const CARE_ACTIONS = ['drop_off', 'pick_up'] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

/** The longest a single occurrence may last. */
export const MAX_EVENT_DAYS = 31;
/** The widest range one listing may expand, in days (inclusive). */
export const MAX_EVENT_RANGE_DAYS = 62;

/** Event series take calendar rules only: "N days after it's done" means nothing for an event. */
export const isValidEventRule = (rule: unknown): rule is CalendarRule =>
  isValidRule(rule) && isCalendarRule(rule);

export interface EventException {
  /** The occurrence's own local start date. */
  date: string;
  kind: 'skip' | 'cover';
  coverMemberId: string | null;
}

export interface EventSeries {
  id: string;
  title: string;
  kind: EventKind;
  /** The first occurrence, as ISO 8601 instants. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrence: CalendarRule | null;
  /** Last local date the series may occur on. */
  recursUntil: string | null;
  memberIds: readonly string[];
  careMemberId: string | null;
  careAction: CareAction | null;
  carePlace: string | null;
  exceptions: readonly EventException[];
}

export interface EventOccurrence {
  /** Stable key: the event and the occurrence's local start date. */
  key: string;
  eventId: string;
  /** Local start date in the event's timezone. */
  date: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  title: string;
  kind: EventKind;
  recurring: boolean;
  /** Who attends or is responsible, after any cover. */
  memberIds: string[];
  careMemberId: string | null;
  careAction: CareAction | null;
  carePlace: string | null;
  skipped: boolean;
  /** Set when a different adult handles this occurrence. */
  cover: { memberId: string; replacedMemberIds: string[] } | null;
}

export const occurrenceKey = (eventId: string, date: string) => `${eventId}:${date}`;

const zoned = (iso: string, timeZone: string) =>
  Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone);

/** Local midnight at the start of `date` in `timeZone`, as an instant. */
export function startOfLocalDay(date: string, timeZone: string): Temporal.Instant {
  return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone }).toInstant();
}

/** A local date-time as an instant, with the same DST policy as routines (forward over gaps). */
const toInstant = (local: Temporal.PlainDateTime, timeZone: string) =>
  local.toZonedDateTime(timeZone, { disambiguation: 'compatible' }).toInstant();

/** The local start date of a series' first occurrence. */
export const seriesStartDate = (series: Pick<EventSeries, 'startsAt' | 'timezone'>) =>
  zoned(series.startsAt, series.timezone).toPlainDate().toString();

/** Days from start to end of one occurrence, rounded up (for widening a search window). */
function spanDays(series: Pick<EventSeries, 'startsAt' | 'endsAt' | 'timezone'>): number {
  const start = zoned(series.startsAt, series.timezone).toPlainDate();
  const end = zoned(series.endsAt, series.timezone).toPlainDate();
  return start.until(end, { largestUnit: 'days' }).days;
}

/**
 * Who handles an occurrence: the event's members, unless it's covered. A cover replaces the
 * responsible adults (members who aren't cared for) with the covering adult; the child or pet
 * the event is about stays.
 */
function applyCover(
  memberIds: readonly string[],
  exception: EventException | undefined,
  isCaredFor: (memberId: string) => boolean,
): Pick<EventOccurrence, 'memberIds' | 'cover'> {
  if (exception?.kind !== 'cover' || !exception.coverMemberId) {
    return { memberIds: [...memberIds], cover: null };
  }
  const coverId = exception.coverMemberId;
  const replaced = memberIds.filter((id) => !isCaredFor(id) && id !== coverId);
  const kept = memberIds.filter((id) => isCaredFor(id));
  return {
    memberIds: [coverId, ...kept],
    cover: { memberId: coverId, replacedMemberIds: replaced },
  };
}

function occurrenceOn(
  series: EventSeries,
  date: string,
  isCaredFor: (memberId: string) => boolean,
): EventOccurrence {
  const startLocal = zoned(series.startsAt, series.timezone).toPlainDateTime();
  const endLocal = zoned(series.endsAt, series.timezone).toPlainDateTime();
  const offset = startLocal
    .toPlainDate()
    .until(Temporal.PlainDate.from(date), { largestUnit: 'days' }).days;
  // The first occurrence is exactly as stored; later ones repeat its local wall-clock times.
  const startsAt =
    offset === 0
      ? Temporal.Instant.from(series.startsAt)
      : toInstant(startLocal.add({ days: offset }), series.timezone);
  const endsAt =
    offset === 0
      ? Temporal.Instant.from(series.endsAt)
      : toInstant(endLocal.add({ days: offset }), series.timezone);
  const exception = series.exceptions.find((e) => e.date === date);
  return {
    key: occurrenceKey(series.id, date),
    eventId: series.id,
    date,
    startsAt: startsAt.toString(),
    // A gap at the end can't put the end before the start.
    endsAt: (Temporal.Instant.compare(endsAt, startsAt) < 0 ? startsAt : endsAt).toString(),
    allDay: series.allDay,
    title: series.title,
    kind: series.kind,
    recurring: series.recurrence !== null,
    careMemberId: series.careMemberId,
    careAction: series.careAction,
    carePlace: series.carePlace,
    skipped: exception?.kind === 'skip',
    ...applyCover(series.memberIds, exception, isCaredFor),
  };
}

/** Whether `date` is one of the series' occurrence dates. */
export function isOccurrenceDate(series: EventSeries, date: string): boolean {
  const first = seriesStartDate(series);
  if (!series.recurrence) return date === first;
  if (date < first || (series.recursUntil !== null && date > series.recursUntil)) return false;
  const next = occurrencesFrom(series.recurrence, first, date).next();
  return !next.done && next.value.date === date;
}

/** The occurrence on `date`, or null if the series has none that day. */
export function occurrenceOf(
  series: EventSeries,
  date: string,
  isCaredFor: (memberId: string) => boolean = () => false,
): EventOccurrence | null {
  return isOccurrenceDate(series, date) ? occurrenceOn(series, date, isCaredFor) : null;
}

export interface ExpandRange {
  /** Local dates, inclusive, in `timeZone` (the household's). */
  from: string;
  to: string;
  timeZone: string;
}

/**
 * Every occurrence that overlaps the range, skipped ones included (marked), sorted by start.
 * An occurrence overlaps when it starts before the range ends and ends after it begins; one
 * with no duration counts when it starts inside the range.
 */
export function expandEvents(
  series: readonly EventSeries[],
  range: ExpandRange,
  isCaredFor: (memberId: string) => boolean = () => false,
): EventOccurrence[] {
  const rangeStart = startOfLocalDay(range.from, range.timeZone);
  const rangeEnd = startOfLocalDay(
    Temporal.PlainDate.from(range.to).add({ days: 1 }).toString(),
    range.timeZone,
  );
  const overlaps = (o: EventOccurrence) => {
    const start = Temporal.Instant.from(o.startsAt);
    const end = Temporal.Instant.from(o.endsAt);
    if (Temporal.Instant.compare(start, rangeEnd) >= 0) return false;
    if (Temporal.Instant.compare(start, end) === 0)
      return Temporal.Instant.compare(start, rangeStart) >= 0;
    return Temporal.Instant.compare(end, rangeStart) > 0;
  };

  const out: EventOccurrence[] = [];
  for (const s of series) {
    const first = seriesStartDate(s);
    if (!s.recurrence) {
      const only = occurrenceOn(s, first, isCaredFor);
      if (overlaps(only)) out.push(only);
      continue;
    }
    // Widen by the occurrence's length (and a day either side for timezone differences), so
    // one that started before the range but runs into it is found.
    const from = Temporal.PlainDate.from(range.from)
      .subtract({ days: spanDays(s) + 1 })
      .toString();
    const to = Temporal.PlainDate.from(range.to).add({ days: 1 }).toString();
    const last = s.recursUntil !== null && s.recursUntil < to ? s.recursUntil : to;
    for (const { date } of occurrencesFrom(s.recurrence, first, from)) {
      if (date > last) break;
      const occurrence = occurrenceOn(s, date, isCaredFor);
      if (overlaps(occurrence)) out.push(occurrence);
    }
  }
  return out.sort(
    (a, b) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(a.startsAt),
        Temporal.Instant.from(b.startsAt),
      ) || a.key.localeCompare(b.key),
  );
}

/** Inclusive length of a local date range in days. */
export const rangeDays = (from: string, to: string) =>
  Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: 'days' }).days +
  1;
