import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../design/Button';
import { Field } from '../design/Field';
import { ErrorNotice } from '../design/Notice';
import {
  NEW_PASSWORD_HINT,
  linkFailure,
  newPasswordCheck,
  resetToken,
  saveFailure,
} from '../lib/password-reset';
import { openResetLink, setPassword } from '../lib/supabase';

/**
 * Opened from the reset email: https://<app>/reset-password?token_hash=…&type=recovery, on the
 * web or (as a universal link) in the iPhone app. The link is used up only when the new password
 * is saved, never on opening, so a mail app checking the link first doesn't spend it.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const token = resetToken(params);
  const [expired, setExpired] = useState(token === null);
  if (expired || token === null) return <LinkExpired incomplete={token === null} />;
  return <ChooseNewPassword token={token} onExpired={() => setExpired(true)} />;
}

function ChooseNewPassword({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [password, setNewPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the link has worked, this device is signed in: a retry only saves the password again.
  const [linkUsed, setLinkUsed] = useState(false);
  const { passwordError, againError, ready } = newPasswordCheck(password, again);

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    if (!linkUsed) {
      const { error: linkError } = await openResetLink(token).catch(() => ({
        error: { status: 0 },
      }));
      if (linkError) {
        setBusy(false);
        const failure = linkFailure(linkError);
        if (failure.expired) onExpired();
        else setError(failure.message);
        return;
      }
      setLinkUsed(true);
    }
    const { error: saveError } = await setPassword(password).catch(() => ({
      error: { status: 0 },
    }));
    setBusy(false);
    const problem = saveError ? saveFailure(saveError) : null;
    if (problem) {
      setError(problem);
      return;
    }
    router.replace('/');
  };

  return (
    <AuthLayout
      title="Choose a new password"
      lead="Then you’re signed in on this device. Use it to sign in everywhere else."
    >
      <Field
        label="New password"
        hint={NEW_PASSWORD_HINT}
        error={passwordError}
        value={password}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="New password again"
        error={againError}
        value={again}
        onChangeText={setAgain}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={save}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <Button
        title="Save and sign in"
        size="lg"
        full
        onPress={save}
        busy={busy}
        disabled={!ready}
      />
    </AuthLayout>
  );
}

function LinkExpired({ incomplete }: { incomplete: boolean }) {
  return (
    <AuthLayout
      title={incomplete ? 'This link isn’t complete' : 'This link has expired'}
      lead={
        incomplete
          ? 'Open the link straight from the reset email, or ask for a new one.'
          : 'Reset links work once, for an hour. Ask for a new one.'
      }
    >
      <View style={{ gap: 6 }}>
        <Button
          title="Send a new link"
          size="lg"
          full
          onPress={() => router.replace('/forgot-password')}
        />
        <Button
          title="Back to sign in"
          variant="quiet"
          full
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </AuthLayout>
  );
}
