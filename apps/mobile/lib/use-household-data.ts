import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  errorMessage,
  type RoutineDetail,
  type RoutineListEntry,
  type TodayResponse,
  type WorkItem,
} from './api';
import { useCapture } from './capture';
import { useHousehold } from './household';

/**
 * Everything Tasks shows: open and recently finished items, the household's local date, and the
 * routines with their upcoming turns. Reloads on focus and after a capture; `replace` swaps in an
 * item the API just returned so the screen updates without a round trip.
 */
export function useTasksData() {
  const { household } = useHousehold();
  const { version } = useCapture();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [routines, setRoutines] = useState<
    { entry: RoutineListEntry; detail: RoutineDetail | null }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const load = useCallback(async () => {
    if (!household) return;
    const base = `/households/${household.id}`;
    try {
      const [list, td, rl] = await Promise.all([
        api<{ items: WorkItem[] }>(`${base}/work-items`),
        api<TodayResponse>(`${base}/today`),
        api<{ routines: RoutineListEntry[] }>(`${base}/routines`),
      ]);
      const details = await Promise.all(
        rl.routines.map((r) =>
          r.ended
            ? Promise.resolve(null)
            : api<RoutineDetail>(`${base}/routines/${r.id}`).catch(() => null),
        ),
      );
      if (!alive.current) return;
      setItems(list.items);
      setToday(td.date);
      setRoutines(rl.routines.map((entry, i) => ({ entry, detail: details[i] ?? null })));
      setError(null);
    } catch (caught) {
      if (alive.current) setError(errorMessage(caught));
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A capture or another screen changed something: refresh quietly.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load();
  }, [version, load]);

  const replace = useCallback((item: WorkItem) => {
    setItems((all) => {
      if (!all) return all;
      const found = all.some((i) => i.id === item.id);
      return found ? all.map((i) => (i.id === item.id ? item : i)) : [item, ...all];
    });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { items, today, routines, error, load, refresh, refreshing, replace };
}
