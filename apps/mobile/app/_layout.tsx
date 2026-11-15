import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../design/fonts';
import { CelebrationProvider, HapticsProvider } from '../design/motion';
import { ToastProvider } from '../design/Toast';
import { color } from '../design/tokens';
import { installWebStyles } from '../design/web';
import { HouseholdProvider } from '../lib/household';
import { SessionProvider } from '../lib/session';

installWebStyles();

export default function RootLayout() {
  const fontsReady = useAppFonts();
  // The ground color shows while the fonts load (a fraction of a second), never a flash of system type.
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: color.ground }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <HouseholdProvider>
          <HapticsProvider>
            <ToastProvider>
              <CelebrationProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: color.ground },
                  }}
                />
                <StatusBar style="dark" />
              </CelebrationProvider>
            </ToastProvider>
          </HapticsProvider>
        </HouseholdProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
