import { Check, X } from 'lucide-react-native';
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
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../Button';
import { nativeDriver, useLayout, useReducedMotion } from '../layout';
import { Text } from '../Text';
import { color, memberPalette, radius, shadow } from '../tokens';
import { acknowledgeOnce } from './acknowledgment';
import { useHaptics } from './haptics';

export interface Milestone {
  /** Stable key: a milestone is shown once (see useAcknowledgment). */
  key: string;
  title: string;
  line?: string;
  action?: { label: string; onPress: () => void };
  /** Colors for the bloom (the people involved). */
  colors?: string[];
}

interface CelebrationApi {
  /** Show a milestone, once. Call only after the server has confirmed the change. */
  celebrate: (milestone: Milestone) => void;
}

const CelebrationContext = createContext<CelebrationApi | null>(null);

/** Rare, warm moments: a short card with a check that blooms, and a firmer haptic. */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Milestone | null>(null);
  const haptics = useHaptics();
  const celebrate = useCallback(
    (m: Milestone) => {
      if (!acknowledgeOnce(m.key)) return;
      setCurrent(m);
      haptics.medium();
    },
    [haptics],
  );
  const value = useMemo(() => ({ celebrate }), [celebrate]);
  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {current ? (
        <CelebrationCard key={current.key} milestone={current} onDone={() => setCurrent(null)} />
      ) : null}
    </CelebrationContext.Provider>
  );
}

function CelebrationCard({ milestone, onDone }: { milestone: Milestone; onDone: () => void }) {
  const reduced = useReducedMotion();
  const { phone } = useLayout();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const bloom = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const colors = (milestone.colors?.length ? milestone.colors : memberPalette).slice(0, 3);

  useEffect(() => {
    if (!reduced) {
      Animated.parallel([
        Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: nativeDriver }),
        Animated.sequence([
          Animated.delay(120),
          Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: nativeDriver }),
        ]),
        Animated.sequence([
          Animated.delay(160),
          Animated.timing(bloom, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: nativeDriver,
          }),
        ]),
      ]).start();
    }
    const timer = setTimeout(() => doneRef.current(), milestone.action ? 6500 : 3800);
    return () => clearTimeout(timer);
  }, [enter, pop, bloom, reduced, milestone.action]);

  const dots = [
    { x: -26, y: -18 },
    { x: 26, y: -20 },
    { x: 0, y: 30 },
  ];

  return (
    <View pointerEvents="box-none" style={[styles.region, { top: phone ? 70 : 84 }]}>
      <Animated.View
        role="status"
        aria-live="polite"
        style={[
          styles.card,
          {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          },
        ]}
      >
        <View style={styles.badgeWrap} aria-hidden>
          {dots.map((d, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: colors[i % colors.length],
                  opacity: bloom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateX: bloom.interpolate({ inputRange: [0, 1], outputRange: [0, d.x] }) },
                    { translateY: bloom.interpolate({ inputRange: [0, 1], outputRange: [0, d.y] }) },
                  ],
                },
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.badge,
              { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
            ]}
          >
            <Check size={22} strokeWidth={3} color={color.onInk} />
          </Animated.View>
        </View>
        <View style={styles.text}>
          <Text variant="chapter" style={styles.title}>
            {milestone.title}
          </Text>
          {milestone.line ? (
            <Text variant="meta" tone="muted">
              {milestone.line}
            </Text>
          ) : null}
          {milestone.action ? (
            <Button
              title={milestone.action.label}
              size="sm"
              variant="secondary"
              onPress={() => {
                milestone.action?.onPress();
                onDone();
              }}
              style={styles.action}
            />
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDone}
          style={styles.close}
        >
          <X size={16} color={color.muted} strokeWidth={2.2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function useCelebrate(): CelebrationApi {
  const value = useContext(CelebrationContext);
  if (!value) throw new Error('useCelebrate must be used inside CelebrationProvider');
  return value;
}

const styles = StyleSheet.create({
  region: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 120 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: 520,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    boxShadow: shadow.sheet,
  },
  badgeWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  text: { flexShrink: 1, gap: 2 },
  title: { fontSize: 20, lineHeight: 26 },
  action: { marginTop: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
