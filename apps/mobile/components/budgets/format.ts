import { clock, shortDate } from '../../lib/dates';
import { localParts } from '../../lib/rhythm';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "November" from "2026-11-01". */
export const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? '';

/** A month's first day, `by` months on. */
export const shiftMonth = (m: string, by: number) => {
  const y = Number(m.slice(0, 4));
  const n = Number(m.slice(5, 7)) - 1 + by;
  const year = y + Math.floor(n / 12);
  const month = ((n % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole dollars: "$1,300". */
export const money = (n: number) => dollars.format(n);

/** A plan as typed: whole dollars when it is one, else with cents ("$1,300", "$462.12"). */
export const planMoney = (n: number) => (Number.isInteger(n) ? dollars.format(n) : cents.format(n));

/** "$1,400" or "1400.50" as typed → dollars, or null when it isn't an amount the plan can take. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n < 1e7 ? n : null;
}

/** "around 12pm", or "tomorrow around 7am". */
export const nextSyncText = (next: { time: string; tomorrow: boolean } | null) =>
  next ? `${next.tomorrow ? 'tomorrow ' : ''}around ${clock(next.time)}` : null;

/** "6:10am" today, else "Nov 24, 9pm". */
export function syncedText(at: string, timeZone: string, today: string) {
  const parts = localParts(at, timeZone);
  const hh = `${String(Math.floor(parts.minutes / 60)).padStart(2, '0')}:${String(parts.minutes % 60).padStart(2, '0')}`;
  return parts.date === today ? clock(hh) : `${shortDate(parts.date, today)}, ${clock(hh)}`;
}
