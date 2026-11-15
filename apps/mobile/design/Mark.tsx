import Svg, { Rect } from 'react-native-svg';
import { memberPalette } from './tokens';

/** The household mark: three lanes, one per person, in the household's own colors. */
export function Mark({ size = 26, colors }: { size?: number; colors?: string[] }) {
  const [a, b, c] = [
    colors?.[0] ?? memberPalette[0],
    colors?.[2] ?? memberPalette[2],
    colors?.[1] ?? memberPalette[1],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26" aria-hidden>
      <Rect x={2} y={4} width={15} height={4.5} rx={2.25} fill={a} />
      <Rect x={6} y={10.75} width={18} height={4.5} rx={2.25} fill={b} />
      <Rect x={2} y={17.5} width={12} height={4.5} rx={2.25} fill={c} />
    </Svg>
  );
}
