import { router } from 'expo-router';
import { ArrowRight, ChevronDown, ChevronUp, Inbox, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text as Span, RefreshControl, StyleSheet, View } from 'react-native';
import { AllDay } from '../../components/rhythm/AllDay';
import { DayColumn } from '../../components/rhythm/DayColumn';
import { DayTimeline } from '../../components/rhythm/DayTimeline';
import { EventSheet, type EventTarget } from '../../components/rhythm/EventSheet';
import type { CoverRequestLists } from '../../components/reset/coordination';
import { HeadsUps, type DatedHeadsUp } from '../../components/rhythm/HeadsUps';
import { NextUp, dayEntries } from '../../components/rhythm/NextUp';
import { allDayOn, readableOn, type LateCounts } from '../../components/rhythm/today-model';
import { WhileAway } from '../../components/rhythm/WhileAway';
import { SinceLastLooked } from '../../components/rhythm/SinceLastLooked';
import { WeekStrip } from '../../components/rhythm/WeekStrip';
import { WeekPlanStrip } from '../../components/rhythm/WeekPlanStrip';
import {
  lateRows,
  todayLists,
  type MissedTurns,
  type TodayList,
} from '../../components/tasks/lists';
import { OnYou } from '../../components/tasks/OnYou';
import { PersonColumn } from '../../components/tasks/PersonColumn';
import { Avatar, Either } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { useLayout } from '../../design/layout';
import {
  FadeIn,
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  useAcknowledgment,
  useCelebrate,
} from '../../design/motion';
import { LoadNotice } from '../../design/Notice';
import { Page } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, font, radius, shadow, space, touch } from '../../design/tokens';
import { failureKind, type Occurrence, type WorkItem } from '../../lib/api';
import { SETUP_KEY } from '../../lib/acknowledgments';
import { useCapture } from '../../lib/capture';
import { greetingFor, longDate, shortDate, weekdayName } from '../../lib/dates';
import { useOccurrenceActions } from '../../lib/events';
import { headline } from '../../lib/headline';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { headsUpsForDays, localParts, timeOf } from '../../lib/rhythm';
import {
  WHEN_ORDER,
  clearsToday,
  todayClearMilestone,
  useTaskActions,
  type When,
} from '../../lib/tasks';
import { addDays } from '../../lib/dates';
import { useSettle } from '../../lib/use-settle';
import { useTodayData } from '../../lib/use-today';

const PER_COLUMN = 6;
/** Undated things shown per list on Today; the rest are a tap away in Tasks. */
const ANYTIME = 3;

// Today's rhythm: a greeting and a headline from the day's real data; the day as lanes (desktop)
// or the next few things with the whole day a tap away (phone); heads-ups you can act on; what
// changed since you last looked; who's on what; the rest of the week; and capture.
export default function Today() {
  const { timeZone } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { open, version, shortcuts } = useCapture();
  const data = useTodayData();
  const { household } = useHousehold();
  // A new household's owner, alone in it, gets the guided setup first (once; skippable).
  const setup = useAcknowledgment(SETUP_KEY);
  const alone = household?.role === 'owner' && people.all.length === 1;
  useEffect(() => {
    if (alone && setup.seen === false) router.replace('/setup');
  }, [alone, setup.seen]);
  const { rhythm, week, items, activity, now, error, load, replace } = data;
  const [sheet, setSheet] = useState<EventTarget | null>(null);
  const [wholeDay, setWholeDay] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // undefined until chosen: phones start on your own list.
  const [column, setColumn] = useState<string | null | undefined>(undefined);
  // Lanes this viewer hid on the timeline (tablet and desktop): local to this device, never sent.
  const hiddenKey = `familyos.today.hiddenLanes.${household?.memberId ?? ''}`;
  const [hiddenLanes, setHiddenLanes] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setHiddenLanes(new Set(readLocal(hiddenKey)));
  }, [hiddenKey]);
  const toggleLane = useCallback(
    (id: string) =>
      setHiddenLanes((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeLocal(hiddenKey, [...next]);
        return next;
      }),
    [hiddenKey],
  );

  // Just-finished rows stay in place, checked, for a moment, then fade and leave (lib/use-settle).
  const settle = useSettle();
  const settling = settle.phases;
  const itemsRef = useRef<WorkItem[] | null>(items);
  itemsRef.current = items;
  const reloadSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { observe } = settle;
  const onChange = useCallback(
    (item: WorkItem) => {
      observe(
        itemsRef.current?.find((i) => i.id === item.id),
        item,
      );
      replace(item);
      if (reloadSoon.current) clearTimeout(reloadSoon.current);
      reloadSoon.current = setTimeout(() => void load(), 1600);
    },
    [observe, replace, load],
  );
  // The daily milestone, only after the server confirms (shown once, server-backed).
  const { celebrate } = useCelebrate();
  const onConfirmed = useCallback(
    ({ kind, after }: { kind: string; after: WorkItem }) => {
      const me = people.me;
      const day = rhythm?.today;
      if (kind !== 'completed' || !me || !day) return;
      const all = itemsRef.current ?? [];
      if (clearsToday({ after, items: all, memberId: me.id, today: day, timeZone }))
        celebrate(todayClearMilestone(day, me));
    },
    [people.me, rhythm?.today, timeZone, celebrate],
  );
  const actions = useTaskActions(onChange, onConfirmed);
  const occurrenceActions = useOccurrenceActions(() => void load());

  const today = rhythm?.today ?? '';
  const entries = useMemo(
    () => (rhythm ? dayEntries(rhythm.lanes, people, timeZone) : []),
    [rhythm, people, timeZone],
  );
  // All-day events ("School closed") never sit on the timed lines: they get their own band.
  const allDay = useMemo(
    () =>
      rhythm
        ? allDayOn(
            [...rhythm.lanes.flatMap((l) => l.occurrences), ...(week?.occurrences ?? [])],
            rhythm.date,
            timeZone,
          )
        : [],
    [rhythm, week, timeZone],
  );
  const occurrences = useMemo(() => {
    const map = new Map<string, Occurrence>();
    for (const o of week?.occurrences ?? []) map.set(o.key, o);
    for (const l of rhythm?.lanes ?? []) for (const o of l.occurrences) map.set(o.key, o);
    return map;
  }, [week, rhythm]);

  const headsUps: DatedHeadsUp[] = useMemo(() => {
    if (!rhythm) return [];
    const todays = rhythm.headsUps.map((h) => ({ date: rhythm.date, headsUp: h }));
    const coming = week
      ? headsUpsForDays(
          week.occurrences,
          rhythm.members,
          Array.from({ length: 6 }, (_, i) => addDays(rhythm.today, i + 1)),
          rhythm.today,
          timeZone,
        )
      : [];
    const seen = new Set(todays.map((h) => h.headsUp.id));
    // Today's handoffs that are already past need no action.
    const t = now.getTime();
    return [...todays, ...coming.filter((h) => !seen.has(h.headsUp.id))].filter(
      ({ headsUp: h }) =>
        !(h.type === 'handoff_conflict' || h.type === 'care_unassigned') ||
        new Date(h.time).getTime() > t,
    );
  }, [rhythm, week, timeZone, now]);

  const weekHeadsUps = useMemo(
    () =>
      rhythm && week
        ? headsUpsForDays(
            week.occurrences,
            rhythm.members,
            Array.from({ length: 7 }, (_, i) => addDays(rhythm.today, i)),
            rhythm.today,
            timeZone,
          )
        : [],
    [rhythm, week, timeZone],
  );

  const lists = useMemo(
    () =>
      items && today
        ? todayLists({ items, today, timeZone, keep: (id) => settling.has(id) })
        : new Map<string | null, TodayList>(),
    [items, today, timeZone, settling],
  );
  // What's late, counted the way the lists show it: yours, then the other adults', then shared.
  const late: LateCounts | undefined = items
    ? {
        mine: lateRows(lists.get(people.me?.id ?? '')),
        others: people.adults
          .filter((p) => !p.isMe)
          .map((p) => ({ name: p.name, count: lateRows(lists.get(p.id)) })),
        shared: lateRows(lists.get(null)),
      }
    : undefined;
  const mine = people.me ? lists.get(people.me.id) : undefined;
  const needYou = mine ? lateRows(mine) + mine.groups.today.length : 0;
  const contextOf = (item: WorkItem) =>
    item.parentId ? items?.find((i) => i.id === item.parentId)?.title : undefined;
  const catchUp = useCallback(
    (m: MissedTurns, how: 'done' | 'skip') => actions.catchUp(m, how, () => void load()),
    [actions, load],
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const me = people.me;
  const first = me?.name.split(' ')[0] ?? '';
  const hour = Math.floor(localParts(now, timeZone).minutes / 60);
  const greeting = `${greetingFor(hour)}${first ? `, ${first}` : ''}`;
  const head = rhythm
    ? headline({ rhythm, entries, week: week?.occurrences ?? [], people, now, timeZone, late })
    : null;
  const nowMin = localParts(now, timeZone).minutes;
  const clockText = `${Math.floor(nowMin / 60) % 12 || 12}:${String(nowMin % 60).padStart(2, '0')}`;
  const openOccurrence = (o: Occurrence) => setSheet({ mode: 'occurrence', occurrence: o });

  // Your own late and due-today things, first (phone: under "Next up"; desktop: beside the
  // headline), so they're on the first screen.
  const onYou =
    me && items && today ? (
      <OnYou
        me={me}
        list={mine}
        today={today}
        onComplete={actions.complete}
        onReopen={actions.reopen}
        onAssign={actions.assign}
        onReschedule={actions.reschedule}
        onCatchUp={catchUp}
        settling={settling}
        contextOf={contextOf}
      />
    ) : null;

  // ---------------------------------------------------------------------------------------------
  const header = (
    <View style={[styles.header, desktop && styles.headerWide]}>
      {desktop ? (
        <Text
          style={styles.clock}
          accessibilityLabel={`It’s ${timeOf(now.toISOString(), timeZone)}`}
        >
          {clockText}
          <Span style={[styles.clockDot, { color: me?.color ?? color.ink }]}>.</Span>
        </Text>
      ) : null}
      <View style={styles.headText}>
        <Text variant="kicker" tone="muted">
          {today ? longDate(today) : ' '}
        </Text>
        <Text variant="greeting">{greeting}</Text>
        {head ? (
          <Text style={[styles.headline, phone && styles.headlinePhone]}>
            {head.title.map((p, i) => (
              <Span
                key={i}
                style={p.color ? { color: readableOn(p.color, color.ground) } : undefined}
              >
                {p.text}
              </Span>
            ))}
          </Text>
        ) : (
          <Skeleton>
            <SkeletonBlock width={phone ? '90%' : 460} height={22} />
          </Skeleton>
        )}
        {head?.line ? (
          <Text variant="lead" tone="muted" style={styles.line}>
            {head.line}
          </Text>
        ) : null}
        {rhythm ? (
          <WhileAway
            since={data.since}
            today={today}
            timeZone={timeZone}
            activity={activity}
            people={people}
            needYou={needYou}
          />
        ) : null}
      </View>
      {desktop && onYou ? <View style={styles.headSide}>{onYou}</View> : null}
    </View>
  );

  const capture = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add something for the household"
      onPress={() => open()}
      style={(s: PressState) => [styles.capture, s.hovered && { borderColor: color.ink }]}
    >
      <Plus size={18} color={color.ink} strokeWidth={2.2} />
      <Text variant="body" tone="muted" style={styles.captureText}>
        Add something for the household…
      </Text>
      {!phone && shortcuts ? (
        <View style={styles.kbd} aria-hidden>
          <Text variant="small" tone="muted">
            N
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  const inbox =
    data.inboxCount > 0 ? (
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/inbox')}
        style={(s: PressState) => [styles.inbox, s.hovered && { borderColor: color.ink }]}
      >
        <Inbox size={18} color={color.ink} strokeWidth={2.2} />
        <Text variant="label" style={styles.inboxText}>
          {data.inboxCount === 1 ? '1 thing to sort' : `${data.inboxCount} things to sort`} in the
          inbox
        </Text>
        <ArrowRight size={16} color={color.ink} strokeWidth={2.2} />
      </Pressable>
    ) : null;

  const timeline = rhythm ? (
    <DayTimeline
      date={rhythm.date}
      timeZone={timeZone}
      lanes={rhythm.lanes}
      handoffs={rhythm.handoffs}
      headsUps={rhythm.headsUps}
      people={people}
      now={rhythm.date === rhythm.today ? now : null}
      hidden={hiddenLanes}
      onToggleLane={toggleLane}
      onOpen={openOccurrence}
      allDay={allDay}
    />
  ) : null;

  const dayColumn = rhythm ? (
    <DayColumn
      date={rhythm.date}
      timeZone={timeZone}
      entries={entries}
      lanes={rhythm.lanes}
      handoffs={rhythm.handoffs}
      headsUps={rhythm.headsUps}
      people={people}
      now={rhythm.date === rhythm.today ? now : null}
      onOpen={openOccurrence}
    />
  ) : null;

  const ahead = entries.some((e) => new Date(e.endsAt).getTime() > now.getTime());
  const nextUp =
    rhythm && phone ? (
      ahead ? (
        <NextUp
          entries={entries}
          now={now}
          timeZone={timeZone}
          onOpen={openOccurrence}
          tonight
          onMoreTonight={() => setWholeDay(true)}
          middle={onYou}
        />
      ) : (
        <View style={styles.stack}>
          <Tomorrow occurrences={week?.occurrences ?? []} today={today} onOpen={openOccurrence} />
          {onYou}
        </View>
      )
    ) : null;

  // Requests to cover something, asked of me: GET /events sends them with the week. One about a
  // handoff with no heads-up of its own still needs its row (Accept / Decline), so it counts too.
  const askedOfMe = (
    (week as { coverRequests?: CoverRequestLists } | null)?.coverRequests?.askedOfMe ?? []
  ).filter((r) => occurrences.has(`${r.eventId}:${r.date}`)).length;
  // HeadsUps loads the requests itself and checks again every few seconds while Today is open;
  // when they change, Today reloads (so the block appears, or goes, with the right rows).
  const headsUpList = rhythm ? (
    <HeadsUps
      items={headsUps}
      today={today}
      timeZone={timeZone}
      people={people}
      occurrence={(k) => occurrences.get(k)}
      workItem={(id) => items?.find((i) => i.id === id)}
      onCover={(o, id) => occurrenceActions.cover(o, id, { today })}
      onOpen={openOccurrence}
      onComplete={actions.complete}
      onAssign={actions.assign}
    />
  ) : null;
  const headsUpBlock =
    rhythm && (headsUps.length > 0 || askedOfMe > 0) ? (
      <View style={styles.block}>
        <SectionHeader title="Heads-ups" sub="Worth sorting before they bite" />
        <View style={styles.blockBody}>{headsUpList}</View>
      </View>
    ) : null;
  // Nothing to sort yet: HeadsUps stays mounted, out of sight, so a request that comes in while
  // Today is open is noticed (it draws nothing itself until Today has reloaded around it).
  const headsUpWatch =
    headsUpList && !headsUpBlock ? <View style={styles.hidden}>{headsUpList}</View> : null;

  const partnerName = people.partner?.name;
  const sinceBlock =
    activity && (activity.length > 0 || data.since) ? (
      <View style={styles.block}>
        <SectionHeader
          title="Since you last looked"
          sub={data.since ? `Since ${sinceLabel(data.since, now, timeZone)}` : 'In the last day'}
        />
        {activity.length ? (
          <SinceLastLooked activity={activity} people={people} now={now} limit={phone ? 4 : 6} />
        ) : (
          <Text variant="body" tone="muted" style={styles.quiet}>
            Nothing new from {partnerName ?? 'the household'} since then.
          </Text>
        )}
      </View>
    ) : null;

  const columns: { key: string | null; person: Person | null; title: string; sub: string }[] = [
    ...people.adults.map((p) => ({
      key: p.id as string | null,
      person: p,
      title: p.isMe ? 'You' : `${p.name}’s handling`,
      sub: p.isMe ? 'Late, today and this week' : `What ${p.name} has this week`,
    })),
    { key: null, person: null, title: 'Shared', sub: 'For either of you' },
  ];
  // Keep each column short: a routine's missed turns and the first few by urgency, then at most
  // three undated ("Anytime"); the rest live in Tasks.
  const columnFor = (key: string | null) => {
    const list = lists.get(key);
    const groups = Object.fromEntries(WHEN_ORDER.map((w) => [w, [] as WorkItem[]])) as Record<
      When,
      WorkItem[]
    >;
    if (!list) return { groups, missed: [], anytime: [], hidden: 0 };
    const missed = list.missed.slice(0, PER_COLUMN);
    let left = PER_COLUMN - missed.length;
    let total = list.missed.length + list.anytime.length;
    for (const w of WHEN_ORDER) {
      groups[w] = list.groups[w].slice(0, Math.max(0, left));
      left -= groups[w].length;
      total += list.groups[w].length;
    }
    const anytime = list.anytime.slice(0, ANYTIME);
    const shown =
      missed.length + anytime.length + WHEN_ORDER.reduce((n, w) => n + groups[w].length, 0);
    return { groups, missed, anytime, hidden: total - shown };
  };
  const activeKey = column === undefined ? (me?.id ?? null) : column;
  const partnerColors: [string, string] | undefined =
    people.me && people.partner ? [people.me.color, people.partner.color] : undefined;

  const whoBlock = items ? (
    <View style={styles.block}>
      <SectionHeader title="Who’s on what" sub="What each of you has, late through this week" />
      {phone ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {columns.map((c) => {
            const on = activeKey === c.key;
            return (
              <Pressable
                key={c.key ?? 'shared'}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                aria-selected={on}
                onPress={() => setColumn(c.key)}
                style={[styles.tab, on && styles.tabOn]}
              >
                {c.person ? (
                  <Avatar person={c.person} size={20} />
                ) : (
                  <Either size={20} colors={partnerColors} />
                )}
                <Text variant="label" tone={on ? 'ink' : 'muted'}>
                  {c.person ? (c.person.isMe ? 'You' : c.person.name) : 'Shared'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={[styles.cols, !phone && styles.colsWide]}>
        {columns
          .filter((c) => !phone || c.key === activeKey)
          .map((c) => ({ c, col: columnFor(c.key) }))
          .map(({ c, col }) => (
            <View key={c.key ?? 'shared'} style={!phone ? styles.col : undefined}>
              <PersonColumn
                person={c.person}
                title={c.title}
                sub={c.sub}
                groups={col.groups}
                missed={col.missed}
                onCatchUp={catchUp}
                anytime={col.anytime}
                today={today}
                onComplete={actions.complete}
                onReopen={actions.reopen}
                onAssign={actions.assign}
                onReschedule={actions.reschedule}
                onAdd={() => open(c.key)}
                contextOf={contextOf}
                sharedColors={partnerColors}
                showHeader={!phone}
                settling={settling}
              />
              {col.hidden > 0 ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({ pathname: '/tasks', params: c.key ? { section: c.key } : {} })
                  }
                  style={styles.more}
                >
                  <Text variant="label">{col.hidden} more in Tasks</Text>
                  <ArrowRight size={15} color={color.ink} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
          ))}
      </View>
    </View>
  ) : null;

  const weekBlock =
    rhythm && week ? (
      <View style={styles.block}>
        <SectionHeader
          title="The rest of the week"
          sub={`${shortDate(today)}–${shortDate(addDays(today, 6))}`}
          action={
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/week')}
              style={styles.link}
            >
              <Text variant="label">Open the week</Text>
              <ArrowRight size={15} color={color.ink} strokeWidth={2.2} />
            </Pressable>
          }
        />
        <View style={styles.blockBody}>
          <WeekStrip
            start={today}
            today={today}
            timeZone={timeZone}
            occurrences={week.occurrences}
            headsUps={weekHeadsUps}
            people={people}
          />
        </View>
      </View>
    ) : null;

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {header}

      {error && !(rhythm && failureKind(error) === 'offline') ? (
        <View style={styles.blockTight}>
          <LoadNotice error={error} what="today" hasData={!!rhythm} onRetry={load} />
        </View>
      ) : null}

      {!rhythm && !error ? (
        <Skeleton label="Loading today">
          <View style={styles.blockTight}>
            <SkeletonBlock height={phone ? 220 : 280} />
          </View>
          <View style={styles.block}>
            <SkeletonRows count={4} />
          </View>
        </Skeleton>
      ) : null}

      {rhythm ? (
        <FadeIn>
          {phone ? (
            <View style={styles.blockTight}>
              {allDay.length > 0 ? (
                <View style={styles.allDay}>
                  <AllDay events={allDay} people={people} onOpen={openOccurrence} variant="lines" />
                </View>
              ) : null}
              {nextUp}
              <Pressable
                accessibilityRole="button"
                aria-expanded={wholeDay}
                onPress={() => setWholeDay((v) => !v)}
                style={styles.toggle}
              >
                <Text variant="label">{wholeDay ? 'Hide the whole day' : 'See the whole day'}</Text>
                {wholeDay ? (
                  <ChevronUp size={16} color={color.ink} strokeWidth={2.4} />
                ) : (
                  <ChevronDown size={16} color={color.ink} strokeWidth={2.4} />
                )}
              </Pressable>
              {wholeDay ? <View style={styles.compactDay}>{dayColumn}</View> : null}
            </View>
          ) : (
            <>
              {/* Tablets: your own things under the headline (desktop has them beside it). */}
              {!desktop && onYou ? <View style={styles.blockTight}>{onYou}</View> : null}
              <View style={styles.timelineCard}>{timeline}</View>
            </>
          )}

          <View style={styles.blockTight}>
            <WeekPlanStrip today={today} version={version} />
          </View>

          {!phone || inbox ? (
            <View style={styles.blockTight}>
              {/* Phones capture with the floating button; desktop keeps the line. */}
              {!phone ? capture : null}
              {inbox}
            </View>
          ) : null}

          {desktop ? (
            <View style={styles.twoCols}>
              <View style={styles.colMain}>{headsUpBlock ?? sinceBlock}</View>
              <View style={styles.colSide}>{headsUpBlock ? sinceBlock : null}</View>
            </View>
          ) : activity?.length ? (
            // What the other adult changed comes first when there is some, well above the lists.
            <>
              {sinceBlock}
              {headsUpBlock}
            </>
          ) : (
            <>
              {headsUpBlock}
              {sinceBlock}
            </>
          )}
          {headsUpWatch}
          {whoBlock}
          {weekBlock}
        </FadeIn>
      ) : null}

      <EventSheet
        target={sheet}
        today={today}
        onClose={() => setSheet(null)}
        onChanged={() => void load()}
      />
    </Page>
  );
}

function sinceLabel(iso: string, now: Date, timeZone: string): string {
  const then = localParts(iso, timeZone);
  const today = localParts(now, timeZone);
  const time = timeOf(iso, timeZone);
  if (then.date === today.date) return `${time} today`;
  if (addDays(then.date, 1) === today.date) return `yesterday, ${time}`;
  return shortDate(then.date);
}

/** Phones, once today's calendar is done: tomorrow's first few things, at a glance. */
function Tomorrow({
  occurrences,
  today,
  onOpen,
}: {
  occurrences: Occurrence[];
  today: string;
  onOpen: (o: Occurrence) => void;
}) {
  const { timeZone } = useHousehold();
  const people = usePeople();
  const tomorrow = addDays(today, 1);
  const entries = dayEntries(
    [{ occurrences: occurrences.filter((o) => o.date === tomorrow && !o.skipped) }],
    people,
    timeZone,
  );
  return (
    <View style={styles.tomorrow}>
      <Text variant="kicker" tone="muted">
        Tomorrow · {weekdayName(tomorrow)}
      </Text>
      {entries.length ? (
        <NextUp
          entries={entries}
          now={new Date(0)}
          timeZone={timeZone}
          label="First things tomorrow"
          onOpen={onOpen}
        />
      ) : (
        <View style={styles.dayDone}>
          <Text variant="title">Nothing on the calendar tomorrow yet.</Text>
        </View>
      )}
    </View>
  );
}

/** A small per-device value (web: localStorage). Native keeps it for the session only. */
function readLocal(key: string): string[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, value: string[]): void {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or storage full: the choice lasts for this visit only.
  }
}

const styles = StyleSheet.create({
  header: { gap: space[4] },
  headerWide: { flexDirection: 'row', alignItems: 'flex-start', gap: space[7] + space[1] },
  clock: {
    fontFamily: font.displayHeavy,
    fontSize: 112,
    lineHeight: 112,
    letterSpacing: -3.9,
    color: color.ink,
    marginTop: -space[2] + 2,
  },
  clockDot: { fontFamily: font.displayHeavy },
  headText: { flex: 1, gap: space[2] - 2, minWidth: 0, paddingTop: space[1] },
  headSide: { width: 400, flexShrink: 0 },
  stack: { gap: space[4] },
  hidden: { display: 'none' },
  allDay: { marginBottom: space[4] },
  headline: {
    fontFamily: font.display,
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.4,
    color: color.ink,
    marginTop: space[2] - 2,
    maxWidth: 820,
  },
  headlinePhone: { fontSize: 20, lineHeight: 25, marginTop: space[1] },
  line: { maxWidth: 760, marginTop: 2 },
  timelineCard: {
    marginTop: space[7],
    paddingTop: space[5],
    paddingBottom: space[4],
    paddingHorizontal: space[5],
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
  },
  compactDay: { marginTop: space[2] },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] - 2,
    minHeight: touch,
    alignSelf: 'flex-start',
  },
  tomorrow: { gap: space[2] },
  dayDone: {
    gap: space[1],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  capture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touch + space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  captureText: { flex: 1 },
  kbd: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line2,
  },
  inbox: {
    marginTop: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touch + space[1],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
    cursor: 'pointer',
  },
  inboxText: { flex: 1 },
  block: { marginTop: space[8] },
  blockTight: { marginTop: space[6] },
  blockBody: { marginTop: space[4] },
  quiet: { paddingVertical: space[3] },
  twoCols: { flexDirection: 'row', gap: space[9], alignItems: 'flex-start' },
  colMain: { flex: 1.2, minWidth: 0 },
  colSide: { flex: 1, minWidth: 0 },
  cols: { marginTop: space[2] },
  colsWide: { flexDirection: 'row', flexWrap: 'wrap', gap: space[7], marginTop: space[5] },
  // Tablets wrap to two columns rather than squeeze three.
  col: { flexGrow: 1, flexBasis: 300, minWidth: 0 },
  tabs: {
    flexDirection: 'row',
    gap: space[2] - 2,
    marginTop: space[3],
    marginBottom: space[1],
    flexWrap: 'wrap',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: touch,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
  },
  tabOn: { backgroundColor: color.surface, boxShadow: shadow.raised },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] - 2,
    minHeight: touch,
    marginTop: space[1],
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: space[2] - 2, minHeight: touch },
});
