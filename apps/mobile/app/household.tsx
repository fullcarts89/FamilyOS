import { can } from '@familyos/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, ListScreen, Section } from '../components/items';
import { Body, Button, ErrorText, Field, Title } from '../components/ui';
import { api, errorMessage, type Invite } from '../lib/api';
import { useHousehold } from '../lib/household';
import { goBack } from '../lib/navigation';
import { useTheme } from '../lib/theme';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  adult: 'Adult',
  caregiver: 'Caregiver',
  child: 'Child',
};
// A role this version doesn't know (a newer release's pets, say) gets a neutral word, never "Adult".
const roleLabel = (role: string) => ROLE_LABEL[role] ?? 'Member';

// Household members and invites (PRD WF-05). Invites have no email of their own yet: the owner
// gets a one-time link here and sends it however they like.
export default function HouseholdScreen() {
  const t = useTheme();
  const { household, members } = useHousehold();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Invite['role']>('adult');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mayInvite = household ? can(household.role, 'member.invite') : false;
  const base = household ? `/households/${household.id}` : '';

  const load = useCallback(async () => {
    if (!household || !mayInvite) return;
    try {
      setInvites((await api<{ invites: Invite[] }>(`${base}/invites`)).invites);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household, mayInvite, base]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!household) return null;

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ link: string }>(`${base}/invites`, {
        method: 'POST',
        body: { email: email.trim(), role },
      });
      setLink(created.link);
      setEmail('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api(`${base}/invites/${id}`, { method: 'DELETE' });
    } catch (caught) {
      setError(errorMessage(caught));
    }
    await load();
  };

  const pending = invites.filter(
    (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
  );

  return (
    <ListScreen footer={<Button title="Back to Today" onPress={() => goBack()} />}>
      <Title>{household.name}</Title>
      {error && <ErrorText>{error}</ErrorText>}

      <Section title="Members">
        {members.map((m) => (
          <Body key={m.id}>
            {m.displayName} · {roleLabel(m.role)}
          </Body>
        ))}
      </Section>

      {mayInvite && (
        <Section title="Invite someone">
          {[
            <Field
              key="email"
              label="Their email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="off"
              inputMode="email"
              placeholder="For example, sam@example.com"
            />,
            <View key="role" style={styles.chips}>
              <Chip label="Adult" selected={role === 'adult'} onPress={() => setRole('adult')} />
              <Chip
                label="Caregiver"
                selected={role === 'caregiver'}
                onPress={() => setRole('caregiver')}
              />
            </View>,
            <Button
              key="send"
              title="Create invite link"
              busy={busy}
              disabled={!email.includes('@')}
              onPress={invite}
            />,
          ]}
        </Section>
      )}

      {link && (
        <View style={[styles.link, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Body>Send them this link. It works once, for 48 hours, and is shown only now.</Body>
          <Text selectable style={[styles.linkText, { color: t.text }]}>
            {link}
          </Text>
        </View>
      )}

      {mayInvite && pending.length > 0 && (
        <Section title="Waiting to join">
          {pending.map((i) => (
            <View key={i.id} style={styles.pending}>
              <Body>
                {i.email} · {roleLabel(i.role)}
              </Body>
              <Chip label="Cancel invite" selected={false} onPress={() => revoke(i.id)} />
            </View>
          ))}
        </Section>
      )}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8 },
  link: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  linkText: { fontSize: 15, fontFamily: 'Courier' },
  pending: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
