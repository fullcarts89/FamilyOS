import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HouseholdProvider } from '../lib/household';
import { SessionProvider } from '../lib/session';

export default function RootLayout() {
  return (
    <SessionProvider>
      <HouseholdProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
          <Stack.Screen name="routine/new" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </HouseholdProvider>
    </SessionProvider>
  );
}
