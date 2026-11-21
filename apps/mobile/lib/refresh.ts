import { startOfLocalDay } from '@familyos/domain';
import { addDays } from './dates';
import { localParts } from './rhythm';

/**
 * When an open screen reloads on its own (lib/use-live-refresh.ts). Pure, so the rules are
 * unit-tested (test/mobile-refresh.test.ts).
 */

/** While a screen is open and visible, it reloads this often. */
export const REFRESH_EVERY_MS = 60_000;

/** Milliseconds from `now` until the next local midnight in the household's time zone. */
export function msUntilLocalMidnight(now: Date, timeZone: string): number {
  const today = localParts(now, timeZone).date;
  const next = startOfLocalDay(addDays(today, 1), timeZone).epochMilliseconds;
  return Math.max(1_000, next - now.getTime());
}

/**
 * Reads and writes running at once: a reload that started before (or while) a write was in flight
 * must not land, or it would put back what the write just changed. Each write moves `epoch` on
 * when it starts and when it ends; a read is current only if no write is in flight and the epoch
 * is the one it started with.
 */
export function createWriteTracker() {
  let inFlight = 0;
  let epoch = 0;
  const idle = new Set<() => void>();
  return {
    start(): () => void {
      inFlight += 1;
      epoch += 1;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        inFlight -= 1;
        epoch += 1;
        if (inFlight === 0) [...idle].forEach((l) => l());
      };
    },
    /** A token for a read starting now; `current(token)` says whether its result may be applied. */
    snapshot: () => epoch,
    current: (token: number) => inFlight === 0 && token === epoch,
    busy: () => inFlight > 0,
    /** Called each time the last write in flight ends. */
    onIdle(listener: () => void): () => void {
      idle.add(listener);
      return () => void idle.delete(listener);
    },
  };
}

export type WriteTracker = ReturnType<typeof createWriteTracker>;
