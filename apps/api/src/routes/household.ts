import { isCaredFor } from '@familyos/domain';
import { Hono } from 'hono';
import { sql } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError, conflict, forbidden, notFound } from '../http/errors';
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

/** #RRGGBB in either case; stored uppercase. */
const Color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((c) => c.toUpperCase());
const Note = z.string().trim().min(1).max(200);
const Species = z.string().trim().min(1).max(40);
const DisplayName = z.string().trim().min(1).max(60);

const AddMember = z
  .object({
    role: z.enum(['child', 'pet']),
    displayName: DisplayName,
    species: Species.optional(),
    color: Color.optional(),
    note: Note.optional(),
  })
  .strict()
  .refine((b) => b.role === 'pet' || b.species === undefined, { message: 'species is for pets' });

const UpdateMember = z
  .object({
    expectedVersion: z.number().int().min(1),
    displayName: DisplayName.optional(),
    color: Color.optional(),
    note: Note.nullable().optional(),
    species: Species.nullable().optional(),
  })
  .strict();

const UpdateHousehold = z
  .object({ expectedVersion: z.number().int().min(1), name: z.string().trim().min(1).max(100) })
  .strict();

export const MEMBER_COLUMNS = [
  'id',
  'display_name as displayName',
  'role',
  'status',
  'color',
  'species',
  'note',
  'version',
] as const;

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
      .select(MEMBER_COLUMNS)
      .where('household_id', '=', householdId)
      .where('status', '=', 'active')
      .orderBy('created_at')
      .execute();
    return c.json({ household, members, me: c.get('member') });
  });

  // Rename the household (owner or adult), versioned. The audit records that it changed, not
  // the name.
  app.patch('/', async (c) => {
    authorize(c, 'household.update');
    const body = await parseBody(c.req.raw, UpdateHousehold);
    const trx = c.get('trx');
    const me = c.get('member');
    const current = await trx
      .selectFrom('app.household')
      .select(['version'])
      .where('id', '=', me.householdId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (current.version !== body.expectedVersion) throw conflict();
    const household = await trx
      .updateTable('app.household')
      .set({ name: body.name, version: current.version + 1, updated_at: now() })
      .where('id', '=', me.householdId)
      .where('version', '=', body.expectedVersion)
      .returning(['id', 'name', 'timezone', 'version'])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: me.householdId,
      actorMemberId: me.id,
      entityType: 'household',
      entityId: me.householdId,
      action: 'household.updated',
      payload: { fields: ['name'], version: household.version },
      requestId: c.get('requestId'),
    });
    return c.json({ household });
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
    // No account is created here: the invitee creates theirs, with a password, from the link.
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
      .returning(MEMBER_COLUMNS)
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

  // Children and pets: named members without accounts, whom the household looks after.
  app.post('/members', async (c) => {
    const body = await parseBody(c.req.raw, AddMember);
    authorize(c, body.role === 'pet' ? 'member.add_pet' : 'member.add_child');
    const trx = c.get('trx');
    const me = c.get('member');
    const added = await trx
      .insertInto('app.member')
      .values({
        household_id: me.householdId,
        user_id: null,
        display_name: body.displayName,
        role: body.role,
        species: body.species ?? null,
        note: body.note ?? null,
        ...(body.color && { color: body.color }),
      })
      .returning(MEMBER_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: me.householdId,
      actorMemberId: me.id,
      entityType: 'member',
      entityId: added.id,
      action: body.role === 'pet' ? 'member.pet_added' : 'member.child_added',
      payload: { role: body.role },
      requestId: c.get('requestId'),
    });
    return c.json({ member: added }, 201);
  });

  // Name, color, note and (pets) species. Adults edit children, pets and themselves; the owner
  // edits anyone.
  app.patch('/members/:memberId', async (c) => {
    authorize(c, 'member.update');
    const memberId = uuidParam(c.req.param('memberId'));
    const body = await parseBody(c.req.raw, UpdateMember);
    const trx = c.get('trx');
    const me = c.get('member');
    const target = await trx
      .selectFrom('app.member')
      .select(['id', 'role', 'version'])
      .where('id', '=', memberId)
      .where('household_id', '=', me.householdId)
      .where('status', '=', 'active')
      .forUpdate()
      .executeTakeFirst();
    if (!target) throw notFound();
    if (!isCaredFor(target.role) && target.id !== me.id && me.role !== 'owner') throw forbidden();
    if (target.version !== body.expectedVersion) throw conflict();
    if (body.species !== undefined && body.species !== null && target.role !== 'pet') {
      throw new ApiError(422, 'species_pets_only');
    }
    const changes = {
      ...(body.displayName !== undefined && { display_name: body.displayName }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.note !== undefined && { note: body.note }),
      ...(body.species !== undefined && { species: body.species }),
    };
    if (Object.keys(changes).length === 0) throw new ApiError(422, 'no_changes');
    const updated = await trx
      .updateTable('app.member')
      .set({ ...changes, version: target.version + 1, updated_at: now() })
      .where('id', '=', memberId)
      .where('household_id', '=', me.householdId)
      .where('version', '=', body.expectedVersion)
      .returning(MEMBER_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: me.householdId,
      actorMemberId: me.id,
      entityType: 'member',
      entityId: memberId,
      action: 'member.updated',
      payload: { fields: Object.keys(changes).sort(), version: updated.version },
      requestId: c.get('requestId'),
    });
    return c.json({ member: updated });
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
    // Their phones get nothing more from this household, and the tokens aren't kept.
    await sql`select app.forget_removed_member_devices(${memberId}::uuid)`.execute(trx);
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
