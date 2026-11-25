import { Check, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../design/Button';
import { Field } from '../../design/Field';
import { ErrorNotice } from '../../design/Notice';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { api, errorMessage, type VisitorView } from '../../lib/api';
import { addDays } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { DayStepper } from './DayStepper';

export type VisitorTarget = { mode: 'add' } | { mode: 'edit'; visitor: VisitorView };

/**
 * Family or friends coming to stay: a name, their days, and a note (where they're sleeping,
 * flight times). Not an account: they see nothing and nothing is assigned to them.
 */
export function VisitorSheet({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: VisitorTarget | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const title = target?.mode === 'edit' ? target.visitor.name : 'Add a visitor';
  return (
    <Sheet visible={target !== null} onClose={onClose} label={title} title={title} width={540}>
      {target ? (
        <VisitorForm
          key={target.mode === 'edit' ? target.visitor.id : 'add'}
          target={target}
          today={today}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </Sheet>
  );
}

function VisitorForm({
  target,
  today,
  onClose,
  onChanged,
}: {
  target: VisitorTarget;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { household } = useHousehold();
  const toast = useToast();
  const editing = target.mode === 'edit' ? target.visitor : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [arrivesOn, setArrivesOn] = useState(editing?.arrivesOn ?? addDays(today, 7));
  const [leavesOn, setLeavesOn] = useState(editing?.leavesOn ?? addDays(today, 9));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = household ? `/households/${household.id}/visitors` : '';

  const save = async () => {
    if (!household || !name.trim()) return;
    setBusy('save');
    setError(null);
    try {
      if (editing) {
        const changes = {
          ...(name.trim() !== editing.name && { name: name.trim() }),
          ...(arrivesOn !== editing.arrivesOn && { arrivesOn }),
          ...(leavesOn !== editing.leavesOn && { leavesOn }),
          ...((notes.trim() || null) !== editing.notes && { notes: notes.trim() || null }),
        };
        if (Object.keys(changes).length > 0) {
          await api(`${base}/${editing.id}`, {
            method: 'PATCH',
            body: { expectedVersion: editing.version, ...changes },
          });
          toast.show('Saved');
        }
      } else {
        await api(base, {
          method: 'POST',
          body: {
            name: name.trim(),
            arrivesOn,
            leavesOn,
            ...(notes.trim() && { notes: notes.trim() }),
          },
        });
        toast.show(`${name.trim()} is on the calendar`, {
          detail: 'Today and the Weekly Reset show them a week ahead.',
        });
      }
      onChanged();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!household || !editing) return;
    setBusy('remove');
    setError(null);
    try {
      await api(`${base}/${editing.id}?expectedVersion=${editing.version}`, { method: 'DELETE' });
      toast.show(`Removed ${editing.name}`);
      onChanged();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="Who’s coming"
        value={name}
        onChangeText={setName}
        placeholder="Grandma and Grandpa"
        autoFocus={!editing}
        maxLength={80}
      />
      <DayStepper
        label="Arriving"
        value={arrivesOn}
        today={today}
        onChange={(d) => {
          if (!d) return;
          setArrivesOn(d);
          if (leavesOn < d) setLeavesOn(d);
        }}
      />
      <DayStepper
        label="Leaving"
        value={leavesOn}
        today={today}
        min={arrivesOn}
        onChange={(d) => d && setLeavesOn(d)}
      />
      <Field
        label="A note (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Guest room · landing 4:10pm Friday"
        maxLength={500}
      />
      <Text variant="meta" tone="muted">
        Visitors don’t get an account and can’t see anything.
      </Text>
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        {confirmRemove && editing ? (
          <View style={styles.confirm}>
            <Text variant="body">Remove {editing.name}’s visit?</Text>
            <View style={styles.actions}>
              <Button title="Remove" busy={busy === 'remove'} onPress={remove} />
              <Button title="Keep it" variant="quiet" onPress={() => setConfirmRemove(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button
              title={editing ? 'Save' : 'Add visitor'}
              icon={Check}
              busy={busy === 'save'}
              disabled={!name.trim()}
              onPress={save}
            />
            {editing ? (
              <Button
                title="Remove"
                icon={Trash2}
                variant="quiet"
                onPress={() => setConfirmRemove(true)}
              />
            ) : null}
            <Button title="Cancel" variant="quiet" onPress={onClose} />
          </View>
        )}
      </SheetActions>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18, paddingBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  confirm: { gap: 10 },
});
