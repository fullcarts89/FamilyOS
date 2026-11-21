import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { onConnectionChange, writes } from './api';
import { REFRESH_EVERY_MS, msUntilLocalMidnight } from './refresh';

/**
 * Keeps an open screen's data current, for two adults changing the same lists: it reloads when the
 * screen is focused, when the app comes back to the foreground (or the page becomes visible), every
 * minute while it's visible, at the household's local midnight (a new day's lists), and when the
 * connection comes back.
 *
 * `load` gets `isCurrent`: check it before applying what was read. A read that overlapped a write
 * still being saved is not current (it could put back what the write just changed); it is dropped
 * and the screen reloads once the write has finished.
 */
export function useLiveRefresh(
  load: (isCurrent: () => boolean) => Promise<void>,
  timeZone: string,
): () => Promise<void> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const focused = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  // A read was dropped because a write was still saving: reload once the write is done.
  const afterWrite = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    // One reload at a time; a request for another while one runs becomes one more afterwards.
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const go = async () => {
      do {
        again.current = false;
        const token = writes.snapshot();
        let stale = false;
        await loadRef.current(() => {
          if (writes.current(token)) return true;
          stale = true;
          return false;
        });
        if (stale) {
          if (writes.busy()) afterWrite.current = true;
          else again.current = true;
        }
      } while (again.current);
    };
    running.current = go().finally(() => {
      running.current = null;
    });
    return running.current;
  }, []);

  // Focus: load now, then every minute while focused and visible.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void run();
      const timer = setInterval(() => {
        if (visible()) void run();
      }, REFRESH_EVERY_MS);
      return () => {
        focused.current = false;
        clearInterval(timer);
      };
    }, [run]),
  );

  // Back in the foreground, visible again, online again, or a dropped read's write finished.
  useEffect(() => {
    const whenFocused = () => {
      if (focused.current) void run();
    };
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') whenFocused();
    });
    const onVisible = () => {
      if (visible()) whenFocused();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    const offConnection = onConnectionChange((state) => {
      if (state === 'online') whenFocused();
    });
    const offIdle = writes.onIdle(() => {
      if (!afterWrite.current) return;
      afterWrite.current = false;
      whenFocused();
    });
    return () => {
      app.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      offConnection();
      offIdle();
    };
  }, [run]);

  // Local midnight: a new day, new lists.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (focused.current) void run();
          schedule();
        },
        msUntilLocalMidnight(new Date(), timeZone),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [run, timeZone]);

  return run;
}

function visible(): boolean {
  if (Platform.OS === 'web') return typeof document === 'undefined' || !document.hidden;
  return AppState.currentState === 'active';
}
