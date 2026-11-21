import { useId } from 'react';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { color as tokens } from './tokens';

/**
 * Diagonal hatching: how the app marks lateness, misses and conflicts (instead of another color).
 * Draws a rounded rectangle filled with stripes over a background, with an optional outline.
 */
export function Hatch({
  width,
  height,
  radius = 3,
  stroke = tokens.ink,
  background = tokens.surface,
  outline = true,
  strokeOpacity = 0.5,
}: {
  width: number;
  height: number;
  radius?: number;
  stroke?: string;
  background?: string;
  outline?: boolean;
  strokeOpacity?: number;
}) {
  const id = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const inset = outline ? 0.6 : 0;
  return (
    <Svg width={width} height={height} aria-hidden>
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
          <Path
            d="M-1 1l2-2M0 6l6-6M5 7l2-2"
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={1.3}
          />
        </Pattern>
      </Defs>
      <Rect
        x={inset}
        y={inset}
        width={width - inset * 2}
        height={height - inset * 2}
        rx={radius}
        fill={background}
      />
      <Rect
        x={inset}
        y={inset}
        width={width - inset * 2}
        height={height - inset * 2}
        rx={radius}
        fill={`url(#${id})`}
        {...(outline && { stroke, strokeWidth: 1.2 })}
      />
    </Svg>
  );
}
