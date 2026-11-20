import type { HeadsUp } from '@familyos/domain';
import { CalendarDays, Car, EyeOff } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { Text } from '../../design/Text';
import { color, font, radius, space, tint, touch } from '../../design/tokens';
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
import { fitLabel, readableOn, solidFill, textOn } from './day-model';

/** Lane names column, and the hour axis height. */
const HEAD = 192;
const AXIS = 22;
/** Roughly how wide a character of block text is, for fitting labels. */
const CHAR = 6.6;
/** Hour labels this close (in px) to the now chip step aside for it. */
const NOW_CLEAR = 40;

const HIDDEN_KEY = 'familyos.today.hiddenLanes';

/** Lanes this viewer hid, kept in this browser only (no account setting, no API). */
function useHiddenLanes(): [Set<string>, (id: string) => void] {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Private mode or no storage: every lane shows.
    }
  }, []);
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        globalThis.localStorage?.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered; still applies now.
      }
      return next;
    });
  return [hidden, toggle];
}

/**
 * The day as lanes across time (direction C), for tablet and desktop: a lane per adult, and for
 * each child or pet where they are (home or away) with the handoffs between. Events shared by
 * both adults are bands across every lane. The now-line marks the present; what's past is
 * quieted. Member chips above show or hide each lane for this viewer. Phones use DayColumn.
 */
export function DayTimeline({
  date,
  timeZone,
  lanes,
  handoffs,
  headsUps,
  people,
  now,
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
  onOpen: (o: Occurrence) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const [hidden, toggle] = useHiddenLanes();

  const model = useMemo(
    () => buildModel({ date, timeZone, lanes, handoffs, headsUps, people, now, hidden }),
    [date, timeZone, lanes, handoffs, headsUps, people, now, hidden],
  );

  const head = HEAD;
  const track = Math.max(0, width - head);
  const { from, to } = model.window;
  const x = (m: number) => ((Math.min(Math.max(m, from), to) - from) / (to - from)) * track;
  const nowMin = now ? localParts(now, timeZone).minutes : null;
  const hours: number[] = [];
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hours.push(m);
  const nowLabel = timeOf(now?.toISOString() ?? '', timeZone).replace(/am|pm/, '');

  // Where each block's label goes: inside when it fits, else beside it, never cut mid-word.
  const labels = model.blocks.map((b) => {
    const left = x(b.start);
    const w = Math.max(18, x(b.end) - left);
    if (b.care) {
      const roomy = w >= b.label.length * CHAR + 40;
      return { b, left, w, inside: roomy ? b.label : null, outside: null };
    }
    const inner = w - space[4] - (b.imported ? space[4] : 0);
    const next = model.blocks
      .filter((o) => o.top === b.top && o.start >= b.end && o.key !== b.key)
      .reduce((m, o) => Math.min(m, x(o.start)), track);
    const room = Math.min(next - (left + w) - space[3], 260);
    const inFit = fitLabel(b.label, null, inner, CHAR);
    const outFit = room >= 40 ? fitLabel(b.label, b.time, room, CHAR) : null;
    if (inFit?.text === b.label) return { b, left, w, inside: b.label, outside: null };
    if (outFit?.text === b.label) return { b, left, w, inside: null, outside: { ...outFit, room } };
    if (inFit) return { b, left, w, inside: inFit.text, outside: null };
    if (outFit) return { b, left, w, inside: null, outside: { ...outFit, room } };
    return { b, left, w, inside: null, outside: null };
  });

  return (
    <View onLayout={onLayout} accessibilityLabel={`The day’s rhythm, ${model.window.label}`}>
      {/* Member chips: show or hide a lane (this viewer only) */}
      <View style={styles.chips}>
        {model.everyone.map((p) => {
          const shown = !hidden.has(p.id);
          return (
            <Pressable
              key={p.id}
              role="switch"
              aria-checked={shown}
              accessibilityLabel={`${p.isMe ? 'Your' : `${p.name}’s`} lane`}
              onPress={() => toggle(p.id)}
              style={(s: PressState) => [
                styles.chip,
                shown
                  ? { backgroundColor: tint(p.color, 0.16), borderColor: p.color }
                  : styles.chipOff,
                s.hovered && styles.chipHover,
              ]}
            >
              {shown ? (
                <Avatar person={p} size={20} />
              ) : (
                <EyeOff size={16} color={color.muted} strokeWidth={2.2} />
              )}
              <Text variant="label" tone={shown ? 'ink' : 'muted'}>
                {p.isMe ? 'You' : p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {width > 0 && model.lanes.length === 0 ? (
        <View style={styles.allHidden}>
          <Text variant="body" tone="muted">
            Every lane is hidden. Tap a name above to show it again.
          </Text>
        </View>
      ) : null}

      {width > 0 && model.lanes.length > 0 ? (
        <View>
          {/* Hour axis */}
          <View style={[styles.axis, { marginLeft: head, height: AXIS }]}>
            {hours.map((m, i) => {
              if (nowMin !== null && nowMin >= from && Math.abs(x(nowMin) - x(m)) < NOW_CLEAR)
                return null;
              return (
                <Text
                  key={m}
                  variant="small"
                  tone={m === 12 * 60 ? 'ink' : 'muted'}
                  style={[styles.hour, { left: x(m) - 30 }]}
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
                  <Avatar person={lane.person} size={30} />
                  <View style={styles.headText}>
                    <Text variant="title" style={styles.headName} numberOfLines={1}>
                      {lane.person.isMe ? 'You' : lane.person.name}
                    </Text>
                    {lane.sub ? (
                      <Text variant="small" tone="muted" numberOfLines={2}>
                        {lane.sub}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>

            {/* Track */}
            <View style={{ width: track, height: model.height }}>
              {model.lanes.map((lane) => (
                <View
                  key={lane.person.id}
                  style={[styles.lane, { top: lane.top, height: lane.height }]}
                />
              ))}
              {hours.map((m) => (
                <View key={m} style={[styles.grid, { left: x(m), height: model.height }]} />
              ))}

              {/* What's past is quieter (under the labels, so their text keeps its contrast) */}
              {nowMin !== null && nowMin > from ? (
                <View
                  pointerEvents="none"
                  style={[styles.past, { width: x(nowMin), height: model.height + space[2] }]}
                />
              ) : null}

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
                      height: model.height + space[2],
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
                // A handoff marker sits on the segment's first pixels: start the text after it.
                const marked = model.blocks.some(
                  (b) =>
                    b.care &&
                    b.top >= s.top &&
                    b.top < s.top + s.height &&
                    Math.abs(b.start - s.start) <= 10,
                );
                const pad = marked ? space[7] : space[2];
                return (
                  <View
                    key={`seg${i}`}
                    style={[
                      styles.segment,
                      {
                        left: x(s.start) + 1,
                        width: Math.max(2, w - 2),
                        top: s.top + space[1],
                        height: s.height - space[2],
                        paddingLeft: pad,
                        backgroundColor: away
                          ? solidFill(s.color)
                          : tint(by?.color ?? s.color, 0.16),
                        borderColor: away ? solidFill(s.color) : tint(by?.color ?? s.color, 0.55),
                        borderStyle: away ? 'solid' : 'dashed',
                      },
                    ]}
                  >
                    {w - pad - space[2] >= s.label.length * CHAR ? (
                      <Text
                        variant="small"
                        numberOfLines={1}
                        color={away ? textOn(solidFill(s.color)) : color.ink}
                        style={styles.segText}
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
              {labels.map(({ b, left, w, inside }) => {
                const c = b.color;
                return (
                  <Pressable
                    key={b.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.a11y}`}
                    onPress={() => onOpen(b.o)}
                    style={(s: PressState) => [
                      styles.block,
                      { left, width: w, top: b.top, height: b.height },
                      b.care
                        ? { backgroundColor: solidFill(c), borderColor: solidFill(c) }
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
                          radius={radius.sm}
                          stroke={c}
                          background="transparent"
                          outline={false}
                        />
                      </View>
                    ) : null}
                    {b.care ? (
                      <View style={styles.glyph}>
                        <Car size={15} strokeWidth={2.4} color={textOn(solidFill(c))} />
                        {inside ? (
                          <Text
                            variant="small"
                            color={textOn(solidFill(c))}
                            numberOfLines={1}
                            style={styles.careText}
                          >
                            {inside}
                          </Text>
                        ) : null}
                      </View>
                    ) : inside ? (
                      <View style={styles.blockInner}>
                        <View style={styles.blockTitle}>
                          {b.imported ? (
                            <CalendarDays size={12} color={readableOn(c)} strokeWidth={2.2} />
                          ) : null}
                          <Text variant="small" numberOfLines={1} style={styles.blockText}>
                            {inside}
                          </Text>
                        </View>
                        {b.height >= 40 && w - space[4] >= b.sub.length * CHAR ? (
                          <Text variant="small" tone="muted" numberOfLines={1}>
                            {b.sub}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {/* The now-line marks the present (under the side labels, so they stay legible) */}
              {nowMin !== null && nowMin >= from && nowMin <= to ? (
                <View
                  pointerEvents="none"
                  style={[styles.now, { left: x(nowMin) - 1, height: model.height + 14 }]}
                  accessibilityLabel={`Now, ${timeOf(now?.toISOString() ?? '', timeZone)}`}
                >
                  <View style={styles.nowPill}>
                    <Text variant="small" tone="onInk" style={styles.nowText}>
                      {nowLabel}
                    </Text>
                  </View>
                </View>
              ) : null}
              {/* Labels beside blocks too short to hold them */}
              {labels.map(({ b, left, w, outside }) => {
                if (!outside) return null;
                return (
                  <View
                    key={`out${b.key}`}
                    pointerEvents="none"
                    style={[
                      styles.outside,
                      {
                        left: left + w + space[2],
                        top: b.top,
                        height: b.height,
                        width: outside.room,
                      },
                    ]}
                  >
                    <Text variant="small" numberOfLines={1} style={styles.blockText}>
                      {outside.text}
                      {outside.time ? (
                        <Text variant="small" tone="muted">
                          {'  '}
                          {outside.time}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                );
              })}

              {/* Handoff lines under a child's lane */}
              {model.handoffLabels.map((h) => (
                <View
                  key={`hl${h.key}`}
                  pointerEvents="none"
                  style={[
                    styles.handoffLabel,
                    { left: Math.min(x(h.at) + space[2], track - 260), top: h.top },
                  ]}
                >
                  <Text variant="small" numberOfLines={1}>
                    <Text variant="small" color={readableOn(h.color)} style={styles.handoffTime}>
                      {h.time}
                    </Text>
                    {'  '}
                    {h.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Shared events, named under the timeline; captions that would overlap take a new row */}
          {model.together.length > 0
            ? (() => {
                const placed: { key: string; label: string; left: number; row: number }[] = [];
                const rowEnds: number[] = [];
                const sorted = [...model.together].sort((a, b) => a.start - b.start);
                for (const t of sorted) {
                  const left = Math.max(0, Math.min(track - 200, x((t.start + t.end) / 2) - 100));
                  let row = rowEnds.findIndex((end) => end + 8 <= left);
                  if (row === -1) row = rowEnds.length;
                  rowEnds[row] = left + 200;
                  placed.push({
                    key: t.o.key,
                    label: `${t.o.title.split(':')[0]} · ${t.names}`,
                    left,
                    row,
                  });
                }
                return (
                  <View
                    style={[
                      styles.foot,
                      { marginLeft: head, height: AXIS * Math.max(1, rowEnds.length) },
                    ]}
                  >
                    {placed.map((p) => (
                      <Text
                        key={p.key}
                        variant="small"
                        tone="muted"
                        numberOfLines={1}
                        style={[styles.footText, { left: p.left, top: p.row * AXIS }]}
                      >
                        {p.label}
                      </Text>
                    ))}
                  </View>
                );
              })()
            : null}
        </View>
      ) : null}
      {width === 0 ? <View style={{ height: 260 }} /> : null}
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
  now,
  hidden,
}: {
  date: string;
  timeZone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  headsUps: HeadsUp[];
  people: People;
  now: Date | null;
  /** Lanes this viewer hid. */
  hidden: Set<string>;
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

  const adultH = 54;
  const caredH = 44;
  const gap = space[3];
  const labelRoom = 18;
  let y = 0;
  const everyone = ordered.map((o) => o.person);
  const laneModels = ordered
    .filter((o) => !hidden.has(o.person.id))
    .map(({ lane, person }) => {
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
    const pad = 6;
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
  // Late at night the window stretches so the now-line stays on it.
  if (now) {
    const n = localParts(now, timeZone);
    if (n.date === date) spans.push({ start: n.minutes, end: Math.min(24 * 60, n.minutes + 30) });
  }
  const w = dayWindow(spans);
  return {
    everyone,
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[4] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: touch,
    paddingLeft: space[2],
    paddingRight: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    cursor: 'pointer',
  },
  chipOff: { backgroundColor: color.surface, borderColor: color.line2, borderStyle: 'dashed' },
  chipHover: { opacity: 0.85 },
  allHidden: { paddingVertical: space[6], alignItems: 'center' },
  axis: { position: 'relative' },
  hour: { position: 'absolute', top: 0, width: 60, textAlign: 'center' },
  body: { flexDirection: 'row' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingRight: space[3] },
  headText: { flex: 1, minWidth: 0 },
  headName: { fontFamily: font.display },
  lane: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: color.lane,
    borderRadius: radius.md,
  },
  grid: { position: 'absolute', top: 0, width: 1, backgroundColor: color.hairline },
  band: {
    position: 'absolute',
    top: -space[1],
    borderRadius: radius.md,
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
    borderRadius: radius.sm,
    justifyContent: 'center',
    paddingRight: space[2],
    overflow: 'hidden',
  },
  segText: { fontFamily: font.uiBold },
  bridge: { position: 'absolute', width: space[1], borderRadius: 2 },
  block: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  glyph: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[1],
  },
  careText: { fontFamily: font.uiBold },
  blockInner: { paddingHorizontal: space[2], gap: 1 },
  blockTitle: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  blockText: { fontFamily: font.uiBold, color: color.ink, flexShrink: 1 },
  outside: { position: 'absolute', justifyContent: 'center' },
  handoffLabel: { position: 'absolute', width: 260, height: 16, justifyContent: 'center' },
  handoffTime: { fontFamily: font.uiBold },
  past: {
    position: 'absolute',
    left: 0,
    top: -space[1],
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
    paddingHorizontal: space[2],
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
    minWidth: touch,
    alignItems: 'center',
  },
  nowText: { fontFamily: font.uiBold },
  foot: { marginTop: space[3], position: 'relative' },
  footText: { position: 'absolute', width: 200, textAlign: 'center' },
});
