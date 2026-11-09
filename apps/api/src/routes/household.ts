import { Hono } from 'hono';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';
import { hashToken, newInviteToken } from '../tokens';

const INVITE_LIFETIME_MS = 48 * 60 * 60 * 1000;

const CreateInvite = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  role: z.enum(['adult', 'caregiver']),
});

const AddChild = z.object({ displayName: z.string().trim().min(1).max(60) });

export function householdRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  app.get('/', async (c) => {
    authorize(c, 'household.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const household = await trx
      .selectFrom('app.household')
      .select(['id', 'name', 'timezone', 'version'])
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const members = await trx
      .selectFrom('app.member')
      .select(['id', 'display_name as displayName', 'role', 'status'])
      .where('household_id', '=', householdId)
      .where('status', '=', 'active')
      .orderBy('created_at')
      .execute();
    return c.json({ household, members, me: c.get('member') });
  });

  app.post('/invites', async (c) => {
    authorize(c, 'member.invite');
    const body = await parseBody(c.req.raw, CreateInvite);
    const trx = c.get('trx');
    const member = c.get('member');
    const token = newInviteToken();
    const invite = await trx
      .insertInto('app.invite')
      .values({
        household_id: member.householdId,
        email: body.email,
        role: body.role,
        token_hash: hashToken(token),
        invited_by_member_id: member.id,
        expires_at: new Date(now().getTime() + INVITE_LIFETIME_MS),
      })
      .returning(['id', 'role', 'expires_at as expiresAt'])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'invite',
      entityId: invite.id,
      action: 'invite.created',
      payload: { role: invite.role },
      requestId: c.get('requestId'),
    });
    // Inside the transaction: if the account can't be prepared, the invite is rolled back.
    await deps.authAdmin.ensureUser(body.email);
    const link = `${deps.inviteLinkBase}?token=${encodeURIComponent(token)}`;
    // The token is returned once, to the owner, to share by hand. It is never stored or logged.
    return c.json({ invite: { ...invite, email: body.email }, token, link }, 201);
  });

  app.get('/invites', async (c) => {
    authorize(c, 'member.invite');
    const invites = await c
      .get('trx')
      .selectFrom('app.invite')
      .select([
        'id',
        'email',
        'role',
        'expires_at as expiresAt',
        'accepted_at as acceptedAt',
        'revoked_at as revokedAt',
      ])
      .where('household_id', '=', c.get('member').householdId)
      .orderBy('created_at', 'desc')
      .execute();
    return c.json({ invites });
  });

  app.delete('/invites/:inviteId', async (c) => {
    authorize(c, 'member.invite');
    const inviteId = uuidParam(c.req.param('inviteId'));
    const trx = c.get('trx');
    const member = c.get('member');
    const result = await trx
      .updateTable('app.invite')
      .set({ revoked_at: now() })
      .where('id', '=', inviteId)
      .where('household_id', '=', member.householdId)
      .where('accepted_at', 'is', null)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw notFound();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'invite',
      entityId: inviteId,
      action: 'invite.revoked',
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  app.post('/children', async (c) => {
    authorize(c, 'member.add_child');
    const body = await parseBody(c.req.raw, AddChild);
    const trx = c.get('trx');
    const member = c.get('member');
    const child = await trx
      .insertInto('app.member')
      .values({
        household_id: member.householdId,
        user_id: null,
        display_name: body.displayName,
        role: 'child',
      })
      .returning(['id', 'display_name as displayName', 'role'])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'member',
      entityId: child.id,
      action: 'member.child_added',
      requestId: c.get('requestId'),
    });
    return c.json({ member: child }, 201);
  });

  app.delete('/members/:memberId', async (c) => {
    authorize(c, 'member.remove');
    const memberId = uuidParam(c.req.param('memberId'));
    const trx = c.get('trx');
    const me = c.get('member');
    if (memberId === me.id) throw new ApiError(422, 'cannot_remove_self');
    const result = await trx
      .updateTable('app.member')
      .set({ status: 'removed', removed_at: now() })
      .where('id', '=', memberId)
      .where('household_id', '=', me.householdId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw notFound();
    // Their open invites, if any, stop working too.
    await trx
      .updateTable('app.invite')
      .set({ revoked_at: now() })
      .where('household_id', '=', me.householdId)
      .where('invited_by_member_id', '=', memberId)
      .where('accepted_at', 'is', null)
      .where('revoked_at', 'is', null)
      .execute();
    await recordAudit(trx, {
      householdId: me.householdId,
      actorMemberId: me.id,
      entityType: 'member',
      entityId: memberId,
      action: 'member.removed',
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  return app;
}
