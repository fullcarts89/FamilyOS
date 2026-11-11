/**
 * Password rules for FamilyOS accounts (sign-in is email and password, decision 2026-11-11).
 * Length is what matters; there are no character-class rules. Supabase Auth hashes with bcrypt,
 * which reads only the first 72 bytes, so longer passwords are refused rather than truncated.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

/** Why a new password is not acceptable, or null when it is. */
export function passwordProblem(password: string): 'too_short' | 'too_long' | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'too_long';
  return null;
}
