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

/** A small uppercase group label with a count: "LATE 2". Late groups carry the hatch mark. */
export function GroupLabel({
  label,
  count,
  late,
  style,
}: {
  label: string;
  count?: number;
  late?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.group, style]}
      accessibilityRole="header"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
    >
      {late ? <Hatch width={15} height={9} radius={3} /> : null}
      <Text variant="kicker" tone={late ? 'ink' : 'muted'}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="kicker" tone="faint">
          {count}
        </Text>
      ) : null}
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
