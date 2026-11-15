import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../design/Button';
import { Field } from '../design/Field';
import { ErrorNotice } from '../design/Notice';
import { Text } from '../design/Text';
import { signInWithPassword } from '../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const ready = email.includes('@') && password.length > 0;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await signInWithPassword(email, password);
    setBusy(false);
    if (signInError) {
      // One message for a wrong email or a wrong password: sign-in never reveals who has an account.
      setError(
        signInError.status === 400
          ? 'That email and password don’t match. Check both and try again.'
          : signInError.status === 429
            ? 'Too many tries. Wait a few minutes, then try again.'
            : 'Couldn’t sign in. Check your connection and try again.',
      );
      return;
    }
    router.replace('/');
  };

  return (
    <AuthLayout
      title="Welcome home"
      lead="Sign in to your household. New here? Open the invite link you were sent."
    >
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
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
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
      {error ? <ErrorNotice message={error} /> : null}
      <Button title="Sign in" size="lg" full onPress={submit} busy={busy} disabled={!ready} />
      <Text variant="meta" tone="muted">
        Forgot your password? Ask your household owner to reset it.
      </Text>
    </AuthLayout>
  );
}
