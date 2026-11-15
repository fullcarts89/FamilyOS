import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { hitSlopFor, type PressState } from './Button';
import { Text } from './Text';
import { color, radius } from './tokens';

/**
 * A choice chip (owner, day, schedule). Selected chips are ink. With `accent`, the selected chip
 * takes that color instead (a person's own color when choosing who).
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  leading,
  accent,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  leading?: ReactNode;
  accent?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const on = accent ?? color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(36)}
      style={(state: PressState) => [
        styles.chip,
        {
          backgroundColor: selected ? on : color.surface,
          borderColor: selected ? on : state.hovered ? color.ink : color.line2,
        },
        disabled && { opacity: 0.4 },
        state.pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {leading}
      {Icon ? <Icon size={15} strokeWidth={2.2} color={selected ? color.onInk : color.ink} /> : null}
      <Text variant="label" style={styles.text} color={selected ? color.onInk : color.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A read-only chip for parsed values: dashed until a value is found, then solid. */
export function TagChip({ label, on, icon: Icon }: { label: string; on: boolean; icon?: LucideIcon }) {
  return (
    <View
      style={[
        styles.tag,
        on
          ? { borderColor: color.ink, backgroundColor: color.surface, borderStyle: 'solid' }
          : { borderColor: color.line2, borderStyle: 'dashed' },
      ]}
    >
      {Icon ? <Icon size={14} strokeWidth={2.1} color={on ? color.ink : color.faint} /> : null}
      <Text variant="small" style={styles.tagText} color={on ? color.ink : color.faint}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    cursor: 'pointer',
  },
  text: { fontSize: 13.5 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  tagText: { fontSize: 12.5 },
});
