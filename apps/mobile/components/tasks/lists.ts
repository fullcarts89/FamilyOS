import type { WorkItem } from '../../lib/api';
import { WHEN_ORDER, byDue, currentTurns, isOpen, whenOf, type When } from './rules';

/**
 * Today's lists, without React (unit-tested in test/mobile-today-lists.test.ts): each person's
 * late, due-today and this-week items; a routine's missed turns as one row; and the open things
 * with no date at all ("Anytime"), which never get a date made up for them.
 */

/** The groups Today shows by date. */
export const NEAR: When[] = ['late', 'today', 'week'];

/** A routine with two or more turns gone by undone: one row, "Walk Biscuit · 4 missed". */
export interface MissedTurns {
  /** The routine's rule (one row per routine). */
  key: string;
  routineId: string | null;
  title: string;
  /** Open turns due before today, oldest first. The last is the most recent. */
  turns: WorkItem[];
  /** Whose the most recent missed turn is: the row sits on their list. */
  ownerMemberId: string | null;
}

export interface TodayList {
  groups: Record<When, WorkItem[]>;
  missed: MissedTurns[];
  /** Open, undated, owned by this list's person (or shared, for the shared list). */
  anytime: WorkItem[];
}

const emptyGroups = () =>
  Object.fromEntries(WHEN_ORDER.map((w) => [w, [] as WorkItem[]])) as Record<When, WorkItem[]>;

const routineOf = (item: WorkItem) =>
  (item as WorkItem & { routineId?: string | null }).routineId ?? null;

/** Routines with two or more open turns that are late, each as one row. */
export function missedTurns(
  items: readonly WorkItem[],
  today: string,
  timeZone: string,
): MissedTurns[] {
  const byRule = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (!item.recurrenceRuleId || !isOpen(item)) continue;
    if (whenOf(item, today, timeZone) !== 'late') continue;
    byRule.set(item.recurrenceRuleId, [...(byRule.get(item.recurrenceRuleId) ?? []), item]);
  }
  const out: MissedTurns[] = [];
  for (const [key, turns] of byRule) {
    if (turns.length < 2) continue;
    turns.sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));
    const latest = turns.at(-1) as WorkItem;
    out.push({
      key,
      routineId: routineOf(latest),
      title: latest.title,
      turns,
      ownerMemberId: latest.ownerMemberId,
    });
  }
  const sort = byDue(timeZone);
  return out.sort((a, b) => sort(a.turns.at(-1) as WorkItem, b.turns.at(-1) as WorkItem));
}

/**
 * Each list on Today, by owner (null is the shared list). `keep` holds a just-finished item in
 * place for its moment (lib/use-settle.ts).
 */
export function todayLists({
  items,
  today,
  timeZone,
  keep = () => false,
}: {
  items: readonly WorkItem[];
  today: string;
  timeZone: string;
  keep?: (id: string) => boolean;
}): Map<string | null, TodayList> {
  const out = new Map<string | null, TodayList>();
  const listOf = (owner: string | null) => {
    let list = out.get(owner);
    if (!list) {
      list = { groups: emptyGroups(), missed: [], anytime: [] };
      out.set(owner, list);
    }
    return list;
  };
  const missed = missedTurns(items, today, timeZone);
  const grouped = new Set(missed.flatMap((m) => m.turns.map((t) => t.id)));
  for (const m of missed) listOf(m.ownerMemberId).missed.push(m);

  for (const item of currentTurns(items)) {
    if (item.type === 'project' || grouped.has(item.id)) continue;
    if (!isOpen(item) && !keep(item.id)) continue;
    // A project's step shows on its owner's list too; unowned steps stay with the project.
    if (item.parentId && !item.ownerMemberId) continue;
    const when = whenOf(item, today, timeZone);
    if (NEAR.includes(when)) listOf(item.ownerMemberId).groups[when].push(item);
    else if (when === 'later' && !item.dueOn && !item.dueAt)
      listOf(item.ownerMemberId).anytime.push(item);
  }
  const sort = byDue(timeZone);
  for (const list of out.values()) {
    for (const w of WHEN_ORDER) list.groups[w].sort(sort);
    list.anytime.sort(sort);
  }
  return out;
}

/** How many late rows a list shows: late items plus routines with missed turns. */
export const lateRows = (list: TodayList | undefined) =>
  list ? list.groups.late.length + list.missed.length : 0;
