/**
 * Readable color pairs (WCAG 2.2, 4.5:1 for text). Member colors are the ownership system, so text
 * and icons on or in them go through these helpers everywhere: avatars, chips, Today's lanes and
 * the headline. No React here, so the rules are unit-tested (test/mobile-contrast.test.ts).
 */

const INK = '#17201B';
const WHITE = '#FFFFFF';

function rgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const full =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((c, i) => Math.round(c + ((y[i] ?? c) - c) * t))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Text on a filled member color: white or ink, whichever reads better. */
export function textOn(fill: string): string {
  return contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK;
}

/**
 * A member color to fill behind text: the color itself when white or ink reads on it at 4.5:1,
 * else the color deepened just enough for white text (coral, sage and teal sit between the two).
 * Always pair it with `textOn(solidFill(hex))`.
 */
export function solidFill(hex: string): string {
  if (Math.max(contrast(WHITE, hex), contrast(INK, hex)) >= 4.5) return hex;
  return readableOn(hex, WHITE);
}

/**
 * A member color deepened toward ink until it reads as small text (or an icon beside text) on
 * `background` at 4.5:1. Keeps the hue, so "5:30" still looks like Maya's.
 */
export function readableOn(hex: string, background = WHITE): string {
  if (contrast(hex, background) >= 4.5) return hex;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(hex, INK, t);
    if (contrast(c, background) >= 4.5) return c;
  }
  return INK;
}

/**
 * Muted text deepened in coarser steps until it reads on a lane or a tint (muted itself already
 * reads on the ground, the surface and the lane fill).
 */
export function textShade(hex: string, background = WHITE): string {
  if (contrast(hex, background) >= 4.5) return hex;
  const from = rgb(hex);
  const to = rgb(INK);
  for (let k = 0.1; k <= 1; k += 0.1) {
    const mixed = from.map((c, i) => Math.round(c + ((to[i] ?? 0) - c) * k));
    const out = `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    if (contrast(out, background) >= 4.5) return out;
  }
  return INK;
}
