import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { createTestApp } from './testing/harness';

const user = { userId: randomUUID(), email: 'someone@example.test' };

describe('api http layer', () => {
  it('reports health without authentication', async () => {
    const { request } = createTestApp();
    const res = await request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'dev' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('requires a valid token for everything else', async () => {
    const { request, tokenFor } = createTestApp();
    expect((await request('/me')).status).toBe(401);
    expect((await request('/nope')).status).toBe(401);
    expect((await request('/me', { token: 'not-a-jwt' })).status).toBe(401);

    const wrongIssuer = await tokenFor(user, { issuer: 'https://evil.example/auth/v1' });
    expect((await request('/me', { token: wrongIssuer })).status).toBe(401);

    const other = createTestApp();
    const foreignSigned = await other.tokenFor(user);
    expect((await request('/me', { token: foreignSigned })).status).toBe(401);
  });

  it('returns 404 for unknown routes once authenticated, and for malformed IDs', async () => {
    const { request, tokenFor } = createTestApp();
    const token = await tokenFor(user);
    expect((await request('/nope', { token })).status).toBe(404);
    expect((await request('/households/not-a-uuid', { token })).status).toBe(404);
  });

  it('hides error details from the response and the logs', async () => {
    const { app, request, tokenFor, logs } = createTestApp();
    app.get('/boom', () => {
      throw new Error('household secret in message');
    });
    const res = await request('/boom', { token: await tokenFor(user) });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('household secret');
    expect(body).toContain('internal_error');
    expect(logs.join('\n')).not.toContain('household secret');
  });

  it('opens only the invite claim before sign-in, and validates it', async () => {
    const { request, accounts } = createTestApp();
    const claim = (body: unknown) => request('/invites/claim', { method: 'POST', body });
    const base = { token: 'x'.repeat(43), email: 'new@example.test', displayName: 'New' };
    // Rejected by validation (422), not by the auth check (401), and before any database call.
    expect((await claim({ ...base, password: 'too short' })).status).toBe(422);
    expect((await claim({ ...base, password: 'a'.repeat(73) })).status).toBe(422);
    expect(
      (await claim({ ...base, email: 'not an email', password: 'long enough password' })).status,
    ).toBe(422);
    expect(accounts.size).toBe(0);
    // Everything else still needs a token.
    expect((await request('/invites/accept', { method: 'POST', body: base })).status).toBe(401);
    expect((await request('/me')).status).toBe(401);
  });

  it('rejects oversized bodies', async () => {
    const { request, tokenFor } = createTestApp();
    const res = await request('/invites/accept', {
      method: 'POST',
      token: await tokenFor(user),
      body: { token: 'x'.repeat(70 * 1024), displayName: 'A' },
    });
    expect(res.status).toBe(413);
  });
});

describe('cors', () => {
  it('allows only listed browser origins', async () => {
    const { app } = createTestApp({ corsOrigins: ['http://localhost:8081'] });
    const preflight = (origin: string) =>
      app.request('/me', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'GET' },
      });
    expect(
      (await preflight('http://localhost:8081')).headers.get('access-control-allow-origin'),
    ).toBe('http://localhost:8081');
    expect(
      (await preflight('https://evil.example')).headers.get('access-control-allow-origin'),
    ).toBeNull();
  });

  it('sends no CORS headers when no origins are configured', async () => {
    const { app } = createTestApp();
    const res = await app.request('/health', { headers: { origin: 'http://localhost:8081' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('api config', () => {
  const valid = {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
    SUPABASE_URL: 'http://127.0.0.1:55321',
    SUPABASE_SECRET_KEY: 'x'.repeat(32),
    SUPABASE_JWT_SECRET: 'y'.repeat(40),
  };

  it('accepts a complete config and defaults the port', () => {
    expect(loadConfig(valid).API_PORT).toBe(8787);
  });

  it("takes the host's PORT unless API_PORT is set", () => {
    expect(loadConfig({ ...valid, PORT: '3000' }).API_PORT).toBe(3000);
    expect(loadConfig({ ...valid, PORT: '3000', API_PORT: '9000' }).API_PORT).toBe(9000);
  });

  it('names missing or invalid fields without echoing values', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'not a url with secret' })).toThrow(
      /^Invalid API configuration: DATABASE_URL$/,
    );
    expect(() => loadConfig({ ...valid, SUPABASE_JWT_SECRET: undefined })).toThrow(
      /SUPABASE_JWKS_URL/,
    );
  });
});
