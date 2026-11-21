/** Calendar arithmetic on YYYY-MM-DD strings (household-local dates from the API). */
const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string =>
  fromUtc(toUtc(date) + days * 86_400_000);

/** Monday = 1 … Sunday = 7. */
export const dayOfWeek = (date: string): number => {
  const d = new Date(toUtc(date)).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((toUtc(b) - toUtc(a)) / 86_400_000);

const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
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

export const weekdayName = (date: string) => WEEKDAY[dayOfWeek(date) - 1] ?? '';

/** "Nov 30", or "Nov 30, 2027" in another year. */
export function shortDate(date: string, today?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const year = today && today.slice(0, 4) !== date.slice(0, 4) ? `, ${y}` : '';
  return `${MONTH[(m ?? 1) - 1]} ${d}${year}`;
}

/** "Sunday, November 15". */
export function longDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${weekdayName(date)}, ${MONTH_LONG[(m ?? 1) - 1]} ${d}`;
}

/**
 * A friendly relative date: "3 days late", "Yesterday", "Today", "Tomorrow", "Thursday" (within a
 * week), else "Nov 30".
 */
export function relativeDay(date: string, today: string, { late = true } = {}): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return late ? `${-diff} days late` : shortDate(date, today);
  if (diff < 7) return weekdayName(date);
  return shortDate(date, today);
}

/** "7pm", "9:30am" from "19:00". */
export function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

/**
 * A schedule line from the API or the domain ("Every Monday at 20:00") in the app's one time
 * format: "Every Monday at 8pm".
 */
export function friendlyTimes(text: string): string {
  return text.replace(
    /\bat ([01]\d|2[0-3]):([0-5]\d)\b/g,
    (_, h: string, m: string) => `at ${clock(`${h}:${m}`)}`,
  );
}

/** The greeting for the household's local hour. */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The current hour (0–23) in a timezone. */
export function hourIn(timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(
      new Date(),
    );
    return Number(h) % 24;
  } catch {
    return new Date().getHours();
  }
}
