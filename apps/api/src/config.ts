import { z } from 'zod';

const ConfigSchema = z
  .object({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    /** Server-side key for the Auth admin API (creating invited accounts). Never sent to clients. */
    SUPABASE_SECRET_KEY: z.string().min(20),
    /** Verify access tokens with the project's JWKS (asymmetric keys) ... */
    SUPABASE_JWKS_URL: z.string().url().optional(),
    /** ... or with the legacy shared secret (HS256), as the local CLI stack does. */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    INVITE_LINK_BASE: z.string().default('familyos://invite'),
    /** Directory of the Expo web export to serve beside the API (production); unset in development. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /** Supabase URL compiled into that export, if it differs from SUPABASE_URL (set by the image). */
    WEB_SUPABASE_URL: z.string().url().optional(),
    /** Commit being run, set by the host (Railway) and shown by the health checks. */
    RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
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

export type ApiConfig = z.infer<typeof ConfigSchema>;

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
  return parsed.data;
}
