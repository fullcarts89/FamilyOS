import { router } from 'expo-router';
import { CalendarDays, Car, CircleCheck } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Text } from '../../design/Text';
import { color, radius, space, tint, touch } from '../../design/tokens';
import type { HandoffView, Occurrence, RhythmLaneView } from '../../lib/api';
import type { People, Person } from '../../lib/people';
import { timeOf } from '../../lib/rhythm';
import type { NextEntry } from './NextUp';
import {
  awayRails,
  handoffByKey,
  minutesLabel,
  railRows,
  readableOn,
  textShade,
  verticalDay,
} from './today-model';

const RULER = 64;
const TRACK = 36;
/** Where the line runs inside the track, and where a row's marker sits from its top. */
const LINE_X = 12;
const MARK_Y = 22;
const MARK = 16;

/**
 * Phones: the whole day as one vertical timeline. An hour ruler runs down the side; every item is a
 * marker in its member's color on one continuous line; drop-offs and pickups say who does them;
 * a child away from home (daycare) is a rail beside the line from drop-off to pickup; the now-line
 * marks the present. Ordered rather than to scale, so nothing is squeezed or cut off.
 */
export function DayColumn({
  date,
  timeZone,
  entries,
  lanes,
  handoffs,
  people,
  now,
  onOpen,
}: {
  date: string;
  timeZone: string;
  entries: NextEntry[];
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  people: People;
  /** The current instant when `date` is today. */
  now: Date | null;
  onOpen: (o: Occurrence) => void;
}) {
  const rows = useMemo(
    () => verticalDay({ entries, date, timeZone, now }),
    [entries, date, timeZone, now],
  );
  const rails = useMemo(() => {
    const all = awayRails(lanes, date, timeZone);
    return all
      .map((r) => ({ ...r, person: people.byId(r.memberId), at: railRows(rows, r) }))
      .filter(
        (r): r is typeof r & { person: Person; at: { first: number; last: number } } =>
          !!r.person && !!r.at,
      );
  }, [lanes, date, timeZone, people, rows]);
  const byKey = useMemo(() => handoffByKey(handoffs), [handoffs]);
  const nowIndex = rows.findIndex((r) => r.kind === 'now');

  return (
    <View role="list" aria-label="The whole day, hour by hour" style={styles.list}>
      {rows.map((row, i) => {
        const past = nowIndex !== -1 && i < nowIndex;
        const line = (
          <View
            style={[
              styles.line,
              i === 0 && { top: MARK_Y },
              i === rows.length - 1 && { bottom: undefined, height: MARK_Y },
              past && styles.linePast,
            ]}
          />
        );
        const railViews = rails.map((r, j) => {
          if (i < r.at.first || i > r.at.last) return null;
          const top = i === r.at.first ? MARK_Y : 0;
          const end = i === r.at.last;
          return (
            <View
              key={`${r.memberId}${r.start}`}
              style={[
                styles.rail,
                {
                  left: LINE_X + MARK / 2 + space[1] + j * (space[1] + 2),
                  top,
                  backgroundColor: r.person.color,
                },
                end ? { bottom: undefined, height: Math.max(0, MARK_Y - top) } : null,
              ]}
            />
          );
        });

        if (row.kind === 'hour') {
          return (
            <View
              key={row.key}
              style={styles.hourRow}
              aria-hidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.ruler}>
                <Text variant="small" tone="muted" style={styles.hourText}>
                  {row.label}
                </Text>
              </View>
              <View style={styles.track}>
                {line}
                {railViews}
                <View style={[styles.tick, past && styles.linePast]} />
              </View>
              <View style={styles.hourBody}>
                {row.tonight ? (
                  <Text variant="kicker" tone="muted">
                    Tonight
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }

        if (row.kind === 'now') {
          const label = timeOf(now?.toISOString() ?? '', timeZone);
          return (
            <View key={row.key} role="listitem" aria-label={`Now, ${label}`} style={styles.nowRow}>
              <View style={styles.ruler}>
                <View style={styles.nowPill}>
                  <Text variant="small" tone="onInk" style={styles.nowText}>
                    {label}
                  </Text>
                </View>
              </View>
              <View style={styles.track}>
                {line}
                {railViews}
                <View style={styles.nowDot} />
              </View>
              <View style={styles.nowLine} />
            </View>
          );
        }

        const e = row.entry;
        const lead = e.people[0];
        const hand = e.occurrence ? byKey.get(e.occurrence.key) : undefined;
        const nobody = e.kind === 'care' && (!hand || hand.byMemberIds.length === 0);
        const child = hand ? people.byId(hand.careMemberId) : null;
        const away = rails.find(
          (r) => r.memberId === child?.id && r.at.first === i && hand?.action === 'drop_off',
        );
        const time = timeOf(e.startsAt, timeZone);
        const Icon =
          e.kind === 'care'
            ? Car
            : e.kind === 'task'
              ? CircleCheck
              : e.kind === 'imported'
                ? CalendarDays
                : null;
        const markColor = lead?.color ?? color.ink;
        const awayLine = away
          ? `${away.person.name} at ${away.place} until ${minutesLabel(away.end)}`
          : null;
        return (
          <View key={row.key} role="listitem" style={styles.itemRow}>
            <View style={styles.ruler}>
              <Text
                variant="meta"
                tone={row.past ? 'muted' : 'ink'}
                style={styles.itemTime}
                aria-hidden
              >
                {time}
              </Text>
            </View>
            <View style={styles.track}>
              {line}
              {railViews}
              <Marker
                people={e.people}
                care={e.kind === 'care'}
                nobody={nobody}
                hollow={row.past}
                fallback={markColor}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={[
                row.ongoing ? 'Now' : time,
                e.title,
                e.sub,
                awayLine,
                row.past ? (e.kind === 'task' ? 'was due earlier' : 'earlier today') : null,
              ]
                .filter(Boolean)
                .join('. ')}
              onPress={() =>
                e.occurrence
                  ? onOpen(e.occurrence)
                  : e.task && router.push({ pathname: '/item/[id]', params: { id: e.task.id } })
              }
              style={(s: PressState) => [
                styles.card,
                e.kind === 'care' && !nobody && lead
                  ? { backgroundColor: tint(lead.color, 0.1), borderColor: tint(lead.color, 0.45) }
                  : null,
                nobody && styles.cardNobody,
                (s.hovered || s.focused) && styles.cardHover,
                s.pressed && styles.pressed,
              ]}
            >
              <View style={styles.titleRow}>
                {Icon ? (
                  <Icon size={15} strokeWidth={2.4} color={textShade(markColor, color.surface)} />
                ) : null}
                <Text variant="title" style={styles.title}>
                  {e.title}
                </Text>
              </View>
              <View style={styles.subRow}>
                {row.ongoing ? (
                  <View style={styles.nowTag}>
                    <Text variant="small" tone="onInk" style={styles.nowText}>
                      Now
                    </Text>
                  </View>
                ) : null}
                <Text variant="meta" tone="muted" style={styles.title}>
                  {e.sub}
                </Text>
              </View>
              {awayLine && away ? (
                <Text variant="meta" color={textShade(away.person.color, color.surface)}>
                  {awayLine}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** A dot in the member's color; two colors split it (a handoff: who drives, who's carried). */
function Marker({
  people,
  care,
  nobody,
  hollow,
  fallback,
}: {
  people: Person[];
  care: boolean;
  nobody: boolean;
  hollow: boolean;
  fallback: string;
}) {
  const a = people[0]?.color ?? fallback;
  const b = care ? undefined : people[1]?.color;
  if (nobody) return <View style={[styles.mark, styles.markCare, styles.markNobody]} />;
  if (care)
    return (
      <View
        style={[
          styles.mark,
          styles.markCare,
          hollow
            ? { backgroundColor: color.surface, borderColor: a }
            : { backgroundColor: a, borderColor: a },
        ]}
      >
        <Car size={12} strokeWidth={2.6} color={hollow ? textShade(a) : readableOn(a)} />
      </View>
    );
  if (hollow)
    return <View style={[styles.mark, { backgroundColor: color.surface, borderColor: a }]} />;
  return (
    <View style={[styles.mark, { backgroundColor: a, borderColor: a }]}>
      {b ? <View style={[styles.markHalf, { backgroundColor: b }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: space[3],
    paddingRight: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  hourRow: { flexDirection: 'row', minHeight: space[6] },
  ruler: { width: RULER, paddingRight: space[2], alignItems: 'flex-end' },
  hourText: { marginTop: space[1] },
  track: { width: TRACK, alignSelf: 'stretch' },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: LINE_X + MARK / 2 - 1,
    width: 2,
    backgroundColor: color.line2,
  },
  linePast: { backgroundColor: color.hairline },
  tick: {
    position: 'absolute',
    top: space[3] - 1,
    left: LINE_X + MARK / 2 - space[1],
    width: space[2],
    height: 2,
    backgroundColor: color.line2,
  },
  rail: { position: 'absolute', bottom: 0, width: space[1], borderRadius: 2 },
  hourBody: { flex: 1, justifyContent: 'center' },
  nowRow: { flexDirection: 'row', alignItems: 'center', minHeight: space[7] },
  nowPill: {
    paddingHorizontal: space[1] + 2,
    height: space[5],
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
  },
  nowText: { fontVariant: ['tabular-nums'] },
  nowDot: {
    position: 'absolute',
    top: space[4] - space[1] - 1,
    left: LINE_X + MARK / 2 - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.ink,
  },
  nowLine: { flex: 1, height: 2, backgroundColor: color.ink, borderRadius: 1 },
  itemRow: { flexDirection: 'row' },
  itemTime: { marginTop: MARK_Y - 9, fontVariant: ['tabular-nums'] },
  mark: {
    position: 'absolute',
    top: MARK_Y - MARK / 2,
    left: LINE_X,
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markHalf: { position: 'absolute', left: MARK / 2 - 2, right: -2, top: -2, bottom: -2 },
  markCare: {
    top: MARK_Y - 11,
    left: LINE_X - 3,
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  markNobody: { backgroundColor: color.surface, borderColor: color.ink, borderStyle: 'dashed' },
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: touch,
    gap: 2,
    marginVertical: space[1],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    cursor: 'pointer',
  },
  cardNobody: { borderColor: color.ink, borderStyle: 'dashed' },
  cardHover: { borderColor: color.line2 },
  pressed: { opacity: 0.7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] - 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] - 2 },
  title: { flexShrink: 1 },
  nowTag: {
    paddingHorizontal: space[2],
    height: space[5],
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
  },
});
