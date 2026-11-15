import { router } from 'expo-router';
import { ArrowRight, ChevronDown, ChevronUp, Inbox, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text as Span, RefreshControl, StyleSheet, View } from 'react-native';
import { DayTimeline } from '../../components/rhythm/DayTimeline';
import { EventSheet, type EventTarget } from '../../components/rhythm/EventSheet';
import { HeadsUps, type DatedHeadsUp } from '../../components/rhythm/HeadsUps';
import { NextUp, dayEntries } from '../../components/rhythm/NextUp';
import { SinceLastLooked } from '../../components/rhythm/SinceLastLooked';
import { WeekStrip } from '../../components/rhythm/WeekStrip';
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
} from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, font, radius, shadow } from '../../design/tokens';
import type { Occurrence, WorkItem } from '../../lib/api';
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
  byDue,
  currentTurns,
  isOpen,
  useTaskActions,
  whenOf,
  type When,
} from '../../lib/tasks';
import { addDays } from '../../lib/dates';
import { useTodayData } from '../../lib/use-today';

const NEAR: When[] = ['late', 'today', 'week'];
const PER_COLUMN = 6;

// Today's rhythm: a greeting and a headline from the day's real data; the day as lanes (desktop)
// or the next few things with the whole day a tap away (phone); heads-ups you can act on; what
// changed since you last looked; who's on what; the rest of the week; and capture.
export default function Today() {
  const { timeZone } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { open } = useCapture();
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

  const reloadSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = useCallback(
    (item: WorkItem) => {
      replace(item);
      if (reloadSoon.current) clearTimeout(reloadSoon.current);
      reloadSoon.current = setTimeout(() => void load(), 1600);
    },
    [replace, load],
  );
  const actions = useTaskActions(onChange);
  const occurrenceActions = useOccurrenceActions(() => void load());

  const today = rhythm?.today ?? '';
  const entries = useMemo(
    () => (rhythm ? dayEntries(rhythm.lanes, people, timeZone) : []),
    [rhythm, people, timeZone],
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

  const lists = useMemo(() => {
    const out = new Map<string | null, Record<When, WorkItem[]>>();
    if (!items || !today) return out;
    const sort = byDue(timeZone);
    for (const item of currentTurns(items)) {
      if (item.parentId || item.type === 'project' || !isOpen(item)) continue;
      const when = whenOf(item, today, timeZone);
      if (!NEAR.includes(when)) continue;
      const g =
        out.get(item.ownerMemberId) ??
        (Object.fromEntries(WHEN_ORDER.map((w) => [w, [] as WorkItem[]])) as Record<
          When,
          WorkItem[]
        >);
      g[when].push(item);
      out.set(item.ownerMemberId, g);
    }
    for (const g of out.values()) for (const w of WHEN_ORDER) g[w].sort(sort);
    return out;
  }, [items, today, timeZone]);

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
    ? headline({ rhythm, entries, week: week?.occurrences ?? [], people, now, timeZone })
    : null;
  const nowMin = localParts(now, timeZone).minutes;
  const clockText = `${Math.floor(nowMin / 60) % 12 || 12}:${String(nowMin % 60).padStart(2, '0')}`;
  const openOccurrence = (o: Occurrence) => setSheet({ mode: 'occurrence', occurrence: o });

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
              <Span key={i} style={p.color ? { color: p.color } : undefined}>
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
      </View>
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
      {!phone ? (
        <View style={styles.kbd}>
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
      compact={phone}
      onOpen={openOccurrence}
    />
  ) : null;

  const nextUp =
    rhythm && phone ? (
      entries.some((e) => new Date(e.endsAt).getTime() > now.getTime()) ? (
        <NextUp entries={entries} now={now} timeZone={timeZone} onOpen={openOccurrence} />
      ) : (
        <Tomorrow occurrences={week?.occurrences ?? []} today={today} onOpen={openOccurrence} />
      )
    ) : null;

  const headsUpBlock =
    rhythm && headsUps.length > 0 ? (
      <View style={styles.block}>
        <SectionHeader title="Heads-ups" sub="Worth sorting before they bite" />
        <View style={styles.blockBody}>
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
        </View>
      </View>
    ) : null;

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
      title: p.isMe ? 'On you' : `${p.name}’s handling`,
      sub: p.isMe ? 'Late, today and this week' : `What ${p.name} has this week`,
    })),
    { key: null, person: null, title: 'Up for grabs', sub: 'Either of you' },
  ];
  const groupsFor = (key: string | null): Record<When, WorkItem[]> => {
    const g = lists.get(key);
    const empty = Object.fromEntries(WHEN_ORDER.map((w) => [w, [] as WorkItem[]])) as Record<
      When,
      WorkItem[]
    >;
    if (!g) return empty;
    // Keep the column short: the first few by urgency; the rest live in Tasks.
    let left = PER_COLUMN;
    for (const w of WHEN_ORDER) {
      empty[w] = g[w].slice(0, Math.max(0, left));
      left -= empty[w].length;
    }
    return empty;
  };
  const hidden = (key: string | null) => {
    const g = lists.get(key);
    const total = g ? WHEN_ORDER.reduce((n, w) => n + g[w].length, 0) : 0;
    return Math.max(0, total - PER_COLUMN);
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
          .map((c) => (
            <View key={c.key ?? 'shared'} style={!phone ? styles.col : undefined}>
              <PersonColumn
                person={c.person}
                title={c.title}
                sub={c.sub}
                groups={groupsFor(c.key)}
                today={today}
                onComplete={actions.complete}
                onAssign={actions.assign}
                onReschedule={actions.reschedule}
                onAdd={() => open(c.key)}
                sharedColors={partnerColors}
                showHeader={!phone}
              />
              {hidden(c.key) > 0 ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({ pathname: '/tasks', params: c.key ? { section: c.key } : {} })
                  }
                  style={styles.more}
                >
                  <Text variant="label">{hidden(c.key)} more in Tasks</Text>
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

      {error ? (
        <View style={styles.blockTight}>
          <ErrorNotice
            message={
              rhythm
                ? 'Couldn’t refresh. Pull down or try again.'
                : 'Couldn’t load today. Check your connection.'
            }
            onRetry={load}
          />
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
              {wholeDay ? <View style={styles.compactDay}>{timeline}</View> : null}
            </View>
          ) : (
            <View style={styles.timelineCard}>{timeline}</View>
          )}

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
          ) : (
            <>
              {headsUpBlock}
              {sinceBlock}
            </>
          )}
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
        <NextUp entries={entries} now={new Date(0)} timeZone={timeZone} limit={3} onOpen={onOpen} />
      ) : (
        <View style={styles.dayDone}>
          <Text variant="title">Nothing on the calendar tomorrow yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 16 },
  headerWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 36 },
  clock: {
    fontFamily: font.displayHeavy,
    fontSize: 112,
    lineHeight: 112,
    letterSpacing: -3.9,
    color: color.ink,
    marginTop: -6,
  },
  clockDot: { fontFamily: font.displayHeavy },
  headText: { flex: 1, gap: 6, minWidth: 0, paddingTop: 4 },
  headline: {
    fontFamily: font.display,
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.4,
    color: color.ink,
    marginTop: 6,
    maxWidth: 820,
  },
  headlinePhone: { fontSize: 20, lineHeight: 25, marginTop: 4 },
  line: { maxWidth: 760, marginTop: 2 },
  timelineCard: {
    marginTop: 34,
    paddingTop: 22,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
  },
  compactDay: {
    marginTop: 6,
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  tomorrow: { gap: 8 },
  dayDone: {
    gap: 4,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  capture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  captureText: { flex: 1 },
  kbd: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.line2,
  },
  inbox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
    cursor: 'pointer',
  },
  inboxText: { flex: 1 },
  block: { marginTop: 40 },
  blockTight: { marginTop: 22 },
  blockBody: { marginTop: 16 },
  quiet: { paddingVertical: 14 },
  twoCols: { flexDirection: 'row', gap: 48, alignItems: 'flex-start' },
  colMain: { flex: 1.2, minWidth: 0 },
  colSide: { flex: 1, minWidth: 0 },
  cols: { marginTop: 8 },
  colsWide: { flexDirection: 'row', gap: 28, marginTop: 20 },
  col: { flex: 1, minWidth: 0 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 4, flexWrap: 'wrap' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  tabOn: { backgroundColor: color.surface, boxShadow: shadow.raised },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
});
