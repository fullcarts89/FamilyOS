import { Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../../design/Button';
import { ErrorNotice } from '../../design/Notice';
import { Segmented } from '../../design/Segmented';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, em, font, radius } from '../../design/tokens';
import { api, errorMessage, type BudgetCategory, type BudgetPlanChange } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { money, monthName, parseAmount, planMoney } from './format';

/**
 * A category's plan for a month, set here and sent to Monarch at the next sync: just this month,
 * or this month and every month after. Nothing changes on the page until Monarch confirms it;
 * until then the category shows the change as waiting.
 */
export function PlanSheet({
  visible,
  month,
  category,
  waiting,
  nextSync,
  onClose,
  onSent,
}: {
  visible: boolean;
  month: string;
  category: BudgetCategory | null;
  /** A change for this category still waiting for Monarch: its amount starts the field. */
  waiting: BudgetPlanChange | null;
  /** "around 12pm". */
  nextSync: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { household } = useHousehold();
  const toast = useToast();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'month' | 'after'>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = monthName(month);

  useEffect(() => {
    if (!visible || !category) return;
    const start = waiting?.toAmount ?? category.budgeted ?? null;
    setText(start ? String(start) : '');
    setScope(waiting?.applyToFuture ? 'after' : 'month');
    setError(null);
  }, [visible, category, waiting]);

  if (!category) return null;
  const amount = parseAmount(text);
  const plan = category.budgeted ?? 0;

  const send = async () => {
    if (!household || amount === null || !category.monarchCategoryId) return;
    setBusy(true);
    setError(null);
    try {
      const { change } = await api<{ change: BudgetPlanChange | null }>(
        `/households/${household.id}/budgets/changes`,
        {
          method: 'POST',
          body: {
            month,
            monarchCategoryId: category.monarchCategoryId,
            amount,
            applyToFuture: scope === 'after',
          },
        },
      );
      onSent();
      onClose();
      toast.show(
        change
          ? `Waiting for Monarch: ${category.category}, ${planMoney(amount)}`
          : `${category.category} stays at Monarch’s ${planMoney(amount)}`,
        change
          ? { detail: `Goes to Monarch at the next sync${nextSync ? `, ${nextSync}` : ''}.` }
          : undefined,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label={`Change the plan for ${category.category}`}
      title={`Plan for ${name}`}
    >
      <View style={styles.body}>
        <Text variant="chapter">{category.category}</Text>
        <Text variant="meta" tone="muted">
          {money(category.actual ?? 0)} spent so far ·{' '}
          {plan ? `Monarch’s plan is ${planMoney(plan)}` : 'No plan in Monarch yet'}
        </Text>
        <View style={styles.amount}>
          <Text style={styles.dollar} aria-hidden>
            $
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void send()}
            placeholder="0"
            placeholderTextColor={color.faint}
            accessibilityLabel={`New plan for ${category.category} in ${name}, in dollars`}
            aria-invalid={!!text && amount === null}
            inputMode="decimal"
            keyboardType="decimal-pad"
            autoFocus
            maxLength={12}
            style={styles.input}
          />
        </View>
        {text && amount === null ? (
          <Text variant="meta" tone="danger" accessibilityRole="alert">
            Write the plan in dollars, like 1,400 or 462.50.
          </Text>
        ) : null}
        <Segmented
          label="Which months"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'month', label: `Just ${name}` },
            { value: 'after', label: `${name} and after` },
          ]}
        />
        {scope === 'after' ? (
          <Text variant="small" tone="muted">
            “{name} and after” also replaces any plans already set for later months in Monarch.
          </Text>
        ) : null}
        <View style={styles.note}>
          <Clock size={15} color={color.muted} strokeWidth={2.2} />
          <Text variant="meta" tone="muted" style={styles.noteText}>
            Goes to Monarch at the next sync{nextSync ? `, ${nextSync}` : ''}. Until Monarch
            confirms it, it shows as waiting, and Monarch’s number stays on the page.
          </Text>
        </View>
      </View>
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        <View style={styles.actions}>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button
            title="Send to Monarch"
            busy={busy}
            disabled={amount === null}
            onPress={() => void send()}
          />
        </View>
      </SheetActions>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  amount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: color.ink,
    marginVertical: 4,
  },
  dollar: { fontFamily: font.displayHeavy, fontSize: 36, lineHeight: 46, color: color.ink },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.displayHeavy,
    fontSize: 36,
    lineHeight: 46,
    letterSpacing: em(36, -0.02),
    color: color.ink,
    paddingVertical: 4,
  },
  note: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: color.ground,
  },
  noteText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
});
