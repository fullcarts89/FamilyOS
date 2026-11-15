import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Car, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
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
import { api, type EventsResponse, type Occurrence, type RhythmResponse } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { addDays, dayOfWeek, shortDate, weekdayName } from '../../lib/dates';
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
// and pickups (whose, or a hatched "?" when nobody has one or it clashes), pets, and what you do
// together. Tap anything to see it, cover it or change it; imported events stay read-only.
export default function Week() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { household, timeZone, members } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { version } = useCapture();
  const [today, setToday] = useState<string | null>(null);
  const [monday, setMonday] = useState<string | null>(null);
  const [data, setData] = useState<EventsResponse | null>(null);
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
        setMonday(
          mondayOf(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : r.today),
        );
      })
      .catch(() => setError(true));
  }, [household, today, params.date]);

  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setMonday(mondayOf(params.date));
  }, [params.date]);

  const load = useCallback(async () => {
    if (!household || !monday) return;
    try {
      const res = await api<EventsResponse>(
        `/households/${household.id}/events?from=${monday}&to=${addDays(monday, 6)}`,
      );
      if (!alive.current) return;
      setData(res);
      setError(false);
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
  const partnerColors: [string, string] | undefined =
    people.me && people.partner ? [people.me.color, people.partner.color] : undefined;
  const open = headsUps.length;

  const header = (
    <PageHeader
      kicker={monday ? (thisWeek ? 'This week' : `Week of ${shortDate(monday)}`) : 'Week'}
      title={
        monday
          ? `${shortDate(monday)}–${shortDate(addDays(monday, 6)).replace(`${shortDate(monday).split(' ')[0]} `, '')}`
          : 'The week'
      }
      lead={
        data
          ? open === 0
            ? 'Every drop-off and pickup has someone, and nothing clashes.'
            : `${open === 1 ? 'One drop-off or pickup needs' : `${open} drop-offs and pickups need`} sorting: look for the hatching.`
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
                        <Text style={styles.dayName}>{weekdayName(d).slice(0, 3)}</Text>
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
                    <View
                      key={d}
                      style={[
                        styles.cell,
                        d === today && styles.cellToday,
                        d < today && styles.cellPast,
                      ]}
                    >
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
                          />
                        ))}
                    </View>
                  ))}
                </View>
              ))}
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
}: {
  o: Occurrence;
  row: Row;
  timeZone: string;
  flagged: Set<string>;
  onOpen: (o: Occurrence) => void;
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
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${o.careAction === 'drop_off' ? 'Drop-off' : 'Pickup'} ${time}, ${who ? (who.isMe ? 'you' : who.name) : 'nobody yet'}${problem ? ', needs sorting' : ''}`}
        onPress={() => onOpen(o)}
        style={(s: PressState) => [
          styles.handoff,
          problem && styles.handoffProblem,
          s.hovered && styles.cardHover,
        ]}
      >
        {problem ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Hatch width={200} height={40} radius={0} outline={false} strokeOpacity={0.18} />
          </View>
        ) : null}
        <Text variant="small" style={styles.handoffText}>
          {o.careAction === 'drop_off' ? 'Drop' : 'Pick'}{' '}
          <Text variant="small" tone="muted">
            {time.replace(/am|pm/, '')}
          </Text>
        </Text>
        {who && !problem ? (
          <Avatar person={who} size={20} />
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
  const c =
    row.person && !row.person.caredFor
      ? row.person.color
      : (adults[0]?.color ?? row.person?.color ?? color.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.title}, ${time}${o.readOnly && o.source ? `, from ${o.source.label}` : ''}${problem ? ', clashes with a handoff' : ''}`}
      onPress={() => onOpen(o)}
      style={(s: PressState) => [
        styles.card,
        o.readOnly
          ? { borderColor: c, borderStyle: 'dashed', backgroundColor: color.surface }
          : { borderLeftColor: c, backgroundColor: tint(c, 0.1) },
        problem && styles.cardProblem,
        s.hovered && styles.cardHover,
      ]}
    >
      {problem ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Hatch width={220} height={80} radius={0} outline={false} strokeOpacity={0.22} />
        </View>
      ) : null}
      <Text variant="small" numberOfLines={2} style={styles.cardTitle}>
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
  today,
  timeZone,
  flagged,
  onOpen,
  onNew,
}: {
  days: string[];
  rows: Row[];
  today: string;
  timeZone: string;
  flagged: Set<string>;
  onOpen: (o: Occurrence) => void;
  onNew: (date: string) => void;
}) {
  return (
    <View style={styles.dayList}>
      {days.map((d) => {
        const filled = rows
          .map((r) => ({ row: r, items: r.on(d) }))
          .filter((x) => x.items.length > 0);
        return (
          <View
            key={d}
            style={[
              styles.dayCard,
              d === today && styles.dayCardToday,
              d < today && styles.cellPast,
            ]}
          >
            <View style={styles.dayCardHead}>
              <Text style={styles.dayName}>{d === today ? 'Today' : weekdayName(d)}</Text>
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
            {filled.length === 0 ? (
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
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 28 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
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
  cellPast: { opacity: 0.6 },
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
