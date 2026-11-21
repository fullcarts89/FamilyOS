import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, space, touch } from '../../design/tokens';
import { api, type Activity } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import type { People } from '../../lib/people';
import {
  activityLink,
  activityWords,
  answeredWords,
  answerTo,
  type ActivityEntry,
} from '../reset/coordination';

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
 * trail, newest first. Real events only; nothing is summarized or scored. A request to cover
 * that you've answered since says so ("· you said yes"), so it doesn't read as still open.
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
  const { household } = useHousehold();
  const meId = household?.memberId ?? null;
  // Your own answers aren't in this list (it's the others' activity): read them when someone
  // asked you to cover something.
  const askedOfMe = activity.filter(
    (a) => a.action === 'event.cover_requested' && a.memberId === meId,
  );
  const since = askedOfMe.map((a) => a.at).sort()[0] ?? null;
  const [mine, setMine] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    if (!household || !since) return;
    let alive = true;
    api<{ activity: ActivityEntry[] }>(
      `/households/${household.id}/activity?since=${encodeURIComponent(since)}&includeMine=true`,
    )
      .then((r) => alive && setMine(r.activity))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [household, since, activity]);

  const lines = activity
    .map((a) => {
      const line = activityLine(a, people);
      return {
        a,
        line: line && { ...line, rest: `${line.rest}${answeredWords(answerTo(a, mine, meId))}` },
      };
    })
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
