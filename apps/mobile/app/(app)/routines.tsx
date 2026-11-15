import { formatDue } from '@familyos/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ListScreen, Section } from '../components/items';
import { Body, Button, ErrorText, Title } from '../components/ui';
import { api, errorMessage, type RoutineListEntry, type TodayResponse } from '../lib/api';
import { useHousehold } from '../lib/household';
import { goBack } from '../lib/navigation';
import { whoLabel } from '../lib/routines';
import { useTheme } from '../lib/theme';

// Routines (PRD WF-02): recurring chores and maintenance, each with its schedule and whose turn is next.
export default function Routines() {
  const t = useTheme();
  const { household, memberName } = useHousehold();
  const [routines, setRoutines] = useState<RoutineListEntry[] | null>(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      const [list, td] = await Promise.all([
        api<{ routines: RoutineListEntry[] }>(`/households/${household.id}/routines`),
        api<TodayResponse>(`/households/${household.id}/today`),
      ]);
      setRoutines(list.routines);
      setToday(td.date);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!household) return null;
  const active = routines?.filter((r) => !r.ended) ?? [];
  const ended = routines?.filter((r) => r.ended) ?? [];

  const row = (r: RoutineListEntry) => {
    const next = r.next
      ? `Next: ${formatDue(r.next.date, today)}${r.next.ownerMemberId ? ` · ${memberName(r.next.ownerMemberId) ?? ''}` : ''}`
      : r.paused
        ? 'Paused'
        : r.ended
          ? 'Ended'
          : 'Nothing due yet';
    return (
      <Pressable
        key={r.id}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
          ↻ {r.title}
        </Text>
        <Text style={[styles.meta, { color: t.muted }]}>{r.summary}</Text>
        <Text style={[styles.meta, { color: t.muted }]}>
          {whoLabel(r, memberName)} · {next}
        </Text>
      </Pressable>
    );
  };

  return (
    <ListScreen
      footer={
        <>
          <Button title="New routine" onPress={() => router.push('/routine/new')} />
          <Button title="Back to Today" onPress={() => goBack()} />
        </>
      }
    >
      <Title>Routines</Title>
      {error && <ErrorText>{error}</ErrorText>}
      {!routines && !error && <ActivityIndicator />}
      {routines?.length === 0 && (
        <Body muted>
          No routines yet. Add the chores and upkeep that come round again, like bins night or the
          furnace filter.
        </Body>
      )}
      {active.length > 0 && <Section title="Active">{active.map(row)}</Section>}
      {ended.length > 0 && (
        <View>
          <Section title="Ended">{ended.map(row)}</Section>
        </View>
      )}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  title: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13 },
});
