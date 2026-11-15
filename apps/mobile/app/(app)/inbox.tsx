import { router, useFocusEffect } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Either } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { EmptyState } from '../../design/EmptyState';
import { FadeIn, Skeleton, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, radius } from '../../design/tokens';
import { api, errorMessage, type WorkItem } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

// Inbox: quick captures waiting to be sorted. Keep one (choosing who has it) or let it go.
export default function Inbox() {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { changed } = useCapture();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setItems((await api<{ items: WorkItem[] }>(`/households/${household.id}/inbox`)).items);
      setError(null);
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

  const act = async (item: WorkItem, action: 'accept' | 'discard') => {
    const owner = item.id in owners ? (owners[item.id] ?? null) : item.ownerMemberId;
    setItems((all) => all?.filter((i) => i.id !== item.id) ?? null);
    try {
      await api(`/households/${household.id}/work-items/${item.id}/${action}`, {
        method: 'POST',
        body:
          action === 'accept'
            ? { expectedVersion: item.version, ownerMemberId: owner }
            : { expectedVersion: item.version },
      });
      toast.show(
        action === 'accept'
          ? `Kept for ${owner ? people.label(owner).replace('You', 'you') : 'either of you'}: ${item.title}`
          : `Let go: ${item.title}`,
      );
      changed();
    } catch (caught) {
      toast.show(`Couldn’t sort “${item.title}”.`, { error: true, detail: errorMessage(caught) });
    }
    await load();
  };

  return (
    <Page maxWidth={860}>
      <PageHeader
        title="Inbox"
        lead="Quick captures waiting to be sorted. Keep each one for someone, or let it go."
      />
      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message={error} onRetry={load} />
        </View>
      ) : null}
      {!items && !error ? (
        <Skeleton>
          <SkeletonRows count={3} />
        </Skeleton>
      ) : null}
      {items?.length === 0 ? (
        <EmptyState
          title="All sorted"
          body="Nothing waiting. New captures you send to the inbox land here."
          action={
            <Button
              title="Back to today"
              variant="secondary"
              onPress={() => router.navigate('/')}
            />
          }
        />
      ) : null}
      <FadeIn style={styles.list}>
        {items?.map((item) => {
          const chosen = item.id in owners ? (owners[item.id] ?? null) : item.ownerMemberId;
          return (
            <View key={item.id} style={styles.card}>
              <Text variant="h3">{item.title}</Text>
              <Text variant="kicker" tone="muted">
                Whose is it?
              </Text>
              <View style={styles.chips}>
                {people.assignable.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.isMe ? 'Me' : p.name}
                    leading={<Avatar person={p} size={18} />}
                    accent={p.color}
                    selected={chosen === p.id}
                    onPress={() => setOwners({ ...owners, [item.id]: p.id })}
                  />
                ))}
                <Chip
                  label="Either of us"
                  leading={<Either size={18} />}
                  selected={chosen === null}
                  onPress={() => setOwners({ ...owners, [item.id]: null })}
                />
              </View>
              <View style={styles.actions}>
                <Button
                  title="Keep it"
                  icon={Check}
                  size="sm"
                  onPress={() => act(item, 'accept')}
                />
                <Button
                  title="Let it go"
                  icon={Trash2}
                  size="sm"
                  variant="quiet"
                  onPress={() => act(item, 'discard')}
                />
              </View>
            </View>
          );
        })}
      </FadeIn>
    </Page>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 16 },
  list: { marginTop: 24, gap: 12 },
  card: {
    padding: 18,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
