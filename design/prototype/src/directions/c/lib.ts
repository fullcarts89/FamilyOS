// Direction C helpers: time geometry, task windows and the shape of June's day.
import { events, NOW, people, type FamilyEvent, type PersonId, type Task } from '../../data';

export const DAY_START = 6 * 60;
export const DAY_END = 22 * 60;
export const DAY_SPAN = DAY_END - DAY_START;
export const NOW_MIN = toMin(NOW.time);
export const WEEK_END = '2026-11-22';

export function toMin(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** Fraction of the 6:00–22:00 day, clamped. */
export function frac(min: number): number {
  return Math.max(0, Math.min(1, (min - DAY_START) / DAY_SPAN));
}

function parts(min: number) {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h, m, pm: h24 >= 12 };
}

/** "8:15", "1", "12:30" */
export function clock(hhmm: string | number): string {
  const { h, m } = parts(typeof hhmm === 'number' ? hhmm : toMin(hhmm));
  return m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`;
}

/** "8:15" always with minutes. */
export function clockFull(hhmm: string | number): string {
  const { h, m } = parts(typeof hhmm === 'number' ? hhmm : toMin(hhmm));
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "2pm", "9:30am" */
export function clockAP(hhmm: string): string {
  const { pm } = parts(toMin(hhmm));
  return `${clock(hhmm)}${pm ? 'pm' : 'am'}`;
}

/** "1–3pm", "9:30–10:30am", "11:45am–1pm" */
export function range(start: string, end: string): string {
  const a = parts(toMin(start));
  const b = parts(toMin(end));
  const fa = a.m ? `${a.h}:${String(a.m).padStart(2, '0')}` : `${a.h}`;
  const fb = b.m ? `${b.h}:${String(b.m).padStart(2, '0')}` : `${b.h}`;
  if (a.pm === b.pm) return `${fa}–${fb}${b.pm ? 'pm' : 'am'}`;
  return `${fa}${a.pm ? 'pm' : 'am'}–${fb}${b.pm ? 'pm' : 'am'}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayShort(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
}
export function dayNum(iso: string): number {
  return Number(iso.slice(8, 10));
}

export const nameOf = (p: PersonId | null | undefined, me = 'You') =>
  p == null ? 'Either of you' : p === 'maya' ? me : people[p].name;

export const otherAdult = (p: PersonId): PersonId => (p === 'maya' ? 'theo' : 'maya');

export type When = 'late' | 'today' | 'week' | 'later';
export const WHEN_LABEL: Record<When, string> = { late: 'Late', today: 'Today', week: 'This week', later: 'Later' };

export function whenOf(t: Task): When {
  if (!t.due) return 'later';
  if (t.due < NOW.date) return 'late';
  if (t.due === NOW.date) return 'today';
  if (t.due <= WEEK_END) return 'week';
  return 'later';
}

export function lateBy(due: string): number {
  return Math.round((Date.parse(NOW.date) - Date.parse(due)) / 86400000);
}

/** Short, human due text for a row. */
export function dueText(t: Task): string | undefined {
  if (!t.due) return undefined;
  if (t.due < NOW.date) {
    const d = lateBy(t.due);
    return d === 1 ? 'Yesterday' : `${d} days late`;
  }
  if (t.due === NOW.date) return t.dueTime ? `Today ${clock(t.dueTime)}` : 'Today';
  if (t.due === addDays(NOW.date, 1)) return 'Tomorrow';
  const diff = Math.round((Date.parse(t.due) - Date.parse(NOW.date)) / 86400000);
  const d = new Date(`${t.due}T12:00:00`);
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const eventsOn = (date: string) => events.filter((e) => e.date === date);

/** Breakfast, dinner: everyone together. Drawn as a band across all lanes. */
export const isTogether = (e: FamilyEvent) =>
  e.kind === 'meal' && e.who.includes('maya') && e.who.includes('theo') && e.who.includes('june');

export interface JuneSeg {
  start: number;
  end: number;
  place: 'home' | 'care' | 'with' | 'asleep';
  label: string;
  with: PersonId[];
  eventId?: string;
}

/** Where June is, and who has her, across a day: built from that day's handoffs and bedtime. */
export function juneDay(date: string): JuneSeg[] {
  const day = eventsOn(date);
  const drop = day.find((e) => e.handoff?.to === 'daycare');
  const pick = day.find((e) => e.handoff?.from === 'daycare');
  const bed = day.find((e) => e.kind === 'routine' && e.who.includes('june'));
  const segs: JuneSeg[] = [];
  let cursor = DAY_START;
  const both: PersonId[] = ['maya', 'theo'];
  const push = (s: JuneSeg) => {
    if (s.end > s.start) segs.push(s);
    cursor = s.end;
  };
  if (drop || pick) {
    const dropS = drop ? toMin(drop.start) : 8 * 60 + 15;
    const dropE = drop ? toMin(drop.end) : 8 * 60 + 35;
    const pickS = pick ? toMin(pick.start) : 17 * 60 + 30;
    const pickE = pick ? toMin(pick.end) : 17 * 60 + 50;
    push({ start: cursor, end: dropS, place: 'home', label: 'Home', with: both });
    const dropBy = drop?.handoff?.from as PersonId | undefined;
    push({ start: dropS, end: dropE, place: 'with', label: '', with: dropBy ? [dropBy] : [], eventId: drop?.id });
    push({ start: dropE, end: pickS, place: 'care', label: 'Little Oaks', with: [] });
    const pickBy = pick?.handoff?.to as PersonId | undefined;
    push({ start: pickS, end: pickE, place: 'with', label: '', with: pickBy ? [pickBy] : [], eventId: pick?.id });
  }
  if (bed) {
    const bS = toMin(bed.start);
    const bE = toMin(bed.end);
    push({ start: cursor, end: bS, place: 'home', label: 'Home', with: both });
    push({ start: bS, end: bE, place: 'with', label: 'Bath', with: bed.who.filter((p) => p !== 'june'), eventId: bed.id });
    push({ start: bE, end: DAY_END, place: 'asleep', label: 'Asleep', with: [] });
  } else {
    push({ start: cursor, end: 19 * 60 + 45, place: 'home', label: 'Home', with: both });
    push({ start: cursor, end: DAY_END, place: 'asleep', label: 'Asleep', with: [] });
  }
  return segs;
}

export const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
