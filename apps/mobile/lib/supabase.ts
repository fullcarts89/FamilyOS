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

/** Sends a 6-digit sign-in code. Never creates an account: accounts exist only through invites. */
export const sendSignInCode = (email: string) =>
  supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });

export const verifySignInCode = (email: string, token: string) =>
  supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
