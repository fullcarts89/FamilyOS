import { hashToken } from '../tokens';
import { withRequestContext } from '@familyos/db';
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
    try {
      const result = await withRequestContext(deps.db, { userId }, (trx) =>
        sql<{ household_id: string; member_id: string }>`
          select * from app.accept_invite(
            ${hashToken(body.token)}, ${userId}::uuid, ${email}, ${body.displayName}, ${c.get('requestId')}
          )
        `.execute(trx),
      );
      const row = result.rows[0];
      if (!row) throw new ApiError(404, 'invite_not_found');
      return c.json({ householdId: row.household_id, memberId: row.member_id }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('invite_not_found')) throw new ApiError(404, 'invite_not_found');
      if (message.includes('already_member')) throw new ApiError(409, 'already_member');
      throw error;
    }
  });

  return app;
}
