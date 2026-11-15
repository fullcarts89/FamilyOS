import { X } from 'lucide-react-native';
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
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from './Button';
import { nativeDriver, useLayout, useReducedMotion } from './layout';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';

interface ToastOptions {
  /** A second, quieter line: an acknowledgment ("One less thing for both of you."). */
  detail?: string;
  undo?: () => void | Promise<void>;
  /** Another way forward, e.g. "Try again" after a failed write. */
  action?: { label: string; run: () => void | Promise<void> };
  error?: boolean;
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  /** Shows a short confirmation; with `undo`, an Undo button that reverses it. */
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const { phone } = useLayout();

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-2), { id, message, ...options }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        aria-live="polite"
        style={[styles.region, { bottom: phone ? 92 : 28 }]}
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [busy, setBusy] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const hasUndo = !!toast.undo || !!toast.action;

  useEffect(() => {
    if (!reduced) {
      Animated.timing(enter, { toValue: 1, duration: 260, useNativeDriver: nativeDriver }).start();
    }
    // Undo stays a little longer, so there's time to reach it.
    const timer = setTimeout(() => dismissRef.current(), hasUndo ? DURATION + 1500 : DURATION);
    return () => clearTimeout(timer);
  }, [enter, reduced, hasUndo]);

  return (
    <Animated.View
      role="status"
      style={[
        styles.toast,
        toast.error && styles.error,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.message}>
        <Text variant="label" color={color.onInk} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.detail ? (
          <Text variant="small" color="rgba(255,255,255,0.78)" numberOfLines={2}>
            {toast.detail}
          </Text>
        ) : null}
      </View>
      {toast.action ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            onDismiss();
            await toast.action?.run();
          }}
          style={(s: PressState) => [styles.action, s.hovered && styles.hover]}
        >
          <Text variant="label" color={color.onInk} style={styles.undo}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
      {toast.undo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${toast.message}`}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await toast.undo?.();
            } finally {
              onDismiss();
            }
          }}
          style={(s: PressState) => [styles.action, s.hovered && styles.hover]}
        >
          <Text variant="label" color={color.onInk} style={styles.undo}>
            Undo
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onDismiss}
        style={(s: PressState) => [styles.action, styles.close, s.hovered && styles.hover]}
      >
        <X size={16} color={color.onInk} strokeWidth={2.2} />
      </Pressable>
    </Animated.View>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  region: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 48,
    maxWidth: 560,
    paddingLeft: 20,
    paddingRight: 6,
    borderRadius: 26,
    backgroundColor: color.ink,
    boxShadow: shadow.toast,
  },
  error: { backgroundColor: color.danger },
  message: { flexShrink: 1, marginRight: 6, paddingVertical: 9, gap: 1 },
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  close: { paddingHorizontal: 0 },
  hover: { backgroundColor: 'rgba(255,255,255,0.12)' },
  undo: { fontFamily: 'Figtree-800' },
});
