import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import type { Milestone } from '../design/motion';
import { hapticsAvailable, useHaptics } from '../design/motion/haptics';
import { requestWidgetRefresh } from '../native/WidgetSync';
import { useToast } from '../design/Toast';
import type { MissedTurns } from '../components/tasks/lists';
import { api, errorMessage, type Routine, type WorkItem } from './api';
import { useHousehold } from './household';
import { usePeople, type Person } from './people';

export {
  CLOSED,
  DONE,
  STATUS_NOTE,
  STATUS_SENTENCE,
  WHEN_LABEL,
  WHEN_ORDER,
  actionLabel,
  byDue,
  canTick,
  clearsToday,
  currentTurns,
  dueDate,
  dueText,
  isDone,
  isOpen,
  whenOf,
  type When,
} from '../components/tasks/rules';

/** "That's everything for today", once per person per day (see clearsToday). */
export function todayClearMilestone(today: string, me: Person): Milestone {
  return {
    key: `today-clear:${today}:${me.id}`,
    title: 'That’s everything for today',
    line: 'Your list for today is clear. The rest can wait.',
    colors: [me.color],
  };
}

/**
 * Task moves, optimistic: the screen changes at once (`onChange` with the expected item), the
 * request follows, and the API's item (its new version) replaces it. A failed request rolls back
 * with a plain message and a way to try again. A press gets a light selection tick at once; the
 * success haptic, the toast and `onConfirmed` (milestones) only follow a write the server confirmed.
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
  /** The press itself: a selection tick, never a "success" before the server agrees. */
  const pressed = useCallback(() => {
    if (hapticsAvailable && haptics.enabled) Haptics.selectionAsync().catch(() => undefined);
  }, [haptics.enabled]);

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
        const saved = await patch(item, body);
        // The iPhone widget shows the same list: let it catch up now.
        requestWidgetRefresh();
        return saved;
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
      pressed();
      const done = await optimistic(
        item,
        { status: 'verified_complete', completedByMemberId: people.me?.id ?? null },
        { status: 'verified_complete', confirmed: true },
        `Couldn’t mark “${item.title}” done.`,
        () => void complete(item),
      );
      if (!done) return;
      haptics.light();
      toast.show(`Done: ${item.title}`, {
        // Undo puts it back exactly as it was before (the API remembers the earlier status).
        undo: () => patch(done, { undoComplete: true }).then(() => requestWidgetRefresh(), fail),
      });
      onConfirmed?.({ kind: 'completed', before: item, after: done });
    },
    [pressed, haptics, optimistic, people.me, toast, patch, fail, onConfirmed],
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
      haptics.light();
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
      haptics.light();
      toast.show(`${label}: ${item.title}`, {
        undo: () =>
          patch(moved, item.dueAt ? { dueAt: item.dueAt } : { dueOn: item.dueOn }).then(
            () => undefined,
            fail,
          ),
      });
    },
    [optimistic, haptics, toast, patch, fail],
  );

  /**
   * A routine's missed turns in one go. "done": the most recent turn is done and the older ones
   * are skipped; "skip": every missed turn is skipped. Uses the routine's skip and the item's
   * complete, one request at a time (each skip moves the routine's version on). `after` runs
   * either way (reload the lists: a partial failure shows where it stopped).
   */
  const catchUp = useCallback(
    async (missed: MissedTurns, how: 'done' | 'skip', after: () => void): Promise<boolean> => {
      pressed();
      const latest = missed.turns.at(-1);
      const skips = how === 'done' ? missed.turns.slice(0, -1) : missed.turns;
      try {
        if (!household || !missed.routineId || !latest) throw new Error('no routine');
        const routineBase = `/households/${household.id}/routines/${missed.routineId}`;
        let version = (await api<{ routine: Routine }>(routineBase)).routine.version;
        for (const turn of skips) {
          const { routine } = await api<{ routine: Routine }>(
            `${routineBase}/occurrences/${turn.occurrenceIndex ?? 0}/skip`,
            { method: 'POST', body: { expectedVersion: version } },
          );
          version = routine.version;
        }
        if (how === 'done') {
          await api(`${base}/${latest.id}`, {
            method: 'PATCH',
            body: { expectedVersion: latest.version, status: 'verified_complete', confirmed: true },
          });
        }
        requestWidgetRefresh();
        haptics.light();
        const n = skips.length;
        toast.show(
          how === 'done' ? `Done: ${missed.title}` : `Skipped ${n} missed: ${missed.title}`,
          {
            detail:
              how === 'done' && n > 0
                ? `${n} older ${n === 1 ? 'turn' : 'turns'} skipped. You’re caught up.`
                : 'You’re caught up.',
          },
        );
        return true;
      } catch (caught) {
        toast.show(`Couldn’t catch up “${missed.title}”.`, {
          error: true,
          detail: errorMessage(caught),
        });
        return false;
      } finally {
        after();
      }
    },
    [pressed, household, base, haptics, toast],
  );

  return { complete, reopen, assign, reschedule, catchUp, patch, fail };
}
