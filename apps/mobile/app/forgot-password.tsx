import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../design/Button';
import { Field } from '../design/Field';
import { ErrorNotice, Notice } from '../design/Notice';
import { resetRequestMessage } from '../lib/password-reset';
import { requestPasswordReset } from '../lib/supabase';

/** Asks for a reset link by email. The answer is the same whether or not the email has an account. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: boolean; message: string } | null>(null);
  const ready = email.includes('@');

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setResult(null);
    const { error } = await requestPasswordReset(email).catch(() => ({ error: { status: 0 } }));
    setBusy(false);
    setResult(resetRequestMessage(error));
  };

  const backToSignIn = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

  if (result?.sent) {
    return (
      <AuthLayout title="Check your email">
        <Notice message={result.message} />
        <View style={{ gap: 6 }}>
          <Button title="Back to sign in" size="lg" full onPress={backToSignIn} />
          <Button
            title="Use a different email"
            variant="quiet"
            full
            onPress={() => {
              setEmail('');
              setResult(null);
            }}
          />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      lead="Enter the email you sign in with. We’ll send a link to choose a new password."
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
        returnKeyType="send"
        onSubmitEditing={send}
      />
      {result ? <ErrorNotice message={result.message} /> : null}
      <View style={{ gap: 6 }}>
        <Button
          title="Send reset link"
          size="lg"
          full
          onPress={send}
          busy={busy}
          disabled={!ready}
        />
        <Button title="Back to sign in" variant="quiet" full onPress={backToSignIn} />
      </View>
    </AuthLayout>
  );
}
