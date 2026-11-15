/**
 * Push notifications come to the iPhone app only (native/push.ios.ts). On the web and Android
 * everything here is a quiet no-op, and the settings explain where notifications arrive.
 */

/** iOS permission as the app sees it; `unavailable` where push doesn't exist (the web). */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** What registering this device came to. */
export type PushRegistration =
  | 'registered'
  | 'no_permission'
  /** This build has no EAS project ID, so Expo can't issue a push token (see iphone.md). */
  | 'not_configured'
  | 'failed';

export const pushAvailable = false;

/** The EAS project ID this build was made with, or null before `eas init`. */
export function pushProjectId(): string | null {
  return null;
}

export async function pushPermission(): Promise<PushPermission> {
  return 'unavailable';
}

/** Shows the system prompt (once; after that iOS answers from Settings). */
export async function askPushPermission(): Promise<PushPermission> {
  return 'unavailable';
}

/** Gets this device's push token and registers it for the signed-in member of the household. */
export async function registerPush(householdId: string): Promise<PushRegistration> {
  void householdId;
  return 'no_permission';
}

/** Removes this device's token from the household it was registered with (sign-out). */
export async function unregisterPush(): Promise<void> {}

/** Whether the gentle "turn on notifications?" card was already answered on this device. */
export async function pushPromptAnswered(): Promise<boolean> {
  return true;
}

export async function setPushPromptAnswered(): Promise<void> {}

/** Opens this app's page in iOS Settings (to turn notifications back on). */
export function openPushSettings(): void {}

/** Tapping a notification opens the screen it's about. Mount once, signed in. */
export function usePushResponses(): void {}
