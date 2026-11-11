import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';
import { signInWithPassword } from '../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: signInError } = await signInWithPassword(email, password);
    setBusy(false);
    if (signInError) {
      // One message for a wrong email or a wrong password: sign-in never reveals who has an account.
      setError(
        signInError.status === 400
          ? 'That email and password don’t match.'
          : signInError.status === 429
            ? 'Too many tries. Wait a few minutes, then try again.'
            : 'Couldn’t sign in. Check your connection and try again.',
      );
      return;
    }
    router.replace('/');
  };

  return (
    <Screen>
      <Title>Sign in</Title>
      <Body muted>FamilyOS is invite-only. New here? Open the invite link you were sent.</Body>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="username"
        returnKeyType="next"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title="Sign in"
        onPress={submit}
        busy={busy}
        disabled={!email.includes('@') || password.length === 0}
      />
      <Body muted>Forgot your password? Ask your household owner to reset it.</Body>
    </Screen>
  );
}
