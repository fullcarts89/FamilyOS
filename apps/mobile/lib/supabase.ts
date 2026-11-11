import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { sessionStorage } from './session-storage';

export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Signs in with email and password. There is no public sign-up: accounts come from invites. */
export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
