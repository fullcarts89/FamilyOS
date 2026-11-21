import { describe, expect, it } from 'vitest';
import { contrast, readableOn, solidFill, textOn } from '../apps/mobile/design/contrast';
import { choosablePalette, color, memberPalette, tint } from '../apps/mobile/design/tokens';

/** WCAG 2.2 AA for normal-size text. */
const AA = 4.5;

/** The fills text sits on across the app. */
const BACKGROUNDS = {
  ground: color.ground,
  surface: color.surface,
  lane: color.lane,
} as const;

/** Every token used as a text color on those fills. */
const TEXT_TOKENS = {
  ink: color.ink,
  muted: color.muted,
  faint: color.faint,
  danger: color.danger,
} as const;

describe('text tokens', () => {
  for (const [name, fg] of Object.entries(TEXT_TOKENS)) {
    for (const [bgName, bg] of Object.entries(BACKGROUNDS)) {
      it(`${name} on ${bgName} reads at 4.5:1`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('white reads on the ink, ink-hover and danger fills', () => {
    for (const fill of [color.ink, color.inkHover, color.danger]) {
      expect(contrast(color.onInk, fill), fill).toBeGreaterThanOrEqual(AA);
    }
  });

  it('error text reads on the error tint', () => {
    expect(contrast(color.danger, color.dangerTint)).toBeGreaterThanOrEqual(AA);
  });

  it('faint stays a step lighter than muted, so the hierarchy survives', () => {
    expect(contrast(color.muted, color.ground)).toBeGreaterThan(
      contrast(color.faint, color.ground),
    );
  });
});

describe('member colors', () => {
  it('covers the default and the choosable palettes', () => {
    expect(choosablePalette.slice(0, memberPalette.length)).toEqual(memberPalette);
  });

  for (const hex of choosablePalette) {
    it(`${hex}: an avatar or a selected chip carries 4.5:1 text`, () => {
      const fill = solidFill(hex);
      expect(contrast(textOn(fill), fill)).toBeGreaterThanOrEqual(AA);
    });

    it(`${hex}: as text (a name, "You", a time) it reads on every fill and its own tint`, () => {
      for (const bg of [...Object.values(BACKGROUNDS), tint(hex, 0.1), tint(hex, 0.14)]) {
        expect(contrast(readableOn(hex, bg), bg), bg).toBeGreaterThanOrEqual(AA);
      }
    });
  }
});
