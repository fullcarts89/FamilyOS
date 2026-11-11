import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgresql://familyos_api_login.ref@pooler.example:5432/postgres',
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_placeholder_placeholder',
  SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
};

describe('loadConfig', () => {
  it('fills the database password in from its own variable', () => {
    const config = loadConfig({ ...base, DATABASE_PASSWORD: 'p@ss/word-1' });
    expect(decodeURIComponent(new URL(config.DATABASE_URL).password)).toBe('p@ss/word-1');
    expect(loadConfig(base).DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it("points invite links at the app's own address on Railway unless set", () => {
    expect(loadConfig(base).INVITE_LINK_BASE).toBe('familyos://invite');
    expect(
      loadConfig({ ...base, RAILWAY_PUBLIC_DOMAIN: 'familyos.up.railway.app' }).INVITE_LINK_BASE,
    ).toBe('https://familyos.up.railway.app/invite');
    expect(
      loadConfig({
        ...base,
        RAILWAY_PUBLIC_DOMAIN: 'familyos.up.railway.app',
        INVITE_LINK_BASE: 'https://familyos.fullcarts.org/invite',
      }).INVITE_LINK_BASE,
    ).toBe('https://familyos.fullcarts.org/invite');
  });

  it('names missing fields without echoing any value', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'not a url secret-value' })).toThrow(
      /^Invalid API configuration: DATABASE_URL$/,
    );
  });
});
