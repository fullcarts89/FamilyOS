/**
 * Operator command: sets a new password for an account, for when someone has forgotten theirs.
 * Asks for the password without echoing it.
 *
 *   pnpm --filter @familyos/api household:set-password --email you@example.com
 */
import { parseArgs } from 'node:util';
import { createDb } from '@familyos/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { createSupabaseAuthAdmin } from '../auth/admin';
import { readNewPassword } from './read-password';

const args = z
  .object({ email: z.email().transform((e) => e.toLowerCase()) })
  .parse(parseArgs({ options: { email: { type: 'string' } } }).values);

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20),
  })
  .parse(process.env);

const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 1 });
try {
  const { rows } = await sql<{
    id: string;
  }>`select id from auth.users where email = ${args.email}`.execute(db);
  const userId = rows[0]?.id;
  if (!userId) throw new Error('no account has that email');
  const password = await readNewPassword();
  const result = await createSupabaseAuthAdmin({
    supabaseUrl: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  }).setPassword(userId, password);
  if (result === 'weak_password') {
    throw new Error('Supabase refused that password as weak or leaked; run again with another');
  }
  console.warn('Password changed.');
} finally {
  await db.destroy();
}
