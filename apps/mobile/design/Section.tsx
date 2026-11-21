import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Hatch } from './Hatch';
import { Text } from './Text';
import { color } from './tokens';

/** A section heading in Bricolage, a quiet subline beside it, and an ink rule underneath. */
export function SectionHeader({
  title,
  sub,
  action,
  rule = true,
  style,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.head, rule && styles.rule, style]}>
      <View style={styles.titles}>
        <Text variant="h2">{title}</Text>
        {sub ? (
          <Text variant="meta" tone="muted" style={styles.sub}>
            {sub}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/**
 * A small uppercase group label: "RUNNING LATE". Late groups carry the hatch mark. No counts: side
 * by side, one adult's "3" against the other's "1" reads as a score.
 */
export function GroupLabel({
  label,
  late,
  style,
}: {
  label: string;
  late?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, style]} accessibilityRole="header" accessibilityLabel={label}>
      {late ? <Hatch width={15} height={9} radius={3} /> : null}
      <Text variant="kicker" tone={late ? 'ink' : 'muted'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 14,
  },
  rule: { borderBottomWidth: 2, borderBottomColor: color.ink },
  titles: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 14, rowGap: 2, flexShrink: 1 },
  sub: { fontSize: 13.5 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 16, paddingBottom: 6 },
});
