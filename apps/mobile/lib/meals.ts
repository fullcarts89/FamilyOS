import { useCallback } from 'react';
import { useToast } from '../design/Toast';
import { api, ApiRequestError, errorMessage, type Meal } from './api';
import { weekdayName } from './dates';
import { useHousehold } from './household';

/** Dinner titles from recent weeks, most used first: the family's own ideas, nothing invented. */
export function recentDinnerIdeas(meals: Meal[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const m of meals) {
    if (m.slot !== 'dinner') continue;
    const t = m.title.trim();
    if (!t || /^leftovers$/i.test(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

/**
 * Plan, change or clear one day's dinner. The row changes at once; the API's meal (with its new
 * version) replaces it, and a failed write puts it back with a plain message.
 */
export function useMealActions(
  setMeals: (update: (all: Meal[]) => Meal[]) => void,
  onSaved?: () => void,
) {
  const { household } = useHousehold();
  const toast = useToast();
  const base = household ? `/households/${household.id}/meals` : '';

  const save = useCallback(
    async (
      date: string,
      existing: Meal | null,
      next: { title: string; cookMemberId: string | null },
    ): Promise<boolean> => {
      const title = next.title.trim();
      if (!existing && !title) return true;
      // Still being saved: the next change waits for the API's copy.
      if (existing?.id.startsWith('temp-')) return false;
      if (existing && existing.title === title && existing.cookMemberId === next.cookMemberId) {
        return true;
      }
      const tempId = `temp-${date}`;
      const preview: Meal | null = title
        ? {
            ...(existing ?? {
              id: tempId,
              onDate: date,
              slot: 'dinner',
              notes: null,
              createdByMemberId: household?.memberId ?? '',
              version: 1,
            }),
            title,
            cookMemberId: next.cookMemberId,
          }
        : null;
      const others = (all: Meal[]) => all.filter((m) => m.id !== existing?.id && m.id !== tempId);
      setMeals((all) => (preview ? [...others(all), preview] : others(all)));
      try {
        let saved: Meal | null = null;
        if (!existing) {
          saved = (
            await api<{ meal: Meal }>(base, {
              method: 'POST',
              body: { onDate: date, slot: 'dinner', title, cookMemberId: next.cookMemberId },
            })
          ).meal;
        } else if (!title) {
          await api(`${base}/${existing.id}?expectedVersion=${existing.version}`, {
            method: 'DELETE',
          });
        } else {
          saved = (
            await api<{ meal: Meal }>(`${base}/${existing.id}`, {
              method: 'PATCH',
              body: {
                expectedVersion: existing.version,
                ...(title !== existing.title && { title }),
                ...(next.cookMemberId !== existing.cookMemberId && {
                  cookMemberId: next.cookMemberId,
                }),
              },
            })
          ).meal;
        }
        setMeals((all) => (saved ? [...others(all), saved] : others(all)));
        // A short confirmation once it's saved (a new dinner, or a different one).
        if (saved && (!existing || existing.title !== saved.title)) {
          toast.show(`${existing ? 'Changed' : 'Planned'} ${weekdayName(date)}’s dinner`, {
            detail: saved.title,
          });
        }
        onSaved?.();
        return true;
      } catch (caught) {
        setMeals((all) => (existing ? [...others(all), existing] : others(all)));
        const conflict = caught instanceof ApiRequestError && caught.status === 409;
        toast.show(conflict ? 'Someone just changed that dinner.' : 'Couldn’t save that dinner.', {
          error: true,
          detail: errorMessage(caught),
        });
        if (conflict) onSaved?.();
        return false;
      }
    },
    [base, household, setMeals, toast, onSaved],
  );

  return { save };
}
