/**
 * Family Rhythm design tokens: direction C's structure with A's warmth
 * (docs/plan/redesign-family-rhythm.md). One ink accent for primary actions; each member's own
 * color is the color system for ownership. Attention is hatching, never another hue. No gradients.
 */
export const color = {
  ground: '#F7F5F0',
  surface: '#FFFFFF',
  /** Track and lane fill, segmented control background. */
  lane: '#EFECE5',
  ink: '#17201B',
  inkHover: '#2B3731',
  muted: '#676E68',
  faint: '#9BA09A',
  hairline: '#E6E2D9',
  line2: '#D6D1C6',
  scrim: 'rgba(23, 32, 27, 0.32)',
  /** Errors only (form problems, failed requests). Lateness uses hatching instead. */
  danger: '#A83E2C',
  dangerTint: '#F8E6E1',
  onInk: '#FFFFFF',
} as const;

/** Member colors when a member has none stored yet: coral, blue, marigold, sage, plum, teal. */
export const memberPalette = ['#D2553F', '#2F6FB3', '#D99A1C', '#5E8A4E', '#8A5A9E', '#2E8A86'];

/** A light tint of a member color for backgrounds (mixes the color with white). */
export function tint(hex: string, strength = 0.14): string {
  const n = hex.replace('#', '');
  const full =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n.slice(0, 6);
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  const mixed = rgb.map((c) => Math.round(255 - (255 - c) * strength));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** Font family names, registered by `useAppFonts`. One family per weight works on every platform. */
export const font = {
  display: 'Bricolage-700',
  displayHeavy: 'Bricolage-800',
  displaySemi: 'Bricolage-600',
  serif: 'Fraunces-500',
  serifRegular: 'Fraunces-400',
  ui: 'Figtree-500',
  uiRegular: 'Figtree-400',
  uiSemi: 'Figtree-600',
  uiBold: 'Figtree-700',
  uiHeavy: 'Figtree-800',
} as const;

/** Letter spacing in points from an em value (display type stays at or above -0.02em). */
export const em = (size: number, value: number) => Math.round(size * value * 100) / 100;

export const shadow = {
  raised: '0px 1px 2px rgba(23, 32, 27, 0.08), 0px 0px 0px 1px #E6E2D9',
  card: '0px 1px 2px rgba(23, 32, 27, 0.05)',
  sheet: '0px 24px 60px rgba(23, 32, 27, 0.24)',
  toast: '0px 12px 30px rgba(23, 32, 27, 0.26)',
  fab: '0px 10px 24px rgba(23, 32, 27, 0.30)',
  menu: '0px 0px 0px 1px #E6E2D9, 0px 14px 34px rgba(23, 32, 27, 0.14)',
} as const;

/** Layout breakpoints by window width. */
export const breakpoint = { tablet: 760, desktop: 1100 } as const;

/** The minimum size of anything you can tap. */
export const touch = 44;
