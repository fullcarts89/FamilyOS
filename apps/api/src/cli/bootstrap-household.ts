/**
 * Operator command: creates a household and its owner account. There is no public sign-up or
 * onboarding (product contract §6); this is how the first household comes to exist. It asks for
 * the owner's password without echoing it. If the email already has an account, that account
 * and its password are kept.
 *
 *   pnpm --filter @familyos/api household:bootstrap --name "Our Home" \
 *     --timezone America/Los_Angeles --owner-email you@example.com --owner-name Sam
 */
import { parseArgs } from 'node:util';
import { createDb } from '@familyos/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { createSupabaseAuthAdmin } from '../auth/admin';
import { readNewPassword } from './read-password';

const args = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone: z
      .string()
      .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'unknown timezone'),
    'owner-email': z.email().transform((e) => e.toLowerCase()),
    'owner-name': z.string().trim().min(1).max(60),
  })
  .parse(
    parseArgs({
      options: {
        name: { type: 'string' },
        timezone: { type: 'string' },
        'owner-email': { type: 'string' },
        'owner-name': { type: 'string' },
      },
    }).values,
  );

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20),
  })
  .parse(process.env);

const password = await readNewPassword();
const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 1 });
try {
  const created = await createSupabaseAuthAdmin({
    supabaseUrl: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  }).createUser(args['owner-email'], password);
  if (created === 'weak_password') {
    throw new Error('Supabase refused that password as weak or leaked; run again with another');
  }
  if (created === 'exists') {
    console.warn('That email already has an account; its password is unchanged.');
  }
  const { rows } = await sql<{
    id: string;
  }>`select id from auth.users where email = ${args['owner-email']}`.execute(db);
  const userId = rows[0]?.id;
  if (!userId) throw new Error('owner account was not created');

  const result = await db.transaction().execute(async (trx) => {
    const household = await trx
      .insertInto('app.household')
      .values({ name: args.name, timezone: args.timezone })
      .returning('id')
      .executeTakeFirstOrThrow();
    const owner = await trx
      .insertInto('app.member')
      .values({
        household_id: household.id,
        user_id: userId,
        display_name: args['owner-name'],
        role: 'owner',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('app.audit_event')
      .values({
        household_id: household.id,
        actor_member_id: owner.id,
        entity_type: 'household',
        entity_id: household.id,
        action: 'household.created',
        payload: { via: 'bootstrap' },
      })
      .execute();
    return { householdId: household.id, ownerMemberId: owner.id };
  });
  console.warn(JSON.stringify(result));
} finally {
  await db.destroy();
}
