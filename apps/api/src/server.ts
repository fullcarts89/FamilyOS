import { serve } from '@hono/node-server';
import { createDb } from '@familyos/db';
import { createApp } from './app';
import { createSupabaseAuthAdmin } from './auth/admin';
import { createTokenVerifier } from './auth/verify';
import { loadConfig } from './config';
import { createLogger } from './logger';

const config = loadConfig();
const logger = createLogger();

const app = createApp({
  db: createDb({ connectionString: config.DATABASE_URL }),
  verifyToken: createTokenVerifier({
    issuer: new URL('/auth/v1', config.SUPABASE_URL).toString(),
    jwksUrl: config.SUPABASE_JWKS_URL,
    jwtSecret: config.SUPABASE_JWT_SECRET,
  }),
  authAdmin: createSupabaseAuthAdmin({
    supabaseUrl: config.SUPABASE_URL,
    secretKey: config.SUPABASE_SECRET_KEY,
  }),
  logger,
  inviteLinkBase: config.INVITE_LINK_BASE,
});

serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info('api_listening', { status: info.port });
});
