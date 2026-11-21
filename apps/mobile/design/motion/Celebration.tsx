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
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { announce, politeLiveRegion } from '../announce';
import { Button } from '../Button';
import { nativeDriver, reducedMotion, useLayout, useReducedMotion } from '../layout';
import { Text } from '../Text';
import { color, memberPalette, radius, shadow } from '../tokens';
import { acknowledgeOnce } from './acknowledgment';
import { easing } from './easing';
import { celebrationSpring, duration, linger } from './timing';
import { useHaptics } from './haptics';
import { playChime } from './sound';

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

/**
 * Rare, warm moments: a short card with a check that blooms, and a firmer haptic. A milestone that
 * arrives while another shows takes over after a short fade (never an abrupt cut); each is
 * announced once (design/announce.ts) and stays while hovered or focused.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Milestone[]>([]);
  const haptics = useHaptics();
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;
  const celebrate = useCallback(
    (m: Milestone) => {
      // Shown only the first time this person reaches it, on any device.
      void acknowledgeOnce(m.key).then((first) => {
        if (!first) return;
        setQueue((q) => (q.some((x) => x.key === m.key) ? q : [...q, m]));
      });
    },
    [],
  );
  const current = queue[0] ?? null;
  // The haptic and chime play when a milestone actually shows, not while it waits.
  useEffect(() => {
    if (!current) return;
    hapticsRef.current.medium();
    playChime();
    announce([current.title, current.line]);
  }, [current]);
  const value = useMemo(() => ({ celebrate }), [celebrate]);
  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {current ? (
        <CelebrationCard
          key={current.key}
          milestone={current}
          superseded={queue.length > 1}
          onDone={() => setQueue((q) => q.slice(1))}
        />
      ) : null}
    </CelebrationContext.Provider>
  );
}

function CelebrationCard({
  milestone,
  superseded,
  onDone,
}: {
  milestone: Milestone;
  /** A newer milestone is waiting: fade out now. */
  superseded: boolean;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const { phone } = useLayout();
  const still = reducedMotion();
  const enter = useRef(new Animated.Value(still ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  const bloom = useRef(new Animated.Value(still ? 1 : 0)).current;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const colors = (milestone.colors?.length ? milestone.colors : memberPalette).slice(0, 3);

  useEffect(() => {
    if (reducedMotion()) return;
    const anim = Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: duration.enter,
        easing: easing.enter,
        useNativeDriver: nativeDriver,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(pop, { toValue: 1, ...celebrationSpring, useNativeDriver: nativeDriver }),
      ]),
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(bloom, {
          toValue: 1,
          duration: duration.bloom,
          easing: easing.enter,
          useNativeDriver: nativeDriver,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [enter, pop, bloom]);

  /** A short fade out (at once with reduced motion), then the next milestone, if any. */
  const gone = useRef(false);
  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    if (reducedMotion()) {
      doneRef.current();
      return;
    }
    setLeaving(true);
    Animated.timing(enter, {
      toValue: 0,
      duration: duration.exit,
      easing: easing.exit,
      useNativeDriver: nativeDriver,
    }).start(() => doneRef.current());
  }, [enter]);

  useEffect(() => {
    if (superseded) leave();
  }, [superseded, leave]);

  const remaining = useRef<number>(
    milestone.action ? linger.celebrationWithAction : linger.celebration,
  );
  const paused = hovered || focused || leaving;
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(leave, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - started));
    };
  }, [paused, leave]);

  const dots = [
    { x: -26, y: -18 },
    { x: 26, y: -20 },
    { x: 0, y: 30 },
  ];

  return (
    <View pointerEvents="box-none" style={[styles.region, { top: phone ? 70 : 84 }]}>
      <Animated.View
        role="status"
        {...politeLiveRegion}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.card,
          !reduced && {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          },
        ]}
      >
        <View style={styles.badgeWrap} aria-hidden>
          {reduced
            ? null
            : dots.map((d, i) => (
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
              !reduced && {
                transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
              },
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
                if (gone.current) return;
                gone.current = true;
                onDone();
              }}
              style={styles.action}
            />
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={leave}
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
