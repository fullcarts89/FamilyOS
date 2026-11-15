import { localDueDate, workItemMachine, type WorkItemStatus } from '@familyos/domain';
import { useCallback } from 'react';
import { useHaptics } from '../design/motion/haptics';
import { useToast } from '../design/Toast';
import { api, errorMessage, type WorkItem } from './api';
import { clock, daysBetween, relativeDay } from './dates';
import { useHousehold } from './household';
import { usePeople } from './people';

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
 * Task moves, optimistic: the screen changes at once (`onChange` with the expected item), the
 * request follows, and the API's item (its new version) replaces it. A failed request rolls back
 * with a plain message and a way to try again; success feedback only follows a confirmed write.
 * `onConfirmed` runs after the server agrees (for milestones).
 */
export function useTaskActions(
  onChange: (item: WorkItem) => void,
  onConfirmed?: (event: {
    kind: 'completed' | 'assigned';
    before: WorkItem;
    after: WorkItem;
  }) => void,
) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const haptics = useHaptics();
  const base = household ? `/households/${household.id}/work-items` : '';

  const patch = useCallback(
    async (item: WorkItem, body: Record<string, unknown>): Promise<WorkItem> => {
      const { item: updated } = await api<{ item: WorkItem }>(`${base}/${item.id}`, {
        method: 'PATCH',
        body: { expectedVersion: item.version, ...body },
      });
      onChange(updated);
      return updated;
    },
    [base, onChange],
  );

  const fail = useCallback(
    (caught: unknown) => toast.show(errorMessage(caught), { error: true }),
    [toast],
  );

  /** Show the change now; send it; roll back with a friendly message if it fails. */
  const optimistic = useCallback(
    async (
      item: WorkItem,
      preview: Partial<WorkItem>,
      body: Record<string, unknown>,
      failure: string,
      retry: () => void,
    ): Promise<WorkItem | null> => {
      onChange({ ...item, ...preview });
      try {
        return await patch(item, body);
      } catch (caught) {
        onChange(item);
        toast.show(failure, {
          error: true,
          detail: errorMessage(caught),
          action: { label: 'Try again', run: retry },
        });
        return null;
      }
    },
    [onChange, patch, toast],
  );

  const complete = useCallback(
    async (item: WorkItem): Promise<void> => {
      haptics.light();
      const done = await optimistic(
        item,
        { status: 'verified_complete', completedByMemberId: people.me?.id ?? null },
        { status: 'verified_complete', confirmed: true },
        `Couldn’t mark “${item.title}” done.`,
        () => void complete(item),
      );
      if (!done) return;
      toast.show(`Done: ${item.title}`, {
        // Done can only reopen as "started"; the API has no way back to plain "to do" yet.
        undo: () => patch(done, { status: 'in_progress' }).then(() => undefined, fail),
      });
      onConfirmed?.({ kind: 'completed', before: item, after: done });
    },
    [haptics, optimistic, people.me, toast, patch, fail, onConfirmed],
  );

  const reopen = useCallback(
    async (item: WorkItem): Promise<void> => {
      const back = await optimistic(
        item,
        { status: 'in_progress', completedByMemberId: null },
        { status: 'in_progress' },
        `Couldn’t reopen “${item.title}”.`,
        () => void reopen(item),
      );
      if (back) toast.show(`Reopened: ${item.title}`);
    },
    [optimistic, toast],
  );

  const assign = useCallback(
    async (item: WorkItem, ownerMemberId: string | null): Promise<void> => {
      const before = people.byId(item.ownerMemberId);
      const who = people.byId(ownerMemberId);
      const moved = await optimistic(
        item,
        { ownerMemberId },
        { ownerMemberId },
        `Couldn’t move “${item.title}”.`,
        () => void assign(item, ownerMemberId),
      );
      if (!moved) return;
      // Acknowledge what the move means, in words; never a score.
      const [message, detail]: [string, string | undefined] =
        ownerMemberId === null
          ? [`Up for grabs: ${item.title}`, 'Either of you can take it.']
          : who?.isMe && !before
            ? [`Yours now: ${item.title}`, 'One less thing for both of you.']
            : who?.isMe && before
              ? [`Taken off ${before.name}’s plate`, item.title]
              : [`Handed to ${who?.name ?? 'them'}: ${item.title}`, undefined];
      if (who?.isMe) haptics.light();
      toast.show(message, {
        detail,
        undo: () => patch(moved, { ownerMemberId: item.ownerMemberId }).then(() => undefined, fail),
      });
      onConfirmed?.({ kind: 'assigned', before: item, after: moved });
    },
    [people, optimistic, haptics, toast, patch, fail, onConfirmed],
  );

  /** Move the due day (overdue next steps: "Do it today", "Move to tomorrow"). */
  const reschedule = useCallback(
    async (item: WorkItem, dueOn: string, label: string): Promise<void> => {
      const moved = await optimistic(
        item,
        { dueOn, dueAt: null },
        { dueOn },
        `Couldn’t move “${item.title}”.`,
        () => void reschedule(item, dueOn, label),
      );
      if (!moved) return;
      toast.show(`${label}: ${item.title}`, {
        undo: () =>
          patch(moved, item.dueAt ? { dueAt: item.dueAt } : { dueOn: item.dueOn }).then(
            () => undefined,
            fail,
          ),
      });
    },
    [optimistic, toast, patch, fail],
  );

  return { complete, reopen, assign, reschedule, patch, fail };
}
