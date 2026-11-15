import { useFocusEffect } from 'expo-router';
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

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Everything Today shows, loaded together: the day's rhythm, the next seven days of events (the
 * week strip and the coming days' heads-ups), open work, the inbox count and what the other
 * adults did since this person last looked. Reloads on focus, after a capture, and every minute
 * while open (so the now-line and "in 20 minutes" stay true).
 */
export function useTodayData() {
  const { household } = useHousehold();
  const { version } = useCapture();
  const { lastLooked } = useMemberState();
  const [rhythm, setRhythm] = useState<RhythmResponse | null>(null);
  const [week, setWeek] = useState<EventsResponse | null>(null);
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const load = useCallback(async () => {
    if (!household) return;
    const base = `/households/${household.id}`;
    try {
      const r = await api<RhythmResponse>(`${base}/rhythm`);
      const [w, list, td] = await Promise.all([
        api<EventsResponse>(`${base}/events?from=${r.today}&to=${addDays(r.today, 6)}`),
        api<{ items: WorkItem[] }>(`${base}/work-items`),
        api<TodayResponse>(`${base}/today`),
      ]);
      if (!alive.current) return;
      setRhythm(r);
      setWeek(w);
      setItems(list.items);
      setInboxCount(td.inboxCount);
      setNow(new Date());
      setError(false);
    } catch {
      if (alive.current) setError(true);
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
      if (alive.current) setActivity([]);
    }
  }, [household, lastLooked]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(timer);
    }, [load]),
  );
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
