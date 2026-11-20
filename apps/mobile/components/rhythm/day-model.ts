/**
 * Pure helpers behind Today's day views (no React Native here, so they are unit tested):
 * splitting the day into "next" and "Tonight", the phone's vertical timeline rows, labels that
 * fit their room, and text colors that stay readable on member colors.
 */
import { localParts } from '../../lib/rhythm';

/** Evening starts at 5:00pm household time: dinner, bath and bedtime, evening handoffs. */
export const EVENING = 17 * 60;

/** Minutes since local midnight of an instant in the household's time zone (and its date). */
const localMinutes = localParts;

interface Timed {
  startsAt: string;
  endsAt: string;
}

/**
 * What's next, and tonight as one block. Entries still to come (or under way) are split at
 * 5:00pm household time: those starting before go in `next` (at most `limit`), those starting
 * at or after it go in `tonight` (at most `tonightLimit`). Once it's evening, everything left
 * is tonight.
 */
export function splitTonight<T extends Timed>(
  entries: T[],
  now: Date,
  timeZone: string,
  { limit = 3, tonightLimit = 6 }: { limit?: number; tonightLimit?: number } = {},
): { next: T[]; tonight: T[] } {
  const t = now.getTime();
  const today = localMinutes(now, timeZone).date;
  const upcoming = entries.filter(
    (e) => new Date(e.endsAt).getTime() > t || new Date(e.startsAt).getTime() >= t,
  );
  const evening = (e: T) => {
    const s = localMinutes(e.startsAt, timeZone);
    return s.date > today || (s.date === today && s.minutes >= EVENING);
  };
  return {
    next: upcoming.filter((e) => !evening(e)).slice(0, limit),
    tonight: upcoming.filter(evening).slice(0, tonightLimit),
  };
}

// ------------------------------------------------------------------------------------------------
// The phone's whole day: one vertical timeline with an hour ruler.

export interface AwaySpan {
  /** Who is away (a child or a pet). */
  memberId: string;
  start: number;
  end: number;
}

export type DayRow<T> =
  | {
      kind: 'hour';
      hour: number;
      /** Entries starting in this hour, in order. */
      items: T[];
      /** Where the now-line sits among the items (index before which it goes), or null. */
      nowAt: number | null;
      /** Members away (at daycare, the groomer…) during this hour. */
      away: string[];
    }
  | { kind: 'quiet'; from: number; to: number; away: string[] };

/**
 * Rows for the vertical timeline: one per hour of the window, with the entries that start in it
 * and the now-line placed among them. Runs of three or more empty hours fold into one quiet row,
 * so the day reads without long blank stretches.
 */
export function dayRows<T extends Timed>(
  entries: T[],
  {
    from,
    to,
    timeZone,
    date,
    now,
    away = [],
  }: {
    from: number;
    to: number;
    timeZone: string;
    date: string;
    now: Date | null;
    away?: AwaySpan[];
  },
): DayRow<T>[] {
  const minuteOf = (iso: string) => {
    const p = localMinutes(iso, timeZone);
    return p.date < date ? 0 : p.date > date ? 24 * 60 - 1 : p.minutes;
  };
  const nowMin = now
    ? (() => {
        const p = localMinutes(now, timeZone);
        return p.date === date ? p.minutes : null;
      })()
    : null;
  const firstHour = Math.floor(from / 60);
  const lastHour = Math.max(firstHour, Math.ceil(to / 60) - 1);
  const hours: Extract<DayRow<T>, { kind: 'hour' }>[] = [];
  for (let h = firstHour; h <= lastHour; h++) {
    const items = entries
      .filter((e) => {
        const m = minuteOf(e.startsAt);
        const hourOf = Math.min(lastHour, Math.max(firstHour, Math.floor(m / 60)));
        return hourOf === h;
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    let nowAt: number | null = null;
    if (nowMin !== null && Math.floor(nowMin / 60) === h) {
      const before = items.filter((e) => minuteOf(e.startsAt) <= nowMin).length;
      nowAt = before;
    }
    const awayHere = away
      .filter((s) => s.start < (h + 1) * 60 && s.end > h * 60)
      .map((s) => s.memberId)
      .filter((id, i, all) => all.indexOf(id) === i);
    hours.push({ kind: 'hour', hour: h, items, nowAt, away: awayHere });
  }
  // Fold runs of 3+ empty hours (no items, no now-line) into one quiet row.
  const out: DayRow<T>[] = [];
  let run: typeof hours = [];
  const flush = () => {
    const first = run[0];
    const last = run.at(-1);
    if (first && last && run.length >= 3) {
      out.push({
        kind: 'quiet',
        from: first.hour,
        to: last.hour + 1,
        away: first.away.filter((id) => run.every((r) => r.away.includes(id))),
      });
    } else out.push(...run);
    run = [];
  };
  for (const row of hours) {
    if (row.items.length === 0 && row.nowAt === null) run.push(row);
    else {
      flush();
      out.push(row);
    }
  }
  flush();
  return out;
}

/** "9am", "noon", "5pm", "midnight" for the ruler. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
}

// ------------------------------------------------------------------------------------------------
// Labels that fit.

/**
 * The first label that fits `room` pixels at about `charWidth` per character, trying the full
 * title with its time, the title alone, the title before its colon with the time, and the short
 * title alone. Null when none fits (the caller truncates the shortest, or shows nothing).
 */
export function fitLabel(
  title: string,
  time: string | null,
  room: number,
  charWidth = 6.6,
): { text: string; time: string | null } | null {
  const short = (title.split(':')[0] ?? title).trim();
  const tries: { text: string; time: string | null }[] = [
    { text: title, time },
    { text: title, time: null },
    { text: short, time },
    { text: short, time: null },
  ];
  for (const t of tries) {
    const chars = t.text.length + (t.time ? t.time.length + 2 : 0);
    if (chars * charWidth <= room) return t;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Readable color.

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
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
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

/** Text on a filled member color: white or ink, whichever reads better. */
export function textOn(fill: string): string {
  return contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK;
}

/**
 * A member color to fill behind text: the color itself when white or ink reads on it, else the
 * color deepened just enough for white text (coral, sage and teal sit between the two).
 */
export function solidFill(hex: string): string {
  if (Math.max(contrast(WHITE, hex), contrast(INK, hex)) >= 4.5) return hex;
  return readableOn(hex, WHITE);
}

function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((c, i) => Math.round(c + ((y[i] ?? c) - c) * t))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * A member color deepened toward ink until it reads as small text on `background` (4.5:1).
 * Keeps the hue, so "5:30" still looks like Maya's.
 */
export function readableOn(hex: string, background = WHITE): string {
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(hex, INK, t);
    if (contrast(c, background) >= 4.5) return c;
  }
  return INK;
}
