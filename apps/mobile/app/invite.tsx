import { PASSWORD_MIN_LENGTH, passwordProblem } from '@familyos/domain';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../design/Button';
import { Field } from '../design/Field';
import { ErrorNotice } from '../design/Notice';
import { Loading } from '../design/Page';
import { ApiRequestError, api, claimInvite, errorMessage, failureKind } from '../lib/api';
import { useHousehold } from '../lib/household';
import { useSession } from '../lib/session';
import { signInWithPassword } from '../lib/supabase';

const errorCode = (caught: unknown) => (caught instanceof ApiRequestError ? caught.code : '');

// Opened from an invite link: https://<app>/invite?token=... or familyos://invite?token=...
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, loading } = useSession();

  if (loading) return <Loading />;
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
          ? 'This invite isn’t valid for that email. It may have expired or already been used. Ask for a new link.'
          : code === 'weak_password'
            ? 'That password is known from a data breach or too easy to guess. Choose another.'
            : failureKind(caught) === 'request'
              ? 'Couldn’t create your account. Try again in a moment.'
              : `Couldn’t create your account. ${errorMessage(caught)}`,
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
    // Joined. The welcome screen decides whether it is for this person (an invited adult) or
    // sends them on to Today (a new household's first owner: Today starts the guided setup).
    router.replace('/welcome');
  };

  if (hasAccount) {
    return (
      <AuthLayout
        title="You already have an account"
        lead="Sign in with your password, then open the invite link again to join."
      >
        <Button title="Sign in" size="lg" full onPress={() => router.push('/sign-in')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="You’re invited"
      lead="Join your household. Use the email this invite was sent to, and choose a password."
    >
      <Field
        label="Your name"
        hint="What your household will call you."
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
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
        error={problem === 'too_long' ? 'That password is too long.' : null}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="Password again"
        error={again.length > 0 && again !== password ? 'The passwords don’t match.' : null}
        value={again}
        onChangeText={setAgain}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => ready && void create()}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <View style={{ gap: 6 }}>
        <Button
          title="Join the household"
          size="lg"
          full
          onPress={create}
          busy={busy}
          disabled={!ready}
        />
        <Button
          title="I already have an account"
          variant="quiet"
          full
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </AuthLayout>
  );
}

/** Already signed in (for example, a member of another household): join with this account. */
function JoinAsSignedIn({ token }: { token: string }) {
  const { reload } = useHousehold();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/invites/accept', { method: 'POST', body: { token, displayName: name } });
      await reload();
      router.replace('/welcome');
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
    <AuthLayout title="Join your household" lead="Choose the name your household will see.">
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        maxLength={60}
        returnKeyType="go"
        onSubmitEditing={() => name.trim() && void accept()}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <Button
        title="Join"
        size="lg"
        full
        onPress={accept}
        busy={busy}
        disabled={name.trim().length === 0}
      />
    </AuthLayout>
  );
}
