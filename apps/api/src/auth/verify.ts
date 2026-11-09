import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

export class InvalidTokenError extends Error {
  constructor() {
    super('invalid_token');
    this.name = 'InvalidTokenError';
  }
}

export interface VerifierOptions {
  issuer: string;
  jwksUrl?: string | undefined;
  jwtSecret?: string | undefined;
}

/** Verifies Supabase Auth access tokens: signature, issuer, audience and expiry. */
export function createTokenVerifier({
  issuer,
  jwksUrl,
  jwtSecret,
}: VerifierOptions): TokenVerifier {
  const options = { issuer, audience: 'authenticated' };
  let verify: (token: string) => Promise<JWTPayload>;
  if (jwksUrl) {
    const jwks = createRemoteJWKSet(new URL(jwksUrl));
    verify = async (token) =>
      (await jwtVerify(token, jwks, { ...options, algorithms: ['ES256', 'RS256'] })).payload;
  } else if (jwtSecret) {
    const secret = new TextEncoder().encode(jwtSecret);
    verify = async (token) =>
      (await jwtVerify(token, secret, { ...options, algorithms: ['HS256'] })).payload;
  } else {
    throw new Error('token verifier needs a JWKS URL or a secret');
  }

  return async (token) => {
    let payload: JWTPayload;
    try {
      payload = await verify(token);
    } catch {
      throw new InvalidTokenError();
    }
    const email = payload['email'];
    if (typeof payload.sub !== 'string' || typeof email !== 'string' || email === '') {
      throw new InvalidTokenError();
    }
    return { userId: payload.sub, email: email.toLowerCase() };
  };
}
