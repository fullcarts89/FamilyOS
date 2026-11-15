import { can } from '@familyos/domain';
import { useFocusEffect } from 'expo-router';
import { Link2, LogOut, Send } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { useLayout } from '../../design/layout';
import { FadeIn, hapticsAvailable, useHaptics } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type Invite, type Member } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';
import { supabase } from '../../lib/supabase';

const ROLE_LABEL: Record<Member['role'], string> = {
  owner: 'Owner',
  adult: 'Adult',
  caregiver: 'Caregiver',
  child: 'Child',
  pet: 'Pet',
};

// Household: the people (and soon pets), invites, and this device's settings. Invites have no
// email of their own yet: the owner gets a one-time link here and sends it however they like.
export default function HouseholdScreen() {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const haptics = useHaptics();
  const toast = useToast();
  const { desktop } = useLayout();
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
      toast.show('Invite cancelled');
    } catch (caught) {
      setError(errorMessage(caught));
    }
    await load();
  };

  const pending = invites.filter(
    (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
  );

  const members = (
    <View>
      <SectionHeader title="People" sub={`${people.all.length} in the household`} />
      {people.all.map((p) => (
        <View key={p.id} style={styles.member}>
          <Avatar person={p} size={40} />
          <View style={styles.memberText}>
            <Text variant="h3">
              {p.name}
              {p.isMe ? (
                <Text variant="meta" tone="muted">
                  {'  '}You
                </Text>
              ) : null}
            </Text>
            <Text variant="meta" tone="muted">
              {ROLE_LABEL[p.role]}
            </Text>
          </View>
          <View
            style={[styles.swatch, { backgroundColor: p.color }]}
            accessibilityLabel="Their color"
          />
        </View>
      ))}
      <Text variant="meta" tone="muted" style={styles.note}>
        Each person’s color marks what’s theirs across the app. Pets and choosing colors arrive in
        this redesign.
      </Text>
    </View>
  );

  const invitePanel = mayInvite ? (
    <View>
      <SectionHeader title="Invite someone" />
      <View style={styles.form}>
        <Field
          label="Their email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="off"
          inputMode="email"
          placeholder="sam@example.com"
          returnKeyType="send"
          onSubmitEditing={() => email.includes('@') && void invite()}
        />
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Their role">
          <Chip label="Adult" selected={role === 'adult'} onPress={() => setRole('adult')} />
          <Chip
            label="Caregiver"
            selected={role === 'caregiver'}
            onPress={() => setRole('caregiver')}
          />
        </View>
        <Button
          title="Create invite link"
          icon={Send}
          busy={busy}
          disabled={!email.includes('@')}
          onPress={invite}
        />
        {link ? (
          <FadeIn style={styles.link}>
            <View style={styles.linkHead}>
              <Link2 size={16} color={color.ink} strokeWidth={2.2} />
              <Text variant="label">Send them this link</Text>
            </View>
            <Text variant="meta" tone="muted">
              It works once, for 48 hours, and is shown only now.
            </Text>
            <Text selectable style={styles.linkText}>
              {link}
            </Text>
          </FadeIn>
        ) : null}
        {pending.length > 0 ? (
          <View style={styles.pending}>
            <Text variant="kicker" tone="muted">
              Waiting to join
            </Text>
            {pending.map((i) => (
              <View key={i.id} style={styles.pendingRow}>
                <Text variant="body" style={styles.pendingText}>
                  {i.email} · {ROLE_LABEL[i.role]}
                </Text>
                <Button
                  title="Cancel invite"
                  size="sm"
                  variant="quiet"
                  onPress={() => revoke(i.id)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  ) : null;

  const settings = (
    <View>
      <SectionHeader title="This device" />
      {hapticsAvailable ? (
        <View style={styles.setting}>
          <View style={styles.settingText}>
            <Text variant="title">Haptics</Text>
            <Text variant="meta" tone="muted">
              A light tap when you finish something.
            </Text>
          </View>
          <Switch
            value={haptics.enabled}
            onValueChange={haptics.setEnabled}
            accessibilityLabel="Haptics"
            trackColor={{ true: color.ink, false: color.line2 }}
          />
        </View>
      ) : null}
      <View style={styles.setting}>
        <View style={styles.settingText}>
          <Text variant="title">Time zone</Text>
          <Text variant="meta" tone="muted">
            Dates and times show in {timeZone.replace(/_/g, ' ')}.
          </Text>
        </View>
      </View>
      <Button
        title="Sign out"
        variant="secondary"
        icon={LogOut}
        onPress={() => supabase.auth.signOut()}
        style={styles.signOut}
      />
    </View>
  );

  return (
    <Page maxWidth={1100}>
      <PageHeader kicker="Household" title={household.name} />
      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message={error} onRetry={load} />
        </View>
      ) : null}
      <FadeIn style={[styles.body, desktop && styles.bodyWide]}>
        <View style={desktop ? styles.colMain : undefined}>{members}</View>
        <View style={[desktop ? styles.colSide : undefined, styles.sideStack]}>
          {invitePanel}
          {settings}
        </View>
      </FadeIn>
    </Page>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 16 },
  body: { marginTop: 32, gap: 40 },
  bodyWide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  colMain: { flex: 1 },
  colSide: { flex: 1 },
  sideStack: { gap: 40 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  memberText: { flex: 1 },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  note: { marginTop: 12, maxWidth: 480 },
  form: { gap: 14, marginTop: 16 },
  chips: { flexDirection: 'row', gap: 8 },
  link: {
    gap: 6,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
    backgroundColor: color.surface,
  },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { fontFamily: font.uiSemi, fontSize: 14, color: color.ink },
  pending: { gap: 4, marginTop: 4 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  pendingText: { flexShrink: 1 },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  settingText: { flex: 1, gap: 2 },
  signOut: { marginTop: 18 },
});
