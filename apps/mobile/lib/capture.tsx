import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { CaptureSheet } from '../design/CaptureSheet';
import { requestWidgetRefresh } from '../native/WidgetSync';

interface CaptureState {
  /** Opens quick capture, optionally aimed at someone (null: either of you). */
  open: (owner?: string | null) => void;
  /** Increments whenever something changes data, so visible screens reload. */
  version: number;
  /** Tell visible screens to reload. */
  changed: () => void;
}

const CaptureContext = createContext<CaptureState | null>(null);

/** Quick capture from anywhere: the capture button, the phone's floating button, or N / C on the web. */
export function CaptureProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [target, setTarget] = useState<{ owner: string | null | undefined } | null>(null);
  const [version, setVersion] = useState(0);

  const open = useCallback((owner?: string | null) => setTarget({ owner }), []);
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    requestWidgetRefresh();
  }, []);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setTarget((t) => t ?? { owner: undefined });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  const value = useMemo(() => ({ open, version, changed }), [open, version, changed]);
  return (
    <CaptureContext.Provider value={value}>
      {children}
      {enabled && target ? (
        <CaptureSheet
          initialOwner={target.owner}
          onClose={() => setTarget(null)}
          onCreated={changed}
        />
      ) : null}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureState {
  const value = useContext(CaptureContext);
  if (!value) throw new Error('useCapture must be used inside CaptureProvider');
  return value;
}
