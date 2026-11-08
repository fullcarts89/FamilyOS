import { randomBytes } from 'node:crypto';
import { createDb, type Database } from '@familyos/db';
import { SignJWT } from 'jose';
import type { Kysely } from 'kysely';
import { createApp } from '../app';
import type { AuthAdmin } from '../auth/admin';
import { createTokenVerifier } from '../auth/verify';
import { createLogger } from '../logger';

export const TEST_ISSUER = 'http://127.0.0.1:55321/auth/v1';

/** Test app with a per-run random signing secret, a recording auth admin and captured logs. */
export function createTestApp(
  options: { db?: Kysely<Database>; now?: () => Date; corsOrigins?: string[] } = {},
) {
  const secret = randomBytes(32).toString('hex');
  const logs: string[] = [];
  const ensuredEmails: string[] = [];
  const authAdmin: AuthAdmin = {
    ensureUser: async (email) => {
      ensuredEmails.push(email);
    },
  };
  // A pool that is never used when no database is given: pg connects lazily.
  const db = options.db ?? createDb({ connectionString: 'postgresql://unused@127.0.0.1:1/unused' });
  const app = createApp({
    db,
    verifyToken: createTokenVerifier({ issuer: TEST_ISSUER, jwtSecret: secret }),
    authAdmin,
    logger: createLogger((line) => logs.push(line)),
    inviteLinkBase: 'familyos://invite',
    ...(options.now && { now: options.now }),
    ...(options.corsOrigins && { corsOrigins: options.corsOrigins }),
  });

  const tokenFor = async (
    user: { userId: string; email: string },
    overrides: { issuer?: string; expiresIn?: string } = {},
  ) =>
    new SignJWT({ email: user.email, role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.userId)
      .setIssuer(overrides.issuer ?? TEST_ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(overrides.expiresIn ?? '5m')
      .sign(new TextEncoder().encode(secret));

  const request = async (
    path: string,
    init: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<Response> =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.token && { authorization: `Bearer ${init.token}` }),
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });

  return { app, db, logs, ensuredEmails, tokenFor, request };
}
