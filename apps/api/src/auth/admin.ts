/**
 * The slice of the Supabase Auth admin API FamilyOS uses. Public sign-up stays disabled: accounts
 * are created only here, by the household bootstrap and by accepting an invite.
 */
export interface AuthAdmin {
  /**
   * Creates a confirmed account that signs in with this email and password. Returns 'exists'
   * when the email already has an account (an existing account is never changed), and
   * 'weak_password' when Supabase refuses the password (for example, a known leaked one).
   */
  createUser(
    email: string,
    password: string,
  ): Promise<{ userId: string } | 'exists' | 'weak_password'>;
  /** Replaces an account's password (the operator's reset command). */
  setPassword(userId: string, password: string): Promise<'ok' | 'weak_password'>;
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
  const call = (method: string, path: string, body: unknown) =>
    doFetch(new URL(`/auth/v1/admin${path}`, options.supabaseUrl), {
      method,
      headers: {
        apikey: options.secretKey,
        authorization: `Bearer ${options.secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  return {
    async createUser(email, password) {
      const res = await call('POST', '/users', { email, password, email_confirm: true });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        error_code?: string;
        code?: string;
      };
      if (res.ok && body.id) return { userId: body.id };
      const code = body.error_code ?? body.code;
      if (code === 'email_exists') return 'exists';
      if (code === 'weak_password') return 'weak_password';
      // Status only: the response may echo the email.
      throw new AuthAdminError(res.status);
    },

    async setPassword(userId, password) {
      const res = await call('PUT', `/users/${encodeURIComponent(userId)}`, { password });
      if (res.ok) return 'ok';
      const body = (await res.json().catch(() => ({}))) as { error_code?: string; code?: string };
      if ((body.error_code ?? body.code) === 'weak_password') return 'weak_password';
      throw new AuthAdminError(res.status);
    },
  };
}
