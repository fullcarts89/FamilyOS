import { useCallback, useState } from 'react';

/**
 * Milestones are acknowledged once per person. For now the guard lives in memory for the session;
 * the API will store acknowledgments per member (member_acknowledgment) so refreshes and other
 * devices never replay them. Screens only use this interface, so swapping the store is local.
 */
const seenThisSession = new Set<string>();

export interface AcknowledgmentStore {
  has: (key: string) => boolean;
  add: (key: string) => void;
}

let store: AcknowledgmentStore = {
  has: (key) => seenThisSession.has(key),
  add: (key) => void seenThisSession.add(key),
};

/** Replace the store (the API-backed one, when it exists). */
export function setAcknowledgmentStore(next: AcknowledgmentStore): void {
  store = next;
}

/** Whether `key` was already acknowledged, and a way to acknowledge it (returns false if it was). */
export function acknowledgeOnce(key: string): boolean {
  if (store.has(key)) return false;
  store.add(key);
  return true;
}

export function useAcknowledgment(key: string): { seen: boolean; acknowledge: () => boolean } {
  const [seen, setSeen] = useState(() => store.has(key));
  const acknowledge = useCallback(() => {
    const first = acknowledgeOnce(key);
    setSeen(true);
    return first;
  }, [key]);
  return { seen, acknowledge };
}
