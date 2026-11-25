import { MONARCH_SYNC_TIMES } from '@familyos/domain';
import { Copy, KeyRound } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../../design/Button';
import { ErrorNotice } from '../../design/Notice';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type BudgetSync } from '../../lib/api';
import { clock, shortDate } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';
import { localParts } from '../../lib/rhythm';
import { syncedText } from './format';

const TIMES = MONARCH_SYNC_TIMES.map(clock);
const timesText = `${TIMES.slice(0, -1).join(', ')} and ${TIMES.at(-1) ?? ''}`;

/**
 * The Monarch sync's key. A scheduled Claude task, with the owner's Monarch connector, reads the
 * budget at 7am, 12pm, 6pm and 9pm and posts it here with this key, and takes plans set here to
 * Monarch. The key is shown once, when it's made; FamilyOS keeps only its hash and last four
 * characters. Making a new one stops the old one at once; so does turning the sync off.
 */
export function SyncSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const [sync, setSync] = useState<BudgetSync | null | undefined>(undefined);
  const [key, setKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'replace' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localParts(new Date(), timeZone).date;

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setSync(
        (await api<{ sync: BudgetSync | null }>(`/households/${household.id}/budgets/sync`)).sync,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household]);

  useEffect(() => {
    if (!visible) return;
    setKey(null);
    setConfirm(null);
    setError(null);
    void load();
  }, [visible, load]);

  const makeKey = async () => {
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api<{ key: string; sync: BudgetSync }>(
        `/households/${household.id}/budgets/sync/key`,
        { method: 'POST' },
      );
      setKey(made.key);
      setSync(made.sync);
      setConfirm(null);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/households/${household.id}/budgets/sync/key`, { method: 'DELETE' });
      setSync(null);
      setConfirm(null);
      onChanged();
      onClose();
      toast.show('Monarch sync turned off', {
        detail: 'Its key stopped working. Budgets stay as they were.',
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(key);
        toast.show('Key copied');
      } else {
        await Share.share({ message: key });
      }
    } catch {
      setError('Couldn’t copy it. Select the key and copy it by hand.');
    }
  };

  const maker = sync ? people.byId(sync.createdByMemberId) : null;

  return (
    <Sheet visible={visible} onClose={onClose} label="Monarch sync" title="Monarch sync">
      <View style={styles.body}>
        {key ? (
          <>
            <Text variant="chapter">Here’s the sync’s key</Text>
            <Text variant="body" tone="muted">
              Copy it now. You’ll paste it once, into the secure form Claude shows when it sets up
              the sync. FamilyOS keeps only its last four characters, so it can’t be shown again.
            </Text>
            <View style={styles.keyBox}>
              <KeyRound size={17} color={color.ink} strokeWidth={2.2} />
              <TextInput
                value={key}
                editable={false}
                selectTextOnFocus
                accessibilityLabel="The sync key"
                style={styles.key}
              />
            </View>
          </>
        ) : sync === undefined ? (
          <Text variant="body" tone="muted">
            Loading…
          </Text>
        ) : sync ? (
          <>
            <Text variant="chapter">Syncing with Monarch</Text>
            <Text variant="body" tone="muted">
              A scheduled Claude task reads your Monarch budget at {timesText}, and takes the plans
              you set here to Monarch.
            </Text>
            <View style={styles.facts}>
              <Text variant="meta">
                {sync.lastSyncedAt
                  ? `Last synced ${syncedText(sync.lastSyncedAt, timeZone, today)}.`
                  : 'Hasn’t synced yet.'}
              </Text>
              <Text variant="meta" tone="muted">
                Key ending …{sync.keyHint}, made by{' '}
                {maker ? (maker.isMe ? 'you' : maker.name) : 'an adult'} on{' '}
                {shortDate(localParts(sync.createdAt, timeZone).date, today)}.
              </Text>
            </View>
            {confirm === 'replace' ? (
              <Text variant="meta" accessibilityRole="alert">
                A new key stops this one at once. The sync needs the new one before it can run
                again.
              </Text>
            ) : confirm === 'off' ? (
              <Text variant="meta" accessibilityRole="alert">
                Turning the sync off stops its key at once. Budgets stay as they are, and you can
                still import a file.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text variant="chapter">Keep budgets in step with Monarch</Text>
            <Text variant="body" tone="muted">
              A scheduled Claude task, using your Monarch connection, reads the budget at{' '}
              {timesText} and brings it here, and takes the plans you set here to Monarch. FamilyOS
              never connects to Monarch itself, and only ever sees category totals, never
              transactions or accounts.
            </Text>
            <Text variant="body" tone="muted">
              The task needs a key that works only for this. Make one, then copy it into the setup
              when Claude asks.
            </Text>
          </>
        )}
      </View>
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        <View style={styles.actions}>
          {key ? (
            <>
              <Button
                title="Copy the key"
                icon={Copy}
                variant="secondary"
                onPress={() => void copy()}
              />
              <Button title="Done" onPress={onClose} />
            </>
          ) : sync && confirm === 'replace' ? (
            <>
              <Button title="Keep this key" variant="secondary" onPress={() => setConfirm(null)} />
              <Button title="Make a new key" busy={busy} onPress={() => void makeKey()} />
            </>
          ) : sync && confirm === 'off' ? (
            <>
              <Button title="Keep syncing" variant="secondary" onPress={() => setConfirm(null)} />
              <Button title="Turn the sync off" busy={busy} onPress={() => void turnOff()} />
            </>
          ) : sync ? (
            <>
              <Button title="Turn off" variant="quiet" onPress={() => setConfirm('off')} />
              <Button
                title="Replace the key"
                variant="secondary"
                onPress={() => setConfirm('replace')}
              />
            </>
          ) : sync === null ? (
            <>
              <Button title="Not now" variant="secondary" onPress={onClose} />
              <Button
                title="Make a key"
                icon={KeyRound}
                busy={busy}
                onPress={() => void makeKey()}
              />
            </>
          ) : null}
        </View>
      </SheetActions>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  facts: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  keyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
  },
  key: { flex: 1, minWidth: 0, fontFamily: font.uiSemi, fontSize: 14, color: color.ink },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
});
