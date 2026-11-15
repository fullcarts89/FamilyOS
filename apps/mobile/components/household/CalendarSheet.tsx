import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { ErrorNotice } from '../../design/Notice';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, radius } from '../../design/tokens';
import { api, errorMessage, type CalendarSource } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

type Provider = 'google' | 'icloud' | 'outlook' | 'other';

const GUIDES: Record<Provider, { name: string; steps: string[]; hint: string }> = {
  google: {
    name: 'Google Calendar',
    steps: [
      'On a computer, open Google Calendar and go to Settings.',
      'Under “Settings for my calendars”, choose the calendar.',
      'Scroll to “Integrate calendar” and copy the “Secret address in iCal format”.',
    ],
    hint: 'It starts with https://calendar.google.com/calendar/ical/ and ends in basic.ics.',
  },
  icloud: {
    name: 'iCloud (Apple Calendar)',
    steps: [
      'On your iPhone, open Calendar and tap Calendars.',
      'Tap the ⓘ next to the calendar and turn on “Public Calendar”.',
      'Tap “Share Link…” and copy it. Change webcal:// to https:// if needed.',
    ],
    hint: 'It looks like webcal://p…-caldav.icloud.com/published/2/…',
  },
  outlook: {
    name: 'Outlook',
    steps: [
      'On outlook.com, open Settings → Calendar → Shared calendars.',
      'Under “Publish a calendar”, choose the calendar and “Can view all details”, then Publish.',
      'Copy the ICS link.',
    ],
    hint: 'It ends in calendar.ics.',
  },
  other: {
    name: 'Another calendar',
    steps: [
      'Find the calendar’s subscription (ICS or iCal) link in its sharing settings and copy it.',
    ],
    hint: 'An address that starts with https:// and usually ends in .ics.',
  },
};

/**
 * Connect a calendar read-only: pick where it lives, follow the three steps, paste the private
 * address and say whose it is. FamilyOS checks it by fetching it before saving, stores it
 * encrypted and never shows it again.
 */
export function CalendarSheet({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (c: CalendarSource) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label="Connect a calendar"
      title="Connect a calendar"
      width={600}
    >
      {visible ? <CalendarForm onClose={onClose} onAdded={onAdded} /> : null}
    </Sheet>
  );
}

function CalendarForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (c: CalendarSource) => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [memberId, setMemberId] = useState(people.me?.id ?? people.adults[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!provider) {
    return (
      <View style={styles.form}>
        <Text variant="chapter">Where does the calendar live?</Text>
        <Text variant="body" tone="muted">
          FamilyOS shows its events in your lanes and the week. It only reads: nothing is ever
          written back, and you keep changing events where they are.
        </Text>
        <View style={styles.providers}>
          {(Object.keys(GUIDES) as Provider[]).map((p) => (
            <Chip key={p} label={GUIDES[p].name} onPress={() => setProvider(p)} />
          ))}
        </View>
      </View>
    );
  }

  const guide = GUIDES[provider];
  const address = url.trim().replace(/^webcal:\/\//i, 'https://');
  const save = async () => {
    if (!household || !address || !label.trim() || !memberId) return;
    setBusy(true);
    setError(null);
    try {
      const { calendar, imported } = await api<{ calendar: CalendarSource; imported: number }>(
        `/households/${household.id}/calendars`,
        { method: 'POST', body: { label: label.trim(), url: address, memberId } },
      );
      setUrl('');
      toast.show(`Connected: ${calendar.label}`, {
        detail: imported === 1 ? 'One event brought in.' : `${imported} events brought in.`,
      });
      onAdded(calendar);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.guideHead}>
        <Text variant="chapter">{guide.name}</Text>
        <Button title="Change" variant="quiet" size="sm" onPress={() => setProvider(null)} />
      </View>
      <View style={styles.steps}>
        {guide.steps.map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={styles.stepNum}>
              <Text variant="small" style={styles.stepNumText}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={styles.stepText}>
              {s}
            </Text>
          </View>
        ))}
      </View>
      <Field
        label="Calendar address"
        value={url}
        onChangeText={setUrl}
        placeholder="https://…/basic.ics"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        inputMode="url"
        hint={guide.hint}
      />
      <View style={styles.privacy}>
        <Lock size={15} color={color.muted} strokeWidth={2.2} />
        <Text variant="meta" tone="muted" style={styles.privacyText}>
          Anyone with this address can see the calendar, so FamilyOS keeps it encrypted and never
          shows it again, not even to you.
        </Text>
      </View>
      <Field
        label="Call it"
        value={label}
        onChangeText={setLabel}
        placeholder={provider === 'google' ? 'Work' : 'Family'}
        maxLength={80}
      />
      <View style={styles.group}>
        <Text variant="label">Whose calendar is it?</Text>
        <View style={styles.providers}>
          {people.adults.map((p) => (
            <Chip
              key={p.id}
              label={p.isMe ? 'Mine' : p.name}
              accent={p.color}
              leading={<Avatar person={p} size={18} />}
              selected={memberId === p.id}
              onPress={() => setMemberId(p.id)}
            />
          ))}
        </View>
      </View>
      {error ? <ErrorNotice message={error} /> : null}
      <View style={styles.actions}>
        <Button
          title={busy ? 'Checking the calendar…' : 'Connect'}
          busy={busy}
          disabled={!address || !label.trim() || !memberId}
          onPress={save}
        />
        <Button title="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingBottom: 8 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  guideHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  steps: { gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: color.ground },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: color.onInk, fontFamily: 'Figtree-700' },
  stepText: { flex: 1 },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: -6 },
  privacyText: { flex: 1 },
  group: { gap: 10 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});
