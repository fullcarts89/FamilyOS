import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { nativeDriver, useReducedMotion } from '../layout';

/**
 * Content arriving: a short fade and rise (screens, sections that just loaded). With reduced
 * motion it simply appears.
 */
export function FadeIn({
  children,
  delay = 0,
  rise = 6,
  style,
}: {
  children: ReactNode;
  delay?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, { toValue: 1, duration: 220, delay, useNativeDriver: nativeDriver }).start();
  }, [v, reduced, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
