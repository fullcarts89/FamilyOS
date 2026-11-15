import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type Decision,
  type Meal,
  type Occurrence,
  type ResetResponse,
  type WorkItem,
} from './api';
import { addDays } from './dates';
import { useHousehold } from './household';
import { recentDinnerIdeas } from './meals';

/** The adult who has an occurrence when nobody covers it (null: nobody is down for it). */
export function defaultAdult(o: Occurrence, isCaredFor: (id: string) => boolean): string | null {
  if (o.cover) return o.cover.replacedMemberIds[0] ?? null;
  return o.memberIds.find((id) => !isCaredFor(id)) ?? null;
}

/** The adult who has it now, after any cover. */
export function currentAdult(o: Occurrence, isCaredFor: (id: string) => boolean): string | null {
  return o.memberIds.find((id) => !isCaredFor(id)) ?? null;
}

/**
 * One Weekly Reset session's data: GET /reset (the week, the look back, loose ends, decisions,
 * meals and what's unresolved), every decision (to notice ones settled on the other phone), and
 * the family's recent dinners as ideas. It refreshes while open (every few seconds when you're
 * each on your own phone) so both of you see the same live plan; a refresh never overwrites a
 * change still on its way to the server.
 */
export function useReset({ live, week: initialWeek }: { live: boolean; week?: string }) {
  const { household } = useHousehold();
  const [data, setData] = useState<ResetResponse | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const pending = useRef(0);
  const week = useRef<string | null>(
    initialWeek && /^\d{4}-\d{2}-\d{2}$/.test(initialWeek) ? initialWeek : null,
  );
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const base = household ? `/households/${household.id}` : '';

  const load = useCallback(async () => {
    if (!base) return;
    try {
      const [r, d] = await Promise.all([
        api<ResetResponse>(`${base}/reset${week.current ? `?week=${week.current}` : ''}`),
        api<{ decisions: Decision[] }>(`${base}/decisions?status=all`),
      ]);
      if (!alive.current) return;
      week.current = r.week.start;
      if (pending.current === 0) {
        setData(r);
        setDecisions(d.decisions);
      }
      setError(false);
    } catch {
      if (alive.current) setError(true);
    }
  }, [base]);

  // The family's own dinners from the last four weeks, as ideas (once).
  useEffect(() => {
    if (!base || !data || ideas.length) return;
    const from = addDays(data.week.start, -28);
    api<{ meals: Meal[] }>(`${base}/meals?from=${from}&to=${addDays(data.week.start, -1)}`)
      .then((r) => alive.current && setIdeas(recentDinnerIdeas(r.meals)))
      .catch(() => undefined);
  }, [base, data, ideas.length]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), live ? 5000 : 15000);
      return () => clearInterval(timer);
    }, [load, live]),
  );

  /** Wraps a write: refreshes wait until it's done, then one refresh brings in the truth. */
  const writing = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      pending.current += 1;
      try {
        return await run();
      } finally {
        pending.current -= 1;
        if (pending.current === 0) void load();
      }
    },
    [load],
  );

  const patch = useCallback((fn: (r: ResetResponse) => ResetResponse) => {
    setData((r) => (r ? fn(r) : r));
  }, []);

  const putDecision = useCallback((d: Decision) => {
    setDecisions((all) =>
      all
        ? all.some((x) => x.id === d.id)
          ? all.map((x) => (x.id === d.id ? d : x))
          : [d, ...all]
        : [d],
    );
    setData((r) =>
      r
        ? {
            ...r,
            decisions:
              d.status === 'open'
                ? r.decisions.some((x) => x.id === d.id)
                  ? r.decisions.map((x) => (x.id === d.id ? d : x))
                  : [...r.decisions, d]
                : r.decisions.filter((x) => x.id !== d.id),
            unresolved:
              d.status === 'open'
                ? r.unresolved
                : r.unresolved.filter(
                    (u) => !(u.type === 'decision_open' && u.decisionId === d.id),
                  ),
          }
        : r,
    );
  }, []);

  const putItems = useCallback((items: WorkItem[]) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    setData((r) =>
      r
        ? {
            ...r,
            unfinished: r.unfinished.map((i) => byId.get(i.id) ?? i),
            dueThisWeek: r.dueThisWeek.map((i) => byId.get(i.id) ?? i),
          }
        : r,
    );
  }, []);

  const setMeals = useCallback((fn: (all: Meal[]) => Meal[]) => {
    setData((r) => (r ? { ...r, meals: fn(r.meals) } : r));
  }, []);

  return {
    data,
    decisions,
    ideas,
    error,
    load,
    writing,
    patch,
    putDecision,
    putItems,
    setMeals,
  };
}

export type ResetState = ReturnType<typeof useReset>;
