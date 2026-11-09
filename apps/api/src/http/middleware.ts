import { setContext, withRequestContext } from '@familyos/db';
import type { MiddlewareHandler } from 'hono';
import { InvalidTokenError } from '../auth/verify';
import type { AppEnv, Deps } from './env';
import { ApiError, notFound } from './errors';
import { uuidParam } from './validation';

export function requireUser(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match?.[1]) throw new ApiError(401, 'unauthenticated');
    try {
      c.set('user', await deps.verifyToken(match[1]));
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new ApiError(401, 'unauthenticated');
      throw error;
    }
    await next();
  };
}

/** Thrown to roll back a request transaction whose handler already produced a response. */
class Rollback extends Error {}

/**
 * Opens the request transaction for `/households/:householdId/...`: switches to the RLS role,
 * resolves the caller's active membership and exposes `trx` and `member` to handlers. A caller
 * who is not an active member gets 404, the same as a household that doesn't exist (T-01).
 * Any error or 4xx/5xx response rolls the transaction back.
 */
export function householdScope(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const householdId = uuidParam(c.req.param('householdId'));
    const { userId } = c.get('user');
    try {
      await withRequestContext(deps.db, { userId, householdId }, async (trx) => {
        const member = await trx
          .selectFrom('app.member')
          .select(['id', 'role'])
          .where('household_id', '=', householdId)
          .where('user_id', '=', userId)
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (!member) throw notFound();
        await setContext(trx, { userId, householdId, memberId: member.id });
        c.set('trx', trx);
        c.set('member', { id: member.id, role: member.role, householdId });
        await next();
        if (c.error || c.res.status >= 400) throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  };
}
