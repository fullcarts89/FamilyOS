import { STATUS_PRESENTATION, describeDue, type WorkItemStatus } from '@familyos/domain';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import type { WorkItem } from '../lib/api';
import { useHousehold } from '../lib/household';
import { useTheme } from '../lib/theme';

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const t = useTheme();
  const { label, tone } = STATUS_PRESENTATION[status];
  const colors = t.tones[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: colors.bg }]}
      accessibilityLabel={`Status: ${label}`}
    >
      <Text style={[styles.badgeText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

export function ItemRow({ item, today }: { item: WorkItem; today: string }) {
  const t = useTheme();
  const { memberName, timeZone } = useHousehold();
  const owner = memberName(item.ownerMemberId);
  const due = describeDue(item, today, timeZone);
  const doneBy =
    item.completedByMemberId && item.completedByMemberId !== item.ownerMemberId
      ? `done by ${memberName(item.completedByMemberId) ?? 'someone'}`
      : null;
  const meta = [owner, doneBy, due, item.visibility === 'private' ? 'Private' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={2}>
          {item.type === 'project' ? '▦ ' : item.recurrenceRuleId ? '↻ ' : ''}
          {item.title}
        </Text>
        {meta ? <Text style={[styles.rowMeta, { color: t.muted }]}>{meta}</Text> : null}
      </View>
      <StatusBadge status={item.status} />
    </Pressable>
  );
}

export function Section({
  title,
  empty,
  row,
  children,
}: {
  title: string;
  empty?: string;
  /** Lay children out as wrapping chips instead of a list. */
  row?: boolean;
  children?: ReactNode[];
}) {
  const t = useTheme();
  const hasItems = Array.isArray(children) && children.length > 0;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: t.muted }]}>
        {title}
      </Text>
      {hasItems ? (
        row ? (
          <View style={styles.wrap}>{children}</View>
        ) : (
          children
        )
      ) : empty ? (
        <Text style={[styles.empty, { color: t.muted }]}>{empty}</Text>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? t.accent : t.border,
          backgroundColor: selected ? t.accent : t.surface,
        },
      ]}
    >
      <Text style={{ color: selected ? t.onAccent : t.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/** Scrollable screen with a bottom action bar inside one-handed reach. */
export function ListScreen({
  children,
  footer,
  refreshControl,
}: {
  children: ReactNode;
  footer?: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} {...(refreshControl && { refreshControl })}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { borderTopColor: t.border, backgroundColor: t.background }]}>
          <View style={[styles.column, styles.footerColumn]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, paddingTop: 64 },
  // Lists stay readable on a computer: one centered column, never wider than this.
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 20 },
  footer: { padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth },
  footerColumn: { gap: 10 },
  section: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowMeta: { fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, maxWidth: 150 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
});
