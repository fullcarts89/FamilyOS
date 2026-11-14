/**
 * Operator command: creates a new, empty household and a one-time link for its owner, who opens
 * it, enters their name, email and a new password, and becomes the owner. Nobody types a
 * password into a terminal (founder decision 2026-11-14). Prints the link once; it works once,
 * for that email only, for 48 hours. Needs only the admin database URL.
 *
 *   DATABASE_URL=<admin URL> pnpm --filter @familyos/api household:invite-owner --name "Our Home" \
 *     --timezone America/Los_Angeles --owner-email you@example.com \
 *     --link-base https://<app address>/invite
 */
import { parseArgs } from 'node:util';
import { createDb } from '@familyos/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { hashToken, newInviteToken } from '../tokens';

const LIFETIME_MS = 48 * 3600 * 1000;

const args = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone: z
      .string()
      .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'unknown timezone'),
    'owner-email': z.email().transform((e) => e.toLowerCase()),
    'link-base': z.url(),
  })
  .parse(
    parseArgs({
      options: {
        name: { type: 'string' },
        timezone: { type: 'string' },
        'owner-email': { type: 'string' },
        'link-base': { type: 'string' },
      },
    }).values,
  );

const env = z.object({ DATABASE_URL: z.string().url() }).parse(process.env);

const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 1 });
try {
  const token = newInviteToken();
  await sql`
    select app.create_household_with_owner_invite(
      ${args.name}, ${args.timezone}, ${args['owner-email']}, ${hashToken(token)},
      ${new Date(Date.now() + LIFETIME_MS)}
    )
  `.execute(db);
  process.stdout.write(`${args['link-base']}?token=${encodeURIComponent(token)}\n`);
} finally {
  await db.destroy();
}
