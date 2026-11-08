import { formatDue } from '@familyos/domain';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Chip, ListScreen, Section, StatusBadge } from '../../components/items';
import { Body, Button, ErrorText, Title } from '../../components/ui';
import { api, errorMessage, type RoutineDetail, type UpcomingOccurrence } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { goBack } from '../../lib/navigation';
import { whoLabel } from '../../lib/routines';
import { useTheme } from '../../lib/theme';

const OPEN = (status: string) =>
  !['verified_complete', 'done_unverified', 'cancelled'].includes(status);

// One routine (J3, J3b): what's coming and whose turn it is, skip or swap one, and what got done.
export default function RoutineScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household, members, memberName } = useHousehold();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const base = household ? `/households/${household.id}/routines/${id}` : '';

  const load = useCallback(async () => {
    if (!household || !id) return;
    try {
      setDetail(await api<RoutineDetail>(base));
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
      <ListScreen footer={<Button title="Back" onPress={() => goBack('/routines')} />}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator />}
      </ListScreen>
    );
  }

  const { routine, upcoming, history, fairness, today } = detail;
  const version = routine.version;

  const run = async (path: string, body: Record<string, unknown>, method = 'POST') => {
    setError(null);
    try {
      await api(`${base}${path}`, { method, body: { expectedVersion: version, ...body } });
    } catch (caught) {
      setError(errorMessage(caught));
    }
    await load();
  };

  const name = (memberId: string | null) => memberName(memberId) ?? 'Anyone';
  const others = (o: UpcomingOccurrence) => routine.rotation.filter((m) => m !== o.ownerMemberId);
  const active = !routine.ended && !routine.paused;

  const occurrenceRow = (o: UpcomingOccurrence, first: boolean) => (
    <View
      key={o.index}
      style={[styles.occurrence, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <Pressable
        accessibilityRole={o.itemId ? 'link' : 'text'}
        disabled={!o.itemId}
        onPress={() =>
          o.itemId && router.push({ pathname: '/item/[id]', params: { id: o.itemId } })
        }
      >
        <Text
          style={[
            styles.occurrenceTitle,
            { color: o.skipped ? t.muted : t.text },
            o.skipped && styles.struck,
          ]}
        >
          {formatDue(o.date, today)} · {name(o.ownerMemberId)}
          {first && !o.skipped && routine.rotation.length > 0 ? ' (next turn)' : ''}
        </Text>
        {o.skipped ? <Text style={{ color: t.muted, fontSize: 13 }}>Skipped</Text> : null}
      </Pressable>
      {active && (
        <View style={styles.chips}>
          {o.skipped ? (
            <Chip
              label="Undo skip"
              selected={false}
              onPress={() => run(`/occurrences/${o.index}/unskip`, {})}
            />
          ) : (
            <>
              <Chip
                label="Skip this one"
                selected={false}
                onPress={() => run(`/occurrences/${o.index}/skip`, {})}
              />
              {others(o).map((m) => (
                <Chip
                  key={m}
                  label={`Swap with ${name(m)}`}
                  selected={false}
                  onPress={() => run(`/occurrences/${o.index}/swap`, { withMemberId: m })}
                />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );

  const firstOpen = upcoming.find((o) => !o.skipped);

  return (
    <ListScreen
      footer={
        <>
          {!routine.ended && (
            <Button
              title={routine.paused ? 'Resume' : 'Pause'}
              onPress={() => run('', { paused: !routine.paused }, 'PATCH')}
            />
          )}
          {!routine.ended && (
            <Button
              title={confirmEnd ? 'Tap again to end this routine' : 'End routine'}
              onPress={() => {
                if (!confirmEnd) return setConfirmEnd(true);
                setConfirmEnd(false);
                void run('/end', {});
              }}
            />
          )}
          <Button title="Back" onPress={() => goBack('/routines')} />
        </>
      }
    >
      <Title>↻ {routine.title}</Title>
      <Body>{routine.summary}</Body>
      <Body muted>
        {whoLabel(routine, memberName)}
        {routine.paused ? ' · Paused' : ''}
        {routine.ended ? ' · Ended' : ''}
      </Body>
      {error && <ErrorText>{error}</ErrorText>}

      {routine.paused && (
        <Body muted>
          Paused: nothing new is added until you resume. Resuming starts from today.
        </Body>
      )}

      {active && (
        <Section title="Coming up" empty="Nothing scheduled.">
          {upcoming.map((o) => occurrenceRow(o, o === firstOpen))}
        </Section>
      )}

      {!routine.ended && routine.rotation.length === 0 && (
        <Section title="Who does it" row>
          {members
            .filter((m) => m.role !== 'child')
            .map((m) => (
              <Chip
                key={m.id}
                label={m.displayName}
                selected={routine.ownerMemberId === m.id}
                onPress={() =>
                  run('', { ownerMemberId: routine.ownerMemberId === m.id ? null : m.id }, 'PATCH')
                }
              />
            ))}
        </Section>
      )}

      <Section title={`Done in the last ${fairness.days} days`} empty="Nothing done yet.">
        {fairness.counts.map((f) => (
          <Body key={f.memberId ?? 'none'}>
            {name(f.memberId)}: {f.completed}
          </Body>
        ))}
      </Section>

      <Section title="Earlier" empty="No earlier ones yet.">
        {history.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            style={styles.historyRow}
          >
            <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>
              {item.occurrenceOn ? formatDue(item.occurrenceOn, today) : ''}
              {item.completedByMemberId ? ` · ${name(item.completedByMemberId)}` : ''}
              {OPEN(item.status) && item.occurrenceOn && item.occurrenceOn < today
                ? ' · Missed, still open'
                : ''}
            </Text>
            <StatusBadge status={item.status} />
          </Pressable>
        ))}
      </Section>
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  occurrence: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  occurrenceTitle: { fontSize: 16, fontWeight: '500' },
  struck: { textDecorationLine: 'line-through' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
