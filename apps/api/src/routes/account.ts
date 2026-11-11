import { hashToken } from '../tokens';
import { withRequestContext } from '@familyos/db';
import { passwordProblem } from '@familyos/domain';
import { Hono } from 'hono';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppEnv, Deps } from '../http/env';
import { ApiError } from '../http/errors';
import { parseBody } from '../http/validation';

const AcceptInvite = z.object({
  token: z.string().min(20).max(200),
  displayName: z.string().trim().min(1).max(60),
});

const ClaimInvite = AcceptInvite.extend({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  password: z.string().refine((p) => passwordProblem(p) === null),
});

/** Joins the invite's household as `userId`, through app.accept_invite and all of its checks. */
async function acceptInvite(
  deps: Deps,
  args: { token: string; userId: string; email: string; displayName: string; requestId: string },
) {
  try {
    const result = await withRequestContext(deps.db, { userId: args.userId }, (trx) =>
      sql<{ household_id: string; member_id: string }>`
        select * from app.accept_invite(
          ${hashToken(args.token)}, ${args.userId}::uuid, ${args.email}, ${args.displayName}, ${args.requestId}
        )
      `.execute(trx),
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'invite_not_found');
    return { householdId: row.household_id, memberId: row.member_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('invite_not_found')) throw new ApiError(404, 'invite_not_found');
    if (message.includes('already_member')) throw new ApiError(409, 'already_member');
    throw error;
  }
}

/**
 * The one route open before sign-in: an invitee without an account opens the invite link,
 * chooses a password and joins. The link is checked before the account is created, so nobody
 * can create an account without a pending invite for that exact email. An email that already
 * has an account gets 409 and is left untouched: that person signs in, then accepts.
 */
export function inviteClaimRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.post('/invites/claim', async (c) => {
    const body = await parseBody(c.req.raw, ClaimInvite);
    const claimable = await deps.db.transaction().execute(async (trx) => {
      await sql`set local role familyos_api`.execute(trx);
      const { rows } = await sql<{ ok: boolean }>`
        select app.invite_claimable(${hashToken(body.token)}, ${body.email}) as ok
      `.execute(trx);
      return rows[0]?.ok === true;
    });
    if (!claimable) throw new ApiError(404, 'invite_not_found');

    const created = await deps.authAdmin.createUser(body.email, body.password);
    if (created === 'exists') throw new ApiError(409, 'account_exists');
    if (created === 'weak_password') throw new ApiError(422, 'weak_password');
    // If the invite was revoked in between, the new account simply has no household.
    const joined = await acceptInvite(deps, {
      token: body.token,
      userId: created.userId,
      email: body.email,
      displayName: body.displayName,
      requestId: c.get('requestId'),
    });
    return c.json(joined, 201);
  });

  return app;
}

/** Account-level routes: the caller's households, and accepting an invite. */
export function accountRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get('/me', async (c) => {
    const { userId } = c.get('user');
    const households = await withRequestContext(deps.db, { userId }, (trx) =>
      trx
        .selectFrom('app.member as m')
        .innerJoin('app.household as h', 'h.id', 'm.household_id')
        .select(['h.id as id', 'h.name as name', 'm.id as memberId', 'm.role as role'])
        .where('m.user_id', '=', userId)
        .where('m.status', '=', 'active')
        .orderBy('h.created_at')
        .execute(),
    );
    return c.json({ userId, households });
  });

  app.post('/invites/accept', async (c) => {
    const body = await parseBody(c.req.raw, AcceptInvite);
    const { userId, email } = c.get('user');
    const joined = await acceptInvite(deps, {
      token: body.token,
      userId,
      email,
      displayName: body.displayName,
      requestId: c.get('requestId'),
    });
    return c.json(joined, 201);
  });

  return app;
}
