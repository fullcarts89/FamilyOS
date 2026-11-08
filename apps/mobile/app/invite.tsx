import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';
import { ApiRequestError, api } from '../lib/api';
import { useSession } from '../lib/session';

// Opened from an invite link: familyos://invite?token=...
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, loading } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!token) return <Redirect href="/" />;
  if (!session) {
    return (
      <Screen>
        <Title>You’re invited</Title>
        <Body muted>Sign in with the email the invite was sent to, then open the link again.</Body>
        <Button title="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/invites/accept', { method: 'POST', body: { token, displayName: name } });
      router.replace('/');
    } catch (caught) {
      const code = caught instanceof ApiRequestError ? caught.code : '';
      setError(
        code === 'already_member'
          ? 'You’re already in this household.'
          : code === 'invite_not_found'
            ? 'This invite isn’t valid for your email. It may have expired or already been used.'
            : 'Couldn’t accept the invite. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Join your household</Title>
      <Body muted>Choose the name your household will see.</Body>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        maxLength={60}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Join" onPress={accept} busy={busy} disabled={name.trim().length === 0} />
    </Screen>
  );
}
