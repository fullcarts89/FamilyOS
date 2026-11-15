import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { Person } from '../lib/people';
import { Avatar } from './Avatar';
import { color as tokens } from './tokens';

/**
 * Turn order as a ring: one arc per person in the rotation, the current turn drawn bold and
 * centered at the top, with that person's avatar in the middle. A routine with one owner is a
 * full ring in their color; nobody yet is a dashed ring.
 */
export function RotationRing({
  rotation,
  turn,
  size = 76,
  paused,
}: {
  /** People in turn order. Empty for a routine with a single owner or none. */
  rotation: Person[];
  /** Whose turn it is now (null: anyone). */
  turn: Person | null;
  size?: number;
  paused?: boolean;
}) {
  const c = size / 2;
  const r = size * 0.395;
  const C = 2 * Math.PI * r;
  const n = rotation.length;
  const turnIndex = Math.max(
    0,
    rotation.findIndex((p) => p.id === turn?.id),
  );
  const gap = n > 1 ? 11 : 0;
  const seg = n > 0 ? C / n - gap : C;
  const segDeg = (seg / C) * 360;
  // Rotate so the current turn's arc is centered at twelve o'clock.
  const rotate = n > 1 ? -90 - (turnIndex * 360) / n - segDeg / 2 : -90;
  const avatar = Math.round(size * 0.47);

  return (
    <View style={{ width: size, height: size, opacity: paused ? 0.45 : 1 }} aria-hidden>
      <Svg width={size} height={size}>
        {n > 1 ? (
          <G transform={`rotate(${rotate} ${c} ${c})`}>
            {rotation.map((p, i) => (
              <Circle
                key={`${p.id}-${i}`}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={p.color}
                strokeOpacity={i === turnIndex ? 1 : 0.3}
                strokeWidth={i === turnIndex ? 7 : 4}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.1, seg)} ${C}`}
                strokeDashoffset={-(i * C) / n}
              />
            ))}
          </G>
        ) : (
          <Circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={turn?.color ?? tokens.faint}
            strokeWidth={turn ? 6 : 2}
            strokeDasharray={turn ? undefined : '4 5'}
          />
        )}
      </Svg>
      <View style={[styles.center, { width: size, height: size }]}>
        <Avatar person={turn} size={avatar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
});
