// Small formatting and derivation helpers for Direction A. Pure functions only.
import { NOW, people, projects, type FamilyEvent, type PersonId, type Task } from '../../data';

export const TODAY = NOW.date;
export const TOMORROW = '2026-11-18';
export const WEEKEND = '2026-11-21';
export const END_OF_WEEK = '2026-11-22';

const pad = (n: number) => String(n).padStart(2, '0');

function hm(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return { h, m };
}

/** "8:15", "1:00" */
export function clock(hhmm: string): string {
  const { h, m } = hm(hhmm);
  return `${((h + 11) % 12) + 1}:${pad(m)}`;
}

export function meridiem(hhmm: string): 'am' | 'pm' {
  return hm(hhmm).h < 12 ? 'am' : 'pm';
}

/** "8:15–8:35am", "1–3pm", "7–10pm", "11:45am–1pm" */
export function range(start: string, end: string): string {
  const a = hm(start);
  const b = hm(end);
  const short = (x: { h: number; m: number }) => `${((x.h + 11) % 12) + 1}${x.m ? `:${pad(x.m)}` : ''}`;
  const am = (x: { h: number }) => (x.h < 12 ? 'am' : 'pm');
  if (am(a) === am(b)) return `${short(a)}–${short(b)}${am(b)}`;
  return `${short(a)}${am(a)}–${short(b)}${am(b)}`;
}

/** "1pm", "8:15am" */
export function tshort(hhmm: string): string {
  const { h, m } = hm(hhmm);
  return `${((h + 11) % 12) + 1}${m ? `:${pad(m)}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

export const minutes = (hhmm: string) => {
  const { h, m } = hm(hhmm);
  return h * 60 + m;
};

export function dayParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    num: d.getDate(),
    short: d.toLocaleDateString('en-US', { weekday: 'short' }),
    long: d.toLocaleDateString('en-US', { weekday: 'long' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

/** Who, in the viewer's voice: "You" for Maya. */
export const who = (id: PersonId | null | undefined, lower = false) => {
  if (!id) return lower ? 'either of you' : 'Either of you';
  if (id === 'maya') return lower ? 'you' : 'You';
  return people[id].name;
};

export const projectTitle = (id?: string) => {
  const p = projects.find((x) => x.id === id);
  if (!p) return undefined;
  return p.id === 'p1' ? 'Hall bathroom' : 'Garage';
};

/** Childcare handoffs as sentences: "Theo drops June at Little Oaks". */
export function handoffSentence(e: FamilyEvent): string | undefined {
  if (!e.handoff) return undefined;
  const place = e.location ?? 'Little Oaks';
  const { from, to } = e.handoff;
  if (to === 'daycare' && from !== 'daycare') {
    return from === 'maya' ? `You drop June at ${place}` : `${people[from].name} drops June at ${place}`;
  }
  if (from === 'daycare' && to !== 'daycare') {
    return to === 'maya' ? `You pick up June from ${place}` : `${people[to].name} picks up June from ${place}`;
  }
  return undefined;
}

export const adultsIn = (ids: PersonId[]) => ids.filter((p) => p === 'maya' || p === 'theo');

export const isLate = (t: Task) => !t.done && !!t.due && t.due < TODAY;

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
