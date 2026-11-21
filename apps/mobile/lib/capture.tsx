import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, type View } from 'react-native';
import { CaptureSheet } from '../design/CaptureSheet';
import { requestWidgetRefresh } from '../native/WidgetSync';
import { useHousehold } from './household';

interface CaptureState {
  /** Opens quick capture, optionally aimed at someone (null: either of you). */
  open: (owner?: string | null) => void;
  /** Increments whenever something changes data, so visible screens reload. */
  version: number;
  /** Tell visible screens to reload. */
  changed: () => void;
  /**
   * A screen that carries its own capture button (the Weekly Reset's chapter bar on phones)
   * hides the floating one while it shows, so nothing covers its controls or content.
   */
  fabHidden: boolean;
  setFabHidden: (hidden: boolean) => void;
  /** Single-key shortcuts (N or C opens capture) on the web; a personal setting, on by default. */
  shortcuts: boolean;
  setShortcuts: (on: boolean) => void;
  /** The top bar's Capture button: focus goes back to it after saving (keyboard and screen readers). */
  captureButton: RefObject<ComponentRef<typeof View> | null>;
}

const CaptureContext = createContext<CaptureState | null>(null);

/**
 * Whether this person wants the single-key shortcuts, kept on this device like the other
 * device settings (the Lock Screen widget, hidden lanes): WCAG 2.1.4 lets them be turned off.
 */
const shortcutsKey = (memberId: string) => `familyos.shortcuts.${memberId}`;
function readShortcuts(memberId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(shortcutsKey(memberId)) !== 'off';
  } catch {
    return true;
  }
}
function writeShortcuts(memberId: string, on: boolean): void {
  try {
    if (on) globalThis.localStorage?.removeItem(shortcutsKey(memberId));
    else globalThis.localStorage?.setItem(shortcutsKey(memberId), 'off');
  } catch {
    // Without storage the setting lasts until the page reloads.
  }
}

/** Quick capture from anywhere: the capture button, the phone's floating button, or N / C on the web. */
export function CaptureProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { household } = useHousehold();
  const memberId = household?.memberId ?? '';
  // Each opening is its own sheet (fresh text, a fresh capture id); it stays mounted through
  // its exit fade, then goes.
  const [target, setTarget] = useState<{ id: number; owner: string | null | undefined } | null>(
    null,
  );
  const [showing, setShowing] = useState(false);
  const opened = useRef(0);
  const [version, setVersion] = useState(0);
  const [fabHidden, setFabHidden] = useState(false);
  const [shortcuts, setShortcutsState] = useState(true);
  const captureButton = useRef<ComponentRef<typeof View> | null>(null);
  const refocus = useRef(false);
  // After a save, once the sheet has gone (and the modal has put focus back where it was), focus
  // the top bar's Capture button, so the next capture is one key away.
  useEffect(() => {
    if (target || !refocus.current) return;
    refocus.current = false;
    if (Platform.OS === 'web') captureButton.current?.focus();
  }, [target]);

  useEffect(() => {
    if (memberId) setShortcutsState(readShortcuts(memberId));
  }, [memberId]);
  const setShortcuts = useCallback(
    (on: boolean) => {
      setShortcutsState(on);
      if (memberId) writeShortcuts(memberId, on);
    },
    [memberId],
  );

  const open = useCallback((owner?: string | null) => {
    opened.current += 1;
    setTarget({ id: opened.current, owner });
    setShowing(true);
  }, []);
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    requestWidgetRefresh();
  }, []);

  useEffect(() => {
    if (!enabled || !shortcuts || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setShowing((already) => {
          if (!already) {
            opened.current += 1;
            setTarget({ id: opened.current, owner: undefined });
          }
          return true;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, shortcuts]);

  const value = useMemo(
    () => ({
      open,
      version,
      changed,
      fabHidden,
      setFabHidden,
      shortcuts,
      setShortcuts,
      captureButton,
    }),
    [open, version, changed, fabHidden, shortcuts, setShortcuts],
  );
  return (
    <CaptureContext.Provider value={value}>
      {children}
      {enabled && target ? (
        <CaptureSheet
          key={target.id}
          visible={showing}
          initialOwner={target.owner}
          onClose={() => setShowing(false)}
          onExited={() => setTarget((t) => (t?.id === target.id ? null : t))}
          onCreated={changed}
          onSaved={() => {
            refocus.current = true;
          }}
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
