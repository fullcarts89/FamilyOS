import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { hapticsAvailable, useHaptics } from '../design/motion';
import { setSoundEnabled } from '../design/motion/sound';
import { api, errorMessage, type MemberState } from './api';
import { useHousehold } from './household';
import { sessionStorage } from './session-storage';

const ANCHOR = 'familyos.since';
/** A visit that starts this soon after the last one continues it (a reload, a quick reopen). */
const CONTINUES_MS = 30 * 60 * 1000;

type Patch = Partial<Pick<MemberState, 'quietHours' | 'haptics' | 'sound'>> & {
  notifications?: Partial<MemberState['notifications']>;
};

interface MemberStateApi {
  state: MemberState | null;
  /** Saves a change at once on screen; rolls back and returns the message if the API refuses. */
  update: (patch: Patch) => Promise<string | null>;
  /**
   * When this person last looked before this visit (for "Since you last looked"). Marked once per
   * app session, on the first visit to Today.
   */
  lastLooked: () => Promise<string | null>;
}

const MemberStateContext = createContext<MemberStateApi | null>(null);

/** The signed-in member's own settings (/me/state): haptics, sound, notifications, quiet hours. */
export function MemberStateProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold();
  const haptics = useHaptics();
  const [state, setState] = useState<MemberState | null>(null);
  const stateRef = useRef<MemberState | null>(null);
  stateRef.current = state;
  const seen = useRef<Promise<string | null> | null>(null);
  const base = household ? `/households/${household.id}/me` : null;
  const setHaptics = haptics.setEnabled;

  useEffect(() => {
    if (!base) return;
    let alive = true;
    api<{ state: MemberState }>(`${base}/state`)
      .then(({ state: s }) => {
        if (!alive) return;
        setState(s);
        if (hapticsAvailable) setHaptics(s.haptics);
        setSoundEnabled(s.sound);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [base, setHaptics]);

  const update = useCallback(
    async (patch: Patch): Promise<string | null> => {
      const before = stateRef.current;
      if (!base || !before) return 'Settings are still loading.';
      const optimistic: MemberState = {
        ...before,
        ...patch,
        notifications: { ...before.notifications, ...patch.notifications },
      };
      setState(optimistic);
      if (patch.haptics !== undefined && hapticsAvailable) setHaptics(patch.haptics);
      if (patch.sound !== undefined) setSoundEnabled(patch.sound);
      try {
        const { state: saved } = await api<{ state: MemberState }>(`${base}/state`, {
          method: 'PATCH',
          body: { expectedVersion: before.version, ...patch },
        });
        setState(saved);
        return null;
      } catch (caught) {
        setState(before);
        if (patch.haptics !== undefined && hapticsAvailable) setHaptics(before.haptics);
        if (patch.sound !== undefined) setSoundEnabled(before.sound);
        return errorMessage(caught);
      }
    },
    [base, setHaptics],
  );

  const lastLooked = useCallback(() => {
    if (!base) return Promise.resolve(null);
    const anchorKey = `${ANCHOR}.${household?.memberId ?? 'me'}`;
    seen.current ??= api<{ previousSeenAt: string | null; seenAt: string }>(`${base}/seen`, {
      method: 'POST',
    })
      .then(async (r) => {
        // A reload moments after the last visit keeps that visit's "since", instead of showing
        // nothing new since a few seconds ago.
        let since = r.previousSeenAt;
        try {
          const stored = JSON.parse((await sessionStorage.getItem(anchorKey)) ?? 'null') as {
            seenAt: string;
            since: string | null;
          } | null;
          if (
            stored &&
            r.previousSeenAt &&
            Math.abs(new Date(stored.seenAt).getTime() - new Date(r.previousSeenAt).getTime()) <
              2000 &&
            new Date(r.seenAt).getTime() - new Date(r.previousSeenAt).getTime() < CONTINUES_MS
          ) {
            since = stored.since;
          }
          await sessionStorage.setItem(anchorKey, JSON.stringify({ seenAt: r.seenAt, since }));
        } catch {
          // Without storage, "since" is simply the last visit.
        }
        return since;
      })
      .catch(() => {
        seen.current = null;
        return null;
      });
    return seen.current;
  }, [base, household?.memberId]);

  const value = useMemo(() => ({ state, update, lastLooked }), [state, update, lastLooked]);
  return <MemberStateContext.Provider value={value}>{children}</MemberStateContext.Provider>;
}

export function useMemberState(): MemberStateApi {
  const value = useContext(MemberStateContext);
  if (!value) throw new Error('useMemberState must be used inside MemberStateProvider');
  return value;
}
