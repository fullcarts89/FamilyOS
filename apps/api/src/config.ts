import { CalendarKeyError, parseCalendarKey } from '@familyos/calendar';
import { databaseUrl } from '@familyos/db';
import { z } from 'zod';

const ConfigSchema = z
  .object({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    DATABASE_URL: z.string().url(),
    /** The password for DATABASE_URL, when the host keeps it separately (Railway). */
    DATABASE_PASSWORD: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url(),
    /** Server-side key for the Auth admin API (creating invited accounts). Never sent to clients. */
    SUPABASE_SECRET_KEY: z.string().min(20),
    /** Verify access tokens with the project's JWKS (asymmetric keys) ... */
    SUPABASE_JWKS_URL: z.string().url().optional(),
    /** ... or with the legacy shared secret (HS256), as the local CLI stack does. */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    /** Defaults to the app's own /invite page on Railway's address, else the iPhone app's link. */
    INVITE_LINK_BASE: z.string().optional(),
    /**
     * Apple Developer Team ID (10 letters and digits, not secret). Lets the iPhone app open
     * password reset links (apple-app-site-association); unset, they open in Safari.
     */
    APPLE_TEAM_ID: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .optional(),
    /** Set by Railway: the service's public hostname. */
    RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
    /** Directory of the Expo web export to serve beside the API (production); unset in development. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /** Supabase URL compiled into that export, if it differs from SUPABASE_URL (set by the image). */
    WEB_SUPABASE_URL: z.string().url().optional(),
    /** Commit being run, set by the host (Railway) and shown by the health checks. */
    RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
    /**
     * 32 random bytes, base64: encrypts calendar subscription addresses at rest. Without it the
     * calendar endpoints answer 503 and nothing is imported.
     */
    CALENDAR_ENCRYPTION_KEY: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (v === undefined || v === '') return undefined;
        try {
          return parseCalendarKey(v);
        } catch (error) {
          if (!(error instanceof CalendarKeyError)) throw error;
          ctx.addIssue({ code: 'custom', message: 'must be 32 bytes, base64' });
          return z.NEVER;
        }
      }),
    /** Comma-separated browser origins allowed to call the API (the web app). Native apps need none. */
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
  })
  .refine((c) => c.SUPABASE_JWKS_URL || c.SUPABASE_JWT_SECRET, {
    message: 'set SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET',
    path: ['SUPABASE_JWKS_URL'],
  });

export type ApiConfig = Omit<z.infer<typeof ConfigSchema>, 'INVITE_LINK_BASE'> & {
  INVITE_LINK_BASE: string;
};

/** Reads configuration from the environment. Values are never logged or echoed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  // Hosts such as Railway assign the port in PORT; an explicit API_PORT still wins.
  const parsed = ConfigSchema.safeParse({ API_PORT: env.PORT, ...env });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(
      ', ',
    );
    throw new Error(`Invalid API configuration: ${fields}`);
  }
  const c = parsed.data;
  return {
    ...c,
    DATABASE_URL: databaseUrl(c.DATABASE_URL, c.DATABASE_PASSWORD),
    INVITE_LINK_BASE:
      c.INVITE_LINK_BASE ??
      (c.RAILWAY_PUBLIC_DOMAIN ? `https://${c.RAILWAY_PUBLIC_DOMAIN}/invite` : 'familyos://invite'),
  };
}
