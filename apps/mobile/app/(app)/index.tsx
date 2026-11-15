import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ItemRow, ListScreen, Section } from '../components/items';
import { Body, Button, ErrorText, Screen, Title } from '../components/ui';
import { api, type TodayResponse } from '../lib/api';
import { useHousehold } from '../lib/household';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';

// Today (PRD §4): decisions and exceptions first, then what's moving, what's due, what got handled.
export default function Today() {
  const { session, loading: sessionLoading } = useSession();
  const { household, loading: householdLoading, error: householdError } = useHousehold();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!household) return;
    try {
      setToday(await api<TodayResponse>(`/households/${household.id}/today`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (sessionLoading)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (!session) return <Redirect href="/sign-in" />;
  if (householdLoading)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (householdError)
    return (
      <Screen>
        <ErrorText>Couldn’t load your household.</ErrorText>
      </Screen>
    );
  if (!household) {
    return (
      <Screen>
        <Title>FamilyOS</Title>
        <Body muted>
          You’re signed in but not in a household yet. Open the invite link your household owner
          sent you.
        </Body>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </Screen>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const date = today?.date ?? '';
  return (
    <ListScreen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      footer={
        <>
          {today && today.inboxCount > 0 ? (
            <Button
              title={`Sort inbox (${today.inboxCount})`}
              onPress={() => router.push('/inbox')}
            />
          ) : null}
          <Button title="Capture" onPress={() => router.push('/capture')} />
        </>
      }
    >
      <Title>Today</Title>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/work')}>
          <Body muted>All to-dos →</Body>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/routines')}>
          <Body muted>Routines →</Body>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/household')}>
          <Body muted>Household →</Body>
        </Pressable>
      </View>
      {error && <ErrorText>Couldn’t refresh. Pull down to try again.</ErrorText>}
      {!today && !error && <ActivityIndicator />}
      {today && (
        <>
          <Section title="Needs you" empty="Nothing needs you right now.">
            {today.needsYou.map((item) => (
              <ItemRow key={item.id} item={item} today={date} />
            ))}
          </Section>
          {today.inProgress.length > 0 && (
            <Section title="In progress">
              {today.inProgress.map((item) => (
                <ItemRow key={item.id} item={item} today={date} />
              ))}
            </Section>
          )}
          <Section title="This week" empty="Nothing due in the next seven days.">
            {today.thisWeek.map((item) => (
              <ItemRow key={item.id} item={item} today={date} />
            ))}
          </Section>
          {today.handled.length > 0 && (
            <Section title="Handled">
              {today.handled.map((item) => (
                <ItemRow key={item.id} item={item} today={date} />
              ))}
            </Section>
          )}
        </>
      )}
    </ListScreen>
  );
}

const styles = StyleSheet.create({ links: { flexDirection: 'row', gap: 20 } });
