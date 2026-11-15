import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from './Button';
import { Text } from './Text';
import { color, radius, shadow } from './tokens';

/** A pill-shaped segmented control (tabs). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; leading?: ReactNode; trailing?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  /** What the control chooses, for screen readers. */
  label: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={(state: PressState) => [
              styles.option,
              on && styles.on,
              !on && state.hovered && { backgroundColor: 'rgba(255,255,255,0.5)' },
            ]}
          >
            {o.leading}
            <Text variant="label" tone={on ? 'ink' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
            {o.trailing}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: color.lane,
  },
  option: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  on: { backgroundColor: color.surface, boxShadow: shadow.raised },
});
