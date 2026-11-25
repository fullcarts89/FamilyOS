import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { View, type TextInput } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../design/Button';
import { Field } from '../design/Field';
import { ErrorNotice, Notice } from '../design/Notice';
import { useSession } from '../lib/session';
import { signInWithPassword } from '../lib/supabase';

export default function SignIn() {
  const { expired } = useSession();
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
            : signInError.status === undefined || signInError.status === 0
              ? 'You’re offline. Check your Wi‑Fi or mobile data, then try again.'
              : signInError.status >= 500
                ? 'Signing in isn’t working on our side right now, not your connection. Try again in a moment.'
                : 'Couldn’t sign in. Try again in a moment.',
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
      {expired && !error ? (
        <Notice message="Please sign in again. For your security, this device was signed out." />
      ) : null}
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
      <View style={{ gap: 6 }}>
        <Button title="Sign in" size="lg" full onPress={submit} busy={busy} disabled={!ready} />
        <Button
          title="Forgot password?"
          variant="quiet"
          full
          onPress={() => router.push('/forgot-password')}
        />
      </View>
    </AuthLayout>
  );
}
