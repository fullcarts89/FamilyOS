import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useLayout } from './layout';
import { color, em, font } from './tokens';

/**
 * Type scale. Fraunces (A's warmth): greetings, page and section titles. Bricolage Grotesque
 * (C's structure): numerals, dates, people's names on columns (tracking -0.02em). Figtree: all UI.
 */
const variants = {
  /** Page title: "Who's carrying what". */
  hero: { fontFamily: font.serif, fontSize: 46, lineHeight: 52, letterSpacing: em(46, -0.015) },
  /** Fraunces greeting: "Good morning, Sam". */
  greeting: { fontFamily: font.serif, fontSize: 46, lineHeight: 52, letterSpacing: em(46, -0.015) },
  /** Fraunces chapter or panel title. */
  chapter: { fontFamily: font.serif, fontSize: 24, lineHeight: 30, letterSpacing: em(24, -0.01) },
  /** Section heading: "Projects", "Routines". */
  h2: { fontFamily: font.serif, fontSize: 24, lineHeight: 30, letterSpacing: em(24, -0.01) },
  /** Column heading, a person's name, a card title. */
  h3: { fontFamily: font.display, fontSize: 19, lineHeight: 24, letterSpacing: em(19, -0.02) },
  /** Display numerals: dates and times. */
  numeral: { fontFamily: font.displayHeavy, fontSize: 52, lineHeight: 52, letterSpacing: em(52, -0.02) },
  /** Row title. */
  title: { fontFamily: font.uiSemi, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: font.ui, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.uiBold, fontSize: 15, lineHeight: 22 },
  /** Quiet supporting line under titles. */
  lead: { fontFamily: font.ui, fontSize: 16, lineHeight: 23 },
  meta: { fontFamily: font.uiSemi, fontSize: 13, lineHeight: 17 },
  small: { fontFamily: font.uiSemi, fontSize: 12, lineHeight: 16 },
  /** Uppercase label: group names, kickers. */
  kicker: {
    fontFamily: font.uiBold,
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  label: { fontFamily: font.uiBold, fontSize: 14, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

/** Smaller sizes on phones for the large display styles. */
const phoneVariants: Partial<Record<Variant, TextStyle>> = {
  hero: { fontSize: 31, lineHeight: 36, letterSpacing: em(31, -0.01) },
  greeting: { fontSize: 31, lineHeight: 36, letterSpacing: em(31, -0.01) },
  numeral: { fontSize: 40, lineHeight: 40, letterSpacing: em(40, -0.02) },
  h2: { fontSize: 21, lineHeight: 26 },
  chapter: { fontSize: 21, lineHeight: 26 },
};

export type Variant = keyof typeof variants;
export type Tone = 'ink' | 'muted' | 'faint' | 'danger' | 'onInk';

const tones: Record<Tone, string> = {
  ink: color.ink,
  muted: color.muted,
  faint: color.faint,
  danger: color.danger,
  onInk: color.onInk,
};

export function Text({
  variant = 'body',
  tone = 'ink',
  color: explicit,
  center,
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone; color?: string; center?: boolean }) {
  const { phone } = useLayout();
  const heading =
    variant === 'hero' || variant === 'greeting' || variant === 'h2' || variant === 'chapter';
  return (
    <RNText
      {...(heading && { accessibilityRole: 'header' as const })}
      {...rest}
      style={[
        variants[variant],
        phone && phoneVariants[variant],
        { color: explicit ?? tones[tone] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}
