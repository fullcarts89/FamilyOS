import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color } from '../../design/tokens';
import type { Activity } from '../../lib/api';
import type { People } from '../../lib/people';

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

/** One plain sentence for what someone did: appreciation in words, never counted. */
export function activityLine(a: Activity, people: People): { who: string; rest: string } {
  const actor = people.byId(a.actorMemberId);
  const who = actor ? (actor.isMe ? 'You' : actor.name) : 'Someone';
  const target = people.byId(a.memberId);
  const toWhom = target ? (target.isMe ? 'you' : target.name) : 'someone';
  switch (a.action) {
    case 'task.completed':
      return { who, rest: `handled ${a.title}` };
    case 'routine.done':
      return { who, rest: `did ${a.title}` };
    case 'project.completed':
      return { who, rest: `finished ${a.title}` };
    case 'task.taken':
      return { who, rest: `took on ${a.title}` };
    case 'task.assigned':
      return target?.isMe
        ? { who, rest: `handed you ${a.title}` }
        : { who, rest: `gave ${a.title} to ${toWhom}` };
    case 'routine.swapped':
      return { who, rest: `swapped turns on ${a.title}` };
    case 'event.covered':
      return target?.id === actor?.id
        ? { who, rest: `is covering ${a.title}` }
        : { who, rest: `asked ${toWhom} to cover ${a.title}` };
    case 'member.added':
      return { who, rest: `added ${a.title} to the household` };
  }
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
  activity: Activity[];
  people: People;
  now: Date;
  limit?: number;
}) {
  return (
    <View role="list" aria-label="Since you last looked">
      {activity.slice(0, limit).map((a, i, all) => {
        const actor = people.byId(a.actorMemberId);
        const { who, rest } = activityLine(a, people);
        const link = a.entityType === 'work_item';
        return (
          <View role="listitem" key={a.id}>
            <Pressable
              accessibilityRole={link ? 'link' : undefined}
              disabled={!link}
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: a.entityId } })}
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
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  last: { borderBottomWidth: 0 },
  hover: { opacity: 0.8 },
  text: { flex: 1 },
});
