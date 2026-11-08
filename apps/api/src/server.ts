import { serve } from '@hono/node-server';
import { createDb } from '@familyos/db';
import { createApp } from './app';
import { createSupabaseAuthAdmin } from './auth/admin';
import { createTokenVerifier } from './auth/verify';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createServer } from './web';

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
  corsOrigins: config.CORS_ORIGINS,
  ...(config.RAILWAY_GIT_COMMIT_SHA && { version: config.RAILWAY_GIT_COMMIT_SHA.slice(0, 12) }),
});

const server = createServer(
  app,
  config.WEB_DIST_DIR
    ? { root: config.WEB_DIST_DIR, supabaseUrl: config.WEB_SUPABASE_URL ?? config.SUPABASE_URL }
    : undefined,
);

serve({ fetch: server.fetch, port: config.API_PORT }, (info) => {
  logger.info('api_listening', { status: info.port });
});
