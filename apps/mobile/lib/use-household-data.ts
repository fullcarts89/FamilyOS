import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type RoutineDetail,
  type RoutineListEntry,
  type TodayResponse,
  type WorkItem,
} from './api';
import { useCapture } from './capture';
import { useHousehold } from './household';
import { useLiveRefresh } from './use-live-refresh';

type RoutineRows = { entry: RoutineListEntry; detail: RoutineDetail | null }[];
/** What Tasks last loaded, per person and household, for this app session (shown at once on a return). */
const lastTasks = new Map<string, { items: WorkItem[]; today: string; routines: RoutineRows }>();

/**
 * Everything Tasks shows: open and recently finished items, the household's local date, and the
 * routines with their upcoming turns. Kept current while open (lib/use-live-refresh) and after a
 * capture; `replace` swaps in an item the API just returned so the screen updates without a round
 * trip. What was last loaded stays on screen when a reload fails; `error` is that failure.
 */
export function useTasksData() {
  const { household, timeZone } = useHousehold();
  const { version } = useCapture();
  const cached = household ? lastTasks.get(`${household.id}:${household.memberId}`) : undefined;
  const [items, setItems] = useState<WorkItem[] | null>(cached?.items ?? null);
  const [today, setToday] = useState<string | null>(cached?.today ?? null);
  const [routines, setRoutines] = useState<RoutineRows | null>(cached?.routines ?? null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const read = useCallback(
    async (isCurrent: () => boolean) => {
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
        if (!alive.current || !isCurrent()) return;
        const rows = rl.routines.map((entry, i) => ({ entry, detail: details[i] ?? null }));
        lastTasks.set(`${household.id}:${household.memberId}`, {
          items: list.items,
          today: td.date,
          routines: rows,
        });
        setItems(list.items);
        setToday(td.date);
        setRoutines(rows);
        setError(null);
      } catch (caught) {
        if (alive.current) setError(caught);
      }
    },
    [household],
  );

  const load = useLiveRefresh(read, timeZone);

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
