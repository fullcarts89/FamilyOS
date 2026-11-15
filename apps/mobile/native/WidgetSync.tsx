import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { config } from '../lib/config';
import { useHousehold } from '../lib/household';
import { toPeople } from '../lib/people';
import { useSession } from '../lib/session';
import {
  clearWidget,
  publishWidgetConfig,
  publishWidgetSnapshot,
  widgetsAvailable,
} from './widget';
import { buildWidgetSnapshot, type RhythmForWidget } from './widget-snapshot';

const listeners = new Set<() => void>();

/**
 * Call after a change the widget shows (an item finished, moved or rescheduled) so it catches
 * up now rather than the next time the app goes to the background.
 */
export function requestWidgetRefresh(): void {
  listeners.forEach((listener) => listener());
}

/** Fewer than one refresh per this many ms, however often it's asked. */
const MIN_INTERVAL = 10_000;

/**
 * Keeps the iPhone widget's snapshot current: on sign-in, when the app comes to the front or
 * goes to the background, and when asked. Renders nothing; mount it once inside the signed-in
 * layout. A failed refresh keeps the previous snapshot (the widget hides it on another day).
 */
export function WidgetSync(): null {
  const { session, loading } = useSession();
  const { household, members } = useHousehold();
  const last = useRef(0);
  const signedIn = session !== null;
  // Only a settled "no session" means signed out; while the session loads, leave the widget be.
  const signedOut = !loading && !signedIn;

  const refresh = useCallback(async () => {
    if (!widgetsAvailable || !household) return;
    const now = Date.now();
    if (now - last.current < MIN_INTERVAL) return;
    last.current = now;
    try {
      const rhythm = await api<RhythmForWidget>(`/households/${household.id}/rhythm`);
      const people = toPeople(members, household.memberId);
      const colorOf = (id: string) => people.find((p) => p.id === id)?.color ?? '#17201B';
      publishWidgetSnapshot(
        buildWidgetSnapshot({
          rhythm,
          householdId: household.id,
          memberId: household.memberId,
          colorOf,
          now: new Date(),
        }),
      );
    } catch {
      // Offline or signed out mid-way: the widget keeps what it had.
    }
  }, [household, members]);

  useEffect(() => {
    if (!widgetsAvailable) return;
    if (signedOut) {
      clearWidget();
      return;
    }
    if (!signedIn || !household) return;
    publishWidgetConfig({
      apiUrl: config.apiUrl,
      supabaseUrl: config.supabaseUrl,
      supabasePublishableKey: config.supabasePublishableKey,
      householdId: household.id,
      memberId: household.memberId,
    });
    last.current = 0;
    void refresh();
  }, [signedIn, signedOut, household, refresh]);

  useEffect(() => {
    if (!widgetsAvailable) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void refresh();
    });
    const listener = () => {
      last.current = 0;
      void refresh();
    };
    listeners.add(listener);
    return () => {
      subscription.remove();
      listeners.delete(listener);
    };
  }, [refresh]);

  return null;
}
