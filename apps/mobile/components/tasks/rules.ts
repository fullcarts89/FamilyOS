import { localDueDate, workItemMachine, type WorkItemStatus } from '@familyos/domain';
import type { WorkItem } from '../../lib/api';
import { clock, daysBetween, relativeDay } from '../../lib/dates';

/**
 * The rules for tasks that need no React: when something is due, whether it's open, the words for
 * where it stands, and which of a routine's turns to show. lib/tasks.ts re-exports all of it;
 * keeping it here lets the unit tests (test/mobile-today*.ts) run it under Node.
 */

export type When = 'late' | 'today' | 'week' | 'later' | 'waiting';
export const WHEN_ORDER: When[] = ['late', 'today', 'week', 'later', 'waiting'];
export const WHEN_LABEL: Record<When, string> = {
  late: 'Late',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  waiting: 'Waiting',
};

export const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
export const CLOSED: readonly WorkItemStatus[] = [...DONE, 'cancelled'];
/** Things someone else (or something) has to move first. */
const WAITING: readonly WorkItemStatus[] = ['waiting_on_others', 'scheduled', 'blocked'];

export const isDone = (item: Pick<WorkItem, 'status'>) => DONE.includes(item.status);
export const isOpen = (item: Pick<WorkItem, 'status'>) =>
  !CLOSED.includes(item.status) && item.status !== 'new';

/** The item's local due date (YYYY-MM-DD) in the household's timezone. */
export function dueDate(item: Pick<WorkItem, 'dueOn' | 'dueAt'>, timeZone: string): string | null {
  return localDueDate(item, timeZone)?.toString() ?? null;
}

export function whenOf(item: WorkItem, today: string, timeZone: string): When {
  if (WAITING.includes(item.status)) return 'waiting';
  const due = dueDate(item, timeZone);
  if (!due) return 'later';
  const diff = daysBetween(today, due);
  if (diff < 0) return 'late';
  if (diff === 0) return 'today';
  if (diff <= 6) return 'week';
  return 'later';
}

/** "3 days late", "Today 7pm", "Tomorrow", "Thursday", "Nov 30". */
export function dueText(item: WorkItem, today: string, timeZone: string): string | null {
  const due = dueDate(item, timeZone);
  if (!due) return null;
  const day = relativeDay(due, today);
  if (!item.dueAt) return day;
  try {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(new Date(item.dueAt));
    return `${day} ${clock(time)}`;
  } catch {
    return day;
  }
}

/** Plain words for where something stands. `null` for the ordinary "to do". */
export const STATUS_NOTE: Record<WorkItemStatus, string | null> = {
  new: 'In the inbox',
  ready: null,
  in_progress: 'Started',
  needs_you: 'Needs a decision',
  waiting_on_others: 'Waiting on someone',
  scheduled: 'Booked',
  awaiting_completion: 'Check it’s done',
  verified_complete: 'Done',
  done_unverified: 'Done, not checked',
  blocked: 'Stuck',
  cancelled: 'Dropped',
};

/** Where it stands, in a sentence for the detail view. */
export const STATUS_SENTENCE: Record<WorkItemStatus, string> = {
  new: 'Still in the inbox, waiting to be sorted.',
  ready: 'To do.',
  in_progress: 'Started.',
  needs_you: 'Needs a decision before it can move.',
  waiting_on_others: 'Waiting on someone else.',
  scheduled: 'Booked. It happens on its day.',
  awaiting_completion: 'Someone should check it’s really done.',
  verified_complete: 'Done, and confirmed.',
  done_unverified: 'Marked done, but nobody could confirm it.',
  blocked: 'Stuck: something is in the way.',
  cancelled: 'Dropped. Nobody needs to do it.',
};

/** The words on a button that moves an item to each status. */
export function actionLabel(to: WorkItemStatus, from: WorkItemStatus): string {
  if (to === 'in_progress' && (DONE.includes(from) || from === 'blocked')) return 'Reopen';
  const labels: Partial<Record<WorkItemStatus, string>> = {
    ready: from === 'cancelled' ? 'Bring it back' : 'Back to to-do',
    in_progress: 'I’ve started',
    needs_you: 'Needs a decision',
    waiting_on_others: 'Waiting on someone',
    scheduled: 'It’s booked',
    awaiting_completion: 'Ask someone to check',
    verified_complete: from === 'done_unverified' ? 'Confirm it’s done' : 'Done',
    done_unverified: 'Done, but I can’t check',
    blocked: 'It’s stuck',
    cancelled: 'Drop it',
  };
  return labels[to] ?? 'Change';
}

/** Ticking the round checkbox is the member's own confirmation (evidence E3). */
export const canTick = (item: Pick<WorkItem, 'status'>) =>
  item.status !== 'new' && workItemMachine.canTransition(item.status, 'verified_complete');

/** Ordering inside a group: earliest due first, then important, then newest. */
export function byDue(timeZone: string) {
  return (a: WorkItem, b: WorkItem) => {
    const da = dueDate(a, timeZone);
    const db = dueDate(b, timeZone);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (db && !da) return 1;
    const pa = a.priority ?? 9;
    const pb = b.priority ?? 9;
    if (pa !== pb) return pa - pb;
    return b.updatedAt.localeCompare(a.updatedAt);
  };
}

/**
 * A routine's turns appear one at a time: only the earliest open occurrence of each routine is
 * listed (the next ones belong to the routine's own view). Everything else passes through.
 */
export function currentTurns<
  T extends Pick<
    WorkItem,
    'id' | 'status' | 'recurrenceRuleId' | 'occurrenceIndex' | 'occurrenceOn' | 'isCurrentTurn'
  >,
>(items: readonly T[]): T[] {
  const key = (i: T) =>
    `${i.occurrenceOn ?? ''}#${String(i.occurrenceIndex ?? 0).padStart(6, '0')}`;
  const first = new Map<string, T>();
  for (const item of items) {
    if (!item.recurrenceRuleId || !isOpen(item) || item.isCurrentTurn === false) continue;
    const seen = first.get(item.recurrenceRuleId);
    if (!seen || key(item) < key(seen)) first.set(item.recurrenceRuleId, item);
  }
  return items.filter(
    (item) =>
      !item.recurrenceRuleId || !isOpen(item) || first.get(item.recurrenceRuleId)?.id === item.id,
  );
}

/**
 * Whether finishing `after` (confirmed by the server) left this person nothing late or due today
 * on their own list: the "That's everything for today" milestone, on Today and in Tasks alike.
 * Project steps and projects have their own milestones.
 */
export function clearsToday({
  after,
  items,
  memberId,
  today,
  timeZone,
}: {
  after: WorkItem;
  items: readonly WorkItem[];
  memberId: string;
  today: string;
  timeZone: string;
}): boolean {
  const urgent = (i: WorkItem) => {
    const w = whenOf(i, today, timeZone);
    return w === 'late' || w === 'today';
  };
  if (after.ownerMemberId !== memberId || after.parentId || after.type === 'project') return false;
  if (!urgent({ ...after, status: 'ready' })) return false;
  return !items.some(
    (i) =>
      i.ownerMemberId === memberId &&
      !i.parentId &&
      i.type !== 'project' &&
      isOpen(i) &&
      i.id !== after.id &&
      urgent(i),
  );
}
