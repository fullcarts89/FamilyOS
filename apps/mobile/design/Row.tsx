import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PressState } from './Button';
import { Text } from './Text';
import { color } from './tokens';

/**
 * A calm list row: a leading control, the title with quiet meta underneath, and trailing actions.
 * Pressing the row (outside its controls) opens it.
 */
export function Row({
  leading,
  title,
  titleAccessory,
  meta,
  footer,
  trailing,
  onPress,
  accessibilityLabel,
  done,
  last,
  style,
}: {
  leading?: ReactNode;
  title: string;
  titleAccessory?: ReactNode;
  meta?: ReactNode;
  /** Controls under the meta line (kept outside the row's own button). */
  footer?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  done?: boolean;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, last && styles.last, style]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.middle}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={onPress ? 'Opens the details' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={(state: PressState) => [
          styles.main,
          onPress && { cursor: 'pointer' },
          state.hovered && onPress && styles.hover,
        ]}
      >
        <Text
          variant="title"
          tone={done ? 'muted' : 'ink'}
          style={[styles.title, done && styles.struck]}
        >
          {title}
          {titleAccessory ? (
            <>
              {'  '}
              {titleAccessory}
            </>
          ) : null}
        </Text>
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </Pressable>
      {footer}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

/** One piece of row meta. `strong` for today's date, `tone` for muted or faint. */
export function Meta({
  children,
  strong,
  icon,
}: {
  children: ReactNode;
  strong?: boolean;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.metaItem}>
      {icon}
      <Text variant="meta" tone={strong ? 'ink' : 'muted'} style={strong && styles.strong}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  last: { borderBottomWidth: 0 },
  leading: { paddingTop: 0, minHeight: 24, justifyContent: 'center' },
  middle: { flex: 1, minWidth: 0, gap: 6 },
  main: { gap: 3, borderRadius: 6, minHeight: 24 },
  hover: { opacity: 0.86 },
  title: { flexShrink: 1 },
  struck: { textDecorationLine: 'line-through', textDecorationColor: color.line2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 11, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  strong: { fontFamily: 'Figtree-700' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
});
