import type { HeadsUp } from '@familyos/domain';
import { CalendarDays, Car } from 'lucide-react-native';
import { useMemo, useState } from 'react';
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
import { readableOn, shortTitle, textShade } from './today-model';

/** Lane heads (avatar, name, a two-line note) on tablet and desktop. */
const HEAD = 196;
const HANDOFF_W = 240;
const NONE = new Set<string>();
/** A row in an adult's lane: tall enough to tap. */
const ROW = touch;

/** Rough width of a label in the timeline's 12px semibold type, rounded up so nothing is cut. */
const estimate = (text: string) => Math.ceil(text.length * 7.2);

/**
 * Where a block's words go: inside when they fit; else beside it (the time underneath when the
 * row is tall enough); else the title before its colon; else nothing (the block still names
 * itself to a screen reader and opens on tap). Never an ellipsis in the middle of a word.
 */
function placeLabel(
  b: Pick<Block, 'label' | 'time' | 'sub' | 'height' | 'care'>,
  width: number,
  room: number,
): { where: 'in' | 'out'; text: string; time: 'inline' | 'below' | null; sub: boolean } | null {
  const inner = width - space[4] - (b.care ? 22 : 0);
  const tall = b.height >= 40;
  const candidates = b.care ? [b.label] : [b.label, shortTitle(b.label)];
  for (const text of candidates) {
    if (estimate(text) <= inner)
      return { where: 'in', text, time: null, sub: tall && estimate(b.sub) <= inner };
    if (b.care) continue;
    if (tall && estimate(text) <= room && estimate(b.time) <= room)
      return { where: 'out', text, time: 'below', sub: false };
    if (estimate(`${text}  ${b.time}`) <= room)
      return { where: 'out', text, time: 'inline', sub: false };
    if (estimate(text) <= room) return { where: 'out', text, time: null, sub: false };
  }
  return null;
}

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
  hidden,
  onToggleLane,
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
  /** Lanes this viewer hid (member ids); the chips above the lanes show or hide them. */
  hidden?: Set<string>;
  onToggleLane?: (memberId: string) => void;
  onOpen: (o: Occurrence) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const model = useMemo(
    () =>
      buildModel({
        date,
        timeZone,
        lanes,
        handoffs,
        headsUps,
        people,
        compact: !!compact,
        now,
        hidden: hidden ?? NONE,
      }),
    [date, timeZone, lanes, handoffs, headsUps, people, compact, now, hidden],
  );

  const head = compact ? 34 : HEAD;
  const track = Math.max(0, width - head);
  const { from, to } = model.window;
  const x = (m: number) => ((Math.min(Math.max(m, from), to) - from) / (to - from)) * track;
  const nowMin = now ? localParts(now, timeZone).minutes : null;
  const hours: number[] = [];
  const step = compact ? 180 : 60;
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) hours.push(m);

  // Free track to the right of a block in its row, before the next block (or the edge).
  const roomAfter = (b: Block, right: number) =>
    model.blocks
      .filter((o) => o.top === b.top && o.key !== b.key && o.start >= b.end)
      .reduce((m, o) => Math.min(m, x(o.start)), track) -
    right -
    space[3];

  return (
    <View onLayout={onLayout} accessibilityLabel={`The day’s rhythm, ${model.window.label}`}>
      {!compact && onToggleLane ? (
        <View style={styles.chips} role="group" aria-label="Show or hide a lane">
          {model.all.map((p) => {
            const shown = !hidden?.has(p.id);
            const name = p.isMe ? 'You' : p.name;
            return (
              <Pressable
                key={p.id}
                role="switch"
                aria-checked={shown}
                accessibilityLabel={`${p.isMe ? 'Your' : `${p.name}’s`} lane`}
                onPress={() => onToggleLane(p.id)}
                style={(s: PressState) => [
                  styles.chip,
                  shown
                    ? { backgroundColor: tint(p.color, 0.16), borderColor: p.color }
                    : styles.chipOff,
                  (s.hovered || s.focused) && styles.chipHover,
                ]}
              >
                <View
                  style={[
                    styles.chipDot,
                    shown ? { backgroundColor: p.color } : { borderColor: p.color, borderWidth: 2 },
                  ]}
                />
                <Text variant="label" tone={shown ? 'ink' : 'muted'}>
                  {name}
                </Text>
                {shown ? null : (
                  <Text variant="small" tone="muted">
                    hidden
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {width > 0 && model.lanes.length === 0 ? (
        <View style={styles.allHidden}>
          <Text variant="body" tone="muted">
            Every lane is hidden. Tap a name above to bring it back.
          </Text>
        </View>
      ) : width > 0 ? (
        <View>
          {/* Hour axis */}
          <View style={[styles.axis, { marginLeft: head, height: compact ? 16 : 22 }]}>
            {hours.map((m, i) => {
              // Keep hour labels clear of the now pill (about 48px wide) by pixels, not minutes.
              const near = nowMin !== null && Math.abs(x(nowMin) - x(m)) < (compact ? 30 : 46);
              if (near) return null;
              return (
                <Text
                  key={m}
                  variant="small"
                  tone="muted"
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
                      <Text variant="title" style={styles.headName} numberOfLines={1}>
                        {lane.person.isMe ? 'You' : lane.person.name}
                      </Text>
                      {lane.sub ? (
                        <Text variant="small" tone="muted" numberOfLines={2}>
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
                    { top: lane.top, height: lane.height, borderRadius: compact ? 7 : radius.md },
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
                // A handoff marker sits at the segment's start: start the words after it.
                const marker = model.blocks
                  .filter((b) => b.top >= s.top && b.top < s.top + s.height)
                  .filter((b) => b.start <= s.start + 5 && b.end > s.start - 5)
                  .reduce((m, b) => Math.max(m, x(Math.max(b.end, b.start + 15)) - x(s.start)), 0);
                const lead = marker > 0 ? Math.max(18, marker) + space[2] : space[2];
                const fits = estimate(s.label) + lead + space[2] <= w;
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
                        paddingLeft: lead,
                        backgroundColor: away ? s.color : tint(by?.color ?? s.color, 0.16),
                        borderColor: away ? s.color : tint(by?.color ?? s.color, 0.55),
                        borderStyle: away ? 'solid' : 'dashed',
                        borderRadius: compact ? 5 : radius.sm,
                      },
                    ]}
                  >
                    {!compact && fits ? (
                      <Text
                        variant="small"
                        numberOfLines={1}
                        color={away ? readableOn(s.color) : color.ink}
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

              {/* Events in each lane: the words inside when they fit, else beside, never cut */}
              {model.blocks.map((b) => {
                const left = x(b.start);
                const w = Math.max(compact ? 8 : 18, x(b.end) - left);
                const c = b.color;
                const label = compact ? null : placeLabel(b, w, roomAfter(b, left + w));
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
                        borderRadius: compact ? 5 : radius.sm,
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
                      (s.hovered || s.focused) && styles.blockHover,
                    ]}
                  >
                    {b.conflict ? (
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Hatch
                          width={w}
                          height={b.height}
                          radius={compact ? 5 : radius.sm}
                          stroke={c}
                          background="transparent"
                          outline={false}
                        />
                      </View>
                    ) : null}
                    {b.care ? (
                      <View style={styles.glyph}>
                        <Car size={compact ? 11 : 15} strokeWidth={2.4} color={readableOn(c)} />
                        {label?.where === 'in' ? (
                          <Text
                            variant="small"
                            color={readableOn(c)}
                            numberOfLines={1}
                            style={styles.careText}
                          >
                            {label.text}
                          </Text>
                        ) : null}
                      </View>
                    ) : label?.where === 'in' ? (
                      <View style={styles.blockInner}>
                        {b.imported && w > 60 ? (
                          <CalendarDays size={12} color={textShade(c)} strokeWidth={2.2} />
                        ) : null}
                        <Text variant="small" numberOfLines={1} style={styles.blockText}>
                          {label.text}
                        </Text>
                        {label.sub ? (
                          <Text variant="small" tone="muted" numberOfLines={1}>
                            {b.sub}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

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
              {/* Labels beside blocks too short to hold them */}
              {!compact
                ? model.blocks.map((b) => {
                    if (b.care) return null;
                    const left = x(b.start);
                    const w = Math.max(18, x(b.end) - left);
                    const room = roomAfter(b, left + w);
                    const label = placeLabel(b, w, room);
                    if (label?.where !== 'out') return null;
                    return (
                      <View
                        key={`out${b.key}`}
                        pointerEvents="none"
                        style={[
                          styles.outside,
                          {
                            left: left + w + space[2] - 2,
                            top: b.top,
                            height: b.height,
                            width: room,
                          },
                        ]}
                      >
                        <View style={styles.outsideText}>
                          <Text variant="small" numberOfLines={1} style={styles.blockText}>
                            {label.text}
                            {label.time === 'inline' ? (
                              <Text variant="small" tone="muted">
                                {'  '}
                                {b.time}
                              </Text>
                            ) : null}
                          </Text>
                          {label.time === 'below' ? (
                            <Text variant="small" tone="muted" numberOfLines={1}>
                              {b.time}
                            </Text>
                          ) : null}
                        </View>
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
                        { left: Math.min(x(h.at) + space[2], track - HANDOFF_W), top: h.top },
                      ]}
                    >
                      <Text variant="small" numberOfLines={1} style={styles.handoffText}>
                        <Text variant="small" color={textShade(h.color)} style={styles.handoffTime}>
                          {h.time}
                        </Text>
                        {'  '}
                        {h.text}
                      </Text>
                    </View>
                  ))
                : null}
            </View>
          </View>

          {/* Shared events, named under the timeline; captions that would overlap take a new row */}
          {!compact && model.together.length > 0
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
                      { marginLeft: head, height: 22 * Math.max(1, rowEnds.length) },
                    ]}
                  >
                    {placed.map((p) => (
                      <Text
                        key={p.key}
                        variant="small"
                        tone="muted"
                        numberOfLines={1}
                        style={[styles.footText, { left: p.left, top: p.row * 22 }]}
                      >
                        {p.label}
                      </Text>
                    ))}
                  </View>
                );
              })()
            : null}
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
  hidden,
}: {
  date: string;
  timeZone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  headsUps: HeadsUp[];
  people: People;
  compact: boolean;
  now: Date | null;
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

  // Each lane's own events, in rows when they overlap (a lane grows a row rather than squeeze).
  const placeLane = (lane: RhythmLaneView) => {
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
    return { placed, n: Math.max(1, rows.length) };
  };

  const pad = compact ? 3 : space[1];
  const caredH = compact ? 22 : touch;
  const gap = compact ? 5 : space[3];
  const labelRoom = compact ? 0 : space[5];
  const visible = ordered.filter((o) => !hidden.has(o.person.id));
  let y = 0;
  const laneModels = visible.map(({ lane, person }) => {
    const hasHandoffs = handoffs.some((h) => h.careMemberId === person.id);
    const layout = placeLane(lane);
    const adultH = compact ? 26 : pad * 2 + layout.n * ROW + (layout.n - 1) * 2;
    const height = lane.caredFor ? caredH : Math.max(compact ? 26 : touch + space[3], adultH);
    const gapAfter = gap + (lane.caredFor && hasHandoffs ? labelRoom : 0);
    const model = { lane, person, top: y, height, gapAfter, sub: '', layout };
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
    // Blocks, laid out in the lane's rows.
    const { placed, n } = lm.layout;
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
      const rh = (inner - (n - 1) * 2) / n;
      blocks.push({
        key: `${person.id}:${o.key}`,
        o,
        start: p.start,
        end: p.end > p.start ? p.end : p.start + 15,
        top: lm.top + pad + p.row * (rh + 2),
        height: rh,
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
      const t = now?.getTime() ?? -Infinity;
      const place = away?.location.kind === 'away' ? (away.location.place ?? 'Away') : '';
      lm.sub = away
        ? new Date(away.startsAt).getTime() <= t && new Date(away.endsAt).getTime() > t
          ? `At ${place} until ${timeOf(away.endsAt, timeZone)}`
          : `${place}, ${rangeOf(away.startsAt, away.endsAt, timeZone)}`
        : (lm.person.note?.split('·')[0]?.trim() ?? '');
    } else {
      const after = now ? now.getTime() : -Infinity;
      const next = lm.lane.occurrences
        .filter((o) => timed(o) && new Date(o.startsAt).getTime() > after)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      lm.sub = next
        ? `Next: ${next.careAction ? (next.careAction === 'drop_off' ? 'drop-off' : 'pickup') : shortTitle(next.title)}, ${timeOf(next.startsAt, timeZone)}`
        : lm.lane.occurrences.some(timed)
          ? now
            ? 'Nothing else today'
            : ''
          : 'Nothing on the calendar';
    }
  }

  for (const t of together) spans.push(t);
  // Where a child is away sets the day's bounds; being home overnight doesn't.
  for (const s of segments) if (s.away && s.end - s.start < 23 * 60) spans.push(s);
  // Late at night the window stretches so the now-line stays on it.
  if (now) {
    const n = localParts(now, timeZone);
    if (n.date === date) spans.push({ start: n.minutes, end: Math.min(24 * 60, n.minutes + 30) });
  }
  const w = dayWindow(spans);
  return {
    all: ordered.map((o) => o.person),
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
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    cursor: 'pointer',
  },
  chipOff: { backgroundColor: color.surface, borderColor: color.line2, borderStyle: 'dashed' },
  chipHover: { transform: [{ translateY: -1 }] },
  chipDot: { width: space[3], height: space[3], borderRadius: radius.pill },
  allHidden: {
    paddingVertical: space[6],
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: color.ground,
  },
  axis: { position: 'relative', marginBottom: space[1] },
  hour: { position: 'absolute', top: 0, width: 60, textAlign: 'center' },
  hourCompact: { fontSize: 10.5 },
  noon: { color: color.ink },
  body: { flexDirection: 'row' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingRight: space[3] },
  headText: { flex: 1, minWidth: 0 },
  headName: { fontFamily: font.display },
  lane: { position: 'absolute', left: 0, right: 0, backgroundColor: color.lane },
  grid: { position: 'absolute', top: 0, width: 1, backgroundColor: 'rgba(23,32,27,0.05)' },
  band: {
    position: 'absolute',
    top: -space[1],
    borderRadius: radius.sm,
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
    paddingRight: space[2],
    overflow: 'hidden',
  },
  segText: { fontFamily: font.uiBold },
  tiny: { fontSize: 10, lineHeight: 12 },
  bridge: { position: 'absolute', width: space[1], borderRadius: 2 },
  block: {
    position: 'absolute',
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  blockHover: { transform: [{ translateY: -1 }] },
  glyph: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2] - 2,
    paddingHorizontal: space[1],
  },
  careText: { fontFamily: font.uiBold },
  blockInner: { paddingHorizontal: space[2] - 1, gap: 1, flexDirection: 'column' },
  blockText: { fontFamily: font.uiBold, color: color.ink },
  outside: { position: 'absolute', justifyContent: 'center', alignItems: 'flex-start' },
  outsideText: { backgroundColor: color.lane, paddingRight: space[1], borderRadius: 4 },
  handoffText: { backgroundColor: color.surface, paddingRight: space[1] },
  handoffLabel: {
    position: 'absolute',
    width: HANDOFF_W,
    height: space[4],
    justifyContent: 'center',
  },
  handoffTime: { fontFamily: font.uiBold },
  past: {
    position: 'absolute',
    left: 0,
    top: -space[1],
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  now: {
    position: 'absolute',
    top: -space[4] + 2,
    width: 2,
    backgroundColor: color.ink,
    alignItems: 'center',
  },
  nowPill: {
    position: 'absolute',
    top: -space[3] + 2,
    paddingHorizontal: space[2],
    height: space[5],
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
    minWidth: touch,
    alignItems: 'center',
  },
  nowPillCompact: { height: 16, minWidth: 34, paddingHorizontal: 4, top: -4 },
  nowText: { fontFamily: font.uiBold },
  foot: { marginTop: space[3], position: 'relative' },
  footText: { position: 'absolute', width: 200, textAlign: 'center' },
});
