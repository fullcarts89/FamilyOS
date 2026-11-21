import { useCallback, useEffect, useState } from 'react';

/**
 * Milestones and one-time moments are acknowledged once per person. The app installs a store
 * backed by the API (member_acknowledgment), so refreshes and other devices never replay them;
 * until it does (and in tests) a session-memory store stands in. Screens only use this interface.
 */
export interface AcknowledgmentStore {
  /** What's known locally: true or false, or undefined when it hasn't been asked yet. */
  known: (key: string) => boolean | undefined;
  /** Asks whether keys were acknowledged (cached afterwards). */
  load: (keys: string[]) => Promise<void>;
  /** Records the key; resolves true only the first time for this person. */
  record: (key: string) => Promise<boolean>;
}

const seenThisSession = new Set<string>();

export const memoryAcknowledgments: AcknowledgmentStore = {
  // Unknown (rather than "not seen") until recorded: one-time screens wait for the real store.
  known: (key) => (seenThisSession.has(key) ? true : undefined),
  load: async () => undefined,
  record: async (key) => {
    if (seenThisSession.has(key)) return false;
    seenThisSession.add(key);
    return true;
  },
};

let store: AcknowledgmentStore = memoryAcknowledgments;
let generation = 0;
const listeners = new Set<() => void>();

/** Replace the store (the API-backed one once a household is loaded). */
export function setAcknowledgmentStore(next: AcknowledgmentStore): void {
  store = next;
  generation += 1;
  listeners.forEach((l) => l());
}

/** Acknowledge `key`; resolves true if this is the first time (show the moment), else false. */
export async function acknowledgeOnce(key: string): Promise<boolean> {
  if (store.known(key) === true) return false;
  const first = await store.record(key);
  listeners.forEach((l) => l());
  return first;
}

/**
 * Whether `key` was already acknowledged (`null` while asking), and a way to acknowledge it.
 * Used for one-time moments such as first-time setup and introductions.
 */
export function useAcknowledgment(key: string): {
  seen: boolean | null;
  acknowledge: () => Promise<boolean>;
} {
  const [, setTick] = useState(0);
  const gen = generation;
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    if (store.known(key) === undefined) {
      store
        .load([key])
        .then(listener)
        .catch(() => undefined);
    }
    return () => void listeners.delete(listener);
  }, [key, gen]);
  const acknowledge = useCallback(() => acknowledgeOnce(key), [key]);
  return { seen: store.known(key) ?? null, acknowledge };
}
