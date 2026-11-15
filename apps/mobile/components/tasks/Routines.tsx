import { router } from 'expo-router';
import { Pause, Play, Plus, Repeat2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, type PressState } from '../../design/Button';
import { EmptyState } from '../../design/EmptyState';
import { Hatch } from '../../design/Hatch';
import { requestWidgetRefresh } from '../../native/WidgetSync';
import { useLayout } from '../../design/layout';
import { useHaptics } from '../../design/motion/haptics';
import { RotationRing } from '../../design/RotationRing';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, radius } from '../../design/tokens';
import {
  api,
  errorMessage,
  type RoutineDetail,
  type RoutineListEntry,
  type WorkItem,
} from '../../lib/api';
import { relativeDay } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { isDone } from '../../lib/tasks';

export interface RoutineEntry {
  entry: RoutineListEntry;
  detail: RoutineDetail | null;
}

/** Routines as rotation rings: whose turn it is, who's next, and Done / Skip / Swap / Pause. */
export function Routines({
  routines,
  items,
  today,
  onChanged,
}: {
  routines: RoutineEntry[];
  items: WorkItem[];
  today: string;
  onChanged: () => void;
}) {
  const { kind, phone } = useLayout();
  const [showEnded, setShowEnded] = useState(false);
  const active = routines.filter((r) => !r.entry.ended);
  const ended = routines.filter((r) => r.entry.ended);
  const columns = kind === 'desktop' ? 3 : kind === 'tablet' ? 2 : 1;
  return (
    <View style={[styles.section, phone && styles.sectionPhone]}>
      <SectionHeader
        title="Routines"
        sub="Whose turn is next"
        action={
          <Button
            title="New routine"
            size="sm"
            variant="secondary"
            icon={Plus}
            onPress={() => router.push('/routine/new')}
          />
        }
      />
      {active.length === 0 ? (
        <EmptyState
          compact
          title="No routines yet"
          body="The things that come round again: bins night, the furnace filter, the cat’s flea treatment on the 1st. Set one up once and take turns."
          action={
            <Button
              title="Set up a routine"
              size="sm"
              onPress={() => router.push('/routine/new')}
            />
          }
        />
      ) : (
        <View style={styles.grid}>
          {active.map((r, i) => (
            <View
              key={r.entry.id}
              style={[
                styles.cell,
                { width: `${100 / columns}%` },
                columns > 1 && i % columns !== 0 && styles.cellDivider,
              ]}
            >
              <RoutineRing routine={r} items={items} today={today} onChanged={onChanged} />
            </View>
          ))}
        </View>
      )}
      {ended.length > 0 ? (
        <View style={styles.ended}>
          <Button
            title={showEnded ? 'Hide ended routines' : `Ended routines (${ended.length})`}
            variant="quiet"
            size="sm"
            onPress={() => setShowEnded((v) => !v)}
          />
          {showEnded
            ? ended.map((r) => (
                <Pressable
                  key={r.entry.id}
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({ pathname: '/routine/[id]', params: { id: r.entry.id } })
                  }
                  style={styles.endedRow}
                >
                  <Repeat2 size={14} color={color.faint} />
                  <Text variant="body" tone="muted">
                    {r.entry.title}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

function RoutineRing({
  routine,
  items,
  today,
  onChanged,
}: {
  routine: RoutineEntry;
  items: WorkItem[];
  today: string;
  onChanged: () => void;
}) {
  const { entry, detail } = routine;
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const haptics = useHaptics();
  const { phone } = useLayout();
  const [busy, setBusy] = useState<string | null>(null);
  const [doneNow, setDoneNow] = useState(false);
  const base = household ? `/households/${household.id}/routines/${entry.id}` : '';

  const rotation = entry.rotation.map((id) => people.byId(id)).filter((p): p is Person => !!p);
  const firstOpen = detail?.upcoming.find((o) => !o.skipped) ?? null;
  const turnId = entry.next?.ownerMemberId ?? firstOpen?.ownerMemberId ?? entry.ownerMemberId;
  const turn = people.byId(turnId);
  const nextItem = entry.next ? (items.find((i) => i.id === entry.next?.id) ?? null) : null;
  const nextDate = entry.next?.date ?? firstOpen?.date ?? null;
  const index = nextItem?.occurrenceIndex ?? firstOpen?.index ?? null;
  const after =
    rotation.length > 1 && turn
      ? rotation[(rotation.findIndex((p) => p.id === turn.id) + 1) % rotation.length]
      : null;
  const history = (detail?.history ?? []).slice(0, 5);

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    success: string,
    options: { detail?: string; undo?: () => Promise<unknown> } = {},
  ) => {
    setBusy(key);
    try {
      await work();
      requestWidgetRefresh();
      toast.show(success, {
        detail: options.detail,
        ...(options.undo && {
          undo: async () => {
            try {
              await options.undo?.();
            } catch (caught) {
              toast.show(errorMessage(caught), { error: true });
            }
            onChanged();
          },
        }),
      });
      onChanged();
    } catch (caught) {
      setDoneNow(false);
      toast.show(`Couldn’t update “${entry.title}”.`, {
        error: true,
        detail: errorMessage(caught),
        action: { label: 'Try again', run: () => void work().then(onChanged, () => undefined) },
      });
    } finally {
      setBusy(null);
    }
  };

  const latestVersion = async () => (await api<RoutineDetail>(base)).routine.version;

  const done = () => {
    if (!nextItem || !household) return;
    setDoneNow(true);
    haptics.light();
    const path = `/households/${household.id}/work-items/${nextItem.id}`;
    void run(
      'done',
      () =>
        api(path, {
          method: 'PATCH',
          body: { expectedVersion: nextItem.version, status: 'verified_complete', confirmed: true },
        }),
      `Done: ${entry.title}`,
      {
        detail: after ? `Next turn: ${after.isMe ? 'you' : after.name}` : undefined,
        undo: async () => {
          const { item } = await api<{ item: WorkItem }>(path);
          await api(path, {
            method: 'PATCH',
            body: { expectedVersion: item.version, undoComplete: true },
          });
          requestWidgetRefresh();
        },
      },
    ).finally(() => setDoneNow(false));
  };

  const skip = () => {
    if (index === null) return;
    void run(
      'skip',
      () =>
        api(`${base}/occurrences/${index}/skip`, {
          method: 'POST',
          body: { expectedVersion: entry.version },
        }),
      `Skipped this time: ${entry.title}`,
      {
        undo: async () =>
          api(`${base}/occurrences/${index}/unskip`, {
            method: 'POST',
            body: { expectedVersion: await latestVersion() },
          }),
      },
    );
  };

  const swap = () => {
    if (index === null || !after || !turn) return;
    void run(
      'swap',
      () =>
        api(`${base}/occurrences/${index}/swap`, {
          method: 'POST',
          body: { expectedVersion: entry.version, withMemberId: after.id },
        }),
      `Swapped: ${after.isMe ? 'you take' : `${after.name} takes`} this turn`,
      {
        undo: async () =>
          api(`${base}/occurrences/${index}/swap`, {
            method: 'POST',
            body: { expectedVersion: await latestVersion(), withMemberId: turn.id },
          }),
      },
    );
  };

  const pause = () =>
    void run(
      'pause',
      () =>
        api(base, {
          method: 'PATCH',
          body: { expectedVersion: entry.version, paused: !entry.paused },
        }),
      entry.paused ? `Resumed: ${entry.title}` : `Paused: ${entry.title}`,
      {
        detail: entry.paused
          ? 'It starts again from today.'
          : 'Nothing new is added until you resume.',
        undo: async () =>
          api(base, {
            method: 'PATCH',
            body: { expectedVersion: await latestVersion(), paused: entry.paused },
          }),
      },
    );

  const whose = turn ? (turn.isMe ? 'Your turn' : `${turn.name}’s turn`) : 'Anyone';
  const when = entry.paused
    ? 'Paused'
    : nextDate
      ? relativeDay(nextDate, today)
      : 'Nothing due yet';
  const canDone = !!nextItem && !isDone(nextItem) && !entry.paused && !doneNow;

  return (
    <View style={[styles.ring, phone && styles.ringPhone]}>
      <RotationRing rotation={rotation} turn={turn} size={phone ? 60 : 76} paused={entry.paused} />
      <View style={styles.text}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/routine/[id]', params: { id: entry.id } })}
        >
          {(s: PressState) => (
            <Text variant="h3" style={[styles.title, s.hovered && styles.underline]}>
              {entry.title}
            </Text>
          )}
        </Pressable>
        <Text variant="meta" tone="muted">
          <Text variant="meta" color={turn?.color ?? color.ink} style={styles.whose}>
            {whose}
          </Text>
          {' · '}
          {doneNow ? 'Done' : when}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {after ? `Then ${after.isMe ? 'you' : after.name} · ` : ''}
          {entry.summary}
          {people.byId(entry.subjectMemberId)
            ? ` · for ${people.byId(entry.subjectMemberId)?.name}`
            : ''}
        </Text>
        {history.length > 0 ? (
          <View style={styles.history} accessibilityLabel="Recent turns">
            {history.map((h) => {
              const by = people.byId(h.completedByMemberId ?? h.ownerMemberId);
              const c = by?.color ?? color.faint;
              const missed = !isDone(h) && (h.occurrenceOn ?? today) < today;
              return missed ? (
                <View key={h.id} style={styles.histDot}>
                  <Hatch width={10} height={10} radius={5} stroke={c} />
                </View>
              ) : (
                <View
                  key={h.id}
                  style={[
                    styles.histDot,
                    { borderColor: c, backgroundColor: isDone(h) ? c : 'transparent' },
                  ]}
                />
              );
            })}
          </View>
        ) : null}
        <View style={styles.actions}>
          {entry.paused ? (
            <Button title="Resume" size="sm" icon={Play} busy={busy === 'pause'} onPress={pause} />
          ) : (
            <>
              <Button
                title="Done"
                size="sm"
                busy={busy === 'done'}
                disabled={!canDone}
                onPress={done}
                accessibilityLabel={`Done: ${entry.title}`}
              />
              <Button
                title="Skip"
                size="sm"
                variant="secondary"
                busy={busy === 'skip'}
                disabled={index === null}
                onPress={skip}
                accessibilityLabel={`Skip this time: ${entry.title}`}
              />
              {after ? (
                <Button
                  title="Swap"
                  size="sm"
                  variant="secondary"
                  busy={busy === 'swap'}
                  disabled={index === null}
                  onPress={swap}
                  accessibilityLabel={`Swap turns: ${after.isMe ? 'you take' : `${after.name} takes`} this one`}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Pause ${entry.title}`}
                onPress={pause}
                style={(s: PressState) => [styles.pause, s.hovered && styles.pauseHover]}
              >
                <Pause size={15} strokeWidth={2.2} color={color.muted} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 48 },
  sectionPhone: { marginTop: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: color.hairline, paddingLeft: 22 },
  ring: { flexDirection: 'row', gap: 16, paddingVertical: 20, paddingRight: 18 },
  ringPhone: { gap: 12, paddingVertical: 14, paddingRight: 0 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17.5, lineHeight: 22 },
  underline: { textDecorationLine: 'underline' },
  whose: { fontFamily: 'Figtree-800' },
  history: { flexDirection: 'row', gap: 4, marginTop: 5 },
  histDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.6, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 9 },
  pause: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pauseHover: { backgroundColor: color.lane },
  ended: { marginTop: 12, gap: 4 },
  endedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
});
