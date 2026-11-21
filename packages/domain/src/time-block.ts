import { Temporal } from 'temporal-polyfill';

/**
 * Time blocks: a task with a time can also say how long it takes ("Walk Biscuit, 5:30–6pm"), so
 * the day view shows it from start to end. The length is optional; a task with a time and no
 * length stays a moment ("Due 5:30pm"). Pure: no clock, no timezone.
 */

/** The shortest and longest length, and the step between lengths (minutes). */
export const DURATION_MIN = 5;
export const DURATION_MAX = 720;
export const DURATION_STEP = 5;

/** The lengths the app offers as chips (minutes); "No length" is null. */
export const DURATION_CHOICES: readonly number[] = [15, 30, 45, 60, 120];

/** Five minutes to twelve hours, in steps of five. */
export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= DURATION_MIN &&
    minutes <= DURATION_MAX &&
    minutes % DURATION_STEP === 0
  );
}

/** "15 min", "45 min", "1 hour", "1 hour 30 min", "2 hours". */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 0 ? '' : hours === 1 ? '1 hour' : `${hours} hours`;
  const m = rest === 0 ? '' : `${rest} min`;
  return [h, m].filter(Boolean).join(' ') || '0 min';
}

export interface TimeBlock {
  /** ISO instants: the task's time, and that plus its length. */
  startsAt: string;
  endsAt: string;
  minutes: number;
}

/** A timed task's block, from its time to its time plus its length; null without both. */
export function timeBlock(item: {
  dueAt: string | null;
  durationMinutes?: number | null;
}): TimeBlock | null {
  const minutes = item.durationMinutes ?? null;
  if (!item.dueAt || minutes === null || minutes <= 0) return null;
  const start = Temporal.Instant.from(item.dueAt);
  return {
    startsAt: start.toString(),
    endsAt: start.add({ minutes }).toString(),
    minutes,
  };
}
