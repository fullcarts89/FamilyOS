import { PASSWORD_MIN_LENGTH, passwordProblem } from '@familyos/domain';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';
import { ApiRequestError, api, claimInvite } from '../lib/api';
import { useSession } from '../lib/session';
import { signInWithPassword } from '../lib/supabase';

const errorCode = (caught: unknown) => (caught instanceof ApiRequestError ? caught.code : '');

// Opened from an invite link: https://<app>/invite?token=... or familyos://invite?token=...
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, loading } = useSession();

  if (loading) return null;
  if (!token) return <Redirect href="/" />;
  return session ? <JoinAsSignedIn token={token} /> : <CreateAccount token={token} />;
}

/** No account yet: choose a password, which creates the account and joins in one step. */
function CreateAccount({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);

  const problem = passwordProblem(password);
  const ready =
    name.trim().length > 0 && email.includes('@') && problem === null && password === again;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await claimInvite({ token, email: email.trim(), password, displayName: name });
    } catch (caught) {
      setBusy(false);
      const code = errorCode(caught);
      if (code === 'account_exists') {
        setHasAccount(true);
        return;
      }
      setError(
        code === 'invite_not_found'
          ? 'This invite isn’t valid for that email. It may have expired or already been used.'
          : code === 'weak_password'
            ? 'That password is known from a data breach or too easy to guess. Choose another.'
            : 'Couldn’t create your account. Try again.',
      );
      return;
    }
    const { error: signInError } = await signInWithPassword(email, password);
    setBusy(false);
    if (signInError) {
      // The account exists and has joined; only the sign-in failed.
      router.replace('/sign-in');
      return;
    }
    router.replace('/');
  };

  if (hasAccount) {
    return (
      <Screen>
        <Title>You already have an account</Title>
        <Body muted>Sign in with your password, then open the invite link again to join.</Body>
        <Button title="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>You’re invited</Title>
      <Body muted>Use the email the invite is for, and choose a password.</Body>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        maxLength={60}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="username"
      />
      <Field
        label={`Password (at least ${PASSWORD_MIN_LENGTH} characters)`}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="Password again"
        value={again}
        onChangeText={setAgain}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => ready && void create()}
      />
      {problem === 'too_long' && <ErrorText>That password is too long.</ErrorText>}
      {again.length > 0 && again !== password && <ErrorText>The passwords don’t match.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Join" onPress={create} busy={busy} disabled={!ready} />
      <Button title="I already have an account" onPress={() => router.push('/sign-in')} />
    </Screen>
  );
}

/** Already signed in (for example, a member of another household): join with this account. */
function JoinAsSignedIn({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/invites/accept', { method: 'POST', body: { token, displayName: name } });
      router.replace('/');
    } catch (caught) {
      const code = errorCode(caught);
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
