import { Redirect, Stack } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { BottomBar, CaptureFab, PhoneHeader } from '../../design/BottomBar';
import { Button } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { Mark } from '../../design/Mark';
import { ErrorNotice } from '../../design/Notice';
import { Loading } from '../../design/Page';
import { TopBar } from '../../design/TopBar';
import { color } from '../../design/tokens';
import { CaptureProvider, useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

/** Everything after sign-in: the app shell around each screen, and capture from anywhere. */
export default function AppLayout() {
  const { session, loading: sessionLoading } = useSession();
  const { household, loading, error, reload } = useHousehold();

  if (sessionLoading)
    return (
      <Centered>
        <Loading />
      </Centered>
    );
  if (!session) return <Redirect href="/sign-in" />;
  if (loading && !household)
    return (
      <Centered>
        <Loading label="Loading your household" />
      </Centered>
    );
  if (error) {
    return (
      <Centered>
        <ErrorNotice
          message="Couldn’t load your household. Check your connection."
          onRetry={reload}
        />
      </Centered>
    );
  }
  if (!household) {
    return (
      <Centered>
        <Mark size={36} />
        <EmptyState
          art={<LanesArt style={styles.art} />}
          title="You’re signed in, but not in a household yet"
          body="Open the invite link your household sent you, and you’ll land here together."
          action={
            <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          }
        />
      </Centered>
    );
  }

  return (
    <CaptureProvider enabled>
      <Shell />
    </CaptureProvider>
  );
}

function Shell() {
  const { phone } = useLayout();
  const { open } = useCapture();
  return (
    <View style={styles.shell}>
      {phone ? <PhoneHeader /> : <TopBar onCapture={() => open()} />}
      <View style={styles.main}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.ground },
            animation: Platform.OS === 'web' ? 'none' : 'default',
          }}
        >
          <Stack.Screen name="routine/new" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
      {phone ? (
        <>
          <BottomBar />
          <CaptureFab onPress={() => open()} />
        </>
      ) : null}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <View style={styles.centeredInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.ground },
  main: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: color.ground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centeredInner: { width: '100%', maxWidth: 520, gap: 16 },
  art: { marginBottom: 12 },
});
