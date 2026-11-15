import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { hitSlopFor, type PressState } from './Button';
import { nativeDriver, useReducedMotion } from './layout';
import { color as tokens, tint } from './tokens';

/**
 * The round "bead" check: hollow in the owner's color, filled when done. Checking it fills at
 * once and the check springs in (~250 ms); with reduced motion it simply appears. `waiting` draws
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
  const pop = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const [was, setWas] = useState(checked);

  useEffect(() => {
    if (checked === was) return;
    setWas(checked);
    if (!checked || reduced) {
      pop.setValue(checked ? 1 : 0);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, {
      toValue: 1,
      friction: 6,
      tension: 220,
      useNativeDriver: nativeDriver,
    }).start();
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
      onPress={onPress}
      hitSlop={hitSlopFor(size)}
      style={(state: PressState) => [
        styles.ring,
        {
          width: size,
          height: size,
          borderColor: color,
          backgroundColor: checked ? color : state.hovered ? tint(color, 0.16) : tokens.surface,
        },
        state.pressed && styles.pressed,
      ]}
    >
      {(state: PressState) =>
        checked ? (
          <Animated.View
            style={{
              opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            }}
          >
            <Check size={size * 0.58} strokeWidth={3.2} color={tokens.onInk} aria-hidden />
          </Animated.View>
        ) : state.hovered ? (
          <Check size={size * 0.56} strokeWidth={3} color={color} aria-hidden />
        ) : null
      }
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
