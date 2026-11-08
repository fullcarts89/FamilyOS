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

  it('creates invited accounts idempotently, and their tokens pass our verifier', async () => {
    const email = `invited-${randomUUID()}@example.test`;
    const admin = createSupabaseAuthAdmin({
      supabaseUrl: supabaseUrl ?? '',
      secretKey: secretKey ?? '',
    });
    await admin.ensureUser(email);
    await admin.ensureUser(email);

    const adminHeaders = {
      apikey: secretKey ?? '',
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/json',
    };
    const link = await fetch(auth('/admin/generate_link'), {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    expect(link.status).toBe(200);
    const linkBody = (await link.json()) as {
      hashed_token?: string;
      properties?: { hashed_token?: string };
      id?: string;
    };
    const tokenHash = linkBody.properties?.hashed_token ?? linkBody.hashed_token;
    expect(tokenHash).toBeTruthy();

    const verified = await fetch(auth('/verify'), {
      method: 'POST',
      headers: { apikey: publishableKey ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    });
    expect(verified.status).toBe(200);
    const session = (await verified.json()) as { access_token: string; user: { id: string } };

    const verify = createTokenVerifier({
      issuer: auth('').toString(),
      jwksUrl: auth('/.well-known/jwks.json').toString(),
    });
    expect(await verify(session.access_token)).toEqual({ userId: session.user.id, email });

    await fetch(auth(`/admin/users/${session.user.id}`), {
      method: 'DELETE',
      headers: adminHeaders,
    });
  });
});
