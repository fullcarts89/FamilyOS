import { Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { GroupLabel } from '../../design/Section';
import { Text } from '../../design/Text';
import type { WorkItem } from '../../lib/api';
import type { Person } from '../../lib/people';
import { WHEN_LABEL, WHEN_ORDER, type When } from '../../lib/tasks';
import type { SettlePhase } from '../../lib/use-settle';
import { TaskRow } from './TaskRow';

/**
 * One person's list (or the shared one): what they have, grouped by when. No scores or
 * comparisons: the same number of things is never the same amount of work.
 */
export function PersonColumn({
  person,
  title,
  sub,
  groups,
  today,
  onComplete,
  onReopen,
  onAssign,
  onReschedule,
  onAdd,
  sharedColors,
  showHeader = true,
  contextOf,
  settling,
}: {
  /** null for the shared list. */
  person: Person | null;
  title: string;
  sub: string;
  groups: Record<When, WorkItem[]>;
  today: string;
  onComplete: (item: WorkItem) => void;
  /** Ticking a just-finished row again (while it's still showing) reopens it. */
  onReopen?: (item: WorkItem) => void;
  onAssign: (item: WorkItem, owner: string | null) => void;
  onReschedule: (item: WorkItem, dueOn: string, label: string) => void;
  onAdd: () => void;
  sharedColors?: [string, string];
  showHeader?: boolean;
  /** Extra meta for a row: a project step shows its project's name. */
  contextOf?: (item: WorkItem) => string | undefined;
  /** Just-finished rows still showing, and whether each is fading out. */
  settling?: ReadonlyMap<string, SettlePhase>;
}) {
  const empty = WHEN_ORDER.every((w) => groups[w].length === 0);
  return (
    <View style={styles.column}>
      {showHeader ? (
        <View style={styles.head}>
          {person ? (
            <Avatar person={person} size={36} />
          ) : (
            <Either size={36} colors={sharedColors} />
          )}
          <View style={styles.headText}>
            <Text variant="h3" style={styles.name}>
              {title}
            </Text>
            <Text variant="meta" tone="muted">
              {sub}
            </Text>
          </View>
        </View>
      ) : null}
      {empty ? (
        <Text variant="body" tone="muted" style={styles.empty}>
          {person?.isMe
            ? 'Nothing on your list. Enjoy it.'
            : person
              ? `Nothing on ${person.name}’s list right now.`
              : 'Nothing up for grabs.'}
        </Text>
      ) : (
        WHEN_ORDER.map((when) => {
          const rows = groups[when];
          if (rows.length === 0) return null;
          return (
            <View key={when}>
              <GroupLabel
                label={
                  when === 'waiting'
                    ? 'Waiting on someone else'
                    : when === 'late'
                      ? 'Running late'
                      : WHEN_LABEL[when]
                }
                count={rows.length}
                late={when === 'late'}
              />
              {rows.map((item, i) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  today={today}
                  onComplete={onComplete}
                  onReopen={onReopen}
                  onAssign={onAssign}
                  onReschedule={onReschedule}
                  context={contextOf?.(item)}
                  last={i === rows.length - 1}
                  settling={settling?.get(item.id)}
                />
              ))}
            </View>
          );
        })
      )}
      <Button
        title="Add"
        variant="quiet"
        size="sm"
        icon={Plus}
        onPress={onAdd}
        accessibilityLabel={`Add something to ${person ? (person.isMe ? 'your list' : `${person.name}’s list`) : 'the shared list'}`}
        style={styles.add}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: 22, lineHeight: 26 },
  empty: { paddingVertical: 18 },
  add: { marginTop: 8 },
});
