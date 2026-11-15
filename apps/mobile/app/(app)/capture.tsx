import { dueOptions } from '@familyos/domain';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, ListScreen } from '../components/items';
import { Body, Button, ErrorText, Field, Title } from '../components/ui';
import { api, errorMessage, type TodayResponse } from '../lib/api';
import { useHousehold } from '../lib/household';
import { goBack } from '../lib/navigation';

// Quick capture (PRD WF-01, manual for now): a title is enough; owner and date are optional.
export default function Capture() {
  const { household, members } = useHousehold();
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [type, setType] = useState<'task' | 'project'>('task');
  const [today, setToday] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    api<TodayResponse>(`/households/${household.id}/today`)
      .then((t) => setToday(t.date))
      .catch(() => setToday(null));
  }, [household]);

  if (!household) return null;
  const assignable = members.filter((m) => m.role !== 'child');

  const save = async (inbox: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/households/${household.id}/work-items`, {
        method: 'POST',
        body: { title, type, inbox, ownerMemberId: ownerId, dueOn },
      });
      goBack();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const ready = title.trim().length > 0;
  return (
    <ListScreen
      footer={
        <>
          {error && <ErrorText>{error}</ErrorText>}
          <Button title="Add to inbox" onPress={() => save(true)} busy={busy} disabled={!ready} />
          <Button title="Add as to-do" onPress={() => save(false)} disabled={!ready || busy} />
        </>
      }
    >
      <Title>Capture</Title>
      <Field
        label="What needs handling?"
        value={title}
        onChangeText={setTitle}
        autoFocus
        maxLength={500}
        returnKeyType="done"
        onSubmitEditing={() => ready && save(true)}
      />
      <View style={styles.chips}>
        <Chip label="Task" selected={type === 'task'} onPress={() => setType('task')} />
        <Chip
          label="Project with steps"
          selected={type === 'project'}
          onPress={() => setType('project')}
        />
      </View>
      <Body muted>Who (optional)</Body>
      <View style={styles.chips}>
        {assignable.map((m) => (
          <Chip
            key={m.id}
            label={m.displayName}
            selected={ownerId === m.id}
            onPress={() => setOwnerId(ownerId === m.id ? null : m.id)}
          />
        ))}
      </View>
      {today && (
        <>
          <Body muted>When (optional)</Body>
          <View style={styles.chips}>
            {dueOptions(today).map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                selected={dueOn === o.date}
                onPress={() => setDueOn(dueOn === o.date ? null : o.date)}
              />
            ))}
          </View>
        </>
      )}
    </ListScreen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
