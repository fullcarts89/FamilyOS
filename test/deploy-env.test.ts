import { describe, expect, it } from 'vitest';
import { apiEnv, workerEnv } from '../deploy/env.mjs';

// deploy/start.mjs: what the API and the worker each see in the shared app service.
const service = {
  PATH: '/usr/bin',
  HOME: '/home/node',
  NODE_ENV: 'production',
  PORT: '8080',
  DATABASE_URL: 'postgresql://api@db/postgres',
  DATABASE_PASSWORD: 'api-password',
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_SECRET_KEY: 'sb-secret',
  SUPABASE_JWT_SECRET: 'jwt-secret',
  CALENDAR_ENCRYPTION_KEY: 'calendar-key',
  WEB_DIST_DIR: '/app/web-dist',
  RAILWAY_GIT_COMMIT_SHA: 'abc123',
  WORKER_DATABASE_URL: 'postgresql://worker@db/postgres',
  WORKER_DATABASE_PASSWORD: 'worker-password',
  EXPO_ACCESS_TOKEN: 'expo-token',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  RAILWAY_DOCKERFILE_PATH: 'deploy/api.Dockerfile',
  SOMETHING_ADDED_LATER: 'x',
};

describe('the app service environment', () => {
  it('gives the API its own login and the Supabase secrets, nothing of the worker', () => {
    expect(apiEnv(service)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/node',
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://api@db/postgres',
      DATABASE_PASSWORD: 'api-password',
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
      SUPABASE_SECRET_KEY: 'sb-secret',
      SUPABASE_JWT_SECRET: 'jwt-secret',
      CALENDAR_ENCRYPTION_KEY: 'calendar-key',
      WEB_DIST_DIR: '/app/web-dist',
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    });
  });

  it('gives the worker its own login as DATABASE_URL, and the push token; no API secrets', () => {
    expect(workerEnv(service)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/node',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://worker@db/postgres',
      DATABASE_PASSWORD: 'worker-password',
      CALENDAR_ENCRYPTION_KEY: 'calendar-key',
      EXPO_ACCESS_TOKEN: 'expo-token',
    });
    const withoutPassword: Record<string, string | undefined> = { ...service };
    delete withoutPassword.WORKER_DATABASE_PASSWORD;
    expect(workerEnv(withoutPassword)).not.toHaveProperty('DATABASE_PASSWORD');
  });
});
