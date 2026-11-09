import { Temporal } from 'temporal-polyfill';

export interface DueOption {
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Quick due-date choices for capture, relative to the household's local date (from the API).
 * "This weekend" is the coming Saturday (today if it is Saturday or Sunday); "Next week" is
 * the following Monday. A choice that lands on the same day as an earlier one is left out, so
 * on a Sunday "This weekend" doesn't repeat "Today".
 */
export function dueOptions(today: string): DueOption[] {
  const date = Temporal.PlainDate.from(today);
  const dayOfWeek = date.dayOfWeek; // Monday = 1 ... Sunday = 7
  const weekend = dayOfWeek >= 6 ? date : date.add({ days: 6 - dayOfWeek });
  const nextMonday = date.add({ days: 8 - dayOfWeek });
  const options = [
    { label: 'Today', date: date.toString() },
    { label: 'Tomorrow', date: date.add({ days: 1 }).toString() },
    { label: 'This weekend', date: weekend.toString() },
    { label: 'Next week', date: nextMonday.toString() },
  ];
  return options.filter((o, i) => options.findIndex((p) => p.date === o.date) === i);
}

/** Short, human date for lists: "Today", "Tomorrow", "Yesterday", "Tue 10 Nov" or "Wed 1 Dec 2027". */
export function formatDue(due: string, today: string): string {
  const d = Temporal.PlainDate.from(due);
  const diff = Temporal.PlainDate.from(today).until(d, { largestUnit: 'days' }).days;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.dayOfWeek - 1];
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][d.month - 1];
  // Another year gets its year, so 1 Dec this year and next don't look alike.
  const year = d.year === Temporal.PlainDate.from(today).year ? '' : ` ${d.year}`;
  return `${weekday} ${d.day} ${month}${year}`;
}

/**
 * When something is due, in the household's own timezone: "Tue 10 Nov" for all-day items,
 * "Today 19:00" for timed ones. Never derived from the UTC date, which is a day off in the
 * evening in the Americas.
 */
export function describeDue(
  item: { dueOn: string | null; dueAt: string | null },
  today: string,
  timeZone: string,
): string | null {
  if (item.dueOn) return formatDue(item.dueOn, today);
  if (!item.dueAt) return null;
  const local = Temporal.Instant.from(item.dueAt).toZonedDateTimeISO(timeZone);
  return `${formatDue(local.toPlainDate().toString(), today)} ${local.toPlainTime().toString().slice(0, 5)}`;
}

const MONTH_NAMES = [
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

/**
 * Start choices for monthly routines: the first of this month and the next two. A monthly series
 * counts its months from the start month, so "every 3 months on the 1st, from December" gives
 * 1 Dec, 1 Mar, 1 Jun.
 */
export function monthStartOptions(today: string): DueOption[] {
  const month = Temporal.PlainDate.from(today).toPlainYearMonth();
  return [0, 1, 2].map((n) => {
    const m = month.add({ months: n });
    return {
      label: `From ${MONTH_NAMES[m.month - 1] ?? ''}`,
      date: m.toPlainDate({ day: 1 }).toString(),
    };
  });
}
