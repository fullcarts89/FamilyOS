import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../design/fonts';
import { CelebrationProvider, HapticsProvider } from '../design/motion';
import { primeReducedMotion, useReducedMotionKnown } from '../design/motion/reduced';
import { ToastProvider } from '../design/Toast';
import { color } from '../design/tokens';
import { installWebStyles } from '../design/web';
import { HouseholdProvider } from '../lib/household';
import { SessionProvider } from '../lib/session';

installWebStyles();
// Reduce Motion is known before the first screen (instant on the web; one system call on iPhone).
void primeReducedMotion();

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const motionKnown = useReducedMotionKnown();
  // iPhone: the ground color shows while the bundled fonts load (a second at most). The web paints
  // at once in the system font and swaps the app's fonts in (design/fonts.ts).
  if (!fontsReady || !motionKnown)
    return <View style={{ flex: 1, backgroundColor: color.ground }} />;
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
