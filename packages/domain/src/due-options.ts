import { Temporal } from 'temporal-polyfill';

export interface DueOption {
  label: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Quick due-date choices for capture, relative to the household's local date (from the API).
 * "This weekend" is the coming Saturday (today if it is Saturday or Sunday); "Next week" is
 * the following Monday.
 */
export function dueOptions(today: string): DueOption[] {
  const date = Temporal.PlainDate.from(today);
  const dayOfWeek = date.dayOfWeek; // Monday = 1 ... Sunday = 7
  const weekend = dayOfWeek >= 6 ? date : date.add({ days: 6 - dayOfWeek });
  const nextMonday = date.add({ days: 8 - dayOfWeek });
  return [
    { label: 'Today', date: date.toString() },
    { label: 'Tomorrow', date: date.add({ days: 1 }).toString() },
    { label: 'This weekend', date: weekend.toString() },
    { label: 'Next week', date: nextMonday.toString() },
  ];
}

/** Short, human date for lists: "Today", "Tomorrow", "Yesterday", or "Tue 10 Nov". */
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
  return `${weekday} ${d.day} ${month}`;
}
