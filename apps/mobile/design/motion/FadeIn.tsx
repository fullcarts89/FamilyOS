import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { nativeDriver } from '../layout';
import { easing } from './easing';
import { reducedMotion, useReducedMotion } from './reduced';
import { duration } from './timing';

/**
 * Content arriving: a short fade and rise (screens, sections that just loaded), easing out. With
 * reduced motion it is simply there from the first frame.
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
  const v = useRef(new Animated.Value(reducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.stopAnimation();
      v.setValue(1);
      return;
    }
    const enter = Animated.timing(v, {
      toValue: 1,
      duration: duration.enter,
      delay,
      easing: easing.enter,
      useNativeDriver: nativeDriver,
    });
    enter.start();
    return () => enter.stop();
  }, [v, reduced, delay]);
  return (
    <Animated.View
      style={[
        style,
        !reduced && {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
