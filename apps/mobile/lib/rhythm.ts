import { buildRhythm, startOfLocalDay, type HeadsUp } from '@familyos/domain';
import type { Member, Occurrence } from './api';
import { addDays, clock } from './dates';

/**
 * Times and the day's shape in the household's timezone (never the phone's): minutes since local
 * midnight, "5:30pm", ranges, and the deterministic heads-ups for the coming days.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** The local date (YYYY-MM-DD) and minutes since local midnight of an instant. */
export function localParts(
  iso: string | Date,
  timeZone: string,
): { date: string; minutes: number } {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter(timeZone).formatToParts(d);
  } catch {
    parts = formatter('UTC').formatToParts(d);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "5:30pm" in the household's timezone. */
export function timeOf(iso: string, timeZone: string): string {
  return clock(hhmm(localParts(iso, timeZone).minutes));
}

/** "9:30–10:30am", "11:30am–1pm", or one time when it has no length. */
export function rangeOf(startsAt: string, endsAt: string, timeZone: string): string {
  const a = localParts(startsAt, timeZone).minutes;
  const b = localParts(endsAt, timeZone).minutes;
  if (a === b) return clock(hhmm(a));
  const sa = clock(hhmm(a));
  const sb = clock(hhmm(b));
  const samePart = a < 12 * 60 === b < 12 * 60;
  return `${samePart ? sa.replace(/am|pm/, '') : sa}–${sb}`;
}

/** Minutes from now until an instant (negative when past). */
export const minutesUntil = (iso: string, now: Date) =>
  Math.round((new Date(iso).getTime() - now.getTime()) / 60000);

/** "in 33 minutes", "in 2 hours", "at 5:30pm". */
export function whenFromNow(iso: string, now: Date, timeZone: string): string {
  const m = minutesUntil(iso, now);
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m} minute${m === 1 ? '' : 's'}`;
  if (m < 120 && m % 60 === 0) return 'in an hour';
  return `at ${timeOf(iso, timeZone)}`;
}

/** An occurrence's start and end as minutes on `date` (clamped to the day). */
export function spanOn(
  o: Pick<Occurrence, 'startsAt' | 'endsAt'>,
  date: string,
  timeZone: string,
): { start: number; end: number } {
  const s = localParts(o.startsAt, timeZone);
  const e = localParts(o.endsAt, timeZone);
  const start = s.date < date ? 0 : s.date > date ? 24 * 60 : s.minutes;
  const end = e.date > date ? 24 * 60 : e.date < date ? 0 : e.minutes;
  return { start, end: Math.max(start, end) };
}

/** Occurrences that touch a local date. */
export function occurrencesOn<T extends Occurrence>(all: T[], date: string, timeZone: string): T[] {
  const dayStart = startOfLocalDay(date, timeZone).epochMilliseconds;
  const dayEnd = startOfLocalDay(addDays(date, 1), timeZone).epochMilliseconds;
  return all.filter((o) => {
    const s = new Date(o.startsAt).getTime();
    const e = new Date(o.endsAt).getTime();
    return s < dayEnd && (e > dayStart || (s === e && s >= dayStart));
  });
}

export interface DayHeadsUp {
  date: string;
  headsUp: Extract<HeadsUp, { type: 'handoff_conflict' | 'care_unassigned' }>;
}

/**
 * Handoff conflicts and care events nobody is down for, for each day in a range: the same rules
 * the API's /rhythm uses for one day (packages/domain rhythm.ts), run over a week of occurrences.
 */
export function headsUpsForDays(
  occurrences: Occurrence[],
  members: Member[],
  dates: string[],
  today: string,
  timeZone: string,
): DayHeadsUp[] {
  const out: DayHeadsUp[] = [];
  for (const date of dates) {
    const view = buildRhythm({
      date,
      today,
      timeZone,
      members: members.map((m) => ({ id: m.id, role: m.role, displayName: m.displayName })),
      occurrences: occurrencesOn(occurrences, date, timeZone).filter((o) => o.date === date),
      tasks: [],
    });
    for (const h of view.headsUps) {
      if (h.type === 'handoff_conflict' || h.type === 'care_unassigned') {
        out.push({ date, headsUp: h });
      }
    }
  }
  return out;
}

/** Day bounds for a timeline: 6am–10pm, widened to fit the day's timed events. */
export function dayWindow(spans: { start: number; end: number }[]): { from: number; to: number } {
  let from = 6 * 60;
  let to = 22 * 60;
  for (const s of spans) {
    if (s.end - s.start >= 23 * 60) continue;
    from = Math.min(from, Math.floor(s.start / 60) * 60);
    to = Math.max(to, Math.ceil(s.end / 60) * 60);
  }
  return { from: Math.max(0, from), to: Math.min(24 * 60, to) };
}

/** "6am", "noon", "3", "6pm" for an hour mark on the axis. */
export function hourMark(minutes: number, first: boolean, last: boolean): string {
  const h = Math.floor(minutes / 60);
  if (h === 12) return 'noon';
  if (h === 0 || h === 24) return 'midnight';
  const label = h > 12 ? h - 12 : h;
  if (first || last || h === 18) return `${label}${h >= 12 ? 'pm' : 'am'}`;
  return String(label);
}

export const CARE_VERB = { drop_off: 'drop-off', pick_up: 'pickup' } as const;
