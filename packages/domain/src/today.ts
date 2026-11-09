import { Temporal } from 'temporal-polyfill';
import type { WorkItemStatus } from './work-item';

/**
 * Today (PRD §4): what needs me, what's moving, what's due this week, what got handled.
 * Pure and deterministic: the API passes the clock and the household's timezone, so tests can
 * pin both (brief rule 9).
 */
export interface TodayItem {
  id: string;
  status: WorkItemStatus;
  ownerMemberId: string | null;
  /** All-day due date, YYYY-MM-DD in the household's timezone. */
  dueOn: string | null;
  /** Timed due instant, ISO 8601. */
  dueAt: string | null;
  updatedAt: string;
}

export interface TodayInput<T extends TodayItem> {
  items: readonly T[];
  memberId: string;
  now: Date;
  timeZone: string;
}

export interface TodayView<T> {
  /** Local date the view was computed for. */
  date: string;
  needsYou: T[];
  inProgress: T[];
  thisWeek: T[];
  handled: T[];
}

const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
// `new` items are still in the inbox; they show there, not on Today.
const NOT_OPEN: readonly WorkItemStatus[] = [...DONE, 'cancelled', 'new'];
const MOVING: readonly WorkItemStatus[] = [
  'in_progress',
  'waiting_on_others',
  'blocked',
  'scheduled',
];
const HANDLED_WINDOW_DAYS = 7;

/** The item's due date as a local calendar date, or null. */
export function localDueDate(
  item: Pick<TodayItem, 'dueOn' | 'dueAt'>,
  timeZone: string,
): Temporal.PlainDate | null {
  if (item.dueOn) return Temporal.PlainDate.from(item.dueOn);
  if (item.dueAt)
    return Temporal.Instant.from(item.dueAt).toZonedDateTimeISO(timeZone).toPlainDate();
  return null;
}

export function isOverdue(item: TodayItem, today: Temporal.PlainDate, timeZone: string): boolean {
  if (NOT_OPEN.includes(item.status)) return false;
  const due = localDueDate(item, timeZone);
  return due !== null && Temporal.PlainDate.compare(due, today) < 0;
}

export function buildToday<T extends TodayItem>({
  items,
  memberId,
  now,
  timeZone,
}: TodayInput<T>): TodayView<T> {
  const nowZoned = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  const today = nowZoned.toPlainDate();
  const weekEnd = today.add({ days: 6 });
  const handledSince = nowZoned.subtract({ days: HANDLED_WINDOW_DAYS }).toInstant();

  const due = (item: T) => localDueDate(item, timeZone);
  const byDue = (a: T, b: T) => {
    const da = due(a);
    const db = due(b);
    if (da && db) return Temporal.PlainDate.compare(da, db);
    if (da) return -1;
    if (db) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  };

  const view: TodayView<T> = {
    date: today.toString(),
    needsYou: [],
    inProgress: [],
    thisWeek: [],
    handled: [],
  };

  for (const item of items) {
    if (DONE.includes(item.status)) {
      if (Temporal.Instant.compare(Temporal.Instant.from(item.updatedAt), handledSince) >= 0)
        view.handled.push(item);
      continue;
    }
    if (NOT_OPEN.includes(item.status)) continue;

    const mine = item.ownerMemberId === memberId;
    const dueDate = due(item);
    if (
      mine &&
      (item.status === 'needs_you' ||
        item.status === 'awaiting_completion' ||
        isOverdue(item, today, timeZone))
    ) {
      view.needsYou.push(item);
    } else if (
      dueDate &&
      Temporal.PlainDate.compare(dueDate, today) >= 0 &&
      Temporal.PlainDate.compare(dueDate, weekEnd) <= 0
    ) {
      view.thisWeek.push(item);
    } else if (
      MOVING.includes(item.status) ||
      item.status === 'needs_you' ||
      item.status === 'awaiting_completion'
    ) {
      view.inProgress.push(item);
    }
  }

  view.needsYou.sort(byDue);
  view.thisWeek.sort(byDue);
  view.inProgress.sort(byDue);
  view.handled.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return view;
}
