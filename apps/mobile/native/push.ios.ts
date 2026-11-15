import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { api } from '../lib/api';
import type { PushPermission, PushRegistration } from './push';

export type { PushPermission, PushRegistration } from './push';

/** This device's registered token and the household it's registered with (this app only). */
const TOKEN_KEY = 'familyos.push.registration';
/** Set once the explained "turn on notifications?" card was answered, either way. */
const ASKED_KEY = 'familyos.push.asked';

export const pushAvailable = true;

// A notification that arrives while FamilyOS is open still shows as a banner; only a handoff
// reminder (time-sensitive) plays a sound.
Notifications.setNotificationHandler({
  handleNotification: async (n) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: n.request.content.data?.kind === 'handoff_reminder',
    shouldSetBadge: false,
  }),
});

export function pushProjectId(): string | null {
  const fromEas = (Constants.easConfig as { projectId?: unknown } | null | undefined)?.projectId;
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  const id = typeof fromEas === 'string' ? fromEas : fromExtra;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

const asPermission = (status: string): PushPermission =>
  status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';

export async function pushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    // Provisional and ephemeral authorizations deliver too.
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL)
      return 'granted';
    return asPermission(p.status);
  } catch {
    return 'undetermined';
  }
}

export async function askPushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return p.granted ? 'granted' : asPermission(p.status);
  } catch {
    return 'undetermined';
  }
}

interface Saved {
  token: string;
  householdId: string;
}

async function saved(): Promise<Saved | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export async function registerPush(householdId: string): Promise<PushRegistration> {
  if ((await pushPermission()) !== 'granted') {
    // Turned off in iOS Settings since: the server shouldn't keep sending to this device.
    await unregisterPush();
    return 'no_permission';
  }
  const projectId = pushProjectId();
  if (!projectId) return 'not_configured';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const before = await saved();
    if (before && (before.token !== token || before.householdId !== householdId))
      await unregisterPush();
    await api(`/households/${householdId}/me/push-tokens`, {
      method: 'POST',
      body: { token, platform: 'ios' },
    });
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify({ token, householdId }));
    return 'registered';
  } catch {
    return 'failed';
  }
}

export async function unregisterPush(): Promise<void> {
  const s = await saved();
  if (!s) return;
  try {
    await api(`/households/${s.householdId}/me/push-tokens`, {
      method: 'DELETE',
      body: { token: s.token },
    });
  } catch {
    // Offline or already gone: the server drops tokens Apple reports as unregistered.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

export async function pushPromptAnswered(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ASKED_KEY)) === 'yes';
  } catch {
    return false;
  }
}

export async function setPushPromptAnswered(): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, 'yes').catch(() => undefined);
}

export function openPushSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

const SCREEN_FOR: Record<string, '/' | '/reset'> = {
  morning_checkin: '/',
  handoff_reminder: '/',
  partner_changes: '/',
  weekly_reset_reminder: '/reset',
};

export function usePushResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const kind = response.notification.request.content.data?.kind;
    router.navigate(SCREEN_FOR[typeof kind === 'string' ? kind : ''] ?? '/');
  }, [response]);
}
