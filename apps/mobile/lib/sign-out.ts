import { unregisterPush } from '../native/push';
import { supabase } from './supabase';

/**
 * Signs out on this device. On iPhone it first takes this device's push token off the account
 * (while the session can still say who's asking), so nothing more is sent here; that never holds
 * up signing out for more than a few seconds.
 */
export async function signOut(): Promise<void> {
  await Promise.race([
    unregisterPush().catch(() => undefined),
    new Promise((done) => setTimeout(done, 4000)),
  ]);
  await supabase.auth.signOut();
}
