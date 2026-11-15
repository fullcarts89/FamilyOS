import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, memberPalette, tint } from './tokens';

/** Three lanes with soft blocks: the household's rhythm as a quiet illustration. */
export function LanesArt({
  lanes = DEFAULT_LANES,
  colors = [memberPalette[0], memberPalette[2], memberPalette[1]],
  height = 22,
  style,
}: {
  /** Blocks per lane as [left %, width %]. */
  lanes?: [number, number][][];
  colors?: (string | undefined)[];
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.art, style]} aria-hidden importantForAccessibility="no-hide-descendants">
      {lanes.map((blocks, i) => {
        const c = colors[i % colors.length] ?? color.ink;
        return (
          <View key={i} style={[styles.lane, { height, borderRadius: height / 2 }]}>
            {blocks.map(([left, width], j) => (
              <View
                key={j}
                style={[
                  styles.block,
                  {
                    left: `${left}%`,
                    width: `${width}%`,
                    borderRadius: height / 2,
                    backgroundColor: j % 2 === 0 ? c : tint(c, 0.35),
                  },
                ]}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const DEFAULT_LANES: [number, number][][] = [
  [
    [6, 22],
    [36, 14],
    [64, 18],
  ],
  [
    [2, 12],
    [16, 54],
    [74, 20],
  ],
  [
    [10, 30],
    [50, 10],
    [70, 16],
  ],
];

/** A designed empty or "not yet" state: a Fraunces title, one plain sentence and an action. */
export function EmptyState({
  title,
  body,
  action,
  art,
  compact,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  art?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.empty, compact && styles.compact]}>
      {art}
      <Text variant={compact ? 'h3' : 'chapter'}>{title}</Text>
      {body ? (
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { gap: 8, width: '100%' },
  lane: { backgroundColor: color.lane, position: 'relative', overflow: 'hidden' },
  block: { position: 'absolute', top: 0, bottom: 0 },
  empty: { gap: 10, paddingVertical: 24, alignItems: 'flex-start' },
  compact: { paddingVertical: 12, gap: 6 },
  body: { maxWidth: 520 },
});
