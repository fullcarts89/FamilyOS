import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { nativeDriver, useReducedMotion } from '../layout';
import { color, radius } from '../tokens';

/** A soft placeholder block that breathes while content loads (still under reduced motion). */
export function SkeletonBlock({
  width = '100%',
  height = 14,
  round,
}: {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: round ? height / 2 : radius.sm,
        backgroundColor: color.lane,
      }}
    />
  );
}

export function Skeleton({ children, label = 'Loading' }: { children: ReactNode; label?: string }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ opacity: pulse }}
    >
      {children}
    </Animated.View>
  );
}

/** Placeholder task rows: a circle, a title line and a meta line. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock width={24} height={24} round />
          <View style={styles.lines}>
            <SkeletonBlock width={`${70 - ((i * 13) % 30)}%`} height={13} />
            <SkeletonBlock width={`${34 + ((i * 7) % 20)}%`} height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  lines: { flex: 1, gap: 8, paddingTop: 2 },
});
