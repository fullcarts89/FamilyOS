// Prototype-only: after the Thursday swap is approved, the pickup shows as proposed to Theo, then
// (simulated) confirmed a moment later. Lives for the session in Direction A only.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useFamily } from '../../store';

export type SwapState = 'none' | 'proposed' | 'confirmed';

const Ctx = createContext<SwapState>('none');

export function SwapProvider({ children }: { children: ReactNode }) {
  const approved = useFamily().suggestionStatus('s1') === 'approved';
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!approved) {
      setConfirmed(false);
      return;
    }
    const h = window.setTimeout(() => setConfirmed(true), 2600);
    return () => window.clearTimeout(h);
  }, [approved]);
  return <Ctx.Provider value={approved ? (confirmed ? 'confirmed' : 'proposed') : 'none'}>{children}</Ctx.Provider>;
}

export const useSwap = () => useContext(Ctx);
