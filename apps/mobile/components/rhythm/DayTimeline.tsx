import type { HeadsUp } from '@familyos/domain';
import { CalendarDays, Car } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { Text } from '../../design/Text';
import { color, font, radius, tint } from '../../design/tokens';
import type { HandoffView, Occurrence, RhythmLaneView } from '../../lib/api';
import type { People, Person } from '../../lib/people';
import {
  CARE_VERB,
  dayWindow,
  hourMark,
  localParts,
  rangeOf,
  spanOn,
  timeOf,
} from '../../lib/rhythm';

/**
 * The day as lanes across time (direction C): a lane per adult, and for each child or pet where
 * they are (home or away) with the handoffs between. Events shared by both adults are bands across
 * every lane. The now-line marks the present; what's past is quieted. Desktop shows names and
 * labels; `compact` (phones) keeps the same shape in a short strip.
 */
export function DayTimeline({
  date,
  timeZone,
  lanes,
  handoffs,
  headsUps,
  people,
  now,
  compact,
  onOpen,
}: {
  date: string;
  timeZone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  headsUps: HeadsUp[];
  people: People;
  /** The current instant when `date` is today. */
  now: Date | null;
  compact?: boolean;
  onOpen: (o: Occurrence) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const model = useMemo(
    () =>
      buildModel({ date, timeZone, lanes, handoffs, headsUps, people, compact: !!compact, now }),
    [date, timeZone, lanes, handoffs, headsUps, people, compact, now],
  );

  const head = compact ? 34 : 176;
  const track = Math.max(0, width - head);
  const { from, to } = model.window;
  const x = (m: number) => ((Math.min(Math.max(m, from), to) - from) / (to - from)) * track;
  const nowMin = now ? localParts(now, timeZone).minutes : null;
  const hours: number[] = [];
  const step = compact ? 180 : 60;
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) hours.push(m);

  return (
    <View onLayout={onLayout} accessibilityLabel={`The day’s rhythm, ${model.window.label}`}>
      {width > 0 ? (
        <View>
          {/* Hour axis */}
          <View style={[styles.axis, { marginLeft: head, height: compact ? 16 : 22 }]}>
            {hours.map((m, i) => {
              const near = nowMin !== null && Math.abs(nowMin - m) < (compact ? 50 : 26);
              if (near) return null;
              return (
                <Text
                  key={m}
                  variant="small"
                  tone="faint"
                  style={[
                    styles.hour,
                    compact && styles.hourCompact,
                    { left: x(m) - 30 },
                    m === 12 * 60 && styles.noon,
                  ]}
                >
                  {hourMark(m, i === 0, i === hours.length - 1)}
                </Text>
              );
            })}
          </View>

          <View style={styles.body}>
            {/* Lane heads */}
            <View style={{ width: head }}>
              {model.lanes.map((lane) => (
                <View
                  key={lane.person.id}
                  style={[styles.headRow, { height: lane.height, marginBottom: lane.gapAfter }]}
                >
                  <Avatar person={lane.person} size={compact ? 22 : 30} />
                  {!compact ? (
                    <View style={styles.headText}>
                      <Text variant="h3" style={styles.headName} numberOfLines={1}>
                        {lane.person.isMe ? 'You' : lane.person.name}
                      </Text>
                      {lane.sub ? (
                        <Text variant="small" tone="muted" numberOfLines={1}>
                          {lane.sub}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            {/* Track */}
            <View style={{ width: track, height: model.height }}>
              {model.lanes.map((lane) => (
                <View
                  key={lane.person.id}
                  style={[
                    styles.lane,
                    { top: lane.top, height: lane.height, borderRadius: compact ? 7 : 12 },
                  ]}
                />
              ))}
              {hours.map((m) => (
                <View key={m} style={[styles.grid, { left: x(m), height: model.height }]} />
              ))}

              {/* Shared events: a band across every lane */}
              {model.together.map((t) => (
                <Pressable
                  key={t.o.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.o.title}, ${rangeOf(t.o.startsAt, t.o.endsAt, timeZone)}, ${t.names}`}
                  onPress={() => onOpen(t.o)}
                  style={(s: PressState) => [
                    styles.band,
                    {
                      left: x(t.start),
                      width: Math.max(4, x(t.end) - x(t.start)),
                      height: model.height + 8,
                    },
                    s.hovered && styles.bandHover,
                  ]}
                />
              ))}

              {/* Children and pets: where they are */}
              {model.segments.map((s, i) => {
                const w = x(s.end) - x(s.start);
                const by = s.with.length === 1 ? people.byId(s.with[0]) : null;
                const away = s.away;
                return (
                  <View
                    key={`seg${i}`}
                    style={[
                      styles.segment,
                      {
                        left: x(s.start) + 1,
                        width: Math.max(2, w - 2),
                        top: s.top + 4,
                        height: s.height - 8,
                        backgroundColor: away ? s.color : tint(by?.color ?? s.color, 0.16),
                        borderColor: away ? s.color : tint(by?.color ?? s.color, 0.55),
                        borderStyle: away ? 'solid' : 'dashed',
                        borderRadius: compact ? 5 : 8,
                      },
                    ]}
                  >
                    {w > (compact ? 52 : 70) ? (
                      <Text
                        variant="small"
                        numberOfLines={1}
                        color={away ? color.onInk : color.ink}
                        style={[styles.segText, compact && styles.tiny]}
                      >
                        {s.label}
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              {/* Handoff bridges between the adult's lane and the child's */}
              {model.bridges.map((b) => (
                <View
                  key={`br${b.key}`}
                  pointerEvents="none"
                  style={[
                    styles.bridge,
                    {
                      left: x(b.at) - 2,
                      top: b.top,
                      height: b.bottom - b.top,
                      backgroundColor: tint(b.color, 0.45),
                    },
                  ]}
                />
              ))}

              {/* Events in each lane */}
              {model.blocks.map((b) => {
                const left = x(b.start);
                const w = Math.max(compact ? 8 : 18, x(b.end) - left);
                const roomy = w >= Math.min(220, b.label.length * 6.6 + (b.care ? 40 : 22));
                const c = b.color;
                return (
                  <Pressable
                    key={b.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.a11y}`}
                    onPress={() => onOpen(b.o)}
                    style={(s: PressState) => [
                      styles.block,
                      {
                        left,
                        width: w,
                        top: b.top,
                        height: b.height,
                        borderRadius: compact ? 5 : 8,
                      },
                      b.care
                        ? { backgroundColor: c, borderColor: c }
                        : b.imported
                          ? {
                              backgroundColor: color.surface,
                              borderColor: c,
                              borderStyle: 'dashed',
                            }
                          : {
                              backgroundColor: tint(c, 0.16),
                              borderColor: tint(c, 0.16),
                              borderLeftColor: c,
                              borderLeftWidth: 3,
                            },
                      s.hovered && { transform: [{ translateY: -1 }] },
                    ]}
                  >
                    {b.conflict ? (
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Hatch
                          width={w}
                          height={b.height}
                          radius={compact ? 5 : 8}
                          stroke={c}
                          background="transparent"
                          outline={false}
                        />
                      </View>
                    ) : null}
                    {!b.care &&
                    !compact &&
                    w < Math.min(220, b.label.length * 6.6 + 22) ? null : b.care ? (
                      <View style={styles.glyph}>
                        <Car size={compact ? 11 : 15} strokeWidth={2.4} color={color.onInk} />
                        {!compact && roomy ? (
                          <Text
                            variant="small"
                            color={color.onInk}
                            numberOfLines={1}
                            style={styles.careText}
                          >
                            {b.label}
                          </Text>
                        ) : null}
                      </View>
                    ) : !compact || w > 56 ? (
                      <View style={styles.blockInner}>
                        {b.imported && !compact && w > 60 ? (
                          <CalendarDays size={12} color={c} strokeWidth={2.2} />
                        ) : null}
                        <Text
                          variant="small"
                          numberOfLines={1}
                          style={[
                            styles.blockText,
                            compact && styles.tiny,
                            !roomy && styles.blockTextTight,
                          ]}
                        >
                          {b.label}
                        </Text>
                        {!compact && roomy && b.height >= 40 ? (
                          <Text
                            variant="small"
                            tone="muted"
                            numberOfLines={1}
                            style={styles.blockSub}
                          >
                            {b.sub}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {/* Labels beside blocks too short to hold them */}
              {!compact
                ? model.blocks.map((b) => {
                    const left = x(b.start);
                    const w = Math.max(18, x(b.end) - left);
                    const roomy = w >= Math.min(220, b.label.length * 6.6 + (b.care ? 40 : 22));
                    if (roomy || b.care) return null;
                    const next = model.blocks
                      .filter((o) => o.top === b.top && o.start >= b.end)
                      .reduce((m, o) => Math.min(m, x(o.start)), track);
                    const room = next - (left + w) - 10;
                    if (room < 40) return null;
                    return (
                      <View
                        key={`out${b.key}`}
                        pointerEvents="none"
                        style={[
                          styles.outside,
                          {
                            left: left + w + 6,
                            top: b.top,
                            height: b.height,
                            width: Math.min(room, 200),
                          },
                        ]}
                      >
                        <Text variant="small" numberOfLines={1} style={styles.blockText}>
                          {b.label}
                          <Text variant="small" tone="muted">
                            {'  '}
                            {b.time}
                          </Text>
                        </Text>
                      </View>
                    );
                  })
                : null}

              {/* Handoff lines under a child's lane */}
              {!compact
                ? model.handoffLabels.map((h) => (
                    <View
                      key={`hl${h.key}`}
                      pointerEvents="none"
                      style={[
                        styles.handoffLabel,
                        { left: Math.min(x(h.at) + 8, track - 230), top: h.top },
                      ]}
                    >
                      <Text variant="small" numberOfLines={1}>
                        <Text variant="small" color={h.color} style={styles.handoffTime}>
                          {h.time}
                        </Text>
                        {'  '}
                        {h.text}
                      </Text>
                    </View>
                  ))
                : null}

              {/* What's past is quieter; the now-line marks the present */}
              {nowMin !== null && nowMin > from ? (
                <View
                  pointerEvents="none"
                  style={[styles.past, { width: x(nowMin), height: model.height + 8 }]}
                />
              ) : null}
              {nowMin !== null && nowMin >= from && nowMin <= to ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.now,
                    { left: x(nowMin) - 1, height: model.height + (compact ? 10 : 14) },
                  ]}
                  accessibilityLabel={`Now, ${timeOf(now?.toISOString() ?? '', timeZone)}`}
                >
                  <View style={[styles.nowPill, compact && styles.nowPillCompact]}>
                    <Text
                      variant="small"
                      color={color.onInk}
                      style={[styles.nowText, compact && styles.tiny]}
                    >
                      {timeOf(now?.toISOString() ?? '', timeZone).replace(/am|pm/, '')}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Shared events, named under the timeline */}
          {!compact && model.together.length > 0 ? (
            <View style={[styles.foot, { marginLeft: head }]}>
              {model.together.map((t) => (
                <Text
                  key={t.o.key}
                  variant="small"
                  tone="muted"
                  numberOfLines={1}
                  style={[
                    styles.footText,
                    { left: Math.max(0, Math.min(track - 200, x((t.start + t.end) / 2) - 100)) },
                  ]}
                >
                  {t.o.title.split(':')[0]} · {t.names}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height: compact ? 120 : 260 }} />
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------------------------

interface Block {
  key: string;
  o: Occurrence;
  start: number;
  end: number;
  top: number;
  height: number;
  color: string;
  label: string;
  sub: string;
  time: string;
  a11y: string;
  care: boolean;
  imported: boolean;
  conflict: boolean;
}

function buildModel({
  date,
  timeZone,
  lanes,
  handoffs,
  headsUps,
  people,
  compact,
  now,
}: {
  date: string;
  timeZone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  headsUps: HeadsUp[];
  people: People;
  compact: boolean;
  now: Date | null;
}) {
  const adultIds = new Set(people.all.filter((p) => !p.caredFor).map((p) => p.id));
  const span = (o: Occurrence) => spanOn(o, date, timeZone);
  const timed = (o: Occurrence) => !o.allDay;

  // Lane order: me, then children and pets, then the other adults (so handoffs sit between).
  const byId = new Map(lanes.map((l) => [l.memberId, l]));
  const me = people.me;
  const ordered: { lane: RhythmLaneView; person: Person }[] = [];
  const push = (id: string | undefined) => {
    const lane = id ? byId.get(id) : undefined;
    const person = people.byId(id);
    if (lane && person && !ordered.some((o) => o.person.id === person.id))
      ordered.push({ lane, person });
  };
  push(me?.id);
  for (const p of people.caredFor) push(p.id);
  for (const p of people.adults) push(p.id);
  for (const l of lanes) {
    // Caregivers only when they have something that day.
    if (l.role === 'caregiver' && l.occurrences.length === 0) continue;
    push(l.memberId);
  }

  // Events with two or more adults are shared: one band across the lanes.
  const allOcc = new Map<string, Occurrence>();
  for (const l of lanes) for (const o of l.occurrences) if (timed(o)) allOcc.set(o.key, o);
  const isTogether = (o: Occurrence) =>
    !o.careAction && o.memberIds.filter((id) => adultIds.has(id)).length >= 2;
  const together = [...allOcc.values()].filter(isTogether).map((o) => {
    const names = o.memberIds
      .map((id) => people.byId(id))
      .filter((p): p is Person => !!p)
      .map((p) => (p.isMe ? 'you' : p.name));
    return {
      o,
      ...span(o),
      names:
        names.length === people.all.filter((p) => p.role !== 'caregiver').length
          ? `everyone`
          : names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`,
    };
  });

  // Conflicts: an adult's handoff overlapping another of their events.
  const conflictKeys = new Map<string, Set<string>>();
  for (const h of headsUps) {
    if (h.type !== 'handoff_conflict') continue;
    const set = conflictKeys.get(h.memberId) ?? new Set<string>();
    set.add(h.occurrenceKey);
    set.add(h.conflictingOccurrenceKey);
    conflictKeys.set(h.memberId, set);
  }

  const adultH = compact ? 26 : 54;
  const caredH = compact ? 22 : 38;
  const gap = compact ? 5 : 12;
  const labelRoom = compact ? 0 : 18;
  let y = 0;
  const laneModels = ordered.map(({ lane, person }) => {
    const hasHandoffs = handoffs.some((h) => h.careMemberId === person.id);
    const height = lane.caredFor ? caredH : adultH;
    const gapAfter = gap + (lane.caredFor && hasHandoffs ? labelRoom : 0);
    const model = { lane, person, top: y, height, gapAfter, sub: '' };
    y += height + gapAfter;
    return model;
  });
  const height = Math.max(0, y - (laneModels.at(-1)?.gapAfter ?? 0));
  const laneOf = new Map(laneModels.map((l) => [l.person.id, l]));

  const blocks: Block[] = [];
  const segments: {
    start: number;
    end: number;
    top: number;
    height: number;
    color: string;
    away: boolean;
    with: string[];
    label: string;
  }[] = [];
  const bridges: { key: string; at: number; top: number; bottom: number; color: string }[] = [];
  const handoffLabels: {
    key: string;
    at: number;
    top: number;
    color: string;
    time: string;
    text: string;
  }[] = [];
  const spans: { start: number; end: number }[] = [];

  for (const lm of laneModels) {
    const { lane, person } = lm;
    if (lane.caredFor) {
      for (const s of lane.segments) {
        const sp = spanOn(s, date, timeZone);
        const by = s.withMemberIds.map((id) => people.byId(id)).filter((p): p is Person => !!p);
        const label =
          s.location.kind === 'away'
            ? (s.location.place ?? 'Away')
            : by.length === 1
              ? `Home with ${by[0]?.isMe ? 'you' : by[0]?.name}`
              : by.length > 1
                ? 'Home with you both'
                : 'Home';
        segments.push({
          ...sp,
          top: lm.top,
          height: lm.height,
          color: person.color,
          away: s.location.kind === 'away',
          with: s.withMemberIds,
          label,
        });
      }
    }
    // Blocks, laid out in rows when they overlap.
    const own = lane.occurrences.filter((o) => timed(o) && !isTogether(o));
    const rows: number[] = [];
    const placed = own
      .map((o) => ({ o, ...span(o) }))
      .sort((a, b) => a.start - b.start)
      .map((p) => {
        let r = rows.findIndex((end) => end <= p.start);
        if (r === -1) {
          r = rows.length;
          rows.push(p.end);
        } else rows[r] = p.end;
        return { ...p, row: r };
      });
    const n = Math.max(1, rows.length);
    const pad = compact ? 3 : 6;
    const inner = lm.height - pad * 2;
    for (const p of placed) {
      const o = p.o;
      spans.push(p);
      // In a child's lane the handoff shows as its own marker; skip repeating events about them.
      const care = !!o.careAction;
      const adultOf = o.memberIds.find((id) => adultIds.has(id));
      const shade =
        lane.caredFor && care ? (people.byId(adultOf)?.color ?? person.color) : person.color;
      const imported = o.readOnly;
      const conflict = !!conflictKeys.get(person.id)?.has(o.key);
      const child = people.byId(o.careMemberId);
      const label =
        care && child && o.careAction
          ? `${o.careAction === 'drop_off' ? 'Drop-off' : 'Pickup'}`
          : o.title;
      const rh = inner / n;
      blocks.push({
        key: `${person.id}:${o.key}`,
        o,
        start: p.start,
        end: p.end > p.start ? p.end : p.start + 15,
        top: lm.top + pad + p.row * rh,
        height: rh - (n > 1 ? 2 : 0),
        color: shade,
        label,
        time: timeOf(o.startsAt, timeZone),
        sub: `${rangeOf(o.startsAt, o.endsAt, timeZone)}${imported && o.source ? ` · ${o.source.label}` : o.location ? ` · ${o.location}` : ''}`,
        a11y: `${o.title}, ${rangeOf(o.startsAt, o.endsAt, timeZone)}${imported && o.source ? `, from the ${o.source.label} calendar` : ''}${conflict ? ', overlaps a handoff' : ''}`,
        care,
        imported,
        conflict,
      });
    }
  }

  // Handoffs: a bridge from the adult's lane to the child's, and a line saying who and where.
  for (const h of handoffs) {
    const childLane = laneOf.get(h.careMemberId);
    const child = people.byId(h.careMemberId);
    if (!childLane || !child) continue;
    const at = localParts(h.time, timeZone).minutes;
    const adult = people.byId(h.byMemberIds[0]);
    const adultLane = adult ? laneOf.get(adult.id) : undefined;
    if (adultLane && adult) {
      const above = adultLane.top < childLane.top;
      bridges.push({
        key: h.occurrenceKey,
        at,
        top: above ? adultLane.top + adultLane.height - 4 : childLane.top + childLane.height - 4,
        bottom: above ? childLane.top + 4 : adultLane.top + 4,
        color: adult.color,
      });
    }
    const who = adult ? (adult.isMe ? 'You' : adult.name) : 'Nobody yet';
    const verb =
      h.action === 'drop_off'
        ? `${adult?.isMe ? 'drop' : adult ? 'drops' : 'for'} ${child.name}${h.place ? ` at ${h.place}` : ''}`
        : `${adult?.isMe ? 'pick' : adult ? 'picks' : 'for'} ${child.name} up`;
    handoffLabels.push({
      key: h.occurrenceKey,
      at,
      top: childLane.top + childLane.height + 2,
      color: adult?.color ?? color.ink,
      time: timeOf(h.time, timeZone).replace(/am|pm/, ''),
      text: adult ? `${who} ${verb}` : `${who}: ${child.name}’s ${CARE_VERB[h.action]}`,
    });
  }

  // Lane subtitles: where a child is now, or each adult's next thing.
  for (const lm of laneModels) {
    if (lm.person.role === 'pet') lm.sub = lm.person.species ?? 'Pet';
    else if (lm.lane.caredFor) {
      const away = lm.lane.segments.find((s) => s.location.kind === 'away');
      lm.sub = away
        ? `${away.location.kind === 'away' ? (away.location.place ?? 'Away') : ''} ${rangeOf(away.startsAt, away.endsAt, timeZone)}`
        : (lm.person.note?.split('·')[0]?.trim() ?? '');
    } else {
      const after = now ? now.getTime() : -Infinity;
      const next = lm.lane.occurrences
        .filter((o) => timed(o) && new Date(o.startsAt).getTime() > after)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      lm.sub = next
        ? `Next: ${next.careAction ? (next.careAction === 'drop_off' ? 'drop-off' : 'pickup') : next.title} ${timeOf(next.startsAt, timeZone)}`
        : lm.lane.occurrences.some(timed)
          ? now
            ? 'Nothing else today'
            : ''
          : 'Nothing on the calendar';
    }
  }

  for (const t of together) spans.push(t);
  for (const s of segments) if (s.end - s.start < 23 * 60) spans.push(s);
  const w = dayWindow(spans);
  return {
    lanes: laneModels,
    height,
    blocks,
    together: together.map((t) => ({ ...t, top: 0 })),
    segments,
    bridges,
    handoffLabels,
    window: { ...w, label: `${hourMark(w.from, true, false)} to ${hourMark(w.to, false, true)}` },
  };
}

const styles = StyleSheet.create({
  axis: { position: 'relative' },
  hour: { position: 'absolute', top: 0, width: 60, textAlign: 'center', fontFamily: font.uiSemi },
  hourCompact: { fontSize: 10.5 },
  noon: { color: color.ink },
  body: { flexDirection: 'row' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10 },
  headText: { flex: 1, minWidth: 0 },
  headName: { fontSize: 16, lineHeight: 20 },
  lane: { position: 'absolute', left: 0, right: 0, backgroundColor: color.lane },
  grid: { position: 'absolute', top: 0, width: 1, backgroundColor: 'rgba(23,32,27,0.05)' },
  band: {
    position: 'absolute',
    top: -4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
    backgroundColor: 'rgba(23,32,27,0.035)',
    cursor: 'pointer',
  },
  bandHover: { borderColor: color.ink },
  segment: {
    position: 'absolute',
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  segText: { fontFamily: font.uiBold, fontSize: 12 },
  tiny: { fontSize: 10, lineHeight: 12 },
  bridge: { position: 'absolute', width: 4, borderRadius: 2 },
  block: {
    position: 'absolute',
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  glyph: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  careText: { fontFamily: font.uiBold },
  blockInner: { paddingHorizontal: 7, gap: 1, flexDirection: 'column' },
  blockText: { fontFamily: font.uiBold, fontSize: 12.5, color: color.ink },
  blockTextTight: { fontSize: 11.5 },
  blockSub: { fontSize: 11.5 },
  outside: { position: 'absolute', justifyContent: 'center' },
  handoffLabel: { position: 'absolute', width: 230, height: 16, justifyContent: 'center' },
  handoffTime: { fontFamily: font.uiBold },
  past: {
    position: 'absolute',
    left: 0,
    top: -4,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  now: {
    position: 'absolute',
    top: -14,
    width: 2,
    backgroundColor: color.ink,
    alignItems: 'center',
  },
  nowPill: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
    minWidth: 44,
    alignItems: 'center',
  },
  nowPillCompact: { height: 16, minWidth: 34, paddingHorizontal: 4, top: -4 },
  nowText: { fontFamily: font.uiBold, fontSize: 11.5 },
  foot: { height: 22, marginTop: 10, position: 'relative' },
  footText: { position: 'absolute', width: 200, textAlign: 'center' },
});
