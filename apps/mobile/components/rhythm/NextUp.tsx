import { router } from 'expo-router';
import { CalendarDays, Car, CircleCheck, Moon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius, shadow, space, touch } from '../../design/tokens';
import type { Occurrence, RhythmLaneView, RhythmTaskView } from '../../lib/api';
import type { People, Person } from '../../lib/people';
import { CARE_VERB, rangeOf, timeOf } from '../../lib/rhythm';
import { isOpen } from '../../lib/tasks';
import { splitTonight, textShade } from './today-model';

export interface NextEntry {
  key: string;
  startsAt: string;
  endsAt: string;
  title: string;
  sub: string;
  people: Person[];
  kind: 'event' | 'care' | 'task' | 'imported';
  occurrence?: Occurrence;
  task?: RhythmTaskView;
}

/** Everything timed today, in order: events (one per occurrence), handoffs and timed tasks. */
export function dayEntries(
  lanes: (Pick<RhythmLaneView, 'occurrences'> & { tasks?: { timed: RhythmTaskView[] } })[],
  people: People,
  timeZone: string,
): NextEntry[] {
  const seen = new Set<string>();
  const out: NextEntry[] = [];
  for (const lane of lanes) {
    for (const o of lane.occurrences) {
      if (o.allDay || seen.has(o.key)) continue;
      seen.add(o.key);
      const who = o.memberIds.map((id) => people.byId(id)).filter((p): p is Person => !!p);
      const adults = who.filter((p) => !p.caredFor);
      const child = people.byId(o.careMemberId);
      const care = !!(o.careAction && child);
      const doer = adults[0];
      const title =
        care && o.careAction && child
          ? doer
            ? `${doer.isMe ? 'You' : doer.name} ${o.careAction === 'drop_off' ? (doer.isMe ? 'drop' : 'drops') : doer.isMe ? 'pick' : 'picks'} ${child.name} ${o.careAction === 'drop_off' ? 'off' : 'up'}`
            : `${child.name}’s ${CARE_VERB[o.careAction]}: nobody yet`
          : o.title;
      const where = o.carePlace ?? o.location;
      out.push({
        key: o.key,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        title,
        sub: [
          rangeOf(o.startsAt, o.endsAt, timeZone),
          care ? where : who.map((p) => (p.isMe ? 'You' : p.name)).join(', '),
          !care ? where : null,
          o.readOnly && o.source ? `${o.source.label} calendar` : null,
          o.cover ? 'covered' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        people: care && doer ? [doer, ...(child ? [child] : [])] : who,
        kind: o.readOnly ? 'imported' : care ? 'care' : 'event',
        occurrence: o,
      });
    }
    for (const t of lane.tasks?.timed ?? []) {
      if (seen.has(t.id) || !t.dueAt || !isOpen(t)) continue;
      seen.add(t.id);
      const owner = people.byId(t.ownerMemberId);
      out.push({
        key: t.id,
        startsAt: t.dueAt,
        endsAt: t.dueAt,
        title: t.title,
        sub: `Due ${timeOf(t.dueAt, timeZone)} · ${owner ? (owner.isMe ? 'You' : owner.name) : 'Either of you'}`,
        people: owner ? [owner] : [],
        kind: 'task',
        task: t,
      });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.key.localeCompare(b.key));
}

/**
 * Now and the next few things, so the day's responsibilities are visible without scrolling a tall
 * grid. Each row is the time, whose it is (their colors) and what it is. With `tonight`, things
 * that start at or after 5pm household time read as one block under "Tonight": dinner, bath,
 * bedtime and the evening handoffs. `only="tonight"` shows just that block (tablet and desktop).
 */
export function NextUp({
  entries,
  now,
  timeZone,
  limit = 4,
  onOpen,
  tonight: group = false,
  only,
}: {
  entries: NextEntry[];
  now: Date;
  timeZone: string;
  limit?: number;
  onOpen: (o: Occurrence) => void;
  /** Group the evening under a "Tonight" heading. */
  tonight?: boolean;
  only?: 'tonight';
}) {
  const t = now.getTime();
  const split = group || only ? splitTonight(entries, now, timeZone) : null;
  const soon = only
    ? []
    : (
        split?.soon ??
        entries.filter(
          (e) => new Date(e.endsAt).getTime() > t || new Date(e.startsAt).getTime() >= t,
        )
      ).slice(0, limit);
  const evening = split?.tonight ?? [];
  return (
    <View style={styles.card}>
      {soon.length ? (
        <Rows label="Next up today" entries={soon} t={t} timeZone={timeZone} onOpen={onOpen} />
      ) : null}
      {evening.length ? (
        <>
          {!only ? (
            <View style={[styles.tonightHead, soon.length > 0 && styles.tonightRule]}>
              <Moon size={15} strokeWidth={2.4} color={color.ink} />
              <Text variant="kicker" role="heading" aria-level={3}>
                Tonight
              </Text>
              <Text variant="meta" tone="muted">
                from 5pm
              </Text>
            </View>
          ) : null}
          <Rows label="Tonight" entries={evening} t={t} timeZone={timeZone} onOpen={onOpen} />
        </>
      ) : null}
    </View>
  );
}

function Rows({
  label,
  entries,
  t,
  timeZone,
  onOpen,
}: {
  label: string;
  entries: NextEntry[];
  t: number;
  timeZone: string;
  onOpen: (o: Occurrence) => void;
}) {
  return (
    <View role="list" aria-label={label}>
      {entries.map((e, i) => {
        const started = new Date(e.startsAt).getTime() <= t;
        const time = timeOf(e.startsAt, timeZone);
        const Icon =
          e.kind === 'care'
            ? Car
            : e.kind === 'task'
              ? CircleCheck
              : e.kind === 'imported'
                ? CalendarDays
                : null;
        const lead = e.people[0]?.color ?? color.ink;
        return (
          <View
            key={e.key}
            role="listitem"
            style={[styles.item, i === entries.length - 1 && styles.last]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${started ? 'Now' : time}: ${e.title}. ${e.sub}`}
              onPress={() =>
                e.occurrence
                  ? onOpen(e.occurrence)
                  : e.task && router.push({ pathname: '/item/[id]', params: { id: e.task.id } })
              }
              style={(s: PressState) => [styles.row, s.pressed && styles.pressed]}
            >
              <View style={styles.time}>
                {started ? (
                  <View style={styles.nowTag}>
                    <Text variant="small" tone="onInk">
                      Now
                    </Text>
                  </View>
                ) : (
                  <Text variant="h3" numberOfLines={1}>
                    {time.replace(/am|pm/, '')}
                    <Text variant="small" tone="muted">
                      {time.slice(-2)}
                    </Text>
                  </Text>
                )}
              </View>
              <View style={[styles.bar, { backgroundColor: lead }]}>
                {e.people[1] ? (
                  <View style={[styles.barHalf, { backgroundColor: e.people[1].color }]} />
                ) : null}
              </View>
              <View style={styles.text}>
                <View style={styles.titleRow}>
                  {Icon ? <Icon size={15} strokeWidth={2.4} color={textShade(lead)} /> : null}
                  <Text variant="title" style={styles.title}>
                    {e.title}
                  </Text>
                </View>
                <Text variant="meta" tone="muted">
                  {e.sub}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingHorizontal: space[4],
    boxShadow: shadow.card,
  },
  item: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  last: { borderBottomWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touch + space[3],
    paddingVertical: space[2],
  },
  pressed: { opacity: 0.7 },
  time: { width: space[10] + space[1] },
  nowTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  bar: { width: space[1], alignSelf: 'stretch', borderRadius: 2, overflow: 'hidden' },
  barHalf: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] - 2 },
  title: { flexShrink: 1 },
  tonightHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingTop: space[4],
    paddingBottom: space[1],
  },
  tonightRule: { borderTopWidth: 2, borderTopColor: color.ink },
});
