import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, Inbox, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { TaskRow } from '../../components/tasks/TaskRow';
import { Avatar } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { EmptyState } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonBlock, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import { api, type TodayResponse, type WorkItem } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { greetingFor, hourIn, longDate } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';
import { useTaskActions } from '../../lib/tasks';

type Lists = Pick<TodayResponse, 'needsYou' | 'inProgress' | 'thisWeek' | 'handled'>;
const LISTS: (keyof Lists)[] = ['needsYou', 'inProgress', 'thisWeek', 'handled'];

// Today: a greeting and a plain sentence about the day, capture, then what needs you, what's
// moving, what's coming this week and what got handled. The day's lanes arrive with events.
export default function Today() {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { open, version } = useCapture();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setToday(await api<TodayResponse>(`/households/${household.id}/today`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (version > 0) void load();
  }, [version, load]);
  useEffect(() => () => void (reloadTimer.current && clearTimeout(reloadTimer.current)), []);

  // Moves update the row in place; the lists regroup a moment later, after it settles.
  const onChange = useCallback(
    (item: WorkItem) => {
      setToday((t) =>
        t
          ? {
              ...t,
              ...Object.fromEntries(
                LISTS.map((k) => [k, t[k].map((i) => (i.id === item.id ? item : i))]),
              ),
            }
          : t,
      );
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 1600);
    },
    [load],
  );
  const actions = useTaskActions(onChange);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const me = people.me;
  const name = me?.name.split(' ')[0] ?? '';
  const greeting = `${greetingFor(hourIn(timeZone))}${name ? `, ${name}` : ''}`;
  const date = today?.date ?? '';

  const row = (item: WorkItem, i: number, list: WorkItem[]) => (
    <TaskRow
      key={item.id}
      item={item}
      today={date}
      onComplete={actions.complete}
      onReopen={actions.reopen}
      onAssign={actions.assign}
      onReschedule={actions.reschedule}
      context={item.ownerMemberId !== me?.id ? people.label(item.ownerMemberId) : undefined}
      last={i === list.length - 1}
    />
  );

  const needs = today ? (
    <View style={styles.block}>
      <SectionHeader title="Needs you" sub={countLine(today.needsYou.length)} />
      {today.needsYou.length ? (
        today.needsYou.map(row)
      ) : (
        <Text variant="body" tone="muted" style={styles.quiet}>
          Nothing needs you right now. Enjoy it, or get ahead on something below.
        </Text>
      )}
    </View>
  ) : null;

  const week = today ? (
    <View style={styles.block}>
      <SectionHeader title="This week" sub="The next seven days" />
      {today.thisWeek.length ? (
        today.thisWeek.map(row)
      ) : (
        <EmptyState
          compact
          title="A clear week ahead"
          body="Nothing is due in the next seven days."
          action={<CaptureLink onPress={() => open()} label="Add something" />}
        />
      )}
    </View>
  ) : null;

  const moving =
    today && today.inProgress.length > 0 ? (
      <View style={styles.block}>
        <SectionHeader title="On the move" sub="Started, booked or waiting" />
        {today.inProgress.map(row)}
      </View>
    ) : null;

  const handled =
    today && today.handled.length > 0 ? (
      <View style={styles.block}>
        <SectionHeader title="Handled" sub="In the last week" />
        {today.handled.slice(0, phone ? 4 : 8).map((item) => {
          const by = people.byId(item.completedByMemberId ?? item.ownerMemberId);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              style={(s: PressState) => [styles.handled, s.hovered && styles.handledHover]}
            >
              <Avatar person={by} size={22} />
              <Text variant="body" style={styles.handledText} numberOfLines={2}>
                <Text variant="bodyStrong">{by ? (by.isMe ? 'You' : by.name) : 'Someone'}</Text>
                {' handled '}
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.head}>
        <Text variant="kicker" tone="muted">
          {date ? longDate(date) : ' '}
        </Text>
        <Text variant="greeting">{greeting}</Text>
        {today ? (
          <Text variant="lead" tone="muted" style={styles.summary}>
            {summary(today, people.label)}
          </Text>
        ) : null}
      </View>

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

      {today && today.inboxCount > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/inbox')}
          style={(s: PressState) => [styles.inbox, s.hovered && { borderColor: color.ink }]}
        >
          <Inbox size={18} color={color.ink} strokeWidth={2.2} />
          <Text variant="label" style={styles.inboxText}>
            {today.inboxCount === 1 ? '1 thing to sort' : `${today.inboxCount} things to sort`} in
            the inbox
          </Text>
          <ArrowRight size={16} color={color.ink} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      {error ? (
        <View style={styles.block}>
          <ErrorNotice
            message={today ? 'Couldn’t refresh. Pull down or try again.' : 'Couldn’t load today.'}
            onRetry={load}
          />
        </View>
      ) : null}

      {!today && !error ? (
        <Skeleton label="Loading today">
          <View style={[styles.block, styles.skeletonHead]}>
            <SkeletonBlock width={160} height={18} />
          </View>
          <SkeletonRows count={4} />
        </Skeleton>
      ) : null}

      {today ? (
        <FadeIn>
          {desktop ? (
            <View style={styles.columns}>
              <View style={styles.main}>
                {needs}
                {week}
              </View>
              <View style={styles.side}>
                {moving}
                {handled}
                {!moving && !handled ? (
                  <View style={styles.block}>
                    <SectionHeader title="Handled" sub="In the last week" />
                    <Text variant="body" tone="muted" style={styles.quiet}>
                      When either of you finishes something, it shows here.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              {needs}
              {week}
              {moving}
              {handled}
            </>
          )}
        </FadeIn>
      ) : null}
    </Page>
  );
}

function CaptureLink({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Plus size={15} color={color.ink} strokeWidth={2.4} />
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

const countLine = (n: number) => (n === 0 ? 'All clear' : n === 1 ? '1 thing' : `${n} things`);

/** One plain sentence about the day, from real data only. */
function summary(t: TodayResponse, label: (id: string | null) => string): string {
  const parts: string[] = [];
  if (t.needsYou.length === 0) parts.push('Nothing needs you right now');
  else if (t.needsYou.length === 1) parts.push(`One thing needs you: ${t.needsYou[0]?.title}`);
  else parts.push(`${t.needsYou.length} things need you`);
  if (t.thisWeek.length > 0)
    parts.push(
      `${t.thisWeek.length === 1 ? 'one thing is' : `${t.thisWeek.length} things are`} due this week across the household`,
    );
  const latest = t.handled[0];
  const line = `${parts.join(', and ')}.`;
  if (!latest) return line;
  const who = label(latest.completedByMemberId ?? latest.ownerMemberId);
  return `${line} Most recently, ${who === 'You' ? 'you' : who} handled “${latest.title}”.`;
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  summary: { maxWidth: 720, marginTop: 4 },
  capture: {
    marginTop: 22,
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
  columns: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  main: { flex: 1.35, minWidth: 0 },
  side: { flex: 1, minWidth: 0 },
  block: { marginTop: 36 },
  skeletonHead: { marginBottom: 8 },
  quiet: { paddingVertical: 14 },
  handled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    cursor: 'pointer',
  },
  handledHover: { opacity: 0.8 },
  handledText: { flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
});
