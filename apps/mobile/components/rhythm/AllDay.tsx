import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius, space, touch } from '../../design/tokens';
import type { Occurrence } from '../../lib/api';
import type { People, Person } from '../../lib/people';

/**
 * Today's all-day events ("School closed", a holiday): each with its title and whose it is (a dot
 * in each member's color), in reading order, and each a button that opens it. `band` is the
 * compact strip above the desktop lanes; `lines` is one line per event at the top of a phone's day.
 */
export function AllDay({
  events,
  people,
  onOpen,
  variant,
}: {
  events: Occurrence[];
  people: People;
  onOpen: (o: Occurrence) => void;
  variant: 'band' | 'lines';
}) {
  if (events.length === 0) return null;
  return (
    <View
      role="list"
      aria-label="All day today"
      style={variant === 'band' ? styles.band : styles.lines}
    >
      {events.map((o, i) => {
        const who = o.memberIds.map((id) => people.byId(id)).filter((p): p is Person => !!p);
        const names = who.length ? who.map((p) => (p.isMe ? 'you' : p.name)) : ['everyone'];
        const whose =
          names.length > 1
            ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
            : (names[0] ?? 'everyone');
        return (
          <View
            key={o.key}
            role="listitem"
            style={variant === 'lines' && i < events.length - 1 && styles.lineItem}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`All day: ${o.title}, ${whose}`}
              onPress={() => onOpen(o)}
              style={(s: PressState) => [
                variant === 'band' ? styles.chip : styles.line,
                (s.hovered || s.focused) && styles.hover,
                s.pressed && styles.pressed,
              ]}
            >
              <View style={styles.dots}>
                {(who.length ? who : [null]).slice(0, 3).map((p, j) => (
                  <View
                    key={p?.id ?? j}
                    style={[
                      styles.dot,
                      p ? { backgroundColor: p.color } : { borderWidth: 2, borderColor: color.ink },
                      j > 0 && styles.dotOverlap,
                    ]}
                  />
                ))}
              </View>
              <Text variant="kicker" tone="muted">
                All day
              </Text>
              <Text variant={variant === 'band' ? 'label' : 'title'} style={styles.title}>
                {o.title}
              </Text>
              <Text variant="meta" tone="muted">
                {whose.charAt(0).toUpperCase() + whose.slice(1)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
  lines: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingHorizontal: space[4],
  },
  lineItem: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: touch,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.ground,
    cursor: 'pointer',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: space[2],
    minHeight: touch,
    paddingVertical: space[2],
    cursor: 'pointer',
  },
  hover: { borderColor: color.ink },
  pressed: { opacity: 0.7 },
  dots: { flexDirection: 'row' },
  dot: { width: space[3], height: space[3], borderRadius: space[3] / 2 },
  dotOverlap: { marginLeft: -space[1] },
  title: { flexShrink: 1 },
});
