import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { HitArea, hitSlopFor, type PressState } from './Button';
import { nativeDriver, reducedMotion, useReducedMotion } from './layout';
import { color as tokens, tint } from './tokens';

/**
 * The check's spring: settles in about 300 ms with under 20% overshoot (friction 9, tension 220
 * is a damping ratio of about 0.47).
 */
const SPRING = { friction: 9, tension: 220 };

/**
 * Web: after a check is pressed, no check shows on hover until the pointer actually moves. The
 * row under a still pointer can change (a finished row leaves and the next slides up; a failed
 * save comes back unticked), and a hover check there would read as the wrong thing ticked.
 */
const hover = (() => {
  let lastDown: { x: number; y: number } | null = null;
  let stillAt: { x: number; y: number } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener(
      'pointerdown',
      (e) => {
        lastDown = { x: e.clientX, y: e.clientY };
      },
      true,
    );
    document.addEventListener(
      'pointermove',
      (e) => {
        if (!stillAt || Math.hypot(e.clientX - stillAt.x, e.clientY - stillAt.y) < 4) return;
        stillAt = null;
        notify();
      },
      { passive: true },
    );
  }
  return {
    pressed: () => {
      if (Platform.OS !== 'web') return;
      stillAt = lastDown ?? { x: Number.NaN, y: Number.NaN };
      notify();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    quiet: () => stillAt !== null,
  };
})();

/**
 * The round "bead" check: hollow in the owner's color, filled when done. Checking it fills at
 * once and the check springs in (~300 ms); with reduced motion it simply appears. `waiting` draws
 * a dashed ring for things that can't be ticked off yet (waiting on someone, booked, stuck).
 */
export function RoundCheckbox({
  checked,
  onPress,
  label,
  color = tokens.ink,
  size = 24,
  waiting,
  disabled,
}: {
  checked: boolean;
  onPress?: () => void;
  /** What ticking does, e.g. "Complete Renew car registration". */
  label: string;
  color?: string;
  size?: number;
  waiting?: boolean;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const quiet = useSyncExternalStore(hover.subscribe, hover.quiet, () => false);
  const pop = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const [was, setWas] = useState(checked);

  useEffect(() => {
    if (checked === was) return;
    setWas(checked);
    if (!checked || reduced || reducedMotion()) {
      pop.setValue(checked ? 1 : 0);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, ...SPRING, useNativeDriver: nativeDriver }).start();
  }, [checked, was, reduced, pop]);

  if (waiting) {
    return (
      <View
        accessibilityLabel={label}
        style={[
          styles.ring,
          { width: size, height: size, borderColor: tokens.faint, borderStyle: 'dashed' },
        ]}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      aria-checked={checked}
      aria-disabled={!!disabled}
      disabled={disabled || !onPress}
      onPress={
        onPress
          ? () => {
              hover.pressed();
              onPress();
            }
          : undefined
      }
      hitSlop={hitSlopFor(size)}
      style={(state: PressState) => [
        styles.ring,
        {
          width: size,
          height: size,
          borderColor: color,
          backgroundColor: checked
            ? color
            : state.hovered && !quiet
              ? tint(color, 0.16)
              : tokens.surface,
        },
        state.pressed && styles.pressed,
      ]}
    >
      {(state: PressState) => (
        <>
          <HitArea slop={hitSlopFor(size)} border={2} />
          {checked ? (
          <Animated.View
            style={{
              opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            }}
          >
            <Check size={size * 0.58} strokeWidth={3.2} color={tokens.onInk} aria-hidden />
          </Animated.View>
        ) : state.hovered && !quiet ? (
          <Check size={size * 0.56} strokeWidth={3} color={color} aria-hidden />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pressed: { transform: [{ scale: 0.88 }] },
});
