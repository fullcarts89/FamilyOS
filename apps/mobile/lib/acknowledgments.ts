import { useEffect } from 'react';
import {
  memoryAcknowledgments,
  setAcknowledgmentStore,
  type AcknowledgmentStore,
} from '../design/motion';
import { api, apiWithStatus } from './api';

const KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/;

/**
 * Acknowledgments stored per member by the API (GET/POST /me/acknowledgments): a milestone is
 * shown once per person across refreshes and devices. POST is idempotent and answers 201 only
 * the first time, so two devices racing still show it once. If the API can't be reached, the
 * moment falls back to once per session rather than being lost or repeated.
 */
export function serverAcknowledgments(householdId: string): AcknowledgmentStore {
  const known = new Map<string, boolean>();
  const base = `/households/${householdId}/me/acknowledgments`;
  return {
    known: (key) => known.get(key),
    load: async (keys) => {
      const ask = [...new Set(keys)].filter((k) => KEY.test(k) && !known.has(k)).slice(0, 50);
      if (ask.length === 0) return;
      const { acknowledgments } = await api<{ acknowledgments: { key: string }[] }>(
        `${base}?keys=${ask.map(encodeURIComponent).join(',')}`,
      );
      const seen = new Set(acknowledgments.map((a) => a.key));
      for (const k of ask) known.set(k, seen.has(k));
    },
    record: async (key) => {
      if (!KEY.test(key)) return memoryAcknowledgments.record(key);
      if (known.get(key)) return false;
      known.set(key, true);
      try {
        const { status } = await apiWithStatus(base, { method: 'POST', body: { key } });
        return status === 201;
      } catch {
        return memoryAcknowledgments.record(key);
      }
    },
  };
}

/** Installs the API-backed store for the signed-in member's household. */
export function useServerAcknowledgments(householdId: string | null, memberId: string | null) {
  useEffect(() => {
    if (!householdId || !memberId) return;
    setAcknowledgmentStore(serverAcknowledgments(householdId));
    return () => setAcknowledgmentStore(memoryAcknowledgments);
  }, [householdId, memberId]);
}
