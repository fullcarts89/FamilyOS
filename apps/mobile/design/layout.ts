import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { breakpoint } from './tokens';

export type LayoutKind = 'phone' | 'tablet' | 'desktop';

/** Phone below 760, tablet 760–1099, desktop from 1100, by window width. */
export function useLayout(): {
  kind: LayoutKind;
  width: number;
  phone: boolean;
  desktop: boolean;
} {
  const { width } = useWindowDimensions();
  const kind: LayoutKind =
    width >= breakpoint.desktop ? 'desktop' : width >= breakpoint.tablet ? 'tablet' : 'phone';
  return { kind, width, phone: kind === 'phone', desktop: kind === 'desktop' };
}

/** True when the person asked their device for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** The native driver isn't available on the web. */
export const nativeDriver = Platform.OS !== 'web';
