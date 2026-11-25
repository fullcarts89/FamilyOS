import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SESSION_STORAGE_KEY } from '../native/shared';
import { config } from './config';
import { sessionStorage } from './session-storage';

export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    storage: sessionStorage,
    // On iPhone the widget reads this same keychain item, so its name is fixed (native/shared.ts).
    ...(Platform.OS === 'ios' && { storageKey: SESSION_STORAGE_KEY }),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Signs in with email and password. There is no public sign-up: accounts come from invites. */
export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });

/**
 * Emails a link to choose a new password, if the address has an account. The link comes from the
 * Reset Password email template (supabase/templates/recovery.html), built from the Site URL, so
 * no redirect address is passed. Supabase answers the same for an address without an account.
 */
export const requestPasswordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());

/** Uses up a reset link's token: signs this device in as the account it was sent to. */
export const openResetLink = (tokenHash: string) =>
  supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });

/** Sets the signed-in account's password. */
export const setPassword = (password: string) => supabase.auth.updateUser({ password });
