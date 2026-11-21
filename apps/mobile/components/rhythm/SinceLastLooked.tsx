import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, space, touch } from '../../design/tokens';
import type { Activity } from '../../lib/api';
import type { People } from '../../lib/people';
import { activityLink, activityWords, type ActivityEntry } from '../reset/coordination';

/** "2 hours ago", "yesterday", "Tuesday". */
export function ago(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * One plain sentence for what someone did: appreciation in words, never counted. Covers asked
 * for, accepted and declined, and decisions voted on and settled, are lines too; anything this
 * version doesn't know is left out (null) rather than shown wrong.
 */
export function activityLine(a: Activity | ActivityEntry, people: People) {
  return activityWords(a, (id) => people.byId(id));
}

/**
 * What changed since you last looked: the other adults' activity from the household's audit
 * trail, newest first. Real events only; nothing is summarized or scored.
 */
export function SinceLastLooked({
  activity,
  people,
  now,
  limit = 6,
}: {
  activity: (Activity | ActivityEntry)[];
  people: People;
  now: Date;
  limit?: number;
}) {
  const lines = activity
    .map((a) => ({ a, line: activityLine(a, people) }))
    .filter(
      (x): x is { a: Activity | ActivityEntry; line: { who: string; rest: string } } => !!x.line,
    )
    .slice(0, limit);
  return (
    <View role="list" aria-label="What changed since you last looked">
      {lines.map(({ a, line }, i, all) => {
        const actor = people.byId(a.actorMemberId);
        const { who, rest } = line;
        const to = activityLink(a);
        const link = to !== null;
        return (
          <View key={a.id} role="listitem">
            <Pressable
              accessibilityRole={link ? 'link' : undefined}
              disabled={!link}
              onPress={() => to && router.push(to)}
              style={(s: PressState) => [
                styles.row,
                i === all.length - 1 && styles.last,
                link && { cursor: 'pointer' },
                s.hovered && link && styles.hover,
              ]}
            >
              <Avatar person={actor} size={24} />
              <Text variant="body" style={styles.text}>
                <Text variant="bodyStrong">{who}</Text> {rest}
              </Text>
              <Text variant="small" tone="muted">
                {ago(a.at, now)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touch,
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  last: { borderBottomWidth: 0 },
  hover: { opacity: 0.8 },
  text: { flex: 1 },
});
