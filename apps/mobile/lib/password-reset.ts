import { PASSWORD_MIN_LENGTH, passwordProblem } from '@familyos/domain';

/**
 * Self-service password reset. The email's link (supabase/templates/recovery.html) is
 * `https://<app>/reset-password?token_hash=…&type=recovery`: the web app's own page, and on an
 * iPhone with the app installed a universal link that opens this same route in the app.
 */
export const RESET_PATH = '/reset-password';

/** An answer from Supabase Auth, or a request that never reached it. */
export interface AuthFailure {
  status?: number;
  code?: string;
}

const OFFLINE = 'You’re offline. Check your Wi‑Fi or mobile data, then try again.';

export const RESET_SENT =
  'If that email has a FamilyOS account, we’ve sent it a link to choose a new password. Check your inbox, and your spam folder too.';

/** Nothing reached Supabase: no status, or the fetch failed outright (status 0). */
const offline = (error: AuthFailure) => error.status === undefined || error.status === 0;

/**
 * What to say after asking for a reset link. Every answer Supabase gives gets the same words, even
 * an error: Supabase can answer differently by whether the account exists (a resend too soon for
 * that account, or a failure to send to a real address), so only a request that never left this
 * device is worded differently. Asking never reveals who has an account.
 */
export function resetRequestMessage(error: AuthFailure | null): { sent: boolean; message: string } {
  if (error && offline(error)) return { sent: false, message: `${OFFLINE} Nothing was sent.` };
  return { sent: true, message: RESET_SENT };
}

/** The token in a reset link, or null when the link is incomplete or isn't a reset link. */
export function resetToken(params: {
  token_hash?: string | string[];
  type?: string | string[];
}): string | null {
  const token = typeof params.token_hash === 'string' ? params.token_hash : null;
  if (params.type !== 'recovery' || !token) return null;
  return /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : null;
}

export const NEW_PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`;

/** What the two new-password fields say, and whether the pair can be saved (as invite.tsx does). */
export function newPasswordCheck(password: string, again: string) {
  const problem = passwordProblem(password);
  return {
    passwordError: problem === 'too_long' ? 'That password is too long.' : null,
    againError: again.length > 0 && again !== password ? 'The passwords don’t match.' : null,
    ready: problem === null && password === again,
  };
}

/**
 * Opening the link failed: it is used up or expired (the screen then offers a new link), or
 * Supabase couldn't be reached or answer, and trying again may work.
 */
export function linkFailure(
  error: AuthFailure,
): { expired: true } | { expired: false; message: string } {
  if (offline(error)) return { expired: false, message: OFFLINE };
  if (error.status === 429)
    return { expired: false, message: 'Too many tries. Wait a few minutes, then try again.' };
  if (error.status !== undefined && error.status >= 500)
    return {
      expired: false,
      message: 'Resetting isn’t working on our side right now. Try again in a moment.',
    };
  // 403 otp_expired, or any other refusal of the token: ask for a new link.
  return { expired: true };
}

/**
 * Saving the new password failed (the link already worked, so this device is signed in), or
 * null when there is nothing to fix: the "new" password is already the account's password.
 */
export function saveFailure(error: AuthFailure): string | null {
  if (error.code === 'same_password') return null;
  if (error.code === 'weak_password')
    return 'That password is known from a data breach or too easy to guess. Choose another.';
  if (offline(error)) return OFFLINE;
  return 'Couldn’t save your new password. Try again in a moment.';
}
