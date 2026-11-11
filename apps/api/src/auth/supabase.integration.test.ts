import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSupabaseAuthAdmin } from './admin';
import { createTokenVerifier } from './verify';

// Against the local Supabase Auth (gate G1: sign-up closed; invited accounts sign in).
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY from `supabase status`.
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(supabaseUrl && secretKey && publishableKey);

const auth = (path: string) => new URL(`/auth/v1${path}`, supabaseUrl);

describe.skipIf(!enabled)('Supabase Auth (local stack)', () => {
  it('refuses public sign-up, with a password or with an email code', async () => {
    const email = `signup-${randomUUID()}@example.test`;
    const signup = await fetch(auth('/signup'), {
      method: 'POST',
      headers: { apikey: publishableKey ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: randomUUID() }),
    });
    expect(signup.ok).toBe(false);

    const otp = await fetch(auth('/otp'), {
      method: 'POST',
      headers: { apikey: publishableKey ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ email, create_user: true }),
    });
    expect(otp.ok).toBe(false);
  });

  it('creates password accounts without touching existing ones, and their tokens pass our verifier', async () => {
    const email = `invited-${randomUUID()}@example.test`;
    const password = `first ${randomUUID()}`;
    const admin = createSupabaseAuthAdmin({
      supabaseUrl: supabaseUrl ?? '',
      secretKey: secretKey ?? '',
    });
    const created = await admin.createUser(email, password);
    if (typeof created === 'string') throw new Error(`expected a new account, got ${created}`);
    expect(await admin.createUser(email, `second ${randomUUID()}`)).toBe('exists');

    const signIn = (pw: string) =>
      fetch(auth('/token?grant_type=password'), {
        method: 'POST',
        headers: { apikey: publishableKey ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
    // The second createUser left the first password in place.
    const signedIn = await signIn(password);
    expect(signedIn.status).toBe(200);
    const session = (await signedIn.json()) as { access_token: string; user: { id: string } };
    expect(session.user.id).toBe(created.userId);

    const verify = createTokenVerifier({
      issuer: auth('').toString(),
      jwksUrl: auth('/.well-known/jwks.json').toString(),
    });
    expect(await verify(session.access_token)).toEqual({ userId: created.userId, email });

    const reset = `reset ${randomUUID()}`;
    expect(await admin.setPassword(created.userId, reset)).toBe('ok');
    expect((await signIn(password)).status).toBe(400);
    expect((await signIn(reset)).status).toBe(200);

    await fetch(auth(`/admin/users/${created.userId}`), {
      method: 'DELETE',
      headers: { apikey: secretKey ?? '', authorization: `Bearer ${secretKey}` },
    });
  });
});
