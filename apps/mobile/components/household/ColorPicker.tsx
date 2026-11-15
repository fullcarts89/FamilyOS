import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { hitSlopFor, type PressState } from '../../design/Button';
import { choosablePalette, color } from '../../design/tokens';

/** A row of color swatches; the chosen one carries a check. Colors others use are marked taken. */
export function ColorPicker({
  value,
  onChange,
  taken = [],
  label = 'Color',
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Colors already someone else's (still choosable, shown smaller). */
  taken?: string[];
  label?: string;
}) {
  const upper = value.toUpperCase();
  const used = new Set(taken.map((t) => t.toUpperCase()));
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choosablePalette.map((hex) => {
        const on = hex.toUpperCase() === upper;
        const other = used.has(hex.toUpperCase()) && !on;
        return (
          <Pressable
            key={hex}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label} ${hex}${other ? ', someone else’s' : ''}`}
            onPress={() => onChange(hex)}
            hitSlop={hitSlopFor(34)}
            style={(s: PressState) => [
              styles.swatch,
              { backgroundColor: hex },
              on && styles.on,
              other && styles.taken,
              s.hovered && !on && styles.hover,
            ]}
          >
            {on ? <Check size={16} strokeWidth={3} color={color.onInk} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  on: { borderWidth: 3, borderColor: color.surface, boxShadow: `0px 0px 0px 2px ${color.ink}` },
  taken: { transform: [{ scale: 0.78 }], opacity: 0.75 },
  hover: { transform: [{ scale: 1.08 }] },
});
