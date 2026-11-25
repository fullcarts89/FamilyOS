import { Temporal } from 'temporal-polyfill';
import { addDays, localDateOf } from './recurrence';

/**
 * Monarch budget sync (owner decisions 2026-11-25). A scheduled Claude task, using the owner's
 * Monarch connector, runs at these household-local times: it sends the plans waiting for Monarch,
 * then posts the budget for the months FamilyOS asks for. FamilyOS's servers never connect to
 * Monarch. The schedule itself lives in the scheduled task; FamilyOS uses these times only to say
 * when the next sync is due.
 */
export const MONARCH_SYNC_TIMES: readonly string[] = ['07:00', '12:00', '18:00', '21:00'];

/** Sync keys start with this, so a key pasted in the wrong place is recognisable. */
export const MONARCH_SYNC_KEY_PREFIX = 'fos_sync_';

/** Tries Monarch may refuse a plan change before it is marked failed. */
export const MONARCH_PLAN_MAX_ATTEMPTS = 3;

/** A budget category's kind, as Monarch reports it. Only expenses are spending. */
export const BUDGET_CATEGORY_TYPES = ['expense', 'income', 'transfer'] as const;
export type BudgetCategoryType = (typeof BUDGET_CATEGORY_TYPES)[number];

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * The household-local time ("HH:MM") of the next scheduled sync after `now`, and whether it is
 * tomorrow.
 */
export function nextSyncAround(
  now: Date,
  timeZone: string,
  times: readonly string[] = MONARCH_SYNC_TIMES,
): { time: string; tomorrow: boolean } {
  const zoned = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone);
  const minutes = zoned.hour * 60 + zoned.minute;
  const sorted = [...times].sort((a, b) => minutesOf(a) - minutesOf(b));
  const next = sorted.find((t) => minutesOf(t) > minutes);
  return next ? { time: next, tomorrow: false } : { time: sorted[0] ?? '07:00', tomorrow: true };
}

/**
 * The months (first days, ascending) the sync posts: this month; last month too for the first five
 * days of a month, while late transactions still land in it; and any month with a plan waiting
 * for Monarch, so the page shows what Monarch confirmed.
 */
export function monthsToSync(now: Date, timeZone: string, waitingMonths: readonly string[] = []) {
  const today = localDateOf(now, timeZone);
  const month = `${today.slice(0, 7)}-01`;
  const months = new Set([month, ...waitingMonths]);
  if (Number(today.slice(8, 10)) <= 5) months.add(`${addDays(month, -1).slice(0, 7)}-01`);
  return [...months].sort();
}

/**
 * A CSV row's kind, from its group: Monarch's own "Income" and "Transfers" groups. (The sync gets
 * each category's kind from Monarch itself.)
 */
export function budgetTypeOfGroup(group: string | null): BudgetCategoryType {
  const g = (group ?? '').trim().toLowerCase();
  if (g === 'income') return 'income';
  if (g === 'transfers' || g === 'transfer') return 'transfer';
  return 'expense';
}
