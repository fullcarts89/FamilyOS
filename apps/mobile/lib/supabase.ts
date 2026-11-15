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
