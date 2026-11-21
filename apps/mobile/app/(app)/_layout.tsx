import { Redirect, Stack, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { PushPrompt } from '../../components/push/PushPrompt';
import { BottomBar, CaptureFab, PhoneHeader } from '../../design/BottomBar';
import { Button } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { Mark } from '../../design/Mark';
import { Skeleton, SkeletonBlock, SkeletonRows } from '../../design/motion';
import { ErrorNotice, OfflineNote } from '../../design/Notice';
import { TopBar } from '../../design/TopBar';
import { color } from '../../design/tokens';
import { useServerAcknowledgments } from '../../lib/acknowledgments';
import { CaptureProvider, useCapture } from '../../lib/capture';
import { MemberStateProvider } from '../../lib/member-state';
import { WidgetSync } from '../../native/WidgetSync';
import { useHousehold } from '../../lib/household';
import { useSession } from '../../lib/session';
import { useConnection } from '../../lib/use-connection';
import { signOut } from '../../lib/sign-out';

/** Everything after sign-in: the app shell around each screen, and capture from anywhere. */
export default function AppLayout() {
  const { session, loading: sessionLoading } = useSession();
  const { household, loading, error, reload } = useHousehold();
  useServerAcknowledgments(household?.id ?? null, household?.memberId ?? null);

  if (sessionLoading) return <ShellSkeleton />;
  if (!session) return <Redirect href="/sign-in" />;
  // The page's shape at once while the household loads (never a blank screen on a slow network).
  if (loading && !household) return <ShellSkeleton />;
  // Once loaded, the shell stays: a failed reload never replaces it.
  if (error && !household) {
    return (
      <Centered>
        <ErrorNotice message="Couldn’t load your household." error={error} onRetry={reload} />
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
          action={<Button title="Sign out" variant="secondary" onPress={() => void signOut()} />}
        />
      </Centered>
    );
  }

  return (
    <MemberStateProvider>
      <CaptureProvider enabled>
        <WidgetSync />
        <Shell />
      </CaptureProvider>
    </MemberStateProvider>
  );
}

function Shell() {
  const { phone } = useLayout();
  const { open, fabHidden } = useCapture();
  const offline = useConnection() === 'offline';
  // First-time setup and the invited adult's welcome are focused, full-screen: no navigation.
  const pathname = usePathname();
  const focused = pathname === '/setup' || pathname === '/welcome';
  return (
    <View style={styles.shell}>
      {focused ? null : phone ? <PhoneHeader /> : <TopBar onCapture={() => open()} />}
      {offline && !focused ? <OfflineNote /> : null}
      {focused ? null : <PushPrompt />}
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
      {phone && !focused ? (
        <>
          <BottomBar />
          {fabHidden ? null : <CaptureFab onPress={() => open()} />}
        </>
      ) : null}
    </View>
  );
}

/** The app's frame with placeholder content, while the session and household load. */
function ShellSkeleton() {
  const { phone } = useLayout();
  return (
    <View style={styles.shell}>
      <View style={[styles.skeletonBar, phone && styles.skeletonBarPhone]}>
        <SkeletonBlock width={phone ? 150 : 200} height={20} round />
      </View>
      <View style={[styles.skeletonPage, phone && styles.skeletonPagePhone]}>
        <Skeleton label="Loading your household">
          <View style={styles.skeletonHead}>
            <SkeletonBlock width={120} height={11} />
            <SkeletonBlock width={phone ? '80%' : 420} height={phone ? 30 : 42} />
            <SkeletonBlock width={phone ? '90%' : 520} height={18} />
          </View>
          <SkeletonBlock height={phone ? 200 : 260} />
          <View style={styles.skeletonRows}>
            <SkeletonRows count={3} />
          </View>
        </Skeleton>
      </View>
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
  skeletonBar: {
    height: 68,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  skeletonBarPhone: { height: 56, paddingHorizontal: 16 },
  skeletonPage: { paddingHorizontal: 40, paddingTop: 36, gap: 24, maxWidth: 1360 },
  skeletonPagePhone: { paddingHorizontal: 16, paddingTop: 18 },
  skeletonHead: { gap: 12, marginBottom: 24 },
  skeletonRows: { marginTop: 24 },
});
