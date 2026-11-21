/**
 * Shared motion values (durations in ms, springs), so every entrance, exit and celebration moves
 * the same way. Pure numbers, no React Native here: the spring's overshoot is unit-tested
 * (test/mobile-motion.test.ts). Easing curves live in ./easing.ts.
 */
export const duration = {
  /** Sheets, toasts and cards arriving. */
  enter: 220,
  /** Anything leaving: a short fade, never a slide. */
  exit: 150,
  /** The celebration's bloom of colored dots. */
  bloom: 700,
} as const;

/** How long confirmations stay before they leave on their own (paused while hovered or focused). */
export const linger = {
  toast: 4500,
  /** A toast with Undo or another action: a little longer, so there's time to reach it. */
  toastWithAction: 6000,
  celebration: 3800,
  celebrationWithAction: 6500,
} as const;

/**
 * The celebration check's spring: settles with a small overshoot (about 15%), not a bounce.
 * React Native's friction/tension, as Animated.spring takes them.
 */
export const celebrationSpring = { friction: 8, tension: 140 } as const;

/**
 * The fraction a friction/tension spring overshoots its target by, from React Native's
 * conversion (stiffness = (tension − 30) × 3.62 + 194, damping = (friction − 8) × 3 + 25, mass 1).
 */
export function springOvershoot({ friction, tension }: { friction: number; tension: number }): number {
  const stiffness = (tension - 30) * 3.62 + 194;
  const damping = (friction - 8) * 3 + 25;
  const zeta = damping / (2 * Math.sqrt(stiffness));
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}
