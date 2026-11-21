import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { useTip } from '../../design/Tooltip';
import { color, font, radius, tint } from '../../design/tokens';
import type { Meal, Occurrence, ResetResponse, WorkItem } from '../../lib/api';
import { weekdayName } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { timeOf } from '../../lib/rhythm';
import { dueDate, isOpen } from '../../lib/tasks';
import { pendingRequest, waitingWords, type WithRequest } from './coordination';

export type RowKind = 'adults' | 'care' | 'together' | 'dinners' | 'chores';

interface BoardRow {
  key: string;
  kind: RowKind;
  label: string;
  sub?: string;
  person: Person | null;
  cell: (date: string) => ReactNode[];
}

/**
 * The shared week board at the centre of the Weekly Reset: days across, lanes down (each adult,
 * each child's and pet's care, what you do together, dinners and chores). It is drawn from the
 * same data the chapters change, so it updates as you resolve things: a pickup covered, a dinner
 * planned, a loose end kept. Hatching marks what still needs someone or clashes.
 */
export function WeekBoard({
  data,
  layout,
  focus,
  today,
  committed,
  onHandoff,
  onEvent,
  onDinner,
  narrow,
}: {
  data: ResetResponse;
  layout: 'grid' | 'days';
  /** Lanes the current chapter is about; the others dim (grid) or hide (days). */
  focus: RowKind[] | 'all';
  today: string;
  committed?: boolean;
  onHandoff?: (o: Occurrence) => void;
  onEvent?: (o: Occurrence) => void;
  onDinner?: (date: string) => void;
  /** Beside a chapter panel: a slimmer label column and tighter cells. */
  narrow?: boolean;
}) {
  const people = usePeople();
  const { timeZone } = useHousehold();
  // Chips keep to two short lines; the full text shows on hover, or on a long press or tap.
  const { tipProps, showTip, tipLayer } = useTip();
  const adults = people.adults.filter((p) => p.role === 'owner' || p.role === 'adult');
  const adultIds = new Set(adults.map((p) => p.id));
  const days = data.events.days.map((d) => d.date);
  const occ = (date: string) =>
    (data.events.days.find((d) => d.date === date)?.occurrences ?? []).filter(
      (o) => o.date === date && !o.skipped,
    );
  const byStart = (a: Occurrence, b: Occurrence) =>
    Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt);
  const together = (o: Occurrence) =>
    !o.careAction && o.memberIds.filter((id) => adultIds.has(id)).length >= 2;

  const problems = new Set<string>();
  for (const h of data.events.needsOwner) problems.add(h.occurrenceKey);
  for (const h of data.events.conflicts) {
    problems.add(h.occurrenceKey);
    problems.add(`${h.memberId}|${h.conflictingOccurrenceKey}`);
  }

  const items = [...data.unfinished, ...data.dueThisWeek].filter(isOpen);
  const tasksOn = (memberId: string, date: string) =>
    items.filter((i) => i.ownerMemberId === memberId && dueDate(i, timeZone) === date);
  const turnsOn = (date: string, subject: string | null) =>
    data.routines.flatMap((r) =>
      r.subjectMemberId === subject
        ? r.turns
            .filter((t) => t.date === date && !t.skipped)
            .map((t) => ({
              routine: r.title,
              id: `${r.id}:${t.index}`,
              owner: t.ownerMemberId,
              status: t.status,
            }))
        : [],
    );

  const eventChip = (o: Occurrence, c: string, flagged: boolean) => (
    <FadeIn key={`${o.key}:${o.memberIds.join(',')}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${o.title}, ${o.allDay ? 'all day' : timeOf(o.startsAt, timeZone)}${flagged ? ', clashes with a handoff' : ''}`}
        {...tipProps(
          `${o.title} · ${o.allDay ? 'All day' : timeOf(o.startsAt, timeZone)}${flagged ? ' · clashes with a handoff' : ''}`,
        )}
        onPress={(e) => (onEvent ? onEvent(o) : showTip(o.title, e))}
        style={(s: PressState) => [
          styles.event,
          o.readOnly
            ? { borderColor: c, borderStyle: 'dashed', backgroundColor: color.surface }
            : { borderLeftColor: c, backgroundColor: tint(c, 0.1) },
          flagged && styles.flagged,
          s.hovered && !!onEvent && styles.hover,
        ]}
      >
        {flagged ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Hatch width={240} height={80} radius={0} outline={false} strokeOpacity={0.22} />
          </View>
        ) : null}
        <Text variant="small" numberOfLines={2} style={styles.eventTitle}>
          {o.title}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {o.allDay ? 'All day' : timeOf(o.startsAt, timeZone)}
        </Text>
      </Pressable>
    </FadeIn>
  );

  const handoffChip = (o: Occurrence) => {
    const who = people.byId(o.memberIds.find((id) => adultIds.has(id)));
    const problem = problems.has(o.key);
    const what =
      o.careAction === 'drop_off' ? 'Drop' : o.careAction === 'pick_up' ? 'Pick' : o.title;
    const whatInFull =
      o.careAction === 'drop_off' ? 'Drop-off' : o.careAction === 'pick_up' ? 'Pickup' : o.title;
    const whoText = who ? (who.isMe ? 'You' : who.name) : 'Nobody yet';
    // Asked, not answered: it still needs someone, and says who it's waiting for.
    const request = pendingRequest(o as WithRequest);
    const asked = request ? people.byId(request.askedMemberId) : null;
    const askedName = asked ? (asked.isMe ? 'you' : asked.name) : null;
    return (
      <FadeIn key={`${o.key}:${who?.id ?? 'none'}:${problem}:${asked?.id ?? ''}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${weekdayName(o.date)} ${o.careAction === 'drop_off' ? 'drop-off' : o.careAction === 'pick_up' ? 'pickup' : o.title} at ${timeOf(o.startsAt, timeZone)}: ${who ? (who.isMe ? 'you' : who.name) : 'nobody yet'}${problem ? ', needs sorting' : ''}${askedName ? `, asked ${askedName}, waiting` : ''}. ${committed ? '' : 'Choose who.'}`}
          {...tipProps(
            `${whatInFull} · ${timeOf(o.startsAt, timeZone)} · ${whoText}${problem ? ' · needs sorting' : ''}${askedName ? ` · ${waitingWords(askedName)}` : ''}`,
          )}
          onPress={(e) => (onHandoff ? onHandoff(o) : showTip(`${whatInFull} · ${whoText}`, e))}
          style={(s: PressState) => [
            styles.handoff,
            problem && styles.handoffProblem,
            !problem && who && { borderColor: tint(who.color, 0.5) },
            s.hovered && !!onHandoff && styles.hover,
          ]}
        >
          {problem ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Hatch width={220} height={40} radius={0} outline={false} strokeOpacity={0.2} />
            </View>
          ) : null}
          <Text variant="small" style={styles.handoffText} numberOfLines={2}>
            {what}{' '}
            <Text variant="small" tone="muted">
              {timeOf(o.startsAt, timeZone)}
            </Text>
          </Text>
          {who && !problem ? (
            <Avatar person={who} size={20} />
          ) : asked ? (
            <View style={[styles.waiting, { borderColor: asked.color }]}>
              <Avatar person={asked} size={16} />
            </View>
          ) : (
            <View style={styles.unknown}>
              <Text variant="small" style={styles.unknownText}>
                ?
              </Text>
            </View>
          )}
        </Pressable>
      </FadeIn>
    );
  };

  const turnChip = (t: {
    routine: string;
    id: string;
    owner: string | null;
    status: string | null;
  }) => {
    const who = people.byId(t.owner);
    const done = t.status === 'verified_complete' || t.status === 'done_unverified';
    const whose = who ? (who.isMe ? 'your turn' : `${who.name}’s turn`) : 'nobody’s turn yet';
    const full = `${t.routine} · ${whose.charAt(0).toUpperCase()}${whose.slice(1)}${done ? ' · done' : ''}`;
    return (
      <FadeIn key={`${t.id}:${t.owner ?? ''}`}>
        <Pressable
          style={[styles.turn, { backgroundColor: who ? tint(who.color, 0.16) : color.lane }]}
          accessibilityLabel={`${t.routine}, ${whose}`}
          {...tipProps(full)}
          onPress={(e) => showTip(full, e)}
        >
          <View style={[styles.dot, { backgroundColor: who?.color ?? color.faint }]} />
          <Text variant="small" numberOfLines={2} style={[styles.turnText, done && styles.struck]}>
            {t.routine}
          </Text>
        </Pressable>
      </FadeIn>
    );
  };

  const taskChip = (i: WorkItem) => (
    <FadeIn key={`${i.id}:${i.version}`}>
      <Pressable
        style={styles.task}
        accessibilityLabel={`To do: ${i.title}`}
        {...tipProps(`To do: ${i.title}`)}
        onPress={(e) => showTip(`To do: ${i.title}`, e)}
      >
        <View style={styles.taskRing} />
        <Text variant="small" tone="muted" numberOfLines={2} style={styles.taskText}>
          {i.title}
        </Text>
      </Pressable>
    </FadeIn>
  );

  const dinner = (date: string) => {
    const meal: Meal | undefined = data.meals.find((m) => m.onDate === date && m.slot === 'dinner');
    const cook = people.byId(meal?.cookMemberId);
    return [
      <FadeIn key={`${date}:${meal?.title ?? ''}:${meal?.cookMemberId ?? ''}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${weekdayName(date)} dinner: ${meal ? `${meal.title}${cook ? `, ${cook.isMe ? 'you cook' : `${cook.name} cooks`}` : ''}` : 'not planned yet'}`}
          {...(meal &&
            tipProps(
              `${weekdayName(date)}: ${meal.title}${cook ? ` · ${cook.isMe ? 'You cook' : `${cook.name} cooks`}` : ''}`,
            ))}
          disabled={!onDinner && !meal}
          onPress={(e) => (onDinner ? onDinner(date) : meal && showTip(meal.title, e))}
          style={(s: PressState) => [
            meal ? styles.meal : styles.mealEmpty,
            s.hovered && !!onDinner && styles.hover,
          ]}
        >
          {meal ? (
            <>
              <Text variant="small" numberOfLines={2} style={styles.mealTitle}>
                {meal.title}
              </Text>
              <View style={styles.cookLine}>
                {cook ? <Avatar person={cook} size={16} /> : null}
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {cook ? (cook.isMe ? 'You cook' : `${cook.name} cooks`) : 'No cook set'}
                </Text>
              </View>
            </>
          ) : (
            <Text variant="small" tone="faint">
              {committed ? 'Open' : 'Add dinner'}
            </Text>
          )}
        </Pressable>
      </FadeIn>,
    ];
  };

  const rows: BoardRow[] = [
    ...adults.map((p) => ({
      key: p.id,
      kind: 'adults' as const,
      label: p.isMe ? 'You' : p.name,
      person: p,
      cell: (d: string) => [
        ...occ(d)
          .filter((o) => o.memberIds.includes(p.id) && !o.careAction && !together(o))
          .sort(byStart)
          .map((o) => eventChip(o, p.color, problems.has(`${p.id}|${o.key}`))),
        ...tasksOn(p.id, d).slice(0, 3).map(taskChip),
      ],
    })),
    ...people.caredFor.map((p) => ({
      key: p.id,
      kind: 'care' as const,
      label: p.name,
      sub: p.role === 'pet' ? (p.species ?? 'Pet') : 'Care and handoffs',
      person: p,
      cell: (d: string) => [
        ...occ(d)
          .filter(
            (o) =>
              o.careMemberId === p.id ||
              (o.memberIds.includes(p.id) && !together(o) && !o.careAction),
          )
          .sort(byStart)
          .map((o) =>
            o.careAction || o.careMemberId === p.id
              ? handoffChip(o)
              : eventChip(
                  o,
                  people.byId(o.memberIds.find((id) => adultIds.has(id)))?.color ?? p.color,
                  problems.has(o.key),
                ),
          ),
        ...turnsOn(d, p.id).map(turnChip),
      ],
    })),
    ...(days.some((d) => occ(d).some(together))
      ? [
          {
            key: 'together',
            kind: 'together' as const,
            label: 'Together',
            sub: 'Both of you',
            person: null,
            cell: (d: string) =>
              occ(d)
                .filter(together)
                .sort(byStart)
                .map((o) => eventChip(o, color.ink, false)),
          },
        ]
      : []),
    { key: 'dinners', kind: 'dinners', label: 'Dinners', person: null, cell: dinner },
    ...(data.routines.some((r) => r.subjectMemberId === null)
      ? [
          {
            key: 'chores',
            kind: 'chores' as const,
            label: 'Chores',
            sub: 'Whose turn',
            person: null,
            cell: (d: string) => turnsOn(d, null).map(turnChip),
          },
        ]
      : []),
  ];

  const lit = (r: BoardRow) => focus === 'all' || focus.includes(r.kind);
  const partnerColors: [string, string] | undefined =
    adults[0] && adults[1] ? [adults[0].color, adults[1].color] : undefined;
  const rowIcon = (r: BoardRow, size: number) =>
    r.person ? (
      <Avatar person={r.person} size={size} />
    ) : r.kind === 'together' ? (
      <Either size={size} colors={partnerColors} />
    ) : null;

  if (layout === 'days') {
    const shown = rows.filter(lit);
    return (
      <View style={styles.dayList} accessibilityLabel="The week board">
        {tipLayer}
        {committed ? <PlanStamp /> : null}
        {days.map((d) => {
          const filled = shown
            .map((r) => ({ row: r, items: r.cell(d) }))
            .filter((x) => x.items.length > 0);
          const allDay = occ(d).filter((o) => o.allDay && !o.careAction);
          return (
            <View key={d} style={[styles.dayCard, d === today && styles.dayCardToday]}>
              <View style={styles.dayCardHead}>
                <Text style={styles.dayName}>{weekdayName(d)}</Text>
                <Text variant="meta" tone="muted">
                  {Number(d.slice(8))}
                  {allDay.length ? ` · ${allDay.map((o) => o.title).join(', ')}` : ''}
                </Text>
              </View>
              {filled.length === 0 ? (
                <Text variant="meta" tone="faint">
                  Nothing here yet
                </Text>
              ) : (
                filled.map(({ row, items: cells }) => (
                  <View key={row.key} style={styles.dayLane}>
                    <View style={styles.dayLaneHead}>
                      {rowIcon(row, 18)}
                      <Text variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
                        {row.label}
                      </Text>
                    </View>
                    <View style={styles.dayLaneItems}>{cells}</View>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.board} accessibilityLabel="The week board">
      {tipLayer}
      {committed ? <PlanStamp /> : null}
      <View style={styles.boardRow}>
        <View style={[styles.rowHead, narrow && styles.rowHeadNarrow]} />
        {days.map((d) => {
          const allDay = occ(d).filter((o) => o.allDay && !o.careAction);
          return (
            <View key={d} style={[styles.dayHead, d === today && styles.today]}>
              <Text style={styles.dayName}>{weekdayName(d).slice(0, 3)}</Text>
              <Text variant="meta" tone={d === today ? 'ink' : 'muted'}>
                {d === today ? `Today · ${Number(d.slice(8))}` : Number(d.slice(8))}
              </Text>
              {allDay.map((o) => (
                <Text key={o.key} variant="small" numberOfLines={2} style={styles.allDay}>
                  {o.title}
                </Text>
              ))}
            </View>
          );
        })}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={[styles.boardRow, !lit(r) && styles.dim]}>
          <View style={[styles.rowHead, narrow && styles.rowHeadNarrow]}>
            {rowIcon(r, narrow ? 22 : 24)}
            <View style={styles.flex}>
              <Text variant="label" numberOfLines={2}>
                {r.label}
              </Text>
              {r.sub ? (
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {r.sub}
                </Text>
              ) : null}
            </View>
          </View>
          {days.map((d) => (
            <View
              key={d}
              style={[
                styles.cell,
                narrow && styles.cellNarrow,
                d === today && styles.today,
                r.kind === 'dinners' && styles.cellDinner,
              ]}
            >
              {r.cell(d)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function PlanStamp() {
  return (
    <View style={styles.stamp}>
      <Check size={15} strokeWidth={3} color={color.onInk} />
      <Text variant="small" color={color.onInk}>
        Our plan for the week
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  board: { borderTopWidth: 2, borderTopColor: color.ink },
  boardRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.hairline },
  dim: { opacity: 0.32 },
  rowHead: {
    width: 128,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingRight: 6,
  },
  rowHeadNarrow: { width: 104, gap: 6 },
  cellNarrow: { padding: 4, gap: 4 },
  dayHead: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 1,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  today: { backgroundColor: color.surface },
  dayName: {
    fontFamily: font.display,
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.4,
    color: color.ink,
  },
  allDay: { fontFamily: font.uiBold, color: color.ink, marginTop: 2 },
  cell: {
    flex: 1,
    minWidth: 0,
    padding: 5,
    gap: 5,
    minHeight: 52,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  cellDinner: { minHeight: 60 },
  event: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderLeftWidth: 3,
    paddingHorizontal: 7,
    paddingVertical: 5,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  eventTitle: { fontFamily: font.uiBold, color: color.ink },
  flagged: { borderColor: color.ink, borderStyle: 'solid' },
  hover: { transform: [{ translateY: -1 }] },
  handoff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    minHeight: 32,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 5,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  handoffProblem: { borderColor: color.ink, borderStyle: 'dashed' },
  handoffText: { flexShrink: 1, fontFamily: font.uiBold, color: color.ink },
  unknown: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  unknownText: { fontFamily: font.uiBold, color: color.ink, fontSize: 11, lineHeight: 13 },
  waiting: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.75,
  },
  turn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 13,
    cursor: 'pointer',
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 4.5 },
  turnText: { flexShrink: 1, color: color.ink },
  struck: { textDecorationLine: 'line-through' },
  task: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 3,
    cursor: 'pointer',
  },
  taskRing: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.faint,
    marginTop: 3,
  },
  taskText: { flex: 1 },
  meal: {
    gap: 2,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: radius.sm,
    cursor: 'pointer',
  },
  mealTitle: { fontFamily: font.uiBold, color: color.ink },
  cookLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mealEmpty: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
    cursor: 'pointer',
  },
  stamp: {
    position: 'absolute',
    top: -15,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  dayList: { gap: 10 },
  dayCard: {
    gap: 8,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  dayCardToday: { borderColor: color.ink },
  dayCardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  dayLane: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dayLaneHead: { width: 88, flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  dayLaneItems: { flex: 1, gap: 5 },
});
