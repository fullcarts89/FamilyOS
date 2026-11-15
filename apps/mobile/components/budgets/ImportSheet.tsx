import { BudgetCsvError, parseBudgetCsv } from '@familyos/domain';
import { FileUp } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button } from '../../design/Button';
import { ErrorNotice } from '../../design/Notice';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import { ApiRequestError, apiWithStatus, errorMessage, type BudgetMonth } from '../../lib/api';
import { useHousehold } from '../../lib/household';

const MAX_BYTES = 1024 * 1024;
const UNRECOGNIZED =
  'That file doesn’t look like a Monarch budget export. FamilyOS looks for columns such as Category, Budget and Actual. Export the budget (not transactions) and try again.';

/** Web: open the browser's file picker for a CSV and read it as text. */
function pickCsv(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > MAX_BYTES) return resolve({ name: file.name, text: '\u0000too_large' });
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch(() => resolve(null));
    };
    input.click();
  });
}

/**
 * "Import from Monarch": how to export the budget from Monarch, then the file. Monarch's terms
 * don't allow other apps to connect, so this is a manual upload of the budget export (category
 * totals only; a transactions export is refused and nothing from it is kept).
 */
export function ImportSheet({
  visible,
  month,
  onClose,
  onImported,
}: {
  visible: boolean;
  /** The month on screen: used when the file doesn't say which month it's for. */
  month: string;
  onClose: () => void;
  onImported: (budget: BudgetMonth, months: string[]) => void;
}) {
  const { household } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const web = Platform.OS === 'web';

  const choose = async () => {
    if (!household) return;
    setError(null);
    const picked = await pickCsv();
    if (!picked) return;
    setFile(picked.name);
    if (picked.text === '\u0000too_large') {
      setError('That file is too big. Export one month (or a few) at a time.');
      return;
    }
    // Read it here first (the same parser the API uses), so a wrong file gets a clear answer
    // without a round trip; the API checks it again.
    try {
      parseBudgetCsv(picked.text, { defaultMonth: month });
    } catch (caught) {
      if (caught instanceof BudgetCsvError) {
        setError(
          caught.code === 'unrecognized_csv'
            ? UNRECOGNIZED
            : errorMessage(new ApiRequestError(422, caught.code)),
        );
        return;
      }
    }
    setBusy(true);
    try {
      const { body } = await apiWithStatus<{
        months: string[];
        imported: number;
        budget: BudgetMonth;
      }>(`/households/${household.id}/budgets/import`, {
        method: 'POST',
        body: { csv: picked.text, month },
      });
      onImported(body.budget, body.months);
    } catch (caught) {
      const code = caught instanceof ApiRequestError ? caught.code : '';
      setError(code === 'unrecognized_csv' ? UNRECOGNIZED : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label="Import from Monarch"
      title="Import from Monarch"
    >
      <View style={styles.body}>
        <Text variant="chapter">Bring in this month’s budget</Text>
        <Text variant="body" tone="muted">
          Monarch doesn’t let other apps connect to it, so FamilyOS reads the budget you export.
          Only the category totals are kept (budgeted and spent), never transactions or accounts.
        </Text>
        <View style={styles.steps}>
          {[
            ['Open Monarch on the web', 'Go to Budget and pick the month you want.'],
            [
              'Export the budget as a CSV file',
              'Use Monarch’s export or download option on the budget page. Export the budget, not transactions.',
            ],
            [
              'Upload it here',
              'Importing a month again replaces it, so re-upload whenever you like.',
            ],
          ].map(([title, line], i) => (
            <View key={title} style={styles.step}>
              <View style={styles.n}>
                <Text variant="small" color={color.onInk}>
                  {i + 1}
                </Text>
              </View>
              <View style={styles.stepText}>
                <Text variant="title">{title}</Text>
                <Text variant="meta" tone="muted">
                  {line}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {!web ? (
          <View style={styles.note}>
            <Text variant="meta">
              Uploading from the iPhone app isn’t available yet. Open FamilyOS on the web on a
              computer to upload the file; the budget then shows here too.
            </Text>
          </View>
        ) : null}
      </View>
      {web ? (
        <SheetActions>
          {error ? <ErrorNotice message={error} /> : null}
          <View style={styles.actions}>
            <Button
              title={
                busy
                  ? 'Reading the file…'
                  : file && error
                    ? 'Choose another file'
                    : 'Choose the CSV file'
              }
              icon={FileUp}
              busy={busy}
              onPress={() => void choose()}
            />
            <Button title="Cancel" variant="quiet" onPress={onClose} />
          </View>
        </SheetActions>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  steps: { gap: 12, marginTop: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  n: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepText: { flex: 1, gap: 2 },
  note: { padding: 12, borderRadius: radius.md, backgroundColor: color.lane },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
});
