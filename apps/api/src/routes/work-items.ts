import {
  IllegalTransitionError,
  MissingEvidenceError,
  WORK_ITEM_STATUSES,
  assertWorkItemTransition,
} from '@familyos/domain';
import type { Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';

const ITEM_COLUMNS = [
  'id',
  'type',
  'title',
  'description',
  'status',
  'owner_member_id as ownerMemberId',
  'due_at as dueAt',
  'priority',
  'visibility',
  'created_by_member_id as createdByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const Uuid = z.uuid();

const CreateWorkItem = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullish(),
  type: z.enum(['task', 'project', 'routine', 'issue']).default('task'),
  ownerMemberId: Uuid.nullish(),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
  priority: z.number().int().min(1).max(3).nullish(),
  visibility: z.enum(['household', 'private']).default('household'),
});

const UpdateWorkItem = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    ownerMemberId: Uuid.nullable().optional(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    priority: z.number().int().min(1).max(3).nullable().optional(),
    status: z.enum(WORK_ITEM_STATUSES).optional(),
    /** The caller confirms the work is done (evidence E3). Required for verified_complete. */
    confirmed: z.boolean().optional(),
  })
  .strict();

/** Owners must be active, account-holding members of the same household. */
async function assertAssignable(trx: Transaction<Database>, householdId: string, memberId: string) {
  const owner = await trx
    .selectFrom('app.member')
    .select('id')
    .where('id', '=', memberId)
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .where('role', '!=', 'child')
    .executeTakeFirst();
  if (!owner) throw new ApiError(422, 'invalid_owner');
}

export function workItemRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  app.get('/', async (c) => {
    authorize(c, 'work_item.read');
    const items = await c
      .get('trx')
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', c.get('member').householdId)
      .orderBy('created_at', 'desc')
      .limit(500)
      .execute();
    return c.json({ items });
  });

  app.post('/', async (c) => {
    authorize(c, 'work_item.create');
    const body = await parseBody(c.req.raw, CreateWorkItem);
    const trx = c.get('trx');
    const member = c.get('member');
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
    const item = await trx
      .insertInto('app.work_item')
      .values({
        household_id: member.householdId,
        title: body.title,
        description: body.description ?? null,
        type: body.type,
        owner_member_id: body.ownerMemberId ?? null,
        due_at: body.dueAt ?? null,
        priority: body.priority ?? null,
        visibility: body.visibility,
        created_by_member_id: member.id,
      })
      .returning(ITEM_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: item.id,
      action: 'work_item.created',
      payload: { type: item.type, visibility: item.visibility, status: item.status },
      requestId: c.get('requestId'),
    });
    return c.json({ item }, 201);
  });

  app.get('/:itemId', async (c) => {
    authorize(c, 'work_item.read');
    const itemId = uuidParam(c.req.param('itemId'));
    const trx = c.get('trx');
    const item = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('id', '=', itemId)
      .where('household_id', '=', c.get('member').householdId)
      .executeTakeFirst();
    if (!item) throw notFound();
    const timeline = await trx
      .selectFrom('app.audit_event')
      .select([
        'id',
        'action',
        'actor_member_id as actorMemberId',
        'payload',
        'created_at as createdAt',
      ])
      .where('household_id', '=', c.get('member').householdId)
      .where('entity_type', '=', 'work_item')
      .where('entity_id', '=', itemId)
      .orderBy('id')
      .execute();
    return c.json({ item, timeline });
  });

  app.patch('/:itemId', async (c) => {
    authorize(c, 'work_item.update');
    const itemId = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, UpdateWorkItem);
    const trx = c.get('trx');
    const member = c.get('member');

    const current = await trx
      .selectFrom('app.work_item')
      .select(['status', 'version'])
      .where('id', '=', itemId)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw notFound();
    if (current.version !== body.expectedVersion) throw conflict();

    if (body.status && body.status !== current.status) {
      try {
        assertWorkItemTransition(current.status, body.status, body.confirmed ? ['E3'] : []);
      } catch (error) {
        if (error instanceof IllegalTransitionError) throw new ApiError(422, 'illegal_transition');
        if (error instanceof MissingEvidenceError) throw new ApiError(422, 'evidence_required');
        throw error;
      }
    }
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);

    const changes = {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.ownerMemberId !== undefined && { owner_member_id: body.ownerMemberId }),
      ...(body.dueAt !== undefined && { due_at: body.dueAt }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.status !== undefined && { status: body.status }),
    };
    if (Object.keys(changes).length === 0) throw new ApiError(422, 'no_changes');

    const item = await trx
      .updateTable('app.work_item')
      .set({ ...changes, version: current.version + 1, updated_at: now() })
      .where('id', '=', itemId)
      .where('version', '=', body.expectedVersion)
      .returning(ITEM_COLUMNS)
      .executeTakeFirstOrThrow();

    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: itemId,
      action: 'work_item.updated',
      payload: {
        fields: Object.keys(changes).sort(),
        ...(body.status !== undefined && { fromStatus: current.status, toStatus: body.status }),
        ...(body.confirmed && body.status === 'verified_complete' && { evidence: 'E3' }),
        version: item.version,
      },
      requestId: c.get('requestId'),
    });
    return c.json({ item });
  });

  return app;
}
