import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const KEY = 'familyos.haptics';
/** Haptics exist on phones only; on the web the setting is absent. */
export const hapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

interface HapticsState {
  /** The person's setting (on by default where haptics exist). */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** A light tap: an ordinary completion. */
  light: () => void;
  /** A firmer tap: a milestone. */
  medium: () => void;
}

const HapticsContext = createContext<HapticsState | null>(null);

export function HapticsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(hapticsAvailable);

  useEffect(() => {
    if (!hapticsAvailable) return;
    SecureStore.getItemAsync(KEY)
      .then((v) => v !== null && setEnabledState(v === 'on'))
      .catch(() => undefined);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    if (hapticsAvailable) SecureStore.setItemAsync(KEY, on ? 'on' : 'off').catch(() => undefined);
  }, []);

  const fire = useCallback(
    (style: Haptics.ImpactFeedbackStyle) => {
      if (!hapticsAvailable || !enabled) return;
      // A haptic that can't play is never an error worth showing.
      Haptics.impactAsync(style).catch(() => undefined);
    },
    [enabled],
  );

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      light: () => fire(Haptics.ImpactFeedbackStyle.Light),
      medium: () => fire(Haptics.ImpactFeedbackStyle.Medium),
    }),
    [enabled, setEnabled, fire],
  );
  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): HapticsState {
  const value = useContext(HapticsContext);
  if (!value) throw new Error('useHaptics must be used inside HapticsProvider');
  return value;
}
