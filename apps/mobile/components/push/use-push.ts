import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useToast } from '../../design/Toast';
import { useHousehold } from '../../lib/household';
import {
  askPushPermission,
  pushAvailable,
  pushPermission,
  registerPush,
  type PushPermission,
  type PushRegistration,
} from '../../native/push';

/** What turning notifications on says, in plain words, for each way it can end. */
export function registeredLine(result: PushRegistration): { text: string; error?: boolean } {
  switch (result) {
    case 'registered':
      return { text: 'Notifications are on for this iPhone.' };
    case 'not_configured':
      return {
        text: 'Allowed. They’ll start arriving once this build of FamilyOS is set up for push.',
      };
    case 'failed':
      return {
        text: 'Couldn’t finish turning them on. Check your connection and try again.',
        error: true,
      };
    default:
      return { text: 'Notifications are off for FamilyOS in iOS Settings.', error: true };
  }
}

/**
 * This iPhone's notification permission, kept current (it can change in iOS Settings while the
 * app is away), and the registration that follows it: allowed means this device's token is on
 * the account; turned off means it's taken off.
 */
export function usePush() {
  const { household } = useHousehold();
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermission>(
    pushAvailable ? 'undetermined' : 'unavailable',
  );
  const [registration, setRegistration] = useState<PushRegistration | null>(null);
  const householdId = household?.id ?? null;

  const sync = useCallback(async () => {
    if (!pushAvailable || !householdId) return;
    const now = await pushPermission();
    setPermission(now);
    // Granted: (re-)register, which also keeps the token current. Denied: unregister.
    if (now !== 'undetermined') setRegistration(await registerPush(householdId));
  }, [householdId]);

  useEffect(() => {
    if (!pushAvailable) return;
    void sync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void sync());
    return () => sub.remove();
  }, [sync]);

  /** Asks iOS (the system prompt, once), then registers; says how it went. */
  const enable = useCallback(async (): Promise<PushPermission> => {
    if (!pushAvailable || !householdId) return 'unavailable';
    const answer = await askPushPermission();
    setPermission(answer);
    if (answer === 'granted') {
      const result = await registerPush(householdId);
      setRegistration(result);
      const line = registeredLine(result);
      toast.show(line.text, { error: line.error });
    } else if (answer === 'denied') {
      toast.show('Notifications stay off.', {
        detail: 'You can turn them on any time in Household, Your settings.',
      });
    }
    return answer;
  }, [householdId, toast]);

  return { permission, registration, enable };
}
