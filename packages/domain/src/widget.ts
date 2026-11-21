import { Temporal } from 'temporal-polyfill';
import { localDueDate } from './today';
import { isDone, type WorkItemStatus } from './work-item';

/**
 * The iPhone widget's list (docs/operations/iphone.md): one person's open items due today or
 * already late, the current turn of each routine only, late first (oldest first), then today's
 * timed items by time, then today's all-day items by title. Pure; the caller passes today.
 */
export const WIDGET_ITEM_LIMIT = 8;
export const WIDGET_HANDOFF_LIMIT = 4;

export interface WidgetSourceTask {
  id: string;
  title: string;
  status: WorkItemStatus;
  ownerMemberId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  recurrenceRuleId: string | null;
  /** For routine occurrences: whether this is the routine's current (earliest open) turn. */
  isCurrentTurn: boolean | null;
}

export function widgetItems<T extends WidgetSourceTask>(
  tasks: readonly T[],
  options: { memberId: string; today: string; timeZone: string },
): { count: number; items: T[] } {
  const due = (t: T) => localDueDate(t, options.timeZone)?.toString() ?? null;
  const eligible = tasks.filter((t) => {
    const on = due(t);
    return (
      t.ownerMemberId === options.memberId &&
      !isDone(t.status) &&
      t.status !== 'cancelled' &&
      t.status !== 'new' &&
      on !== null &&
      on <= options.today &&
      (t.recurrenceRuleId === null || t.isCurrentTurn === true)
    );
  });
  const instant = (t: T) =>
    t.dueAt ? Temporal.Instant.from(t.dueAt).epochMilliseconds : Number.POSITIVE_INFINITY;
  const sorted = [...eligible].sort((a, b) => {
    const da = due(a) ?? '';
    const db = due(b) ?? '';
    const lateA = da < options.today;
    const lateB = db < options.today;
    if (lateA !== lateB) return lateA ? -1 : 1;
    if (lateA && da !== db) return da.localeCompare(db);
    // Timed before all-day, by time; all-day by title.
    return instant(a) - instant(b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
  return { count: sorted.length, items: sorted.slice(0, WIDGET_ITEM_LIMIT) };
}
