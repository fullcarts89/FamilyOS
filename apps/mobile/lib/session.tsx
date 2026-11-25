import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onUnauthorized } from './api';
import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  loading: boolean;
  /** Signed out because the session stopped working (expired, revoked or unreadable). */
  expired: boolean;
}

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  expired: false,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: true,
    expired: false,
  });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setState((s) => ({ ...s, session: data.session, loading: false })))
      // Unreadable stored session: start signed out.
      .catch(() => setState((s) => ({ ...s, session: null, loading: false })));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        session,
        loading: false,
        // A fresh sign-in (or a reset link opened) clears the "sign in again" note.
        expired: event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' ? false : s.expired,
      }));
    });
    // The API refused the session (401): forget it on this device and go back to sign-in, once.
    let signingOut = false;
    onUnauthorized(() => {
      if (signingOut) return;
      signingOut = true;
      setState({ session: null, loading: false, expired: true });
      void supabase.auth
        .signOut({ scope: 'local' })
        .catch(() => undefined)
        .finally(() => {
          signingOut = false;
        });
    });
    return () => {
      data.subscription.unsubscribe();
      onUnauthorized(null);
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
