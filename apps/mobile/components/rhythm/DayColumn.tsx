import { router } from 'expo-router';
import { CalendarDays, Car, Check } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { Text } from '../../design/Text';
import { color, font, radius, space, touch } from '../../design/tokens';
import type { HandoffView, Occurrence, RhythmLaneView } from '../../lib/api';
import type { People } from '../../lib/people';
import { dayWindow, localParts, rangeOf, spanOn, timeOf } from '../../lib/rhythm';
import { dayRows, hourLabel, readableOn, solidFill, textOn, type AwaySpan } from './day-model';
import { dayEntries, type NextEntry } from './NextUp';

const RULER = 52;
const RAIL = 28;
const STRIPE = 4;

/**
 * Phones: the whole day as one vertical timeline. An hour ruler runs down the side; every event,
 * timed task and handoff is a marker in its person's color on one continuous line, in order; the
 * now-line sits where the present is; and where a child or pet is away (daycare, the groomer) a
 * stripe in their color runs beside the line. Handoffs say who does them. Long empty stretches
 * fold into one quiet row. Desktop and tablet keep the lanes (DayTimeline).
 */
export function DayColumn({
  date,
  timeZone,
  lanes,
  handoffs,
  people,
  now,
  onOpen,
}: {
  date: string;
  timeZone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  people: People;
  /** The current instant when `date` is today. */
  now: Date | null;
  onOpen: (o: Occurrence) => void;
}) {
  const model = useMemo(() => {
    const entries = dayEntries(lanes, people, timeZone);
    const away: (AwaySpan & { place: string; startsAt: string; endsAt: string })[] = [];
    for (const lane of lanes) {
      if (!lane.caredFor) continue;
      for (const s of lane.segments) {
        if (s.location.kind !== 'away') continue;
        away.push({
          memberId: lane.memberId,
          ...spanOn(s, date, timeZone),
          place: s.location.place ?? 'away',
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        });
      }
    }
    const spans = entries.map((e) => spanOn(e, date, timeZone));
    for (const a of away) spans.push(a);
    const nowMin = now ? localParts(now, timeZone) : null;
    if (nowMin && nowMin.date === date)
      spans.push({ start: nowMin.minutes, end: Math.min(24 * 60, nowMin.minutes + 30) });
    const { from, to } = dayWindow(spans);
    const rows = dayRows(entries, { from, to, timeZone, date, now, away });
    // Each away member gets a stripe beside the line, in a fixed order.
    const stripeIds = away.map((a) => a.memberId).filter((id, i, all) => all.indexOf(id) === i);
    return { rows, away, stripeIds, from, to };
  }, [lanes, people, timeZone, date, now]);

  // Who does each handoff, by occurrence (the handoff list is the source of truth for "nobody").
  const handoffBy = new Map(handoffs.map((h) => [h.occurrenceKey, h]));
  const t = now?.getTime() ?? -Infinity;
  const stripes = (ids: string[]) =>
    model.stripeIds.map((id, i) =>
      ids.includes(id) ? (
        <View
          key={id}
          style={[
            styles.stripe,
            { left: RAIL / 2 + 4 + i * (STRIPE + 2), backgroundColor: people.byId(id)?.color },
          ]}
        />
      ) : null,
    );

  const item = (e: NextEntry) => {
    const started = new Date(e.startsAt).getTime() <= t;
    const past = (e.endsAt > e.startsAt ? new Date(e.endsAt) : new Date(e.startsAt)).getTime() <= t;
    const time = timeOf(e.startsAt, timeZone);
    const lead = e.people[0]?.color ?? color.ink;
    const o = e.occurrence;
    const care = e.kind === 'care' && o?.careAction;
    const handoff = o ? handoffBy.get(o.key) : undefined;
    const nobody = care && handoff ? handoff.byMemberIds.length === 0 : false;
    let marker: React.ReactNode;
    if (care) {
      marker = nobody ? (
        <View style={styles.careMarker}>
          <Hatch width={22} height={22} radius={11} />
        </View>
      ) : (
        <View style={[styles.careMarker, { backgroundColor: solidFill(lead) }]}>
          <Car size={13} strokeWidth={2.4} color={textOn(solidFill(lead))} />
        </View>
      );
    } else if (e.kind === 'task') {
      marker = (
        <View style={[styles.taskMarker, { borderColor: lead }]}>
          <Check size={10} strokeWidth={3.2} color={readableOn(lead)} />
        </View>
      );
    } else {
      marker = (
        <View
          style={[
            styles.dot,
            { backgroundColor: lead, borderColor: e.people[1]?.color ?? color.surface },
          ]}
        />
      );
    }
    return (
      <View role="listitem" key={e.key} style={styles.line}>
        <View style={styles.rail}>
          <View style={styles.track} />
          {marker}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${started && !past ? 'Now' : time}: ${care ? `${o?.careAction === 'drop_off' ? 'Drop-off' : 'Pickup'}. ` : ''}${e.title}. ${e.sub}`}
          onPress={() =>
            o
              ? onOpen(o)
              : e.task && router.push({ pathname: '/item/[id]', params: { id: e.task.id } })
          }
          style={(s: PressState) => [styles.entry, s.pressed && styles.pressed]}
        >
          {care ? (
            <Text variant="kicker" color={nobody ? color.ink : readableOn(lead)}>
              {o?.careAction === 'drop_off' ? 'Drop-off' : 'Pickup'}
              {nobody ? ' · needs someone' : ''}
            </Text>
          ) : null}
          <Text variant="title" tone={past ? 'muted' : 'ink'}>
            <Text variant="title" tone={past ? 'muted' : 'ink'} style={styles.time}>
              {time}
            </Text>
            {'  '}
            {e.title}
          </Text>
          <View style={styles.subRow}>
            {e.kind === 'imported' ? (
              <CalendarDays size={12} color={color.muted} strokeWidth={2.2} />
            ) : null}
            <Text variant="meta" tone="muted" style={styles.sub}>
              {e.sub}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };

  const nowLine = (
    <View
      role="listitem"
      key="now"
      style={styles.nowLine}
      accessibilityLabel={`Now, ${now ? timeOf(now.toISOString(), timeZone) : ''}`}
    >
      <View style={styles.rail}>
        <View style={styles.track} />
        <View style={styles.nowDot} />
      </View>
      <View style={styles.nowPill}>
        <Text variant="kicker" tone="onInk">
          Now {now ? timeOf(now.toISOString(), timeZone) : ''}
        </Text>
      </View>
      <View style={styles.nowRule} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {model.away.length ? (
        <View style={styles.legend}>
          {model.away.map((a) => {
            const who = people.byId(a.memberId);
            return (
              <View key={`${a.memberId}${a.startsAt}`} style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: who?.color }]} />
                <Text variant="meta" tone="muted">
                  {who?.name ?? 'Away'} at {a.place} · {rangeOf(a.startsAt, a.endsAt, timeZone)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <View
        role="list"
        aria-label={`The whole day, ${hourLabel(Math.floor(model.from / 60))} to ${hourLabel(Math.ceil(model.to / 60))}`}
      >
        {model.rows.map((row) => {
          if (row.kind === 'quiet') {
            return (
              <View key={`q${row.from}`} style={styles.hour}>
                <View style={styles.ruler} aria-hidden>
                  <Text variant="small" tone="muted">
                    {hourLabel(row.from)}
                  </Text>
                </View>
                <View style={styles.quiet}>
                  <View style={styles.rail}>
                    <View style={[styles.track, styles.trackQuiet]} />
                    {stripes(row.away)}
                  </View>
                  <Text variant="meta" tone="muted" style={styles.quietText}>
                    Nothing until {hourLabel(row.to)}
                  </Text>
                </View>
              </View>
            );
          }
          const lines: React.ReactNode[] = row.items.map(item);
          if (row.nowAt !== null) lines.splice(row.nowAt, 0, nowLine);
          return (
            <View key={`h${row.hour}`} style={styles.hour}>
              <View style={styles.ruler} aria-hidden>
                <Text
                  variant="small"
                  tone={row.hour === 12 || row.hour === 18 ? 'ink' : 'muted'}
                  style={row.hour === 12 || row.hour === 18 ? styles.rulerStrong : undefined}
                >
                  {hourLabel(row.hour)}
                </Text>
              </View>
              <View style={styles.hourBody}>
                <View style={styles.tick} />
                {/* Stripes run the whole hour, beside the line */}
                <View style={styles.stripes} pointerEvents="none">
                  {stripes(row.away)}
                </View>
                {lines.length ? (
                  lines
                ) : (
                  <View style={styles.empty}>
                    <View style={styles.rail}>
                      <View style={styles.track} />
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  legend: { gap: space[1], paddingLeft: RULER },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  legendSwatch: { width: STRIPE, height: space[4], borderRadius: 2 },
  hour: { flexDirection: 'row' },
  ruler: { width: RULER, paddingTop: space[1] },
  rulerStrong: { fontFamily: font.uiBold },
  hourBody: { flex: 1, minWidth: 0 },
  tick: {
    position: 'absolute',
    top: 0,
    left: RAIL / 2,
    right: 0,
    height: 1,
    backgroundColor: color.hairline,
  },
  stripes: { position: 'absolute', top: 0, bottom: 0, left: 0, width: RAIL + space[4] },
  stripe: { position: 'absolute', top: 0, bottom: 0, width: STRIPE },
  line: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: RAIL, alignItems: 'center', justifyContent: 'center' },
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: RAIL / 2 - 1,
    width: 2,
    backgroundColor: color.line2,
  },
  trackQuiet: { backgroundColor: color.hairline },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  careMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: color.surface,
  },
  taskMarker: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entry: {
    flex: 1,
    minWidth: 0,
    minHeight: touch + space[2],
    justifyContent: 'center',
    paddingVertical: space[2],
    paddingLeft: space[3],
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  time: { fontFamily: font.uiBold },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  sub: { flexShrink: 1 },
  empty: { height: space[6], flexDirection: 'row' },
  quiet: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: space[7] },
  quietText: { paddingLeft: space[3] },
  nowLine: { flexDirection: 'row', alignItems: 'center', minHeight: space[7] },
  nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink },
  nowPill: {
    marginLeft: space[2],
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  nowRule: { flex: 1, height: 2, backgroundColor: color.ink, marginLeft: space[1] },
});
