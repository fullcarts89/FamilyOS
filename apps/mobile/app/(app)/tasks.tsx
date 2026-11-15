import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { PersonColumn } from '../../components/tasks/PersonColumn';
import { Projects } from '../../components/tasks/Projects';
import { Routines } from '../../components/tasks/Routines';
import { Avatar, Either } from '../../design/Avatar';
import type { PressState } from '../../design/Button';
import { useLayout } from '../../design/layout';
import { FadeIn, SkeletonRows, Skeleton, useCelebrate } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { Text } from '../../design/Text';
import { color, radius, shadow } from '../../design/tokens';
import type { WorkItem } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import {
  WHEN_ORDER,
  byDue,
  isDone,
  isOpen,
  useTaskActions,
  whenOf,
  type When,
} from '../../lib/tasks';
import { useTasksData } from '../../lib/use-household-data';

type Section = string; // a member id, 'shared', 'projects' or 'routines'
const SETTLE_MS = 1600;

// Tasks: "Who's carrying what". Each person's list (and the shared one), grouped by when; projects
// as tracks to their dates; routines as rotation rings. What each person has, never a score.
export default function Tasks() {
  const params = useLocalSearchParams<{ section?: string }>();
  const { timeZone } = useHousehold();
  const people = usePeople();
  const { desktop, phone } = useLayout();
  const { open, changed } = useCapture();
  const { celebrate } = useCelebrate();
  const data = useTasksData();
  const { items, today, routines, error, load, refresh, refreshing, replace } = data;

  // Just-finished items stay in place, done, for a moment, then leave the list.
  const [settling, setSettling] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const itemsRef = useRef<WorkItem[] | null>(items);
  itemsRef.current = items;

  const track = useCallback(
    (item: WorkItem) => {
      const before = itemsRef.current?.find((i) => i.id === item.id);
      if (isDone(item) && before && !isDone(before)) {
        setSettling((s) => new Set(s).add(item.id));
        clearTimeout(timers.current.get(item.id));
        timers.current.set(
          item.id,
          setTimeout(() => {
            setSettling((s) => {
              const n = new Set(s);
              n.delete(item.id);
              return n;
            });
          }, SETTLE_MS),
        );
      }
      replace(item);
    },
    [replace],
  );

  // Milestones, only after the server confirms: today's list cleared; a project's steps all done.
  const onConfirmed = useCallback(
    ({ kind, after }: { kind: string; after: WorkItem }) => {
      const all = itemsRef.current ?? [];
      if (kind !== 'completed' || !today) return;
      const me = people.me;
      if (after.parentId) {
        const project = all.find((i) => i.id === after.parentId);
        const steps = all.filter((i) => i.parentId === after.parentId);
        const doneCount = steps.filter(isDone).length;
        if (project && steps.length > 0 && doneCount === steps.length) {
          celebrate({
            key: `project-steps-done:${project.id}`,
            title: `Every step of ${project.title} is done`,
            line: 'All that’s left is to call it finished.',
            colors: people.all.map((p) => p.color),
          });
        } else if (project && steps.length >= 4 && doneCount === Math.ceil(steps.length / 2)) {
          celebrate({
            key: `project-halfway:${project.id}`,
            title: `Halfway through ${project.title}`,
            line: `${doneCount} of ${steps.length} steps done.`,
            colors: people.all.map((p) => p.color),
          });
        }
        return;
      }
      if (after.type === 'project') {
        celebrate({
          key: `project-done:${after.id}`,
          title: `${after.title} is finished`,
          line: 'That one took real work. It’s done.',
          colors: people.all.map((p) => p.color),
        });
        return;
      }
      const wasUrgent = (i: WorkItem) => {
        const w = whenOf(i, today, timeZone);
        return w === 'late' || w === 'today';
      };
      if (!me || after.ownerMemberId !== me.id || !wasUrgent({ ...after, status: 'ready' })) return;
      const left = all.filter(
        (i) =>
          i.ownerMemberId === me.id &&
          !i.parentId &&
          i.type !== 'project' &&
          isOpen(i) &&
          i.id !== after.id &&
          wasUrgent(i),
      );
      if (left.length === 0) {
        celebrate({
          key: `today-clear:${today}:${me.id}`,
          title: 'That’s everything for today',
          line: 'Your list for today is clear. The rest can wait.',
          colors: me ? [me.color] : undefined,
        });
      }
    },
    [today, timeZone, people, celebrate],
  );

  const actions = useTaskActions(track, onConfirmed);

  const columns: { key: string; person: Person | null; title: string; sub: string }[] = useMemo(
    () => [
      ...people.assignable.map((p) => ({
        key: p.id,
        person: p,
        title: p.isMe ? 'You' : p.name,
        sub: p.isMe ? 'On you' : `${p.name}’s handling`,
      })),
      { key: 'shared', person: null, title: 'Shared', sub: 'Up for grabs · either of you' },
    ],
    [people.assignable],
  );

  const groupsFor = useCallback(
    (ownerId: string | null): Record<When, WorkItem[]> => {
      const g = Object.fromEntries(WHEN_ORDER.map((w) => [w, [] as WorkItem[]])) as Record<
        When,
        WorkItem[]
      >;
      if (!items || !today) return g;
      const sort = byDue(timeZone);
      for (const item of items) {
        if (item.parentId || item.type === 'project') continue;
        if (item.ownerMemberId !== ownerId) continue;
        if (!isOpen(item) && !settling.has(item.id)) continue;
        g[whenOf(item, today, timeZone)].push(item);
      }
      for (const w of WHEN_ORDER) g[w].sort(sort);
      return g;
    },
    [items, today, timeZone, settling],
  );

  const initial: Section =
    params.section === 'routines' || params.section === 'projects'
      ? params.section
      : (people.me?.id ?? 'shared');
  const [section, setSection] = useState<Section>(initial);
  useEffect(() => {
    if (params.section === 'routines' || params.section === 'projects') setSection(params.section);
  }, [params.section]);

  const partnerColors: [string, string] | undefined =
    people.me && people.partner ? [people.me.color, people.partner.color] : undefined;

  const column = (c: (typeof columns)[number], showHeader = true) => (
    <PersonColumn
      key={c.key}
      person={c.person}
      title={c.title}
      sub={c.sub}
      groups={groupsFor(c.person?.id ?? null)}
      today={today ?? ''}
      onComplete={actions.complete}
      onAssign={actions.assign}
      onReschedule={actions.reschedule}
      onAdd={() => open(c.person?.id ?? null)}
      sharedColors={partnerColors}
      showHeader={showHeader}
    />
  );

  const ready = items && today && routines;
  const projects = ready ? (
    <Projects
      items={items}
      today={today}
      onComplete={actions.complete}
      onReopen={actions.reopen}
      onAssign={actions.assign}
      onChanged={() => {
        void load();
        changed();
      }}
    />
  ) : null;
  const routineList = ready ? (
    <Routines routines={routines} items={items} today={today} onChanged={() => void load()} />
  ) : null;

  const tabs: { key: Section; label: string; leading?: React.ReactNode }[] = [
    ...columns.map((c) => ({
      key: c.key,
      label: c.title,
      leading: c.person ? (
        <Avatar person={c.person} size={20} />
      ) : (
        <Either size={20} colors={partnerColors} />
      ),
    })),
    { key: 'projects', label: 'Projects' },
    { key: 'routines', label: 'Routines' },
  ];

  return (
    <Page refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <PageHeader
        title="Who’s carrying what"
        lead={
          phone
            ? undefined
            : 'Everything open in the household, by who has it. Hand something over in one tap.'
        }
      />
      {error ? (
        <View style={styles.notice}>
          <ErrorNotice
            message={items ? 'Couldn’t refresh. Showing what we had.' : 'Couldn’t load your tasks.'}
            onRetry={load}
          />
        </View>
      ) : null}

      {desktop ? (
        <>
          {ready ? (
            <FadeIn>
              <View style={styles.columns}>
                {columns.map((c, i) => (
                  <View
                    key={c.key}
                    style={[
                      styles.col,
                      i > 0 && styles.colDivider,
                      i === 0 && { paddingLeft: 0 },
                      i === columns.length - 1 && { paddingRight: 0 },
                      { width: `${100 / columns.length}%` },
                    ]}
                  >
                    {column(c)}
                  </View>
                ))}
              </View>
            </FadeIn>
          ) : !error ? (
            <TasksSkeleton count={columns.length} />
          ) : null}
          {projects}
          {routineList}
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabs}
            accessibilityRole="tablist"
          >
            {tabs.map((t) => {
              const on = section === t.key;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setSection(t.key)}
                  style={(s: PressState) => [
                    styles.tab,
                    on && styles.tabOn,
                    !on && s.hovered && { backgroundColor: color.lane },
                  ]}
                >
                  {t.leading}
                  <Text variant="label" tone={on ? 'ink' : 'muted'}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {!ready ? (
            !error ? (
              <TasksSkeleton count={1} />
            ) : null
          ) : section === 'projects' ? (
            <FadeIn key="projects">{projects}</FadeIn>
          ) : section === 'routines' ? (
            <FadeIn key="routines">{routineList}</FadeIn>
          ) : (
            <FadeIn key={section} style={styles.phoneList}>
              {(() => {
                const c = columns.find((x) => x.key === section) ?? columns[0];
                return c ? column(c, false) : null;
              })()}
            </FadeIn>
          )}
        </>
      )}
    </Page>
  );
}

function TasksSkeleton({ count }: { count: number }) {
  return (
    <Skeleton label="Loading tasks">
      <View style={styles.columns}>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[styles.col, i > 0 && styles.colDivider, { width: `${100 / count}%` }]}
          >
            <SkeletonRows count={4} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: 16 },
  columns: {
    flexDirection: 'row',
    marginTop: 28,
    borderTopWidth: 2,
    borderTopColor: color.ink,
  },
  col: { paddingTop: 18, paddingHorizontal: 24 },
  colDivider: { borderLeftWidth: 1, borderLeftColor: color.hairline },
  tabsScroll: { marginTop: 14, marginHorizontal: -16, flexGrow: 0 },
  tabs: { gap: 6, paddingHorizontal: 16, paddingVertical: 2 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    cursor: 'pointer',
  },
  tabOn: { backgroundColor: color.surface, boxShadow: shadow.raised },
  phoneList: { marginTop: 6 },
});
