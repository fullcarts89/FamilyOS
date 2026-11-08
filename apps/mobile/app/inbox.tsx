import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, ListScreen } from '../components/items';
import { Body, Button, ErrorText, Title } from '../components/ui';
import { api, errorMessage, type WorkItem } from '../lib/api';
import { useHousehold } from '../lib/household';
import { goBack } from '../lib/navigation';
import { useTheme } from '../lib/theme';

// Inbox (PRD §4): untriaged captures. Accept (optionally assigning) or discard each one.
export default function Inbox() {
  const t = useTheme();
  const { household, members } = useHousehold();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setItems((await api<{ items: WorkItem[] }>(`/households/${household.id}/inbox`)).items);
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
  const assignable = members.filter((m) => m.role !== 'child');

  const act = async (item: WorkItem, action: 'accept' | 'discard') => {
    setError(null);
    try {
      await api(`/households/${household.id}/work-items/${item.id}/${action}`, {
        method: 'POST',
        body:
          action === 'accept'
            ? {
                expectedVersion: item.version,
                ownerMemberId: owners[item.id] ?? item.ownerMemberId,
              }
            : { expectedVersion: item.version },
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <ListScreen footer={<Button title="Done" onPress={() => goBack()} />}>
      <Title>Inbox</Title>
      {error && <ErrorText>{error}</ErrorText>}
      {items?.length === 0 && <Body muted>All sorted.</Body>}
      {items?.map((item) => (
        <View
          key={item.id}
          style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Text style={[styles.title, { color: t.text }]}>{item.title}</Text>
          <View style={styles.chips}>
            {assignable.map((m) => {
              const selected = (owners[item.id] ?? item.ownerMemberId) === m.id;
              return (
                <Chip
                  key={m.id}
                  label={m.displayName}
                  selected={selected}
                  onPress={() => setOwners({ ...owners, [item.id]: selected ? null : m.id })}
                />
              );
            })}
          </View>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button title="Accept" onPress={() => act(item, 'accept')} />
            </View>
            <View style={styles.action}>
              <Button title="Discard" onPress={() => act(item, 'discard')} />
            </View>
          </View>
        </View>
      ))}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 17, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
