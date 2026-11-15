// Small formatting helpers for Direction B. Everything reads from the prototype's fixed clock.
import { NOW, events, type FamilyEvent, type PersonId, type Task } from '../../data';

export const TODAY = NOW.date;
export const NOW_MIN = toMin(NOW.time);

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** "13:00" → "1:00" (12h, no suffix). */
export function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}`;
}

function shortClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}` : `${hh}:${String(m).padStart(2, '0')}`;
}

const suffix = (hhmm: string) => (toMin(hhmm) >= 720 ? 'pm' : 'am');

/** "13:00","15:00" → "1–3pm"; "07:15","07:45" → "7:15–7:45am". */
export function range(start: string, end: string): string {
  const s = suffix(start);
  const e = suffix(end);
  return s === e ? `${shortClock(start)}–${shortClock(end)}${e}` : `${shortClock(start)}${s}–${shortClock(end)}${e}`;
}

export function weekday(iso: string, style: 'short' | 'long' = 'short'): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: style });
}

export function monthDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dayNum(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

/** Compact due text for the mono due column. */
export function dueShort(t: Pick<Task, 'due' | 'done'>): { text: string; tone: 'late' | 'today' | 'soon' | 'later' | 'none' } {
  if (!t.due) return { text: '', tone: 'none' };
  const diff = daysBetween(TODAY, t.due);
  if (diff < 0 && !t.done) return { text: `${-diff} ${diff === -1 ? 'day' : 'days'} late`, tone: 'late' };
  if (diff === 0) return { text: 'Today', tone: 'today' };
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (diff > 1 && diff < 7) return { text: `${weekday(t.due)} ${dayNum(t.due)}`, tone: 'soon' };
  return { text: monthDay(t.due), tone: 'later' };
}

export const ownerName = (p: PersonId | null, you = true): string =>
  p === null ? 'Either of you' : p === 'maya' ? (you ? 'You' : 'Maya') : p === 'theo' ? 'Theo' : p === 'june' ? 'June' : 'Priya';

export const nextOwner = (p: PersonId | null): PersonId | null => (p === 'maya' ? 'theo' : p === 'theo' ? null : 'maya');

export const eventsOn = (date: string): FamilyEvent[] =>
  events.filter((e) => e.date === date).sort((a, b) => toMin(a.start) - toMin(b.start));

export const findEvent = (id: string) => events.find((e) => e.id === id);

/** The adult responsible for an event, for coloring: one adult → that adult; several → null. */
export function leadOf(e: FamilyEvent): PersonId | null {
  const adults = e.who.filter((w) => w === 'maya' || w === 'theo');
  if (adults.length === 1) return adults[0]!;
  if (adults.length === 0) return e.who[0] ?? null;
  return null;
}

/** Days of the current week from today through Sunday. */
export const restOfWeek = [0, 1, 2, 3, 4, 5].map((n) => addDays(TODAY, n));

export const isTyping = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
