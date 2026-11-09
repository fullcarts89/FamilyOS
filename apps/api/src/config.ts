import { z } from 'zod';

const ConfigSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().url().optional(),
});

export type ApiConfig = z.infer<typeof ConfigSchema>;

/** Reads configuration from the environment. Values are never logged. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid API configuration: ${fields}`);
  }
  return parsed.data;
}
