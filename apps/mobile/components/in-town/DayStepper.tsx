import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Chip } from '../../design/Chip';
import { IconButton } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import { addDays, shortDate, weekdayName } from '../../lib/dates';

/**
 * Choose a day without a calendar grid: the day in words, a day earlier or later, a week later,
 * and (optionally) no day at all ("No end yet"). Large targets; works the same on web and iPhone.
 */
export function DayStepper({
  label,
  value,
  onChange,
  today,
  min,
  none,
}: {
  label: string;
  value: string | null;
  onChange: (date: string | null) => void;
  today: string;
  /** The earliest day allowed (the first day, for a last day). */
  min?: string;
  /** Offer "no day" with this label ("No end yet"). */
  none?: string;
}) {
  const floor = min ?? null;
  const set = (d: string) => onChange(floor && d < floor ? floor : d);
  const words = value
    ? `${weekdayName(value)}, ${shortDate(value, today)}${value === today ? ' (today)' : ''}`
    : (none ?? '');
  return (
    <View style={styles.group}>
      <Text variant="label">{label}</Text>
      {value ? (
        <View style={styles.row}>
          <IconButton
            icon={ChevronLeft}
            label={`${label}: a day earlier`}
            disabled={floor !== null && value <= floor}
            onPress={() => set(addDays(value, -1))}
          />
          <View style={styles.day} accessibilityLiveRegion="polite">
            <Text variant="title">{words}</Text>
          </View>
          <IconButton
            icon={ChevronRight}
            label={`${label}: a day later`}
            onPress={() => set(addDays(value, 1))}
          />
        </View>
      ) : (
        <Text variant="body" tone="muted">
          {words}
        </Text>
      )}
      <View style={styles.chips}>
        {value ? (
          <Chip label="A week later" onPress={() => set(addDays(value, 7))} />
        ) : (
          <Chip label="Pick a day" onPress={() => set(addDays(floor ?? today, 1))} />
        )}
        {none ? (
          <Chip label={none} selected={value === null} onPress={() => onChange(null)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
