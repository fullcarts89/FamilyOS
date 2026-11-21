import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pause, Play, Square } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../../design/Avatar';
import { Button, type PressState } from '../../../design/Button';
import { Chip } from '../../../design/Chip';
import { Hatch } from '../../../design/Hatch';
import { useLayout } from '../../../design/layout';
import { FadeIn, Skeleton, SkeletonRows } from '../../../design/motion';
import { ErrorNotice } from '../../../design/Notice';
import { Page } from '../../../design/Page';
import { RotationRing } from '../../../design/RotationRing';
import { SectionHeader } from '../../../design/Section';
import { Text } from '../../../design/Text';
import { useToast } from '../../../design/Toast';
import { color } from '../../../design/tokens';
import { api, errorMessage, type RoutineDetail, type UpcomingOccurrence } from '../../../lib/api';
import { useCapture } from '../../../lib/capture';
import { friendlyTimes, relativeDay, shortDate, weekdayName } from '../../../lib/dates';
import { useHousehold } from '../../../lib/household';
import { goBack } from '../../../lib/navigation';
import { usePeople, type Person } from '../../../lib/people';
import { DONE, isDone } from '../../../lib/tasks';

// One routine: whose turn it is and who's next, what's coming (skip or swap any turn), who did
// the earlier ones, and pause or end it. No tallies: who did what is a list, not a score.
export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { changed } = useCapture();
  const { desktop } = useLayout();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const base = household ? `/households/${household.id}/routines/${id}` : '';

  const load = useCallback(async () => {
    if (!household || !id) return;
    try {
      setDetail(await api<RoutineDetail>(base));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household, id, base]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!household) return null;
  if (!detail) {
    return (
      <Page maxWidth={1100}>
        {error ? (
          <ErrorNotice message={error} onRetry={load} />
        ) : (
          <Skeleton>
            <SkeletonRows count={4} />
          </Skeleton>
        )}
      </Page>
    );
  }

  const { routine, upcoming, history, today } = detail;

  const run = async (
    path: string,
    body: Record<string, unknown>,
    success: string,
    method = 'POST',
  ) => {
    try {
      await api(`${base}${path}`, { method, body: { expectedVersion: routine.version, ...body } });
      toast.show(success);
      changed();
    } catch (caught) {
      toast.show(`Couldn’t update “${routine.title}”.`, {
        error: true,
        detail: errorMessage(caught),
      });
    }
    await load();
  };

  const rotation = routine.rotation.map((m) => people.byId(m)).filter((p): p is Person => !!p);
  // Turns already done (an early Done) belong to the history, not to what's coming up.
  const coming = upcoming.filter(
    (o) => o.status === null || (!DONE.includes(o.status) && o.status !== 'cancelled'),
  );
  const firstOpen = coming.find((o) => !o.skipped) ?? null;
  const turn = people.byId(firstOpen?.ownerMemberId ?? routine.ownerMemberId);
  const active = !routine.ended && !routine.paused;
  const name = (p: Person | null) => (p ? (p.isMe ? 'you' : p.name) : 'anyone');

  const occurrence = (o: UpcomingOccurrence) => {
    const who = people.byId(o.ownerMemberId);
    const others = rotation.filter((p) => p.id !== o.ownerMemberId);
    return (
      <View key={o.index} style={styles.occ}>
        <View style={styles.occDate}>
          <Text variant="h3" style={[styles.occDay, o.skipped && styles.struck]}>
            {relativeDay(o.date, today)}
          </Text>
          <Text variant="small" tone="muted">
            {relativeDay(o.date, today) === shortDate(o.date, today)
              ? weekdayName(o.date)
              : shortDate(o.date, today)}
          </Text>
        </View>
        <Pressable
          accessibilityRole={o.itemId ? 'link' : undefined}
          disabled={!o.itemId}
          onPress={() =>
            o.itemId && router.push({ pathname: '/item/[id]', params: { id: o.itemId } })
          }
          style={styles.occWho}
        >
          <Avatar person={who} size={26} />
          <Text variant="body" tone={o.skipped ? 'muted' : 'ink'}>
            {o.skipped ? 'Skipped' : who ? (who.isMe ? 'You' : who.name) : 'Anyone'}
            {o === firstOpen && rotation.length > 1 ? ' · next turn' : ''}
          </Text>
        </Pressable>
        {active ? (
          <View style={styles.occActions}>
            {o.skipped ? (
              <Button
                title="Bring back"
                size="sm"
                variant="quiet"
                onPress={() => run(`/occurrences/${o.index}/unskip`, {}, 'Brought back')}
              />
            ) : (
              <>
                <Button
                  title="Skip"
                  size="sm"
                  variant="quiet"
                  onPress={() =>
                    run(
                      `/occurrences/${o.index}/skip`,
                      {},
                      `Skipped ${relativeDay(o.date, today).toLowerCase()}`,
                    )
                  }
                />
                {others.map((p) => (
                  <Button
                    key={p.id}
                    title={`Swap with ${p.isMe ? 'me' : p.name}`}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      run(
                        `/occurrences/${o.index}/swap`,
                        { withMemberId: p.id },
                        `Swapped: ${name(p)} take${p.isMe ? '' : 's'} this one`,
                      )
                    }
                  />
                ))}
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Page maxWidth={1100}>
      <FadeIn>
        <Pressable accessibilityRole="link" onPress={() => goBack('/tasks')} style={styles.back}>
          <ArrowLeft size={16} color={color.muted} strokeWidth={2.2} />
          <Text variant="label" tone="muted">
            Tasks
          </Text>
        </Pressable>
        <View style={styles.head}>
          <RotationRing
            rotation={rotation}
            turn={turn}
            size={desktop ? 104 : 80}
            paused={!active}
          />
          <View style={styles.headText}>
            <Text variant="kicker" tone="muted">
              Routine{routine.paused ? ' · Paused' : routine.ended ? ' · Ended' : ''}
            </Text>
            <Text variant="hero">{routine.title}</Text>
            <Text variant="lead" tone="muted">
              {friendlyTimes(routine.summary)}
              {rotation.length > 1
                ? `. Turns: ${rotation.map((p) => (p.isMe ? 'you' : p.name)).join(' → ')}.`
                : turn
                  ? `. ${turn.isMe ? 'You do' : `${turn.name} does`} it.`
                  : '.'}
            </Text>
          </View>
        </View>
        {error ? (
          <View style={styles.gap}>
            <ErrorNotice message={error} onRetry={load} />
          </View>
        ) : null}
        {routine.paused ? (
          <Text variant="body" tone="muted" style={styles.gap}>
            Paused: nothing new is added until you resume. Resuming starts from today.
          </Text>
        ) : null}

        <View style={[styles.body, desktop && styles.bodyWide]}>
          <View style={styles.main}>
            {active ? (
              <View style={styles.section}>
                <SectionHeader title="Coming up" sub="Skip or swap any turn" />
                {coming.length ? (
                  coming.map(occurrence)
                ) : (
                  <Text variant="body" tone="muted" style={styles.gap}>
                    Nothing scheduled yet.
                  </Text>
                )}
              </View>
            ) : null}
            <View style={styles.section}>
              <SectionHeader title="Earlier turns" />
              {history.length === 0 ? (
                <Text variant="body" tone="muted" style={styles.gap}>
                  No earlier turns yet.
                </Text>
              ) : (
                history.map((h) => {
                  const by = people.byId(h.completedByMemberId ?? h.ownerMemberId);
                  const missed = !isDone(h) && (h.occurrenceOn ?? today) < today;
                  return (
                    <Pressable
                      key={h.id}
                      accessibilityRole="link"
                      onPress={() => router.push({ pathname: '/item/[id]', params: { id: h.id } })}
                      style={(s: PressState) => [styles.hist, s.hovered && { opacity: 0.8 }]}
                    >
                      {missed ? (
                        <Hatch width={22} height={22} radius={11} stroke={by?.color ?? color.ink} />
                      ) : (
                        <Avatar person={by} size={22} />
                      )}
                      <Text variant="body" style={styles.histText}>
                        {h.occurrenceOn ? relativeDay(h.occurrenceOn, today, { late: false }) : ''}
                        {isDone(h)
                          ? ` · done by ${name(people.byId(h.completedByMemberId))}`
                          : missed
                            ? ' · missed, still open'
                            : ''}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
          <View style={[styles.side, desktop && styles.sideWide]}>
            {!routine.ended && rotation.length === 0 ? (
              <View style={styles.block}>
                <Text variant="kicker" tone="muted">
                  Who does it
                </Text>
                <View style={styles.chips}>
                  {people.assignable.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.isMe ? 'Me' : p.name}
                      leading={<Avatar person={p} size={18} />}
                      accent={p.color}
                      selected={routine.ownerMemberId === p.id}
                      onPress={() =>
                        run(
                          '',
                          { ownerMemberId: routine.ownerMemberId === p.id ? null : p.id },
                          'Updated who does it',
                          'PATCH',
                        )
                      }
                    />
                  ))}
                  <Chip
                    label="Anyone"
                    leading={<Either size={18} />}
                    selected={routine.ownerMemberId === null}
                    onPress={() =>
                      routine.ownerMemberId !== null &&
                      run('', { ownerMemberId: null }, 'Anyone can do it', 'PATCH')
                    }
                  />
                </View>
              </View>
            ) : null}
            {!routine.ended ? (
              <View style={styles.block}>
                <Text variant="kicker" tone="muted">
                  Routine
                </Text>
                <View style={styles.chips}>
                  <Button
                    title={routine.paused ? 'Resume' : 'Pause'}
                    icon={routine.paused ? Play : Pause}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      run(
                        '',
                        { paused: !routine.paused },
                        routine.paused ? 'Resumed' : 'Paused',
                        'PATCH',
                      )
                    }
                  />
                  <Button
                    title={confirmEnd ? 'Tap again to end it' : 'End routine'}
                    icon={Square}
                    size="sm"
                    variant={confirmEnd ? 'primary' : 'quiet'}
                    onPress={() => {
                      if (!confirmEnd) return setConfirmEnd(true);
                      setConfirmEnd(false);
                      void run('/end', {}, 'Routine ended');
                    }}
                  />
                </View>
                <Text variant="small" tone="muted">
                  Ending stops future turns. What’s already done stays.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </FadeIn>
    </Page>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    alignSelf: 'flex-start',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8, flexWrap: 'wrap' },
  headText: { flex: 1, minWidth: 240, gap: 6 },
  gap: { marginTop: 16 },
  body: { marginTop: 8 },
  bodyWide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  main: { flex: 1.5, minWidth: 0 },
  side: { gap: 4 },
  sideWide: {
    flex: 1,
    marginTop: 40,
    paddingLeft: 28,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  section: { marginTop: 36 },
  block: { marginTop: 20, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  occ: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    flexWrap: 'wrap',
  },
  occDate: { width: 110 },
  occDay: { fontSize: 17 },
  struck: { textDecorationLine: 'line-through', color: color.muted },
  occWho: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 },
  occActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  hist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    cursor: 'pointer',
  },
  histText: { flex: 1 },
});
