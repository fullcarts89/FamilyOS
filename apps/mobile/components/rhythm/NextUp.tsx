import { router } from 'expo-router';
import { CalendarDays, Car, ChevronDown, CircleCheck, Moon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius, shadow, space, touch } from '../../design/tokens';
import type { Occurrence, RhythmLaneView, RhythmTaskView } from '../../lib/api';
import type { People, Person } from '../../lib/people';
import { CARE_VERB, rangeOf, timeOf } from '../../lib/rhythm';
import { isOpen } from '../../lib/tasks';
import { byStart, readableOn, splitTonight } from './today-model';

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

/**
 * Everything timed today, in order: events (one per occurrence), handoffs and timed tasks. A task
 * with a length runs from its time to its end ("5:30–6pm"); one without stays a moment ("Due
 * 5:30pm"). `keep` holds a just-finished task in place for its moment (lib/use-settle.ts).
 */
export function dayEntries(
  lanes: (Pick<RhythmLaneView, 'occurrences'> & { tasks?: { timed: RhythmTaskView[] } })[],
  people: People,
  timeZone: string,
  { keep }: { keep?: (id: string) => boolean } = {},
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
      if (seen.has(t.id) || !t.dueAt || !(isOpen(t) || keep?.(t.id))) continue;
      seen.add(t.id);
      const owner = people.byId(t.ownerMemberId);
      const who = owner ? (owner.isMe ? 'You' : owner.name) : 'Either of you';
      const block = t.block ?? null;
      out.push({
        key: t.id,
        startsAt: block?.startsAt ?? t.dueAt,
        endsAt: block?.endsAt ?? t.dueAt,
        title: t.title,
        sub: block
          ? `${rangeOf(block.startsAt, block.endsAt, timeZone)} · ${who}`
          : `Due ${timeOf(t.dueAt, timeZone)} · ${who}`,
        people: owner ? [owner] : [],
        kind: 'task',
        task: t,
      });
    }
  }
  // By instant, so the hour that repeats when the clocks go back sorts right.
  return out.sort(byStart);
}

/**
 * Now and the next few things, so the day's responsibilities are visible without scrolling a tall
 * grid. Each row is the time, whose it is (their colors) and what it is. With `tonight`, things
 * that start at or after 5pm household time read as one block under "Tonight 5:30–10pm":
 * dinner, bath, bedtime and the evening handoffs, at most `tonightLimit` of them and then "N more
 * tonight". `middle` goes between the two (your own late and due-today items on phones).
 */
export function NextUp({
  entries,
  now,
  timeZone,
  limit = 3,
  label = 'Next up today',
  onOpen,
  tonight: group = false,
  tonightLimit = 3,
  onMoreTonight,
  middle,
}: {
  entries: NextEntry[];
  now: Date;
  timeZone: string;
  limit?: number;
  label?: string;
  onOpen: (o: Occurrence) => void;
  /** Group the evening under a "Tonight" heading. */
  tonight?: boolean;
  tonightLimit?: number;
  /** Where "N more tonight" leads (the whole day). */
  onMoreTonight?: () => void;
  middle?: ReactNode;
}) {
  const t = now.getTime();
  const split = group ? splitTonight(entries, now, timeZone) : null;
  const soon = (
    split?.soon ??
    entries.filter((e) => new Date(e.endsAt).getTime() > t || new Date(e.startsAt).getTime() >= t)
  ).slice(0, limit);
  const evening = split?.tonight ?? [];
  const shown = evening.slice(0, tonightLimit);
  const more = evening.length - shown.length;
  const first = evening[0];
  const last = evening.reduce<string | null>((end, e) => {
    const finish = new Date(e.endsAt) > new Date(e.startsAt) ? e.endsAt : e.startsAt;
    return !end || new Date(finish) > new Date(end) ? finish : end;
  }, null);
  return (
    <View style={styles.wrap}>
      {soon.length ? (
        <Rows label={label} entries={soon} t={t} timeZone={timeZone} onOpen={onOpen} />
      ) : null}
      {middle}
      {first ? (
        <View style={styles.tonight}>
          <View style={styles.tonightHead}>
            <Moon size={16} strokeWidth={2.4} color={color.ink} />
            <Text variant="h3" role="heading" aria-level={2}>
              Tonight
            </Text>
            <Text variant="meta" tone="muted">
              {rangeOf(first.startsAt, last ?? first.startsAt, timeZone)}
            </Text>
          </View>
          <Rows label="Tonight" entries={shown} t={t} timeZone={timeZone} onOpen={onOpen} />
          {more > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={!onMoreTonight}
              onPress={onMoreTonight}
              style={(s: PressState) => [styles.more, s.hovered && styles.pressed]}
            >
              <Text variant="label">{more} more tonight</Text>
              {onMoreTonight ? <ChevronDown size={16} color={color.ink} strokeWidth={2.4} /> : null}
            </Pressable>
          ) : null}
        </View>
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
    <View role="list" aria-label={label} style={styles.card}>
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
                  {Icon ? <Icon size={15} strokeWidth={2.4} color={readableOn(lead)} /> : null}
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
  wrap: { gap: space[4] },
  tonight: { gap: space[2] },
  tonightHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] - 2,
    minHeight: touch,
    alignSelf: 'flex-start',
  },
});
