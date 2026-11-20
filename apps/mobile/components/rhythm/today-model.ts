import type { HandoffView, RhythmLaneView } from '../../lib/api';
import { clock } from '../../lib/dates';
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

/** Ink or white, whichever reads better on a filled member color (marigold takes ink). */
export function readableOn(background: string): string {
  return contrast(WHITE, background) >= 4.5 ||
    contrast(WHITE, background) >= contrast(INK, background)
    ? WHITE
    : INK;
}

/**
 * A member color deepened (mixed toward ink) until it reads as text on `background` at 4.5:1,
 * so a coral "5:30" stays recognisably theirs and still passes contrast.
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
 * Rows for the vertical day, in time order: hour marks (every hour near something, every third
 * hour through quiet stretches), the day's items and the now-line. The ruler is ordered rather
 * than to scale, so nothing overlaps and the day fits a phone.
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
  const rows: (DayRow & { order: number })[] = [];
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
    });
  }
  if (nowMin !== null) rows.push({ kind: 'now', key: 'now', minutes: nowMin, order: 1 });
  rows.sort((a, b) => a.minutes - b.minutes || a.order - b.order);
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

/** Handoffs on a day by the occurrence they belong to (who does them is on the handoff). */
export function handoffByKey(handoffs: HandoffView[]): Map<string, HandoffView> {
  return new Map(handoffs.map((h) => [h.occurrenceKey, h]));
}
