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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { announce, politeLiveRegion, useScreenReader } from './announce';
import type { PressState } from './Button';
import { toastBottom } from './chrome';
import { nativeDriver, reducedMotion, useLayout, useReducedMotion } from './layout';
import { easing } from './motion/easing';
import { duration, linger } from './motion/timing';
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

/**
 * One confirmation at a time: a new one replaces the one showing (never a pile of stale ones).
 * On phones it sits just above the capture button, never over it. Announced once per platform
 * (design/announce.ts); it stays while hovered or focused, and an Undo stays until dismissed
 * while a screen reader is on.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const next = useRef(1);
  const { phone } = useLayout();
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    setToast((t) => (t?.id === id ? null : t));
  }, []);

  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    const id = next.current++;
    setToast({ id, message, ...options });
    announce(
      [message, options.detail],
      options.undo ? 'Undo available' : options.action ? `${options.action.label} available` : undefined,
    );
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.region, { bottom: phone ? toastBottom(insets.bottom) : 28 }]}
      >
        {toast ? (
          <ToastView key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reducedMotion() ? 1 : 0)).current;
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const screenReader = useScreenReader();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const hasAction = !!toast.undo || !!toast.action;

  useEffect(() => {
    if (reducedMotion()) return;
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: duration.enter,
      easing: easing.enter,
      useNativeDriver: nativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [enter]);

  /** Leaves with a short fade (at once with reduced motion). */
  const gone = useRef(false);
  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    if (reducedMotion()) {
      dismissRef.current();
      return;
    }
    setLeaving(true);
    Animated.timing(enter, {
      toValue: 0,
      duration: duration.exit,
      easing: easing.exit,
      useNativeDriver: nativeDriver,
    }).start(() => dismissRef.current());
  }, [enter]);

  // Counts down only while nobody is reading or reaching for it.
  const remaining = useRef<number>(hasAction ? linger.toastWithAction : linger.toast);
  const paused = hovered || focused || leaving || (screenReader && hasAction);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(leave, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - started));
    };
  }, [paused, leave]);

  return (
    <Animated.View
      role="status"
      {...politeLiveRegion}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.toast,
        toast.error && styles.error,
        !reduced && {
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
        onPress={leave}
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
