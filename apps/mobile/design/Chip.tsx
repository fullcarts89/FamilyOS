import type { LucideIcon } from 'lucide-react-native';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { HitArea, hitSlopFor, type PressState } from './Button';
import { solidFill, textOn } from './contrast';
import { Text } from './Text';
import { color, radius, touch } from './tokens';

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
  trailing,
  expanded,
  ref,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  leading?: ReactNode;
  accent?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** After the label (a dropdown's chevron). */
  trailing?: ReactNode;
  /**
   * Set for a chip that opens something below it (a dropdown): it says open or closed instead of
   * pressed, and its label says what's chosen.
   */
  expanded?: boolean;
  ref?: Ref<ComponentRef<typeof View>>;
}) {
  // A person's color behind white or ink text: deepened just enough to read.
  const on = accent ? solidFill(accent) : color.ink;
  const fg = selected ? textOn(on) : color.ink;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // A toggle: pressed on the web (aria-selected isn't allowed on buttons), selected on iPhone.
      accessibilityState={
        Platform.OS === 'web'
          ? { disabled: !!disabled }
          : { selected, disabled: !!disabled, expanded }
      }
      aria-pressed={Platform.OS === 'web' && expanded === undefined ? selected : undefined}
      aria-expanded={expanded}
      aria-disabled={!!disabled}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(36, touch)}
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
      <HitArea slop={hitSlopFor(36, touch)} border={1.5} />
      {leading}
      {Icon ? <Icon size={15} strokeWidth={2.2} color={fg} /> : null}
      <Text variant="label" style={styles.text} color={fg}>
        {label}
      </Text>
      {trailing}
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
