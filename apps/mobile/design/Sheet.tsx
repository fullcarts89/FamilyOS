import { X } from 'lucide-react-native';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './Button';
import { nativeDriver, useLayout, useReducedMotion } from './layout';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';

/**
 * The sheet's footer slot. A form inside the sheet renders its main action with `SheetActions`;
 * the action shows in the sheet's footer, outside the scrolling body, so it stays in reach on a
 * phone however long the form is. Only the footer re-renders when the actions change.
 */
interface FooterSlot {
  set: (node: ReactNode) => void;
  get: () => ReactNode;
  subscribe: (listener: () => void) => () => void;
}

function createFooterSlot(): FooterSlot {
  let node: ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    set: (next) => {
      node = next;
      listeners.forEach((l) => l());
    },
    get: () => node,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const FooterContext = createContext<FooterSlot | null>(null);

/** The sheet's primary actions, pinned in its footer (sticky on phones). Outside a sheet, inline. */
export function SheetActions({ children }: { children: ReactNode }) {
  const slot = useContext(FooterContext);
  useLayoutEffect(() => {
    slot?.set(children);
  });
  useEffect(() => () => slot?.set(null), [slot]);
  return slot ? null : <>{children}</>;
}

function FooterHost({ slot, fallback }: { slot: FooterSlot; fallback: ReactNode }) {
  const node = useSyncExternalStore(slot.subscribe, slot.get, slot.get);
  const content = node ?? fallback;
  return content ? <View style={styles.footer}>{content}</View> : null;
}

/**
 * A modal sheet: slides up from the bottom on phones, a centered card on larger screens
 * (or anchored top-right with `anchor="top-right"`, under the capture button). Escape, the close
 * button and tapping outside all close it.
 */
export function Sheet({
  visible,
  onClose,
  label,
  title,
  children,
  footer,
  width = 560,
  anchor = 'center',
}: {
  visible: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Small uppercase heading inside the sheet. */
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  anchor?: 'center' | 'top-right';
}) {
  const { phone } = useLayout();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [slot] = useState(createFooterSlot);

  useEffect(() => {
    if (!visible) return;
    progress.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        useNativeDriver: nativeDriver,
      }).start();
    }
  }, [visible, reduced, progress]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [phone ? 40 : -8, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.fill,
          phone ? styles.bottom : anchor === 'top-right' ? styles.topRight : styles.center,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={label}
          style={[
            styles.sheet,
            phone
              ? [styles.sheetPhone, { paddingBottom: Math.max(insets.bottom, 16) }]
              : [styles.sheetWide, { width }],
            { opacity: progress, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.head}>
            {title ? (
              <Text variant="kicker" tone="muted">
                {title}
              </Text>
            ) : (
              <View />
            )}
            <IconButton icon={X} label="Close" onPress={onClose} size={36} />
          </View>
          <FooterContext.Provider value={slot}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </FooterContext.Provider>
          <FooterHost slot={slot} fallback={footer} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { justifyContent: 'flex-end' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  topRight: { justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 72, paddingRight: 24, paddingLeft: 24 },
  scrim: { backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    boxShadow: shadow.sheet,
    maxHeight: '92%',
  },
  sheetPhone: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 10,
  },
  sheetWide: { borderRadius: radius.xl, maxWidth: '100%', paddingTop: 12, paddingBottom: 16 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 12,
  },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 22, paddingBottom: 8, gap: 14 },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.surface,
  },
});
