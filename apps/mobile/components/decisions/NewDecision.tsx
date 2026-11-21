import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton } from '../../design/Button';
import { Field } from '../../design/Field';
import { SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import type { Decision } from '../../lib/api';

/**
 * A question and a few options, nothing more. The options start as two blanks ("Matte",
 * "Glossy"); a third appears on request. Used in a sheet and inline in the Weekly Reset.
 */
export function NewDecision({
  onCreate,
  onDone,
}: {
  onCreate: (input: { question: string; options: string[] }) => Promise<Decision | null>;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 2;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    const made = await onCreate({ question, options: filled });
    setBusy(false);
    if (made) onDone();
  };

  return (
    <View style={styles.form}>
      <Field
        label="What do you need to decide?"
        value={question}
        onChangeText={setQuestion}
        placeholder="Thanksgiving: host here or travel?"
        maxLength={200}
        autoFocus
      />
      <View style={styles.options}>
        <Text variant="label" style={styles.label}>
          The options
        </Text>
        {options.map((o, i) => (
          <View key={i} style={styles.optionRow}>
            <View style={styles.optionField}>
              <Field
                label={`Option ${i + 1}`}
                value={o}
                onChangeText={(t) => setOptions((all) => all.map((x, j) => (j === i ? t : x)))}
                placeholder={i === 0 ? 'Host here' : i === 1 ? 'Travel' : 'Something else'}
                maxLength={80}
                onSubmitEditing={() => void save()}
              />
            </View>
            {options.length > 2 ? (
              <IconButton
                icon={X}
                label={`Remove option ${i + 1}`}
                onPress={() => setOptions((all) => all.filter((_, j) => j !== i))}
              />
            ) : null}
          </View>
        ))}
        {options.length < 8 ? (
          <Button
            title="Another option"
            icon={Plus}
            variant="quiet"
            size="sm"
            onPress={() => setOptions((all) => [...all, ''])}
          />
        ) : null}
      </View>
      <SheetActions>
        <View style={styles.actions}>
          <Button title="Add it" busy={busy} disabled={!ready} onPress={() => void save()} />
          <Button title="Cancel" variant="quiet" onPress={onDone} />
        </View>
      </SheetActions>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  options: { gap: 8 },
  label: { fontSize: 13.5 },
  optionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  optionField: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
