import { useEffect, useState, useSyncExternalStore } from 'react';
import { isDone } from '../components/tasks/rules';
import type { WorkItem } from './api';

/**
 * The moment after ticking something off: the row stays where it was, checked and struck, long
 * enough to see it worked (and that it was the right one), then fades and leaves the list. Rows
 * never jump out from under the next tap. A failed save ends the moment at once, so the row is
 * unticked again straight away.
 */

/** How long a finished row stays, checked and struck. */
export const SETTLE_HOLD_MS = 1200;
/** Then its fade (opacity only; nothing moves until it's gone). */
export const SETTLE_FADE_MS = 300;

export type SettlePhase = 'held' | 'leaving';

export interface Settler {
  /** Start (or restart) the moment for an item. */
  start: (id: string) => void;
  /** End it now: a failed save, an undo, a reopen. */
  cancel: (id: string) => void;
  /**
   * Pass every changed item through, with how it was before: newly done starts the moment;
   * anything open again (a rollback, an undo, a reopen) ends it.
   */
  observe: (
    before: Pick<WorkItem, 'status'> | undefined,
    after: Pick<WorkItem, 'id' | 'status'>,
  ) => void;
  /** The items in their moment, and where each is in it. A new map after every change. */
  snapshot: () => ReadonlyMap<string, SettlePhase>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}

export function createSettler({
  hold = SETTLE_HOLD_MS,
  fade = SETTLE_FADE_MS,
}: { hold?: number; fade?: number } = {}): Settler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let phases: ReadonlyMap<string, SettlePhase> = new Map();
  const listeners = new Set<() => void>();

  const set = (id: string, phase: SettlePhase | null) => {
    const next = new Map(phases);
    if (phase) next.set(id, phase);
    else next.delete(id);
    phases = next;
    for (const l of listeners) l();
  };
  const clear = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };

  const start = (id: string) => {
    clear(id);
    set(id, 'held');
    timers.set(
      id,
      setTimeout(() => {
        set(id, 'leaving');
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            set(id, null);
          }, fade),
        );
      }, hold),
    );
  };
  const cancel = (id: string) => {
    if (!phases.has(id) && !timers.has(id)) return;
    clear(id);
    set(id, null);
  };

  return {
    start,
    cancel,
    observe: (before, after) => {
      if (isDone(after)) {
        if (before && !isDone(before)) start(after.id);
      } else cancel(after.id);
    },
    snapshot: () => phases,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      listeners.clear();
    },
  };
}

/** One settler for a screen's lists (Today, Tasks), re-rendering as rows hold, fade and leave. */
export function useSettle(): Settler & { phases: ReadonlyMap<string, SettlePhase> } {
  const [settler] = useState(createSettler);
  useEffect(() => () => settler.dispose(), [settler]);
  const phases = useSyncExternalStore(settler.subscribe, settler.snapshot, settler.snapshot);
  // The functions are the settler's own, so they keep their identity from render to render.
  return { ...settler, phases };
}
