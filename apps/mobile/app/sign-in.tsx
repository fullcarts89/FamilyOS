import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';
import { sendSignInCode, verifySignInCode } from '../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error: sendError } = await sendSignInCode(email);
    setBusy(false);
    // Same message whether or not the account exists: sign-in never reveals who is invited.
    if (sendError && sendError.status !== 400 && sendError.status !== 422) {
      setError('Couldn’t send a code. Check your connection and try again.');
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await verifySignInCode(email, code);
    setBusy(false);
    if (verifyError) {
      setError('That code didn’t work. Check it, or send a new one.');
      return;
    }
    router.replace('/');
  };

  if (step === 'email') {
    return (
      <Screen>
        <Title>Sign in</Title>
        <Body muted>FamilyOS is invite-only. Use the email your household owner invited.</Body>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={send}
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button title="Send code" onPress={send} busy={busy} disabled={!email.includes('@')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Check your email</Title>
      <Body muted>If {email.trim()} has been invited, a 6-digit code is on its way.</Body>
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={verify}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Sign in" onPress={verify} busy={busy} disabled={code.trim().length !== 6} />
      <Button title="Use a different email" onPress={() => setStep('email')} />
    </Screen>
  );
}
