import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Whether the person asked their device for less motion, known before anything animates: one
 * value for the whole app. On the web it is read synchronously from the media query when this
 * module loads and follows changes; on iPhone and Android, app/_layout.tsx primes it at start
 * (`primeReducedMotion`) before the first screen shows, then follows the system setting.
 * Animations read it when they start, so they never begin moving and then stop.
 */
let reduced = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === reduced) return;
  reduced = next;
  listeners.forEach((l) => l());
}

if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = query.matches;
  query.addEventListener?.('change', (e) => set(e.matches));
}

let primed: Promise<void> | null = Platform.OS === 'web' ? Promise.resolve() : null;
let isPrimed = Platform.OS === 'web';

/**
 * Native: ask the system once, at app start, and follow its changes. Safe to call again. The app
 * never waits more than half a second for the answer (it then follows the change event).
 */
export function primeReducedMotion(): Promise<void> {
  primed ??= Promise.race([
    AccessibilityInfo.isReduceMotionEnabled().then(set, () => undefined),
    new Promise<void>((done) => setTimeout(done, 500)),
  ]).finally(() => {
    isPrimed = true;
    AccessibilityInfo.addEventListener('reduceMotionChanged', set);
    listeners.forEach((l) => l());
  });
  return primed;
}

/** Whether the setting is known yet (always on the web). */
export function reducedMotionKnown(): boolean {
  return isPrimed;
}

/** The current value, for code outside React (an animation about to start). */
export function reducedMotion(): boolean {
  return reduced;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** True when the person asked their device for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedMotion, reducedMotion);
}

/** True once the setting is known (native waits for the system; the web knows at once). */
export function useReducedMotionKnown(): boolean {
  return useSyncExternalStore(subscribe, reducedMotionKnown, reducedMotionKnown);
}
