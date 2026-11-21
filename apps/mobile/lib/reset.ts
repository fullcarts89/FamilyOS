import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createFreshness,
  initialNotes,
  keepMine,
  notesConflict,
  notesFromServer,
  notesSaved,
  notesTyped,
  takeTheirs,
  type NotesState,
  type PlanWithNotes,
} from '../components/reset/coordination';
import {
  api,
  ApiRequestError,
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
 * How often an open Weekly Reset refreshes, together or apart: a little under five seconds, so
 * the other phone's changes (votes, covers, the commit, notes) show within five, network included.
 */
export const RESET_REFRESH_MS = 4000;

/**
 * One Weekly Reset session's data: GET /reset (the week, the plan and whether it's committed,
 * the look back, loose ends, decisions, meals and what's unresolved), every decision (to notice
 * ones settled on the other phone), and the family's recent dinners as ideas. It refreshes right
 * after each of your own changes and every few seconds while open, so both of you see the same
 * live plan. A refresh that started before one of your changes never lands on top of it.
 */
export function useReset({ week: initialWeek }: { week?: string }) {
  const { household } = useHousehold();
  const [data, setData] = useState<ResetResponse | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [error, setError] = useState(false);
  /** Counts refreshes applied from the server (not local, optimistic changes). */
  const [loads, setLoads] = useState(0);
  const fresh = useRef<ReturnType<typeof createFreshness> | null>(null);
  fresh.current ??= createFreshness();
  const week = useRef<string | null>(
    initialWeek && /^\d{4}-\d{2}-\d{2}$/.test(initialWeek) ? initialWeek : null,
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const base = household ? `/households/${household.id}` : '';

  const load = useCallback(async () => {
    const order = fresh.current;
    if (!base || !order) return;
    const ticket = order.beginRead();
    try {
      const [r, d] = await Promise.all([
        api<ResetResponse>(`${base}/reset${week.current ? `?week=${week.current}` : ''}`),
        api<{ decisions: Decision[] }>(`${base}/decisions?status=all`),
      ]);
      if (!alive.current) return;
      week.current = r.week.start;
      if (order.accept(ticket)) {
        setData(r);
        setDecisions(d.decisions);
        setLoads((n) => n + 1);
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
      const timer = setInterval(() => void load(), RESET_REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  /** Wraps a write: refreshes that started before it are dropped; one after it brings the truth. */
  const writing = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      const order = fresh.current;
      order?.beginWrite();
      try {
        return await run();
      } finally {
        order?.endWrite();
        if (!order?.writing) void load();
      }
    },
    [load],
  );

  const patch = useCallback((fn: (r: ResetResponse) => ResetResponse) => {
    setData((r) => (r ? fn(r) : r));
  }, []);

  const putPlan = useCallback((plan: PlanWithNotes | null) => {
    setData((r) => (r ? { ...r, plan } : r));
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
    loads,
    load,
    writing,
    patch,
    putPlan,
    putDecision,
    putItems,
    setMeals,
  };
}

export type ResetState = ReturnType<typeof useReset>;

// -----------------------------------------------------------------------------------------------
// The week's notes: autosaved while you type, kept if you leave before they're saved, and when
// the other adult saved different notes first, both versions are shown to choose from.

const drafts = new Map<string, { text: string; base: number }>();
const storageKey = (key: string) => `familyos.reset.notes.${key}`;

function keptDraft(key: string): { text: string; base: number } | null {
  const inMemory = drafts.get(key);
  if (inMemory) return inMemory;
  if (Platform.OS !== 'web') return null;
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(key));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { text?: unknown }).text === 'string' &&
      typeof (parsed as { base?: unknown }).base === 'number'
    ) {
      return parsed as { text: string; base: number };
    }
  } catch {
    // Unreadable: start from the plan's notes.
  }
  return null;
}

function keepDraft(key: string, value: { text: string; base: number } | null) {
  if (value) drafts.set(key, value);
  else drafts.delete(key);
  if (Platform.OS !== 'web') return;
  try {
    if (value) globalThis.localStorage?.setItem(storageKey(key), JSON.stringify(value));
    else globalThis.localStorage?.removeItem(storageKey(key));
  } catch {
    // Private browsing or storage full: the draft lasts for this visit.
  }
}

const AUTOSAVE_MS = 800;

export function useResetNotes({
  reset,
  partnerName,
}: {
  reset: Pick<ResetState, 'data' | 'writing' | 'putPlan'>;
  partnerName: string | null;
}) {
  const { household } = useHousehold();
  const { data, writing, putPlan } = reset;
  const week = data?.week.start ?? null;
  const key = household && week ? `${household.memberId}|${week}` : null;
  const [state, setState] = useState<NotesState | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const current = useRef<{ key: string | null; state: NotesState | null }>({
    key: null,
    state: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);

  // The ref is the one source of truth (it's read right after a change, before React renders).
  const set = useCallback((fn: (s: NotesState) => NotesState) => {
    const s = current.current.state;
    if (!s) return;
    const next = fn(s);
    current.current.state = next;
    setState(next);
  }, []);

  // A new week (or the first load): a kept draft wins until it's saved; else the plan's notes.
  // Later loads follow the other adult's saves unless there's typing here.
  const saveLater = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!data || !key) return;
    if (current.current.key !== key) {
      const next = initialNotes(data.plan as PlanWithNotes | null, keptDraft(key));
      current.current = { key, state: next };
      setState(next);
      // A draft kept from before (the app closed before it was saved) is saved now.
      if (next.dirty) saveLater.current();
      return;
    }
    set((s) => notesFromServer(s, data.plan as PlanWithNotes | null));
  }, [data, key, set]);

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const s = current.current.state;
    const k = current.current.key;
    if (!s || !k || !household || !week) return true;
    if (s.conflict) return false;
    if (!s.dirty) return true;
    const sent = s.text;
    setStatus('saving');
    const run = (async () => {
      try {
        const { plan } = await writing(() =>
          api<{ plan: PlanWithNotes | null }>(`/households/${household.id}/reset/notes`, {
            method: 'PATCH',
            body: { week, notes: sent, expectedVersion: s.base },
          }),
        );
        putPlan(plan);
        set((cur) => notesSaved(cur, plan, sent));
        const after = current.current.state;
        keepDraft(k, after?.dirty ? { text: after.text, base: after.base } : null);
        setStatus('saved');
        return true;
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.code === 'version_conflict') {
          // The other adult saved first: get their version (the 409 carries it; the API client
          // keeps only the code, so read the plan again) and show both.
          try {
            const r = await api<ResetResponse>(`/households/${household.id}/reset?week=${week}`);
            putPlan(r.plan);
            set((cur) => notesConflict(cur, r.plan as PlanWithNotes | null, partnerName));
            setStatus('idle');
          } catch {
            setStatus('error');
          }
          return false;
        }
        setStatus('error');
        return false;
      }
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    if (again.current) {
      again.current = false;
      return save();
    }
    return ok;
  }, [household, week, writing, putPlan, set, partnerName]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save();
    }, AUTOSAVE_MS);
  }, [save]);
  saveLater.current = schedule;

  /** Save now (before committing, or on leaving). False while two versions wait for a choice. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return save();
  }, [save]);

  // Leaving the Reset: what's typed is saved (and kept here until it is).
  useFocusEffect(
    useCallback(
      () => () => {
        if (timer.current) void flush();
      },
      [flush],
    ),
  );

  const setText = useCallback(
    (text: string) => {
      set((s) => notesTyped(s, text));
      const s = current.current.state;
      if (current.current.key && s) keepDraft(current.current.key, { text, base: s.base });
      schedule();
    },
    [set, schedule],
  );

  const chooseMine = useCallback(() => {
    set(keepMine);
    void flush();
  }, [set, flush]);

  const chooseTheirs = useCallback(() => {
    set(takeTheirs);
    if (current.current.key) keepDraft(current.current.key, null);
  }, [set]);

  return { state, status, setText, flush, chooseMine, chooseTheirs };
}
