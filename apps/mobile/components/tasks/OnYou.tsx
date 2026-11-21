import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius, shadow, space, touch } from '../../design/tokens';
import type { WorkItem } from '../../lib/api';
import type { Person } from '../../lib/people';
import type { SettlePhase } from '../../lib/use-settle';
import type { MissedTurns, TodayList } from './lists';
import { MissedRow } from './MissedRow';
import { TaskRow } from './TaskRow';

/**
 * "On you": the signed-in person's own late and due-today things, first, where they can act on
 * them (tick, move to tomorrow, catch up a routine) without scrolling to the lists below. At most
 * `limit` rows, then "N more" to their list in Tasks. Nothing to show, nothing drawn.
 */
export function OnYou({
  me,
  list,
  today,
  limit = 3,
  onComplete,
  onReopen,
  onAssign,
  onReschedule,
  onCatchUp,
  settling,
  contextOf,
}: {
  me: Person;
  list: TodayList | undefined;
  today: string;
  limit?: number;
  onComplete: (item: WorkItem) => void;
  onReopen: (item: WorkItem) => void;
  onAssign: (item: WorkItem, owner: string | null) => void;
  onReschedule: (item: WorkItem, dueOn: string, label: string) => void;
  onCatchUp: (missed: MissedTurns, how: 'done' | 'skip') => Promise<unknown>;
  settling: ReadonlyMap<string, SettlePhase>;
  contextOf: (item: WorkItem) => string | undefined;
}) {
  if (!list) return null;
  const rows: ({ kind: 'missed'; missed: MissedTurns } | { kind: 'item'; item: WorkItem })[] = [
    ...list.missed.map((missed) => ({ kind: 'missed' as const, missed })),
    ...[...list.groups.late, ...list.groups.today].map((item) => ({ kind: 'item' as const, item })),
  ];
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const more = rows.length - shown.length;
  return (
    <View style={styles.card} role="region" aria-label="On you: late and due today">
      <View style={styles.head}>
        <Text variant="h3" role="heading" aria-level={2}>
          On you
        </Text>
        <Text variant="meta" tone="muted">
          Late and due today
        </Text>
      </View>
      {shown.map((r, i) =>
        r.kind === 'missed' ? (
          <MissedRow
            key={r.missed.key}
            missed={r.missed}
            today={today}
            onCatchUp={onCatchUp}
            last={i === shown.length - 1 && more === 0}
          />
        ) : (
          <TaskRow
            key={r.item.id}
            item={r.item}
            today={today}
            onComplete={onComplete}
            onReopen={onReopen}
            onAssign={onAssign}
            onReschedule={onReschedule}
            postpone
            context={contextOf(r.item)}
            last={i === shown.length - 1 && more === 0}
            settling={settling.get(r.item.id)}
          />
        ),
      )}
      {more > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/tasks', params: { section: me.id } })}
          style={(s: PressState) => [styles.more, s.hovered && styles.moreHover]}
        >
          <Text variant="label">{more} more on your list</Text>
          <ArrowRight size={15} color={color.ink} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[1],
    boxShadow: shadow.card,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: space[3],
    paddingBottom: space[1],
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] - 2,
    minHeight: touch,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  moreHover: { opacity: 0.8 },
});
