/** The slice of the Supabase Auth admin API FamilyOS uses. Public sign-up stays disabled. */
export interface AuthAdmin {
  /** Makes sure an account exists for an invited email, so the invitee can sign in with a code. */
  ensureUser(email: string): Promise<void>;
}

export class AuthAdminError extends Error {
  constructor(readonly status: number) {
    super(`auth admin request failed with status ${status}`);
    this.name = 'AuthAdminError';
  }
}

export function createSupabaseAuthAdmin(options: {
  supabaseUrl: string;
  secretKey: string;
  fetch?: typeof fetch;
}): AuthAdmin {
  const doFetch = options.fetch ?? fetch;
  return {
    async ensureUser(email) {
      const res = await doFetch(new URL('/auth/v1/admin/users', options.supabaseUrl), {
        method: 'POST',
        headers: {
          apikey: options.secretKey,
          authorization: `Bearer ${options.secretKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, email_confirm: true }),
      });
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { error_code?: string; code?: string };
      // An existing account is fine: the invite binds to whoever signs in with that email.
      if (body.error_code === 'email_exists' || body.code === 'email_exists') return;
      throw new AuthAdminError(res.status);
    },
  };
}
