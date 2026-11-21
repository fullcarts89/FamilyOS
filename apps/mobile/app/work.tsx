import { isAssignableRole } from '@familyos/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { ItemRow, ListScreen, Section } from '../components/items';
import { Body, Button, ErrorText, Title } from '../components/ui';
import { api, errorMessage, type TodayResponse, type WorkItem } from '../lib/api';
import { useHousehold } from '../lib/household';
import { goBack } from '../lib/navigation';

// Work (PRD §4): every open item, grouped by owner, including undated to-dos that Today leaves out.
export default function Work() {
  const { household, members } = useHousehold();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      const [list, td] = await Promise.all([
        api<{ items: WorkItem[] }>(`/households/${household.id}/work-items`),
        api<TodayResponse>(`/households/${household.id}/today`),
      ]);
      // Top-level items only; subtasks show inside their project.
      setItems(
        list.items.filter(
          (i) => !i.parentId && i.status !== 'verified_complete' && i.status !== 'done_unverified',
        ),
      );
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
  const groups = [
    ...members
      .filter((m) => isAssignableRole(m.role))
      .map((m) => ({ title: m.displayName, id: m.id as string | null })),
    { title: 'Unassigned', id: null },
  ];

  return (
    <ListScreen footer={<Button title="Back to Today" onPress={() => goBack()} />}>
      <Title>All to-dos</Title>
      {error && <ErrorText>{error}</ErrorText>}
      {!items && !error && <ActivityIndicator />}
      {items?.length === 0 && <Body muted>Nothing open. Enjoy it.</Body>}
      {items &&
        groups.map((g) => {
          const mine = items.filter((i) => i.ownerMemberId === g.id);
          return mine.length > 0 ? (
            <Section key={g.title} title={g.title}>
              {mine.map((item) => (
                <ItemRow key={item.id} item={item} today={today} />
              ))}
            </Section>
          ) : null;
        })}
    </ListScreen>
  );
}
