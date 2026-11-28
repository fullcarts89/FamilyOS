import { calendarWeeks, monthTitle, shiftMonth } from '@familyos/domain';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { longDate, shortDate, weekdayName } from '../lib/dates';
import { IconButton, type PressState } from './Button';
import { Chip } from './Chip';
import { textOn } from './contrast';
import { Text } from './Text';
import { color, radius } from './tokens';

/**
 * A specific day for a task, beyond the quick choices (Today, Tomorrow, Next week): a "Pick a
 * date" chip that drops a month calendar down below its row, the way "Add a time" opens its row.
 * Picking a day closes it. Inline rather than floating, so it scrolls with the sheet or the
 * panel it's in and works the same on the web and iPhone.
 */

const WEB = Platform.OS === 'web';
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "Thu, Dec 17", or "Thu, Jan 7, 2027" in another year. */
export function pickedDateLabel(date: string, today: string): string {
  return `${weekdayName(date).slice(0, 3)}, ${shortDate(date, today)}`;
}

/** The dropdown's open state, and its chip, so focus goes back to the chip once a day is picked. */
export function useDateDropdown() {
  const [open, setOpen] = useState(false);
  const chip = useRef<ComponentRef<typeof View>>(null);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => {
    setOpen(false);
    // The day pressed goes with the calendar: on the web, focus would fall to the page.
    if (WEB) requestAnimationFrame(() => chip.current?.focus());
  }, []);
  return { open, toggle, close, chip };
}

/**
 * The dropdown's chip, beside the quick day chips: "Pick a date" until a day off the quick list
 * is the one chosen, then that day ("Thu, Dec 17"), selected.
 */
export function DateChip({
  value,
  today,
  open,
  onPress,
  chip,
}: {
  /** The chosen day when it isn't one of the quick choices, else null. */
  value: string | null;
  today: string;
  open: boolean;
  onPress: () => void;
  chip: ReturnType<typeof useDateDropdown>['chip'];
}) {
  const label = value ? pickedDateLabel(value, today) : 'Pick a date';
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Chip
      ref={chip}
      label={label}
      icon={CalendarDays}
      selected={!!value}
      expanded={open}
      accessibilityLabel={value ? `Pick a date, ${label}` : label}
      trailing={
        <Chevron size={15} strokeWidth={2.4} color={value ? textOn(color.ink) : color.ink} />
      }
      onPress={onPress}
    />
  );
}

/**
 * The month calendar under the chip: a month at a time from Monday, today ringed, the chosen day
 * filled, days before `min` (today, unless given) not offered.
 */
export function DateCalendar({
  value,
  today,
  min = today,
  onPick,
}: {
  value: string | null;
  today: string;
  min?: string;
  onPick: (date: string) => void;
}) {
  // Opens on the chosen day's month, else the first month there's a day to pick in.
  const [month, setMonth] = useState(() => (value && value >= min ? value : min).slice(0, 7));
  const first = min.slice(0, 7);
  const year = today.slice(0, 4);
  // Opened near the bottom of a sheet or a screen, the whole month scrolls into view (on the web;
  // on iPhone it's a swipe away).
  const panel = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!WEB) return;
    const frame = requestAnimationFrame(() => {
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      (panel.current as unknown as HTMLElement | null)?.scrollIntoView?.({
        block: 'nearest',
        behavior: reduced ? 'auto' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <View ref={panel} style={styles.panel} role="group" aria-label="Pick a date">
      <View style={styles.head}>
        <IconButton
          icon={ChevronLeft}
          label="Previous month"
          disabled={month <= first}
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
        />
        <Text variant="title" aria-live="polite" accessibilityLiveRegion="polite">
          {monthTitle(month)}
        </Text>
        <IconButton
          icon={ChevronRight}
          label="Next month"
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
        />
      </View>
      <View style={styles.week} aria-hidden>
        {WEEKDAY_INITIALS.map((d, i) => (
          <View key={i} style={styles.weekday}>
            <Text variant="small" tone="muted">
              {d}
            </Text>
          </View>
        ))}
      </View>
      {calendarWeeks(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const on = day === value;
            const isToday = day === today;
            const before = day < min;
            const name = `${isToday ? 'Today, ' : ''}${longDate(day)}${day.slice(0, 4) !== year ? `, ${day.slice(0, 4)}` : ''}`;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={name}
                // Like a chip: pressed on the web, selected on iPhone.
                accessibilityState={
                  WEB ? { disabled: before } : { selected: on, disabled: before }
                }
                aria-pressed={WEB ? on : undefined}
                aria-current={isToday ? 'date' : undefined}
                aria-disabled={before}
                disabled={before}
                onPress={() => onPick(day)}
                style={[styles.cell, before && styles.cellBefore]}
              >
                {(s: PressState) => (
                  <View
                    style={[
                      styles.day,
                      isToday && styles.today,
                      !on && !before && s.hovered && styles.hover,
                      on && styles.on,
                      before && styles.before,
                      s.pressed && !before && styles.pressed,
                    ]}
                  >
                    <Text variant="label" color={on ? textOn(color.ink) : color.ink}>
                      {Number(day.slice(8))}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 360,
    padding: 10,
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  // Each day is a full 44pt tap across its column.
  cell: {
    flex: 1,
    minWidth: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  cellBefore: { cursor: 'auto' },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderWidth: 1.5, borderColor: color.ink },
  hover: { backgroundColor: color.lane },
  on: { backgroundColor: color.ink },
  before: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.94 }] },
});
