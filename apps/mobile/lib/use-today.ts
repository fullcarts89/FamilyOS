import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type Activity,
  type EventsResponse,
  type RhythmResponse,
  type TodayResponse,
  type WorkItem,
} from './api';
import { useCapture } from './capture';
import { addDays } from './dates';
import { useHousehold } from './household';
import { useMemberState } from './member-state';
import { useLiveRefresh } from './use-live-refresh';

const WEEK_MS = 7 * 24 * 3600 * 1000;

interface TodaySnapshot {
  rhythm: RhythmResponse;
  week: EventsResponse;
  items: WorkItem[];
  inboxCount: number;
}
/**
 * What Today last loaded, per person and household, for this app session: coming back to Today (or opening
 * it offline after visiting) shows it at once instead of an empty page, then it refreshes.
 */
const lastToday = new Map<string, TodaySnapshot>();

/**
 * Everything Today shows, loaded together: the day's rhythm, the next seven days of events (the
 * week strip and the coming days' heads-ups), open work, the inbox count and what the other
 * adults did since this person last looked. Kept current while open (lib/use-live-refresh): on
 * focus, back in the foreground, every minute (so the other adult's changes, the now-line and "in
 * 20 minutes" stay true), at local midnight, when the connection returns and after a capture.
 * What was last loaded stays on screen when a reload fails; `error` is that failure.
 */
export function useTodayData() {
  const { household, timeZone } = useHousehold();
  const { version } = useCapture();
  const { lastLooked } = useMemberState();
  const cached = household ? lastToday.get(`${household.id}:${household.memberId}`) : undefined;
  const [rhythm, setRhythm] = useState<RhythmResponse | null>(cached?.rhythm ?? null);
  const [week, setWeek] = useState<EventsResponse | null>(cached?.week ?? null);
  const [items, setItems] = useState<WorkItem[] | null>(cached?.items ?? null);
  const [inboxCount, setInboxCount] = useState(cached?.inboxCount ?? 0);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => new Date());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const read = useCallback(
    async (isCurrent: () => boolean) => {
      if (!household) return;
      // The clock moves on even when a reload can't reach the server.
      setNow(new Date());
      const base = `/households/${household.id}`;
      try {
        const r = await api<RhythmResponse>(`${base}/rhythm`);
        const [w, list, td] = await Promise.all([
          api<EventsResponse>(`${base}/events?from=${r.today}&to=${addDays(r.today, 6)}`),
          api<{ items: WorkItem[] }>(`${base}/work-items`),
          api<TodayResponse>(`${base}/today`),
        ]);
        if (!alive.current || !isCurrent()) return;
        lastToday.set(`${household.id}:${household.memberId}`, {
          rhythm: r,
          week: w,
          items: list.items,
          inboxCount: td.inboxCount,
        });
        setRhythm(r);
        setWeek(w);
        setItems(list.items);
        setInboxCount(td.inboxCount);
        setNow(new Date());
        setError(null);
      } catch (caught) {
        if (alive.current) setError(caught);
        return;
      }
      // What changed since this person last looked (marked once per app session).
      try {
        const previous = await lastLooked();
        const floor = Date.now() - WEEK_MS + 60_000;
        const from = previous ? new Date(Math.max(new Date(previous).getTime(), floor)) : null;
        const { activity: list } = await api<{ activity: Activity[] }>(
          `${base}/activity${from ? `?since=${encodeURIComponent(from.toISOString())}` : ''}`,
        );
        if (!alive.current) return;
        setSince(previous);
        setActivity(list);
      } catch {
        if (alive.current) setActivity((a) => a ?? []);
      }
    },
    [household, lastLooked],
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
    setItems((all) => (all ? all.map((i) => (i.id === item.id ? item : i)) : all));
  }, []);

  return { rhythm, week, items, inboxCount, activity, since, error, now, load, replace };
}
