import { localInstant, startOfLocalDay, type HeadsUp } from '@familyos/domain';
import type { Activity, HandoffView, Occurrence, RhythmLaneView } from '../../lib/api';
import { addDays, clock, daysBetween } from '../../lib/dates';
import type { People } from '../../lib/people';
import { hourMark, localParts, spanOn } from '../../lib/rhythm';
import type { NextEntry } from './NextUp';

/**
 * Pure helpers behind Today: the "Tonight" split, readable colors on member colors, and the phone's
 * vertical day (an hour ruler, each item a marker on one line, handoffs and the now-line).
 * No React here, so the rules are unit-tested (test/mobile-today.test.ts).
 */

/** Evening starts at 5pm household time: dinner, bath, bedtime and the evening handoffs. */
export const TONIGHT_FROM = 17 * 60;

/** Entries still ahead (or under way) at `now`, split into before 5pm and tonight. */
export function splitTonight(
  entries: NextEntry[],
  now: Date,
  timeZone: string,
): { soon: NextEntry[]; tonight: NextEntry[] } {
  const t = now.getTime();
  const today = localParts(now, timeZone).date;
  const soon: NextEntry[] = [];
  const tonight: NextEntry[] = [];
  for (const e of entries) {
    const ahead = new Date(e.endsAt).getTime() > t || new Date(e.startsAt).getTime() >= t;
    if (!ahead) continue;
    const start = localParts(e.startsAt, timeZone);
    if (start.date === today && start.minutes >= TONIGHT_FROM) tonight.push(e);
    else if (start.date > today) continue;
    else soon.push(e);
  }
  return { soon, tonight };
}

// ---------------------------------------------------------------------------------------------
// Color

function rgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const full =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const INK = '#17201B';
const WHITE = '#FFFFFF';

function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((c, i) => Math.round(c + ((y[i] ?? c) - c) * t))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Text on a filled member color: white or ink, whichever reads better. */
export function textOn(fill: string): string {
  return contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK;
}

/**
 * A member color to fill behind text: the color itself when white or ink reads on it at 4.5:1,
 * else the color deepened just enough for white text (coral, sage and teal sit between the two).
 * Always pair it with `textOn(solidFill(hex))`.
 */
export function solidFill(hex: string): string {
  if (Math.max(contrast(WHITE, hex), contrast(INK, hex)) >= 4.5) return hex;
  return readableOn(hex, WHITE);
}

/**
 * A member color deepened toward ink until it reads as small text (or an icon beside text) on
 * `background` at 4.5:1. Keeps the hue, so "5:30" still looks like Maya's.
 */
export function readableOn(hex: string, background = WHITE): string {
  if (contrast(hex, background) >= 4.5) return hex;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(hex, INK, t);
    if (contrast(c, background) >= 4.5) return c;
  }
  return INK;
}

/**
 * Muted text deepened in coarser steps until it reads on a lane or a tint (muted on the lane
 * fill comes out at 5.01:1).
 */
export function textShade(hex: string, background = WHITE): string {
  if (contrast(hex, background) >= 4.5) return hex;
  const from = rgb(hex);
  const to = rgb(INK);
  for (let k = 0.1; k <= 1; k += 0.1) {
    const mixed = from.map((c, i) => Math.round(c + ((to[i] ?? 0) - c) * k));
    const out = `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    if (contrast(out, background) >= 4.5) return out;
  }
  return INK;
}

/** Earlier first by instant (never by the text of a timestamp), then by key for a stable order. */
export function byStart(
  a: { startsAt: string; key: string },
  b: { startsAt: string; key: string },
): number {
  return (
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.key.localeCompare(b.key)
  );
}

/** The part of a title before a colon or bracket: "Dinner: sheet-pan salmon" → "Dinner". */
export function shortTitle(title: string): string {
  const cut = title.split(/[:(]/)[0]?.trim();
  return cut && cut.length >= 3 ? cut : title;
}

/** "5:30pm" for minutes since local midnight. */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return clock(`${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
}

// ---------------------------------------------------------------------------------------------
// The phone's vertical day

export type DayRow =
  | { kind: 'hour'; key: string; minutes: number; label: string; tonight: boolean }
  | { kind: 'now'; key: string; minutes: number }
  | {
      kind: 'item';
      key: string;
      minutes: number;
      entry: NextEntry;
      /** Already over at `now`. */
      past: boolean;
      /** Started and not yet over. */
      ongoing: boolean;
    };

/** A child or pet away from home (daycare, the groomer): a rail beside the line. */
export interface AwayRail {
  memberId: string;
  start: number;
  end: number;
  place: string;
}

/**
 * The instant of a wall-clock time on a local date (a time that happens twice when the clocks go
 * back takes the first; midnight at the end of the day is the next day's start).
 */
function wallInstant(date: string, minutes: number, timeZone: string): number {
  if (minutes >= 24 * 60) return startOfLocalDay(addDays(date, 1), timeZone).epochMilliseconds;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return localInstant(date, hhmm, timeZone).epochMilliseconds;
}

/**
 * Rows for the vertical day, in time order: hour marks (every hour near something, every third
 * hour through quiet stretches), the day's items and the now-line. The ruler is ordered rather
 * than to scale, so nothing overlaps and the day fits a phone. Rows sort by instant, not by the
 * clock on the wall, so the hour that repeats when the clocks go back stays in order.
 */
export function verticalDay({
  entries,
  date,
  timeZone,
  now,
}: {
  entries: NextEntry[];
  date: string;
  timeZone: string;
  /** The current instant when `date` is today. */
  now: Date | null;
}): DayRow[] {
  const items = entries
    .map((e) => ({ e, ...spanOn(e, date, timeZone) }))
    .filter((p) => p.start < 24 * 60);
  const nowMin =
    now && localParts(now, timeZone).date === date ? localParts(now, timeZone).minutes : null;
  let from = 7 * 60;
  let to = 21 * 60;
  for (const p of items) {
    from = Math.min(from, Math.floor(p.start / 60) * 60);
    to = Math.max(to, Math.ceil(Math.max(p.start + 1, p.end) / 60) * 60);
  }
  if (nowMin !== null) {
    from = Math.min(from, Math.floor(nowMin / 60) * 60);
    to = Math.max(to, Math.ceil((nowMin + 1) / 60) * 60);
  }
  to = Math.min(to, 24 * 60);
  const busy = [...items.map((p) => p.start), ...(nowMin !== null ? [nowMin] : [])];
  const t = now?.getTime() ?? -Infinity;
  const rows: (DayRow & { order: number; at: number })[] = [];
  for (let m = from; m <= to; m += 60) {
    const near = busy.some((b) => b >= m - 60 && b < m + 60);
    const edge = m === from || m === to;
    // An item at the top of the hour shows that time itself; no second "8am" above it.
    const taken = busy.includes(m) && m !== TONIGHT_FROM;
    if (taken || !(near || edge || (m / 60) % 3 === 0 || m === TONIGHT_FROM)) continue;
    rows.push({
      kind: 'hour',
      key: `h${m}`,
      minutes: m,
      label: hourMark(m, true, true),
      tonight: m === TONIGHT_FROM,
      order: 0,
      at: wallInstant(date, m, timeZone),
    });
  }
  for (const p of items) {
    const ends = new Date(p.e.endsAt).getTime();
    const starts = new Date(p.e.startsAt).getTime();
    rows.push({
      kind: 'item',
      key: p.e.key,
      minutes: p.start,
      entry: p.e,
      past: ends <= t && starts < t,
      ongoing: starts <= t && ends > t,
      order: 2,
      // Something that started the day before sits at the top of this one.
      at: Math.max(starts, wallInstant(date, 0, timeZone)),
    });
  }
  if (now && nowMin !== null)
    rows.push({ kind: 'now', key: 'now', minutes: nowMin, order: 1, at: now.getTime() });
  rows.sort((a, b) => a.at - b.at || a.order - b.order);
  return rows;
}

/** Children and pets away from home today, as rails beside the line. */
export function awayRails(
  lanes: Pick<RhythmLaneView, 'memberId' | 'caredFor' | 'segments'>[],
  date: string,
  timeZone: string,
): AwayRail[] {
  const out: AwayRail[] = [];
  for (const l of lanes) {
    if (!l.caredFor) continue;
    for (const s of l.segments) {
      if (s.location.kind !== 'away') continue;
      const sp = spanOn(s, date, timeZone);
      if (sp.end <= sp.start) continue;
      out.push({ memberId: l.memberId, ...sp, place: s.location.place ?? 'Away' });
    }
  }
  return out;
}

/**
 * Where each rail runs through the rows: from the first row at or after it starts (its drop-off,
 * when there is one at that minute) to the last row at or before it ends (its pickup).
 */
export function railRows(rows: DayRow[], rail: AwayRail): { first: number; last: number } | null {
  const isCare = (r: DayRow, at: number) =>
    r.kind === 'item' &&
    r.minutes === at &&
    r.entry.kind === 'care' &&
    r.entry.people.some((p) => p.id === rail.memberId);
  let first = rows.findIndex((r) => isCare(r, rail.start));
  if (first === -1) first = rows.findIndex((r) => r.minutes >= rail.start);
  let last = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (isCare(rows[i] as DayRow, rail.end)) {
      last = i;
      break;
    }
  }
  if (last === -1)
    for (let i = rows.length - 1; i >= 0; i -= 1)
      if ((rows[i] as DayRow).minutes <= rail.end) {
        last = i;
        break;
      }
  if (first === -1 || last === -1 || last < first) return null;
  return { first, last };
}

/**
 * Handoffs that clash with another of the same adult's events, and those events: by entry key,
 * what it clashes with ("Work call", "June’s pickup"). `handoff` marks the handoff itself.
 */
export function clashes(
  headsUps: HeadsUp[],
  entries: Pick<NextEntry, 'key' | 'title'>[],
): Map<string, { with: string; handoff: boolean }> {
  const title = new Map(entries.map((e) => [e.key, e.title]));
  const out = new Map<string, { with: string; handoff: boolean }>();
  for (const h of headsUps) {
    if (h.type !== 'handoff_conflict') continue;
    const other = title.get(h.conflictingOccurrenceKey);
    const handoff = title.get(h.occurrenceKey);
    if (other && !out.get(h.occurrenceKey)?.handoff)
      out.set(h.occurrenceKey, { with: other, handoff: true });
    if (handoff && !out.has(h.conflictingOccurrenceKey))
      out.set(h.conflictingOccurrenceKey, { with: handoff, handoff: false });
  }
  return out;
}

/** Handoffs on a day by the occurrence they belong to (who does them is on the handoff). */
export function handoffByKey(handoffs: HandoffView[]): Map<string, HandoffView> {
  return new Map(handoffs.map((h) => [h.occurrenceKey, h]));
}

// ---------------------------------------------------------------------------------------------
// The headline's late count

/** Late rows on each list Today shows: yours, each other adult's (by name), the shared one. */
export interface LateCounts {
  mine: number;
  others: { name: string; count: number }[];
  shared: number;
}

/**
 * What's running late, counted the way the lists below show it, yours first: "1 of yours is
 * running late · Theo has 2". Null when nothing is late.
 */
export function lateWords({ mine, others, shared }: LateCounts): string | null {
  const rest = [
    ...others.filter((o) => o.count > 0).map((o) => `${o.name} has ${o.count}`),
    ...(shared > 0 ? [`${shared} shared`] : []),
  ];
  if (mine > 0) {
    const yours = `${mine} of yours ${mine === 1 ? 'is' : 'are'} running late`;
    return [yours, ...rest].join(' · ');
  }
  if (rest.length === 0) return null;
  return `Nothing of yours is late · ${rest.join(' · ')}`;
}

// ---------------------------------------------------------------------------------------------
// Back after days away

/** What the other adults "handled": things done, routines done, projects finished. */
const HANDLED = new Set<Activity['action']>([
  'task.completed',
  'routine.done',
  'project.completed',
]);

/**
 * One catch-up line when you come back after two or more days: "While you were away: Theo handled
 * 6 things; 3 need you." Built from the activity Today already loads and your own late and
 * due-today rows. Null on an ordinary day.
 */
export function awayWords({
  since,
  today,
  timeZone,
  activity,
  people,
  needYou,
}: {
  since: string | null;
  today: string;
  timeZone: string;
  activity: Activity[] | null;
  people: Pick<People, 'byId'>;
  needYou: number;
}): string | null {
  if (!since || !today || !activity) return null;
  if (daysBetween(localParts(since, timeZone).date, today) < 2) return null;
  const handled = new Map<string, number>();
  for (const a of activity) {
    const who = people.byId(a.actorMemberId);
    if (!who || who.isMe || !HANDLED.has(a.action)) continue;
    handled.set(who.name, (handled.get(who.name) ?? 0) + 1);
  }
  const done = [...handled].map(
    ([name, n], i) => `${name} handled ${n}${i === 0 ? ` thing${n === 1 ? '' : 's'}` : ''}`,
  );
  const need =
    needYou === 0 ? 'nothing needs you' : `${needYou} need${needYou === 1 ? 's' : ''} you`;
  return `While you were away: ${done.length ? `${done.join(', ')}; ` : ''}${need}.`;
}

// ---------------------------------------------------------------------------------------------
// All-day events

/** Today's all-day events (school closed, a holiday), once each, in title order. */
export function allDayOn(occurrences: Occurrence[], date: string, timeZone: string): Occurrence[] {
  const dayStart = startOfLocalDay(date, timeZone).epochMilliseconds;
  const dayEnd = startOfLocalDay(addDays(date, 1), timeZone).epochMilliseconds;
  const seen = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (!o.allDay || o.skipped || seen.has(o.key)) continue;
    const s = new Date(o.startsAt).getTime();
    const e = new Date(o.endsAt).getTime();
    if (s < dayEnd && e > dayStart) seen.set(o.key, o);
  }
  return [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
}
