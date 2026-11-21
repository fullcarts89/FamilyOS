import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Car, ChevronLeft, ChevronRight, Plus, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { EventSheet, type EventTarget } from '../../components/rhythm/EventSheet';
import { Avatar, Either } from '../../design/Avatar';
import { Button, IconButton, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonBlock } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { Text } from '../../design/Text';
import { color, font, radius, tint } from '../../design/tokens';
import {
  dinnerOn,
  pendingRequest,
  weekLabel,
  weekToOpen,
  type WithRequest,
} from '../../components/reset/coordination';
import {
  api,
  type EventsResponse,
  type Meal,
  type Occurrence,
  type RhythmResponse,
} from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { addDays, dayOfWeek, shortDate, weekdayName } from '../../lib/dates';
import { trackRequests } from '../../lib/events';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { headsUpsForDays, timeOf } from '../../lib/rhythm';

const mondayOf = (date: string) => addDays(date, 1 - dayOfWeek(date));

interface Row {
  key: string;
  label: string;
  sub?: string;
  person: Person | null;
  /** Occurrences for this row on a date. */
  on: (date: string) => Occurrence[];
  care?: boolean;
}

// Week: the household's seven days as a board (days × lanes): each adult's plans, the drop-offs
// and pickups (whose, or a hatched "?" when nobody has one or it clashes, "asked, waiting" while
// the other adult hasn't answered), pets, what you do together, and each night's dinner from the
// meal plan. Tap anything to see it, cover it or change it; imported events stay read-only. On a
// Sunday it opens on the coming week, the one you're planning.
export default function Week() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { household, timeZone, members } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { version } = useCapture();
  const [today, setToday] = useState<string | null>(null);
  const [monday, setMonday] = useState<string | null>(null);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<EventTarget | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  useEffect(() => {
    if (!household) return;
    if (today) return;
    api<RhythmResponse>(`/households/${household.id}/rhythm`)
      .then((r) => {
        setToday(r.today);
        setMonday(weekToOpen(r.today, params.date));
      })
      .catch(() => setError(true));
  }, [household, today, params.date]);

  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setMonday(mondayOf(params.date));
  }, [params.date]);

  const load = useCallback(async () => {
    if (!household || !monday) return;
    try {
      const range = `from=${monday}&to=${addDays(monday, 6)}`;
      const [res, food] = await Promise.all([
        api<EventsResponse>(`/households/${household.id}/events?${range}`),
        // The week's dinners from the meal plan; the board works without them.
        api<{ meals: Meal[] }>(`/households/${household.id}/meals?${range}`).catch(() => null),
      ]);
      if (!alive.current) return;
      setData(res);
      if (food) setMeals(food.meals);
      setError(false);
      trackRequests(household.id, household.memberId, res.occurrences);
    } catch {
      if (alive.current) setError(true);
    }
  }, [household, monday]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (version > 0) void load();
  }, [version, load]);

  const days = useMemo(
    () => (monday ? Array.from({ length: 7 }, (_, i) => addDays(monday, i)) : []),
    [monday],
  );
  const occ = useMemo(() => (data?.occurrences ?? []).filter((o) => !o.skipped), [data]);
  const headsUps = useMemo(
    () => (data && today ? headsUpsForDays(data.occurrences, members, days, today, timeZone) : []),
    [data, members, days, today, timeZone],
  );
  const flagged = useMemo(() => {
    const set = new Set<string>();
    for (const { headsUp: h } of headsUps) {
      set.add(`${h.occurrenceKey}`);
      if (h.type === 'handoff_conflict') set.add(`${h.memberId}|${h.conflictingOccurrenceKey}`);
    }
    return set;
  }, [headsUps]);

  const adultIds = new Set(people.adults.map((p) => p.id));
  const together = (o: Occurrence) =>
    !o.careAction && o.memberIds.filter((id) => adultIds.has(id)).length >= 2;
  const byStart = (a: Occurrence, b: Occurrence) =>
    Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt);
  const rows: Row[] = [
    ...people.adults.map((p) => ({
      key: p.id,
      label: p.isMe ? 'You' : p.name,
      person: p,
      on: (d: string) =>
        occ
          .filter(
            (o) => o.date === d && o.memberIds.includes(p.id) && !o.careAction && !together(o),
          )
          .sort(byStart),
    })),
    ...people.caredFor.map((p) => ({
      key: p.id,
      label: p.role === 'pet' ? p.name : `${p.name}’s care`,
      sub: p.role === 'pet' ? (p.species ?? 'Pet') : undefined,
      person: p,
      care: true,
      on: (d: string) =>
        occ
          .filter(
            (o) =>
              o.date === d &&
              (o.careMemberId === p.id || (o.memberIds.includes(p.id) && !together(o))),
          )
          .sort(byStart),
    })),
    {
      key: 'together',
      label: people.adults.length > 1 ? 'Together' : 'Shared',
      sub: 'Two or more of you',
      person: null,
      on: (d: string) => occ.filter((o) => o.date === d && together(o)).sort(byStart),
    },
  ];

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const go = (weeks: number) => monday && setMonday(addDays(monday, weeks * 7));
  const openO = (o: Occurrence) => setSheet({ mode: 'occurrence', occurrence: o });
  const newOn = (date: string, care = false) => setSheet({ mode: 'new', date, care });
  const thisWeek = today && monday === mondayOf(today);
  const label = today && monday ? weekLabel(monday, today) : null;
  const partnerColors: [string, string] | undefined =
    people.me && people.partner ? [people.me.color, people.partner.color] : undefined;
  const open = headsUps.length;
  const waiting = headsUps.filter(({ headsUp: h }) => {
    const o = occ.find((x) => x.key === h.occurrenceKey);
    return !!o && !!pendingRequest(o as WithRequest);
  }).length;

  const header = (
    <PageHeader
      kicker={
        monday
          ? label === 'Next week' && today && dayOfWeek(today) === 7
            ? 'Next week · starts tomorrow'
            : (label ?? `Week of ${shortDate(monday)}`)
          : 'Week'
      }
      title={
        monday
          ? `${shortDate(monday)}–${shortDate(addDays(monday, 6)).replace(`${shortDate(monday).split(' ')[0]} `, '')}`
          : 'The week'
      }
      lead={
        data
          ? open === 0
            ? 'Every drop-off and pickup has someone, and nothing clashes.'
            : `${open === 1 ? 'One drop-off or pickup needs' : `${open} drop-offs and pickups need`} sorting: look for the hatching.${waiting ? ` ${waiting === 1 ? 'One is' : `${waiting} are`} waiting for an answer.` : ''}`
          : undefined
      }
      action={
        <View style={styles.headActions}>
          <View style={styles.nav}>
            <IconButton
              icon={ChevronLeft}
              label="Previous week"
              variant="outline"
              size={40}
              onPress={() => go(-1)}
            />
            {!thisWeek && today ? (
              <Button
                title="This week"
                variant="secondary"
                size="sm"
                onPress={() => setMonday(mondayOf(today))}
                style={styles.center}
              />
            ) : null}
            <IconButton
              icon={ChevronRight}
              label="Next week"
              variant="outline"
              size={40}
              onPress={() => go(1)}
            />
          </View>
          <Button
            title="New event"
            icon={Plus}
            onPress={() =>
              newOn(
                today && monday && today >= monday && today <= addDays(monday, 6)
                  ? today
                  : (monday ?? ''),
              )
            }
          />
          {!phone ? (
            <Button
              title="Drop-off or pickup"
              icon={Car}
              variant="secondary"
              onPress={() => newOn(today ?? monday ?? '', true)}
            />
          ) : null}
        </View>
      }
    />
  );

  return (
    <Page
      maxWidth={1440}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {header}
      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message="Couldn’t load the week. Check your connection." onRetry={load} />
        </View>
      ) : null}
      {!data && !error ? (
        <Skeleton label="Loading the week">
          <View style={styles.gap}>
            <SkeletonBlock height={phone ? 300 : 460} />
          </View>
        </Skeleton>
      ) : null}
      {data && today ? (
        <FadeIn style={styles.gap}>
          {phone || !desktop ? (
            <DayList
              days={days}
              rows={rows}
              meals={meals}
              today={today}
              timeZone={timeZone}
              flagged={flagged}
              onOpen={openO}
              onNew={newOn}
            />
          ) : (
            <View style={styles.board}>
              <View style={styles.boardRow}>
                <View style={styles.rowHead} />
                {days.map((d) => {
                  const allDay = occ.filter((o) => o.date === d && o.allDay);
                  return (
                    <View key={d} style={[styles.dayHead, d === today && styles.dayToday]}>
                      <View style={styles.dayTop}>
                        <Text style={[styles.dayName, d < today && styles.past]}>
                          {weekdayName(d).slice(0, 3)}
                        </Text>
                        <IconButton
                          icon={Plus}
                          label={`Add on ${weekdayName(d)}`}
                          size={30}
                          iconSize={16}
                          onPress={() => newOn(d)}
                        />
                      </View>
                      <Text variant="meta" tone={d === today ? 'ink' : 'muted'}>
                        {d === today ? `Today · ${Number(d.slice(8))}` : Number(d.slice(8))}
                      </Text>
                      {allDay.map((o) => (
                        <Pressable key={o.key} onPress={() => openO(o)} accessibilityRole="button">
                          <Text variant="small" numberOfLines={2} style={styles.allDay}>
                            {o.title}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
              {rows.map((row) => (
                <View key={row.key} style={styles.boardRow}>
                  <View style={styles.rowHead}>
                    {row.person ? (
                      <Avatar person={row.person} size={26} />
                    ) : (
                      <Either size={26} colors={partnerColors} />
                    )}
                    <View style={styles.rowHeadText}>
                      <Text variant="label" numberOfLines={1}>
                        {row.label}
                      </Text>
                      {row.sub ? (
                        <Text variant="small" tone="muted" numberOfLines={1}>
                          {row.sub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {days.map((d) => (
                    <View key={d} style={[styles.cell, d === today && styles.cellToday]}>
                      {row
                        .on(d)
                        .filter((o) => !o.allDay || row.key !== 'together')
                        .map((o) => (
                          <Card
                            key={o.key}
                            o={o}
                            row={row}
                            timeZone={timeZone}
                            flagged={flagged}
                            onOpen={openO}
                            past={d < today}
                          />
                        ))}
                    </View>
                  ))}
                </View>
              ))}
              <View style={styles.boardRow}>
                <View style={styles.rowHead}>
                  <View style={styles.dinnerIcon}>
                    <Utensils size={15} color={color.ink} strokeWidth={2.2} />
                  </View>
                  <View style={styles.rowHeadText}>
                    <Text variant="label" numberOfLines={1}>
                      Dinners
                    </Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      From the meal plan
                    </Text>
                  </View>
                </View>
                {days.map((d) => (
                  <View key={d} style={[styles.cell, d === today && styles.cellToday]}>
                    <Dinner meal={dinnerOn(meals, d)} date={d} past={d < today} />
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Hatch width={22} height={12} radius={3} />
              <Text variant="small" tone="muted">
                Needs someone, or clashes
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendImported} />
              <Text variant="small" tone="muted">
                From a connected calendar (read-only)
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/household')}
              style={styles.legendItem}
            >
              <CalendarDays size={14} color={color.ink} strokeWidth={2.2} />
              <Text variant="small" style={styles.legendLink}>
                Connect a calendar
              </Text>
            </Pressable>
          </View>
        </FadeIn>
      ) : null}
      <EventSheet
        target={sheet}
        today={today ?? ''}
        onClose={() => setSheet(null)}
        onChanged={() => void load()}
      />
    </Page>
  );
}

/** One thing on the board: a handoff chip (whose, or "?"), or an event card. */
function Card({
  o,
  row,
  timeZone,
  flagged,
  onOpen,
  past,
}: {
  o: Occurrence;
  row: Row;
  timeZone: string;
  flagged: Set<string>;
  onOpen: (o: Occurrence) => void;
  /** A day already gone: quieter by color (never by fading, so its text stays readable). */
  past?: boolean;
}) {
  const people = usePeople();
  const adults = o.memberIds
    .map((id) => people.byId(id))
    .filter((p): p is Person => !!p && !p.caredFor);
  const time = o.allDay ? 'All day' : timeOf(o.startsAt, timeZone);
  const problem = row.care
    ? flagged.has(o.key)
    : !!row.person && flagged.has(`${row.person.id}|${o.key}`);
  if (row.care && o.careAction) {
    const who = adults[0] ?? null;
    // Asked and not answered yet: it reads "asked Theo, waiting" and still needs sorting.
    const request = pendingRequest(o as WithRequest);
    const asked = request ? people.byId(request.askedMemberId) : null;
    const askedName = asked ? (asked.isMe ? 'you' : asked.name) : null;
    const short = o.careAction === 'drop_off' ? 'Drop' : 'Pick';
    return (
      <Pressable
        accessibilityRole="button"
        // The name starts with what the chip shows ("Pick 5:30pm"), then the rest.
        accessibilityLabel={`${short} ${time}, ${o.careAction === 'drop_off' ? 'drop-off' : 'pickup'}, ${who ? (who.isMe ? 'you' : who.name) : 'nobody yet'}${problem ? ', needs sorting' : ''}${askedName ? `, asked ${askedName}, waiting` : ''}`}
        onPress={() => onOpen(o)}
        style={(s: PressState) => [
          styles.handoff,
          past && styles.handoffPast,
          problem && styles.handoffProblem,
          s.hovered && styles.cardHover,
        ]}
      >
        {problem ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Hatch width={200} height={40} radius={0} outline={false} strokeOpacity={0.18} />
          </View>
        ) : null}
        <Text variant="small" style={[styles.handoffText, past && styles.past]}>
          {short}{' '}
          <Text variant="small" tone="muted">
            {time}
          </Text>
        </Text>
        {who && !problem ? (
          <Avatar person={who} size={20} />
        ) : asked ? (
          <View style={[styles.waitingRing, { borderColor: asked.color }]}>
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
    );
  }
  // Together: the household's ink; a person's row: their color; a child or pet: whoever's with them.
  const c =
    row.key === 'together'
      ? color.ink
      : row.person && !row.person.caredFor
        ? row.person.color
        : (adults[0]?.color ?? row.person?.color ?? color.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.title}, ${time}${o.readOnly && o.source ? `, ${o.source.label}, from a connected calendar` : ''}${o.cover ? ', covered' : ''}${problem ? ', clashes with a handoff' : ''}`}
      onPress={() => onOpen(o)}
      style={(s: PressState) => [
        styles.card,
        o.readOnly
          ? { borderColor: c, borderStyle: 'dashed', backgroundColor: color.surface }
          : { borderLeftColor: c, backgroundColor: tint(c, 0.1) },
        past && styles.cardPast,
        problem && styles.cardProblem,
        s.hovered && styles.cardHover,
      ]}
    >
      {problem ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Hatch width={220} height={80} radius={0} outline={false} strokeOpacity={0.22} />
        </View>
      ) : null}
      <Text variant="small" numberOfLines={2} style={[styles.cardTitle, past && styles.past]}>
        {o.title}
      </Text>
      <Text variant="small" tone="muted" numberOfLines={1}>
        {time}
        {o.readOnly && o.source ? ` · ${o.source.label}` : ''}
        {o.cover ? ' · covered' : ''}
      </Text>
    </Pressable>
  );
}

/** Phones and tablets: the same week, one day at a time, each day's lanes as short lists. */
function DayList({
  days,
  rows,
  meals,
  today,
  timeZone,
  flagged,
  onOpen,
  onNew,
}: {
  days: string[];
  rows: Row[];
  meals: Meal[];
  today: string;
  timeZone: string;
  flagged: Set<string>;
  onOpen: (o: Occurrence) => void;
  onNew: (date: string) => void;
}) {
  // Days already gone fold away, so the list starts with today.
  const [showPast, setShowPast] = useState(false);
  const past = days.filter((d) => d < today);
  const shown = showPast ? days : days.filter((d) => d >= today);
  return (
    <View style={styles.dayList}>
      {past.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          aria-expanded={showPast}
          onPress={() => setShowPast((v) => !v)}
          style={styles.pastToggle}
        >
          <Text variant="label" tone="muted">
            {showPast
              ? 'Hide the days already gone'
              : `Earlier this week (${past.length} day${past.length === 1 ? '' : 's'})`}
          </Text>
        </Pressable>
      ) : null}
      {shown.map((d) => {
        const filled = rows
          .map((r) => ({ row: r, items: r.on(d) }))
          .filter((x) => x.items.length > 0);
        return (
          <View
            key={d}
            style={[
              styles.dayCard,
              d === today && styles.dayCardToday,
              d < today && styles.dayCardPast,
            ]}
          >
            <View style={styles.dayCardHead}>
              <Text style={[styles.dayName, d < today && styles.past]}>
                {d === today ? 'Today' : weekdayName(d)}
              </Text>
              <Text variant="meta" tone="muted" style={styles.dayDate}>
                {shortDate(d)}
              </Text>
              <IconButton
                icon={Plus}
                label={`Add on ${weekdayName(d)}`}
                size={34}
                iconSize={17}
                onPress={() => onNew(d)}
              />
            </View>
            {filled.length === 0 && !dinnerOn(meals, d) ? (
              <Text variant="meta" tone="faint">
                Nothing planned
              </Text>
            ) : (
              filled.map(({ row, items }) => (
                <View key={row.key} style={styles.dayLane}>
                  <View style={styles.dayLaneHead}>
                    {row.person ? <Avatar person={row.person} size={20} /> : <Either size={20} />}
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {row.label}
                    </Text>
                  </View>
                  <View style={styles.dayLaneItems}>
                    {items.map((o) => (
                      <Card
                        key={o.key}
                        o={o}
                        row={row}
                        timeZone={timeZone}
                        flagged={flagged}
                        onOpen={onOpen}
                        past={d < today}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
            {dinnerOn(meals, d) ? (
              <View style={styles.dayLane}>
                <View style={styles.dayLaneHead}>
                  <Utensils size={16} color={color.ink} strokeWidth={2.2} />
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    Dinner
                  </Text>
                </View>
                <View style={styles.dayLaneItems}>
                  <Dinner meal={dinnerOn(meals, d)} date={d} past={d < today} />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A night's dinner from the meal plan (who cooks, if anyone): opens Meals. */
function Dinner({ meal, date, past }: { meal: Meal | null; date: string; past?: boolean }) {
  const people = usePeople();
  const cook = people.byId(meal?.cookMemberId);
  if (!meal) {
    return (
      <Text variant="small" tone="muted" style={styles.noDinner}>
        No dinner yet
      </Text>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${meal.title}${cook ? `, ${cook.isMe ? 'you cook' : `${cook.name} cooks`}` : ''}, ${weekdayName(date)} dinner`}
      onPress={() => router.push('/meals')}
      style={(s: PressState) => [
        styles.dinner,
        past && styles.dinnerPast,
        s.hovered && styles.cardHover,
      ]}
    >
      <Text variant="small" numberOfLines={2} style={[styles.cardTitle, past && styles.past]}>
        {meal.title}
      </Text>
      {cook ? (
        <View style={styles.cook}>
          <Avatar person={cook} size={14} />
          <Text variant="small" tone="muted" numberOfLines={1}>
            {cook.isMe ? 'You cook' : `${cook.name} cooks`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 28 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  center: { alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  board: {
    borderTopWidth: 2,
    borderTopColor: color.ink,
  },
  boardRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowHead: {
    width: 150,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 12,
    paddingRight: 8,
  },
  rowHeadText: { flex: 1, minWidth: 0 },
  dayHead: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  dayToday: { backgroundColor: color.surface },
  dayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: {
    fontFamily: font.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.45,
    color: color.ink,
  },
  allDay: { fontFamily: font.uiBold, marginTop: 4, color: color.ink },
  cell: {
    flex: 1,
    minWidth: 0,
    padding: 6,
    gap: 6,
    minHeight: 64,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  cellToday: { backgroundColor: color.surface },
  // Days already gone are quieter by color, never by opacity: their text keeps 4.5:1 (the muted
  // ink on the ground), the member tints and fills step back to the plain ground.
  past: { color: color.muted },
  cardPast: { backgroundColor: 'transparent', borderLeftColor: color.line2 },
  handoffPast: { backgroundColor: 'transparent' },
  dinnerPast: { backgroundColor: 'transparent', paddingHorizontal: 2 },
  dayCardPast: { backgroundColor: color.ground },
  card: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  cardTitle: { fontFamily: font.uiBold, color: color.ink },
  cardProblem: { borderColor: color.ink, borderStyle: 'solid' },
  cardHover: { transform: [{ translateY: -1 }] },
  handoff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    height: 34,
    paddingLeft: 9,
    paddingRight: 6,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  handoffProblem: { borderColor: color.ink, borderStyle: 'dashed' },
  handoffText: { fontFamily: font.uiBold, color: color.ink },
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
  waitingRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dinnerIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dinner: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
    backgroundColor: color.lane,
    cursor: 'pointer',
  },
  noDinner: { paddingHorizontal: 2, paddingVertical: 6 },
  cook: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 18, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  legendImported: {
    width: 22,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.muted,
  },
  legendLink: { fontFamily: font.uiBold, color: color.ink },
  dayList: { gap: 12 },
  pastToggle: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  dayCard: {
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  dayCardToday: { borderColor: color.ink },
  dayCardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dayDate: { flex: 1 },
  dayLane: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dayLaneHead: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 7 },
  dayLaneItems: { flex: 1, gap: 6 },
});
