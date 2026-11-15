import { Check } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { nativeDriver, useReducedMotion } from '../../design/layout';
import { color } from '../../design/tokens';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The Weekly Reset's completion mark: the seven days of the week fill in one after another, then
 * the check settles in the middle with a soft bloom in the family's colors. Plays once per
 * person (the caller decides); with reduced motion, or the second time, it is simply there.
 */
export function PlanMoment({ play, colors }: { play: boolean; colors: string[] }) {
  const reduced = useReducedMotion();
  const still = !play || reduced;
  const days = useRef(DAYS.map(() => new Animated.Value(still ? 1 : 0))).current;
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  const bloom = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) {
      days.forEach((d) => d.setValue(1));
      pop.setValue(1);
      bloom.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.stagger(
        70,
        days.map((d) =>
          Animated.timing(d, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: nativeDriver,
          }),
        ),
      ),
      Animated.parallel([
        Animated.spring(pop, {
          toValue: 1,
          friction: 5,
          tension: 130,
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(bloom, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: nativeDriver,
        }),
      ]),
    ]).start();
  }, [still, days, pop, bloom]);

  const palette = colors.length ? colors : [color.ink];
  const R = 58;
  return (
    <View style={styles.wrap} aria-hidden importantForAccessibility="no-hide-descendants">
      <View style={styles.ring}>
        {DAYS.map((label, i) => {
          const angle = (i / DAYS.length) * Math.PI * 2 - Math.PI / 2;
          const c = palette[i % palette.length] ?? color.ink;
          return (
            <Animated.View
              key={i}
              style={[
                styles.day,
                {
                  left: 70 + Math.cos(angle) * R - 11,
                  top: 70 + Math.sin(angle) * R - 11,
                  backgroundColor: c,
                  opacity: days[i],
                  transform: [
                    {
                      scale: (days[i] ?? pop).interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Animated.Text style={styles.dayText}>{label}</Animated.Text>
            </Animated.View>
          );
        })}
        {palette.slice(0, 4).map((c, i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return (
            <Animated.View
              key={`b${i}`}
              style={[
                styles.bloom,
                {
                  backgroundColor: c,
                  opacity: bloom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.9, 0] }),
                  transform: [
                    {
                      translateX: bloom.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(a) * 34],
                      }),
                    },
                    {
                      translateY: bloom.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(a) * 34],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
        <Animated.View
          style={[
            styles.badge,
            {
              opacity: pop,
              transform: [
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              ],
            },
          ]}
        >
          <Check size={30} strokeWidth={3} color={color.onInk} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 140, height: 140 },
  ring: { width: 140, height: 140 },
  day: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: color.onInk, fontSize: 10, fontWeight: '700' },
  bloom: { position: 'absolute', left: 64, top: 64, width: 12, height: 12, borderRadius: 6 },
  badge: {
    position: 'absolute',
    left: 40,
    top: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
