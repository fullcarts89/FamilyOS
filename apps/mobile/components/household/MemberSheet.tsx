import { router } from 'expo-router';
import { Baby, Check, PawPrint, Repeat2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { FadeIn } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { choosablePalette, color, radius, tint } from '../../design/tokens';
import { api, errorMessage, type Member } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople, type Person } from '../../lib/people';
import { ColorPicker } from './ColorPicker';

export type MemberTarget =
  { mode: 'add'; role?: 'child' | 'pet' } | { mode: 'edit'; person: Person };

const SPECIES = ['Dog', 'Cat', 'Rabbit', 'Bird', 'Fish'];

/** The first palette color nobody has yet. */
export function freeColor(taken: string[]): string {
  const used = new Set(taken.map((t) => t.toUpperCase()));
  return (
    choosablePalette.find((c) => !used.has(c.toUpperCase())) ?? choosablePalette[0] ?? '#2F6FB3'
  );
}

/**
 * Add a child or pet, or change someone's name, color and details, in a small guided sheet.
 * After adding a pet, it offers the obvious next step: a recurring care routine for them.
 */
export function MemberSheet({
  target,
  onClose,
}: {
  target: MemberTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={target !== null}
      onClose={onClose}
      label={target?.mode === 'edit' ? `Edit ${target.person.name}` : 'Add to the household'}
      title={target?.mode === 'edit' ? 'Edit' : 'Add to the household'}
      width={540}
    >
      {target ? (
        <MemberForm
          key={target.mode === 'edit' ? target.person.id : `add:${target.role ?? ''}`}
          target={target}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function MemberForm({ target, onClose }: { target: MemberTarget; onClose: () => void }) {
  const { household, putMember } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const editing = target.mode === 'edit' ? target.person : null;
  const [role, setRole] = useState<'child' | 'pet' | null>(
    editing
      ? editing.role === 'pet'
        ? 'pet'
        : editing.role === 'child'
          ? 'child'
          : null
      : target.mode === 'add'
        ? (target.role ?? null)
        : null,
  );
  const [name, setName] = useState(editing?.name ?? '');
  const [species, setSpecies] = useState(editing?.species ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const others = people.all.filter((p) => p.id !== editing?.id).map((p) => p.color);
  const [hex, setHex] = useState(editing?.color ?? freeColor(others));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Member | null>(null);

  const isAdult = !!editing && !editing.caredFor;
  const preview: Pick<Person, 'initial' | 'color'> = {
    initial: (name.trim() || '?').slice(0, 1).toUpperCase(),
    color: hex,
  };

  const save = async () => {
    if (!household || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const changes = {
          ...(name.trim() !== editing.name && { displayName: name.trim() }),
          ...(hex.toUpperCase() !== editing.color.toUpperCase() && { color: hex }),
          ...(!isAdult && (note.trim() || null) !== editing.note && { note: note.trim() || null }),
          ...(editing.role === 'pet' &&
            (species.trim() || null) !== editing.species && { species: species.trim() || null }),
        };
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        // The new color shows everywhere at once; it goes back if the API refuses.
        putMember({ id: editing.id, displayName: editing.name, role: editing.role, color: hex });
        const { member } = await api<{ member: Member }>(
          `/households/${household.id}/members/${editing.id}`,
          { method: 'PATCH', body: { expectedVersion: editing.version, ...changes } },
        ).catch((e: unknown) => {
          putMember({
            id: editing.id,
            displayName: editing.name,
            role: editing.role,
            color: editing.color,
          });
          throw e;
        });
        putMember(member);
        toast.show(`Saved ${member.displayName}`);
        onClose();
      } else if (role) {
        const { member } = await api<{ member: Member }>(`/households/${household.id}/members`, {
          method: 'POST',
          body: {
            role,
            displayName: name.trim(),
            color: hex,
            ...(role === 'pet' && species.trim() && { species: species.trim() }),
            ...(note.trim() && { note: note.trim() }),
          },
        });
        putMember(member);
        setAdded(member);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (added) {
    const person = people.byId(added.id) ?? { initial: added.displayName.slice(0, 1), color: hex };
    return (
      <FadeIn style={styles.done}>
        <View style={styles.doneHead}>
          <Avatar person={person} size={48} />
          <View style={styles.doneText}>
            <Text variant="chapter">{added.displayName} is part of the household</Text>
            <Text variant="body" tone="muted">
              {added.role === 'pet'
                ? `${added.displayName} gets a lane on Today, and their care can repeat on its own.`
                : `${added.displayName}’s drop-offs and pickups now show who has them.`}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {added.role === 'pet' ? (
            <Button
              title={`Set up ${added.displayName}’s care routine`}
              icon={Repeat2}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/routine/new',
                  params: {
                    for: added.id,
                    title: `${added.displayName}’s flea meds`,
                    preset: 'first',
                  },
                });
              }}
            />
          ) : null}
          <Button
            title="Done"
            variant={added.role === 'pet' ? 'secondary' : 'primary'}
            onPress={onClose}
          />
        </View>
      </FadeIn>
    );
  }

  if (!role && !editing) {
    return (
      <View style={styles.choose}>
        <Text variant="chapter">Who’s joining?</Text>
        <Text variant="body" tone="muted">
          Children and pets don’t need an account. They get their own color and a lane on Today.
        </Text>
        <View style={styles.choices}>
          {(
            [
              ['child', 'A child', 'Drop-offs, pickups, checkups', Baby],
              ['pet', 'A pet', 'Walks, vet visits, monthly meds', PawPrint],
            ] as const
          ).map(([r, title, sub, Icon]) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              onPress={() => setRole(r)}
              style={(s: PressState) => [styles.choice, s.hovered && styles.choiceHover]}
            >
              <Icon size={24} color={color.ink} strokeWidth={2} />
              <Text variant="h3">{title}</Text>
              <Text variant="meta" tone="muted">
                {sub}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <View style={styles.previewRow}>
        <Avatar person={preview} size={44} />
        <View style={[styles.previewLane, { backgroundColor: tint(hex, 0.16), borderColor: hex }]}>
          <Text variant="small" numberOfLines={1}>
            {name.trim() || (role === 'pet' ? 'Your pet' : role === 'child' ? 'Your child' : 'You')}
            ’s lane
          </Text>
        </View>
      </View>
      <Field
        label={role === 'pet' ? 'Their name' : editing && !editing.caredFor ? 'Name' : 'Their name'}
        value={name}
        onChangeText={setName}
        placeholder={role === 'pet' ? 'Biscuit' : 'June'}
        autoFocus={!editing}
        maxLength={60}
      />
      {role === 'pet' ? (
        <View style={styles.group}>
          <Text variant="label">What kind of pet?</Text>
          <View style={styles.chips}>
            {SPECIES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={species === s}
                onPress={() => setSpecies(species === s ? '' : s)}
              />
            ))}
          </View>
          {!SPECIES.includes(species) || species === '' ? (
            <Field
              label="Or something else"
              value={SPECIES.includes(species) ? '' : species}
              onChangeText={setSpecies}
              placeholder="Tortoise"
              maxLength={40}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.group}>
        <Text variant="label">Their color</Text>
        <ColorPicker value={hex} onChange={setHex} taken={others} />
      </View>
      {!isAdult ? (
        <Field
          label="A note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder={
            role === 'pet' ? 'Flea meds on the 1st' : 'Age 2 · Sunflower room at Little Oaks'
          }
          maxLength={200}
        />
      ) : null}
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        <View style={styles.actions}>
          <Button
            title={editing ? 'Save' : role === 'pet' ? 'Add pet' : 'Add child'}
            icon={editing ? Check : undefined}
            busy={busy}
            disabled={!name.trim()}
            onPress={save}
          />
          <Button title="Cancel" variant="quiet" onPress={onClose} />
        </View>
      </SheetActions>
    </View>
  );
}

const styles = StyleSheet.create({
  choose: { gap: 10, paddingBottom: 8 },
  choices: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  choice: {
    flex: 1,
    minWidth: 180,
    gap: 6,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  choiceHover: { borderColor: color.ink },
  form: { gap: 18, paddingBottom: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewLane: {
    flex: 1,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  group: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  done: { gap: 20, paddingBottom: 8 },
  doneHead: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  doneText: { flex: 1, gap: 4 },
});
