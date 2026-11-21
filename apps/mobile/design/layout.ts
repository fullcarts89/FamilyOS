import { Platform, useWindowDimensions } from 'react-native';
import { breakpoint } from './tokens';

/** One app-wide Reduce Motion value, known before anything animates (see motion/reduced.ts). */
export { reducedMotion, useReducedMotion } from './motion/reduced';

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

/** The native driver isn't available on the web. */
export const nativeDriver = Platform.OS !== 'web';
