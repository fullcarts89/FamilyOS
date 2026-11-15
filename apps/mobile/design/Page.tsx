import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useLayout } from './layout';
import { Text } from './Text';
import { color } from './tokens';

/** A scrolling page inside the app shell, with the right gutters for the window width. */
export function Page({
  children,
  refreshControl,
  maxWidth = 1360,
  style,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { kind } = useLayout();
  const pad = kind === 'desktop' ? 40 : kind === 'tablet' ? 28 : 16;
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{
        paddingHorizontal: pad,
        paddingTop: kind === 'phone' ? 18 : 36,
        // Clear the floating capture button on phones.
        paddingBottom: kind === 'phone' ? 120 : 80,
      }}
      keyboardShouldPersistTaps="handled"
      {...(refreshControl && { refreshControl })}
    >
      <View style={[styles.column, { maxWidth }, style]}>{children}</View>
    </ScrollView>
  );
}

/** Kicker, page title (Fraunces) and one quiet line. */
export function PageHeader({
  kicker,
  title,
  lead,
  action,
}: {
  kicker?: string;
  title: string;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  const { phone } = useLayout();
  return (
    <View style={[styles.header, phone && styles.headerPhone]}>
      <View style={styles.headerText}>
        {kicker ? (
          <Text variant="kicker" tone="muted">
            {kicker}
          </Text>
        ) : null}
        <Text variant="hero">{title}</Text>
        {lead ? (
          typeof lead === 'string' ? (
            <Text variant="lead" tone="muted" style={styles.lead}>
              {lead}
            </Text>
          ) : (
            lead
          )
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Centered loading indicator for a page's first load. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator color={color.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.ground },
  column: { width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  headerPhone: { gap: 10 },
  headerText: { gap: 8, flexShrink: 1, minWidth: 260 },
  lead: { maxWidth: 680 },
  loading: { paddingVertical: 64, alignItems: 'center' },
});
