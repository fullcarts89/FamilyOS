import {
  ASSIGNABLE_ROLES,
  IllegalTransitionError,
  MissingEvidenceError,
  WORK_ITEM_STATUSES,
  assertWorkItemTransition,
  type WorkItemStatus,
} from '@familyos/domain';
import { materializeRoutine, type Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';

export const ITEM_COLUMNS = [
  'id',
  'type',
  'title',
  'description',
  'status',
  'owner_member_id as ownerMemberId',
  'parent_id as parentId',
  'due_on as dueOn',
  'due_at as dueAt',
  'priority',
  'visibility',
  'created_by_member_id as createdByMemberId',
  'recurrence_rule_id as recurrenceRuleId',
  'occurrence_index as occurrenceIndex',
  'occurrence_on as occurrenceOn',
  'completed_at as completedAt',
  'completed_by_member_id as completedByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const DONE_STATUSES: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const CLOSED_STATUSES: readonly WorkItemStatus[] = [...DONE_STATUSES, 'cancelled'];

const Uuid = z.uuid();
/** A calendar date, YYYY-MM-DD, that actually exists. */
const LocalDate = z.iso.date();
const DueAt = z.iso.datetime({ offset: true });

const CreateWorkItem = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).nullish(),
    type: z.enum(['task', 'project', 'issue']).default('task'),
    ownerMemberId: Uuid.nullish(),
    parentId: Uuid.nullish(),
    dueOn: LocalDate.nullish(),
    dueAt: DueAt.nullish(),
    priority: z.number().int().min(1).max(3).nullish(),
    visibility: z.enum(['household', 'private']).default('household'),
    /** Quick capture lands in the inbox; set false to add a ready-to-do item directly. */
    inbox: z.boolean().default(true),
  })
  .refine((b) => !(b.dueOn && b.dueAt), { message: 'one due date only' });

const UpdateWorkItem = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    ownerMemberId: Uuid.nullable().optional(),
    parentId: Uuid.nullable().optional(),
    dueOn: LocalDate.nullable().optional(),
    dueAt: DueAt.nullable().optional(),
    priority: z.number().int().min(1).max(3).nullable().optional(),
    status: z.enum(WORK_ITEM_STATUSES).optional(),
    /** The caller confirms the work is done (evidence E3). Required for verified_complete. */
    confirmed: z.boolean().optional(),
  })
  .strict();

const AcceptFromInbox = z
  .object({
    expectedVersion: z.number().int().min(1),
    ownerMemberId: Uuid.nullable().optional(),
    dueOn: LocalDate.nullable().optional(),
  })
  .strict();

const VersionOnly = z.object({ expectedVersion: z.number().int().min(1) }).strict();

const NewComment = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** Owners must be active, account-holding members of the same household. */
export async function assertAssignable(
  trx: Transaction<Database>,
  householdId: string,
  memberId: string,
) {
  const owner = await trx
    .selectFrom('app.member')
    .select('id')
    .where('id', '=', memberId)
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .where('role', 'in', ASSIGNABLE_ROLES)
    .executeTakeFirst();
  if (!owner) throw new ApiError(422, 'invalid_owner');
}

/** Subtasks go one level deep, under a visible project in the same household. */
async function assertValidParent(
  trx: Transaction<Database>,
  householdId: string,
  parentId: string,
  child: { id?: string; type: string },
) {
  if (child.type === 'project') throw new ApiError(422, 'invalid_parent');
  if (child.id && child.id === parentId) throw new ApiError(422, 'invalid_parent');
  const parent = await trx
    .selectFrom('app.work_item')
    .select('type')
    .where('id', '=', parentId)
    .where('household_id', '=', householdId)
    .executeTakeFirst();
  if (parent?.type !== 'project') throw new ApiError(422, 'invalid_parent');
}

/** A project can't be finished while any of its subtasks is still open (J7). */
async function assertNoOpenSubtasks(
  trx: Transaction<Database>,
  householdId: string,
  projectId: string,
) {
  const open = await trx
    .selectFrom('app.work_item')
    .select('id')
    .where('household_id', '=', householdId)
    .where('parent_id', '=', projectId)
    .where('status', 'not in', CLOSED_STATUSES)
    .limit(1)
    .executeTakeFirst();
  if (open) throw new ApiError(422, 'open_subtasks');
}

function checkTransition(from: WorkItemStatus, to: WorkItemStatus, confirmed: boolean) {
  try {
    assertWorkItemTransition(from, to, confirmed ? ['E3'] : []);
  } catch (error) {
    if (error instanceof IllegalTransitionError) throw new ApiError(422, 'illegal_transition');
    if (error instanceof MissingEvidenceError) throw new ApiError(422, 'evidence_required');
    throw error;
  }
}

async function loadForUpdate(
  trx: Transaction<Database>,
  member: CurrentMember,
  itemId: string,
  expectedVersion: number,
) {
  const current = await trx
    .selectFrom('app.work_item')
    .select(['id', 'type', 'status', 'version', 'due_on', 'due_at', 'recurrence_rule_id'])
    .where('id', '=', itemId)
    .where('household_id', '=', member.householdId)
    .forUpdate()
    .executeTakeFirst();
  if (!current) throw notFound();
  if (current.version !== expectedVersion) throw conflict();
  // A routine's own row changes through /routines, which keeps its schedule consistent.
  if (current.type === 'routine') throw new ApiError(422, 'use_routine');
  return current;
}

export function workItemRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  app.get('/', async (c) => {
    authorize(c, 'work_item.read');
    const parentId = c.req.query('parentId');
    let query = c
      .get('trx')
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', c.get('member').householdId)
      .where('type', '!=', 'routine')
      .where('status', 'not in', ['new', 'cancelled']);
    if (parentId) query = query.where('parent_id', '=', uuidParam(parentId));
    const items = await query.orderBy('created_at', 'desc').limit(500).execute();
    return c.json({ items });
  });

  app.post('/', async (c) => {
    authorize(c, 'work_item.create');
    const body = await parseBody(c.req.raw, CreateWorkItem);
    const trx = c.get('trx');
    const member = c.get('member');
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
    if (body.parentId)
      await assertValidParent(trx, member.householdId, body.parentId, { type: body.type });
    const item = await trx
      .insertInto('app.work_item')
      .values({
        household_id: member.householdId,
        title: body.title,
        description: body.description ?? null,
        type: body.type,
        status: body.inbox ? 'new' : 'ready',
        owner_member_id: body.ownerMemberId ?? null,
        parent_id: body.parentId ?? null,
        due_on: body.dueOn ?? null,
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
      action: body.inbox ? 'work_item.captured' : 'work_item.created',
      payload: {
        type: item.type,
        visibility: item.visibility,
        status: item.status,
        ...(item.parentId && { parentId: item.parentId }),
      },
      requestId: c.get('requestId'),
    });
    return c.json({ item }, 201);
  });

  app.get('/:itemId', async (c) => {
    authorize(c, 'work_item.read');
    const itemId = uuidParam(c.req.param('itemId'));
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const item = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('id', '=', itemId)
      .where('household_id', '=', householdId)
      .executeTakeFirst();
    if (!item) throw notFound();
    const subtasks =
      item.type === 'project'
        ? await trx
            .selectFrom('app.work_item')
            .select(ITEM_COLUMNS)
            .where('household_id', '=', householdId)
            .where('parent_id', '=', itemId)
            .where('status', '!=', 'cancelled')
            .orderBy('created_at')
            .execute()
        : [];
    const timeline = await trx
      .selectFrom('app.audit_event')
      .select([
        'id',
        'action',
        'actor_member_id as actorMemberId',
        'payload',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .where('entity_type', '=', 'work_item')
      .where('entity_id', '=', itemId)
      .orderBy('id')
      .execute();
    const routine = item.recurrenceRuleId
      ? ((await trx
          .selectFrom('app.recurrence_rule as r')
          .innerJoin('app.work_item as w', (join) =>
            join.onRef('w.id', '=', 'r.routine_id').onRef('w.household_id', '=', 'r.household_id'),
          )
          .select(['w.id', 'w.title', 'w.status', 'w.version', 'r.rotation'])
          .where('r.id', '=', item.recurrenceRuleId)
          .where('r.household_id', '=', householdId)
          .executeTakeFirst()) ?? null)
      : null;
    const progress =
      item.type === 'project'
        ? {
            done: subtasks.filter((s) => DONE_STATUSES.includes(s.status)).length,
            total: subtasks.length,
          }
        : null;
    return c.json({
      item,
      subtasks,
      progress,
      timeline,
      routine: routine && {
        id: routine.id,
        title: routine.title,
        ended: routine.status === 'cancelled',
        rotation: routine.rotation,
        version: routine.version,
      },
    });
  });

  app.patch('/:itemId', async (c) => {
    authorize(c, 'work_item.update');
    const itemId = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, UpdateWorkItem);
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await loadForUpdate(trx, member, itemId, body.expectedVersion);

    if (body.status && body.status !== current.status) {
      checkTransition(current.status, body.status, body.confirmed === true);
      if (current.type === 'project' && DONE_STATUSES.includes(body.status)) {
        await assertNoOpenSubtasks(trx, member.householdId, itemId);
      }
    }
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
    if (body.parentId) await assertValidParent(trx, member.householdId, body.parentId, current);

    // Setting one kind of due date clears the other.
    const dueOn = body.dueOn !== undefined ? body.dueOn : body.dueAt ? null : undefined;
    const dueAt = body.dueAt !== undefined ? body.dueAt : body.dueOn ? null : undefined;
    if (body.dueOn && body.dueAt) throw new ApiError(422, 'invalid_body');

    const statusChanged = body.status !== undefined && body.status !== current.status;
    const finishing =
      statusChanged && body.status !== undefined && DONE_STATUSES.includes(body.status);
    const reopening = statusChanged && DONE_STATUSES.includes(current.status) && !finishing;
    const changes = {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.ownerMemberId !== undefined && { owner_member_id: body.ownerMemberId }),
      ...(body.parentId !== undefined && { parent_id: body.parentId }),
      ...(dueOn !== undefined && { due_on: dueOn }),
      ...(dueAt !== undefined && { due_at: dueAt }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.status !== undefined && body.status !== current.status && { status: body.status }),
    };
    if (Object.keys(changes).length === 0) throw new ApiError(422, 'no_changes');

    // Who finished it, for Handled and the routine fairness view (J3b).
    const completion = finishing
      ? { completed_at: now(), completed_by_member_id: member.id }
      : reopening
        ? { completed_at: null, completed_by_member_id: null }
        : {};

    const item = await trx
      .updateTable('app.work_item')
      .set({ ...changes, ...completion, version: current.version + 1, updated_at: now() })
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
        ...(changes.status !== undefined && {
          fromStatus: current.status,
          toStatus: changes.status,
        }),
        ...(body.confirmed && changes.status === 'verified_complete' && { evidence: 'E3' }),
        ...(changes.owner_member_id !== undefined && { ownerMemberId: changes.owner_member_id }),
        version: item.version,
      },
      requestId: c.get('requestId'),
    });

    // Closing a routine occurrence may bring the next one due (after-completion routines).
    if (statusChanged && current.recurrence_rule_id) {
      const rule = await trx
        .selectFrom('app.recurrence_rule')
        .select('routine_id')
        .where('id', '=', current.recurrence_rule_id)
        .where('household_id', '=', member.householdId)
        .executeTakeFirst();
      if (rule) {
        await materializeRoutine(trx, {
          householdId: member.householdId,
          routineId: rule.routine_id,
          now: now(),
          requestId: c.get('requestId'),
        });
      }
    }
    return c.json({ item });
  });

  // Inbox triage (PRD §4): accept into the to-do list, optionally assigning it, or discard it.
  app.post('/:itemId/accept', async (c) => {
    authorize(c, 'work_item.update');
    const itemId = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, AcceptFromInbox);
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await loadForUpdate(trx, member, itemId, body.expectedVersion);
    if (current.status !== 'new') throw new ApiError(422, 'not_in_inbox');
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
    const item = await trx
      .updateTable('app.work_item')
      .set({
        status: 'ready',
        ...(body.ownerMemberId !== undefined && { owner_member_id: body.ownerMemberId }),
        ...(body.dueOn !== undefined && {
          due_on: body.dueOn,
          ...(body.dueOn && { due_at: null }),
        }),
        version: current.version + 1,
        updated_at: now(),
      })
      .where('id', '=', itemId)
      .where('version', '=', body.expectedVersion)
      .returning(ITEM_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: itemId,
      action: 'work_item.accepted',
      payload: {
        fromStatus: 'new',
        toStatus: 'ready',
        ...(body.ownerMemberId && { ownerMemberId: body.ownerMemberId }),
        version: item.version,
      },
      requestId: c.get('requestId'),
    });
    return c.json({ item });
  });

  app.post('/:itemId/discard', async (c) => {
    authorize(c, 'work_item.update');
    const itemId = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await loadForUpdate(trx, member, itemId, body.expectedVersion);
    if (current.status !== 'new') throw new ApiError(422, 'not_in_inbox');
    const item = await trx
      .updateTable('app.work_item')
      .set({ status: 'cancelled', version: current.version + 1, updated_at: now() })
      .where('id', '=', itemId)
      .where('version', '=', body.expectedVersion)
      .returning(ITEM_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: itemId,
      action: 'work_item.discarded',
      payload: { fromStatus: 'new', toStatus: 'cancelled', version: item.version },
      requestId: c.get('requestId'),
    });
    return c.json({ item });
  });

  app.get('/:itemId/comments', async (c) => {
    authorize(c, 'work_item.read');
    const itemId = uuidParam(c.req.param('itemId'));
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const item = await trx
      .selectFrom('app.work_item')
      .select('id')
      .where('id', '=', itemId)
      .where('household_id', '=', householdId)
      .executeTakeFirst();
    if (!item) throw notFound();
    const comments = await trx
      .selectFrom('app.comment')
      .select(['id', 'author_member_id as authorMemberId', 'body', 'created_at as createdAt'])
      .where('household_id', '=', householdId)
      .where('work_item_id', '=', itemId)
      .orderBy('created_at')
      .execute();
    return c.json({ comments });
  });

  app.post('/:itemId/comments', async (c) => {
    authorize(c, 'work_item.comment');
    const itemId = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, NewComment);
    const trx = c.get('trx');
    const member = c.get('member');
    const item = await trx
      .selectFrom('app.work_item')
      .select('id')
      .where('id', '=', itemId)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (!item) throw notFound();
    const comment = await trx
      .insertInto('app.comment')
      .values({
        household_id: member.householdId,
        work_item_id: itemId,
        author_member_id: member.id,
        body: body.body,
      })
      .returning(['id', 'author_member_id as authorMemberId', 'body', 'created_at as createdAt'])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: itemId,
      action: 'work_item.commented',
      payload: { commentId: comment.id },
      requestId: c.get('requestId'),
    });
    return c.json({ comment }, 201);
  });

  return app;
}
