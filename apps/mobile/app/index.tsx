import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Body, Button, ErrorText, Screen, Title } from '../components/ui';
import { api, type MyHousehold } from '../lib/api';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';

// M1 home: who you are and which household you belong to. Today arrives in M2.
export default function Home() {
  const { session, loading } = useSession();
  const [households, setHouseholds] = useState<MyHousehold[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<{ households: MyHousehold[] }>('/me')
      .then((me) => setHouseholds(me.households))
      .catch(() => setError('Couldn’t load your household. Pull to try again later.'));
  }, [session]);

  if (loading)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Screen>
      <Title>FamilyOS</Title>
      {error && <ErrorText>{error}</ErrorText>}
      {households === null && !error && <ActivityIndicator />}
      {households?.length === 0 && (
        <Body muted>
          You’re signed in but not in a household yet. Open the invite link your household owner
          sent you.
        </Body>
      )}
      {households?.map((h) => (
        <Body key={h.id}>
          {h.name} · {h.role}
        </Body>
      ))}
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
