import { Easing } from 'react-native';

/** Entrances ease out (fast, then settling); exits ease in, short. See ./timing.ts. */
export const easing = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.quad),
} as const;
