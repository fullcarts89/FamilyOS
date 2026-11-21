import {
  ASSIGNABLE_ROLES,
  IllegalTransitionError,
  MissingEvidenceError,
  WORK_ITEM_STATUSES,
  assertWorkItemTransition,
  isValidDuration,
  undoCompletionTarget,
  type WorkItemStatus,
} from '@familyos/domain';
import { materializeRoutine, type Database } from '@familyos/db';
import { Hono } from 'hono';
import { sql, type ExpressionBuilder, type Transaction } from 'kysely';
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
  'duration_minutes as durationMinutes',
  'priority',
  'visibility',
  'created_by_member_id as createdByMemberId',
  'recurrence_rule_id as recurrenceRuleId',
  'occurrence_index as occurrenceIndex',
  'occurrence_on as occurrenceOn',
  'completed_at as completedAt',
  'completed_by_member_id as completedByMemberId',
  'subject_member_id as subjectMemberId',
  'contact_id as contactId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const DONE_STATUSES: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const CLOSED_STATUSES: readonly WorkItemStatus[] = [...DONE_STATUSES, 'cancelled'];
/** The list's finished items: completed this recently, at most this many. */
export const FINISHED_DAYS = 14;
export const FINISHED_CAP = 1000;

const Uuid = z.uuid();
/** A calendar date, YYYY-MM-DD, that actually exists. */
const LocalDate = z.iso.date();
const DueAt = z.iso.datetime({ offset: true });
/** Minutes; checked by assertDuration, so a bad length gets its own plain code. */
const Duration = z.number();

const CreateWorkItem = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).nullish(),
    type: z.enum(['task', 'project', 'issue']).default('task'),
    ownerMemberId: Uuid.nullish(),
    subjectMemberId: Uuid.nullish(),
    parentId: Uuid.nullish(),
    dueOn: LocalDate.nullish(),
    dueAt: DueAt.nullish(),
    /** With dueAt: how long it takes (a time block), 5 to 720 minutes in steps of 5. */
    durationMinutes: Duration.nullish(),
    priority: z.number().int().min(1).max(3).nullish(),
    contactId: Uuid.nullish(),
    visibility: z.enum(['household', 'private']).default('household'),
    /** Quick capture lands in the inbox; set false to add a ready-to-do item directly. */
    inbox: z.boolean().default(true),
    /**
     * The app's own ID for this capture, the same on every retry: a repeat answers 200 with the
     * item the first one made, and creates nothing.
     */
    clientId: Uuid.optional(),
  })
  .refine((b) => !(b.dueOn && b.dueAt), { message: 'one due date only' });

const UpdateWorkItem = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    ownerMemberId: Uuid.nullable().optional(),
    subjectMemberId: Uuid.nullable().optional(),
    parentId: Uuid.nullable().optional(),
    dueOn: LocalDate.nullable().optional(),
    dueAt: DueAt.nullable().optional(),
    /** Null clears it. Clearing dueAt (or setting dueOn) clears it too. */
    durationMinutes: Duration.nullable().optional(),
    priority: z.number().int().min(1).max(3).nullable().optional(),
    contactId: Uuid.nullable().optional(),
    status: z.enum(WORK_ITEM_STATUSES).optional(),
    /** The caller confirms the work is done (evidence E3). Required for verified_complete. */
    confirmed: z.boolean().optional(),
    /** Undo a completion: back to the status it had before it was finished. */
    undoComplete: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => !(b.undoComplete && b.status !== undefined), { message: 'undo or status' });
export type WorkItemUpdate = z.infer<typeof UpdateWorkItem>;

const BULK_MAX = 100;
const BulkItem = z.discriminatedUnion('action', [
  z
    .object({
      id: Uuid,
      expectedVersion: z.number().int().min(1),
      action: z.literal('due'),
      /** A date (all day) or an instant with an offset. */
      value: z.union([LocalDate, DueAt]),
    })
    .strict(),
  z
    .object({ id: Uuid, expectedVersion: z.number().int().min(1), action: z.literal('clear_due') })
    .strict(),
  z
    .object({ id: Uuid, expectedVersion: z.number().int().min(1), action: z.literal('cancel') })
    .strict(),
  z
    .object({
      id: Uuid,
      expectedVersion: z.number().int().min(1),
      action: z.literal('assign'),
      /** The new owner, or null to leave it for whoever takes it. */
      value: Uuid.nullable(),
    })
    .strict(),
]);
const Bulk = z
  .object({ items: z.array(BulkItem).min(1).max(BULK_MAX) })
  .strict()
  .refine((b) => new Set(b.items.map((i) => i.id)).size === b.items.length, {
    message: 'each item once',
  });

const AcceptFromInbox = z
  .object({
    expectedVersion: z.number().int().min(1),
    ownerMemberId: Uuid.nullable().optional(),
    dueOn: LocalDate.nullable().optional(),
  })
  .strict();

const VersionOnly = z.object({ expectedVersion: z.number().int().min(1) }).strict();

const NewComment = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** Owners must be active, account-holding members of the same household (not children or pets). */
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

/** A subject is an active child or pet of the same household. */
export async function assertSubject(
  trx: Transaction<Database>,
  householdId: string,
  memberId: string,
) {
  const subject = await trx
    .selectFrom('app.member')
    .select('id')
    .where('id', '=', memberId)
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .where('role', 'in', ['child', 'pet'])
    .executeTakeFirst();
  if (!subject) throw new ApiError(422, 'invalid_subject');
}

/**
 * A task's length: five minutes to twelve hours in steps of five, and only with a time to start
 * from. `dueAt` is the time the item will have once the change is made.
 */
function assertDuration(minutes: number | null | undefined, dueAt: unknown) {
  if (minutes === null || minutes === undefined) return;
  if (!isValidDuration(minutes)) throw new ApiError(422, 'invalid_duration');
  if (dueAt === null || dueAt === undefined) throw new ApiError(422, 'duration_needs_time');
}

/** A contact of the same household. */
async function assertContact(trx: Transaction<Database>, householdId: string, contactId: string) {
  const contact = await trx
    .selectFrom('app.contact')
    .select('id')
    .where('id', '=', contactId)
    .where('household_id', '=', householdId)
    .executeTakeFirst();
  if (!contact) throw new ApiError(422, 'invalid_contact');
}

type ItemRow = {
  id: string;
  status: WorkItemStatus;
  recurrenceRuleId: string | null;
  occurrenceIndex: number | null;
  contactId: string | null;
};

/**
 * What the app needs alongside each item without more requests: the contact it involves, and,
 * for routine occurrences, the routine and whether this is its current turn (the earliest
 * occurrence still open), so a list can show one turn per routine.
 */
export async function decorateItems<T extends ItemRow>(
  trx: Transaction<Database>,
  householdId: string,
  items: readonly T[],
) {
  const ruleIds = [
    ...new Set(items.flatMap((i) => (i.recurrenceRuleId ? [i.recurrenceRuleId] : []))),
  ];
  const contactIds = [...new Set(items.flatMap((i) => (i.contactId ? [i.contactId] : [])))];
  const rules = ruleIds.length
    ? await trx
        .selectFrom('app.recurrence_rule')
        .select(['id', 'routine_id'])
        .where('household_id', '=', householdId)
        .where('id', 'in', ruleIds)
        .execute()
    : [];
  const current = ruleIds.length
    ? await trx
        .selectFrom('app.work_item')
        .select(['recurrence_rule_id', (eb) => eb.fn.min('occurrence_index').as('index')])
        .where('household_id', '=', householdId)
        .where('recurrence_rule_id', 'in', ruleIds)
        .where('status', 'not in', CLOSED_STATUSES)
        .groupBy('recurrence_rule_id')
        .execute()
    : [];
  const contacts = contactIds.length
    ? await trx
        .selectFrom('app.contact')
        .select(['id', 'name', 'category', 'role', 'organization', 'phone', 'email'])
        .where('household_id', '=', householdId)
        .where('id', 'in', contactIds)
        .execute()
    : [];
  return items.map((item) => {
    const rule = rules.find((r) => r.id === item.recurrenceRuleId);
    const turn = current.find((r) => r.recurrence_rule_id === item.recurrenceRuleId);
    return {
      ...item,
      routineId: rule?.routine_id ?? null,
      isCurrentTurn: item.recurrenceRuleId
        ? turn !== undefined && Number(turn.index) === item.occurrenceIndex
        : null,
      contact: contacts.find((c) => c.id === item.contactId) ?? null,
    };
  });
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
    .select([
      'id',
      'type',
      'status',
      'version',
      'owner_member_id',
      'due_on',
      'due_at',
      'duration_minutes',
      'recurrence_rule_id',
      'occurrence_index',
      'completed_from_status',
    ])
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

/**
 * One versioned change to a task, project or routine occurrence: fields, a status transition
 * (with its evidence rule), or undoing a completion. Shared by PATCH and the bulk endpoint.
 */
async function applyUpdate(
  trx: Transaction<Database>,
  member: CurrentMember,
  itemId: string,
  body: WorkItemUpdate,
  requestId: string,
  clock: () => Date,
) {
  const current = await loadForUpdate(trx, member, itemId, body.expectedVersion);

  let status = body.status;
  if (body.undoComplete) {
    const target = undoCompletionTarget(current.status, current.completed_from_status);
    if (!target) throw new ApiError(422, 'not_completed');
    status = target;
  } else if (body.status && body.status !== current.status) {
    checkTransition(current.status, body.status, body.confirmed === true);
    if (current.type === 'project' && DONE_STATUSES.includes(body.status)) {
      await assertNoOpenSubtasks(trx, member.householdId, itemId);
    }
  }
  if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
  if (body.subjectMemberId) await assertSubject(trx, member.householdId, body.subjectMemberId);
  if (body.parentId) await assertValidParent(trx, member.householdId, body.parentId, current);
  if (body.contactId) await assertContact(trx, member.householdId, body.contactId);

  // Setting one kind of due date clears the other.
  const dueOn = body.dueOn !== undefined ? body.dueOn : body.dueAt ? null : undefined;
  const dueAt = body.dueAt !== undefined ? body.dueAt : body.dueOn ? null : undefined;
  if (body.dueOn && body.dueAt) throw new ApiError(422, 'invalid_body');
  // A length goes with a time: checked against the time it will have, and cleared with it.
  assertDuration(body.durationMinutes, dueAt !== undefined ? dueAt : current.due_at);
  const durationMinutes =
    body.durationMinutes !== undefined
      ? body.durationMinutes
      : dueAt === null && current.duration_minutes !== null
        ? null
        : undefined;

  const statusChanged = status !== undefined && status !== current.status;
  const finishing = statusChanged && status !== undefined && DONE_STATUSES.includes(status);
  const reopening = statusChanged && DONE_STATUSES.includes(current.status) && !finishing;
  const changes = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.ownerMemberId !== undefined && { owner_member_id: body.ownerMemberId }),
    ...(body.subjectMemberId !== undefined && { subject_member_id: body.subjectMemberId }),
    ...(body.parentId !== undefined && { parent_id: body.parentId }),
    ...(dueOn !== undefined && { due_on: dueOn }),
    ...(dueAt !== undefined && { due_at: dueAt }),
    ...(durationMinutes !== undefined && { duration_minutes: durationMinutes }),
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.contactId !== undefined && { contact_id: body.contactId }),
    ...(statusChanged && { status }),
  };
  if (Object.keys(changes).length === 0) throw new ApiError(422, 'no_changes');

  // Who finished it, for Handled and the routine fairness view (J3b), and what it was before,
  // so the completion can be undone exactly.
  const completion = finishing
    ? {
        completed_at: clock(),
        completed_by_member_id: member.id,
        completed_from_status: DONE_STATUSES.includes(current.status) ? null : current.status,
      }
    : reopening
      ? { completed_at: null, completed_by_member_id: null, completed_from_status: null }
      : {};

  const item = await trx
    .updateTable('app.work_item')
    .set({ ...changes, ...completion, version: current.version + 1, updated_at: clock() })
    .where('id', '=', itemId)
    .where('version', '=', body.expectedVersion)
    .returning(ITEM_COLUMNS)
    .executeTakeFirstOrThrow();

  await recordAudit(trx, {
    householdId: member.householdId,
    actorMemberId: member.id,
    entityType: 'work_item',
    entityId: itemId,
    action: body.undoComplete ? 'work_item.completion_undone' : 'work_item.updated',
    payload: {
      fields: Object.keys(changes).sort(),
      ...(changes.status !== undefined && {
        fromStatus: current.status,
        toStatus: changes.status,
      }),
      ...(body.confirmed && changes.status === 'verified_complete' && { evidence: 'E3' }),
      // Who had it before, so "took it off your plate" can be told (notifications).
      ...(changes.owner_member_id !== undefined && {
        ownerMemberId: changes.owner_member_id,
        fromOwnerMemberId: current.owner_member_id,
      }),
      ...(changes.subject_member_id !== undefined && {
        subjectMemberId: changes.subject_member_id,
      }),
      ...(changes.contact_id !== undefined && { contactId: changes.contact_id }),
      version: item.version,
    },
    requestId,
  });

  if (statusChanged && current.recurrence_rule_id) {
    const rule = await trx
      .selectFrom('app.recurrence_rule')
      .select(['routine_id', 'rule'])
      .where('id', '=', current.recurrence_rule_id)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (rule) {
      // Undoing a completion withdraws the next turn it brought due ("N days after it's done"),
      // as long as nobody has touched that one yet.
      if (body.undoComplete && rule.rule.freq === 'after_completion') {
        const next = await trx
          .selectFrom('app.work_item')
          .select(['id', 'version'])
          .where('household_id', '=', member.householdId)
          .where('recurrence_rule_id', '=', current.recurrence_rule_id)
          .where('occurrence_index', '>', current.occurrence_index ?? 0)
          .where('status', '=', 'ready')
          .where('version', '=', 1)
          .execute();
        for (const row of next) {
          await trx
            .updateTable('app.work_item')
            .set({ status: 'cancelled', version: row.version + 1, updated_at: clock() })
            .where('id', '=', row.id)
            .where('household_id', '=', member.householdId)
            .execute();
          await recordAudit(trx, {
            householdId: member.householdId,
            actorMemberId: member.id,
            entityType: 'work_item',
            entityId: row.id,
            action: 'routine.occurrence_withdrawn',
            payload: { fromStatus: 'ready', toStatus: 'cancelled', version: row.version + 1 },
            requestId,
          });
        }
      }
      // Closing a routine occurrence may bring the next one due (after-completion routines).
      await materializeRoutine(trx, {
        householdId: member.householdId,
        routineId: rule.routine_id,
        now: clock(),
        requestId,
      });
    }
  }
  return item;
}

export function workItemRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  // Every open item, however old, plus what was finished in the last FINISHED_DAYS (Today and
  // Tasks show recent completions), newest first. Only the finished part is capped: a busy
  // household's routine turns must never push an open item out of the list. One statement, so
  // one snapshot: an item completed or reopened meanwhile (often by the other adult) is listed
  // as it was, never missing and never twice.
  app.get('/', async (c) => {
    authorize(c, 'work_item.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const parentId = c.req.query('parentId');
    const subjectId = c.req.query('subjectMemberId');
    const contactId = c.req.query('contactId');
    const filters = {
      parent_id: parentId ? uuidParam(parentId) : null,
      subject_member_id: subjectId ? uuidParam(subjectId) : null,
      contact_id: contactId ? uuidParam(contactId) : null,
    };
    const scoped = (eb: ExpressionBuilder<Database, 'app.work_item'>) =>
      eb.and([
        eb('household_id', '=', householdId),
        eb('type', '!=', 'routine'),
        ...Object.entries(filters).flatMap(([column, value]) =>
          value === null
            ? []
            : [eb(column as 'parent_id' | 'subject_member_id' | 'contact_id', '=', value)],
        ),
      ]);
    const since = new Date(now().getTime() - FINISHED_DAYS * 24 * 3600 * 1000);
    const recentlyFinished = trx
      .selectFrom('app.work_item')
      .select('id')
      .where(scoped)
      .where('status', 'in', DONE_STATUSES)
      .where((eb) => eb(eb.fn.coalesce('completed_at', 'updated_at'), '>=', since))
      .orderBy(sql`coalesce(completed_at, updated_at)`, 'desc')
      .limit(FINISHED_CAP);
    const rows = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where(scoped)
      .where((eb) =>
        eb.or([
          eb('status', 'not in', ['new', ...CLOSED_STATUSES]),
          eb('id', 'in', recentlyFinished),
        ]),
      )
      .execute();
    const items = rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    );
    return c.json({ items: await decorateItems(trx, householdId, items) });
  });

  app.post('/', async (c) => {
    authorize(c, 'work_item.create');
    const body = await parseBody(c.req.raw, CreateWorkItem);
    const trx = c.get('trx');
    const member = c.get('member');
    const alreadyMade = async () => {
      if (!body.clientId) return null;
      const made = await trx
        .selectFrom('app.work_item')
        .select(ITEM_COLUMNS)
        .where('household_id', '=', member.householdId)
        .where('client_id', '=', body.clientId)
        .executeTakeFirst();
      if (!made) return null;
      const [decorated] = await decorateItems(trx, member.householdId, [made]);
      return c.json({ item: decorated }, 200);
    };
    const repeat = await alreadyMade();
    if (repeat) return repeat;
    if (body.ownerMemberId) await assertAssignable(trx, member.householdId, body.ownerMemberId);
    if (body.subjectMemberId) await assertSubject(trx, member.householdId, body.subjectMemberId);
    if (body.parentId)
      await assertValidParent(trx, member.householdId, body.parentId, { type: body.type });
    if (body.contactId) await assertContact(trx, member.householdId, body.contactId);
    assertDuration(body.durationMinutes, body.dueAt);
    const item = await trx
      .insertInto('app.work_item')
      .values({
        household_id: member.householdId,
        title: body.title,
        description: body.description ?? null,
        type: body.type,
        status: body.inbox ? 'new' : 'ready',
        owner_member_id: body.ownerMemberId ?? null,
        subject_member_id: body.subjectMemberId ?? null,
        parent_id: body.parentId ?? null,
        due_on: body.dueOn ?? null,
        due_at: body.dueAt ?? null,
        duration_minutes: body.durationMinutes ?? null,
        priority: body.priority ?? null,
        contact_id: body.contactId ?? null,
        visibility: body.visibility,
        created_by_member_id: member.id,
        client_id: body.clientId ?? null,
      })
      .onConflict((oc) =>
        oc.columns(['household_id', 'client_id']).where('client_id', 'is not', null).doNothing(),
      )
      .returning(ITEM_COLUMNS)
      .executeTakeFirst();
    if (!item) {
      // The same capture arrived twice at once: the other request made it.
      const concurrent = await alreadyMade();
      if (concurrent) return concurrent;
      // Taken by an item this member can't see (someone else's private one).
      throw conflict('client_id_in_use');
    }
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
        ...(item.subjectMemberId && { subjectMemberId: item.subjectMemberId }),
        ...(item.contactId && { contactId: item.contactId }),
      },
      requestId: c.get('requestId'),
    });
    const [decorated] = await decorateItems(trx, member.householdId, [item]);
    return c.json({ item: decorated }, 201);
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
    const [decorated, ...decoratedSubtasks] = await decorateItems(trx, householdId, [
      item,
      ...subtasks,
    ]);
    return c.json({
      item: decorated,
      subtasks: decoratedSubtasks,
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
    const item = await applyUpdate(trx, member, itemId, body, c.get('requestId'), now);
    const [decorated] = await decorateItems(trx, member.householdId, [item]);
    return c.json({ item: decorated });
  });

  /**
   * Several carry-forward changes at once (Weekly Reset loose ends): move or clear a due date,
   * cancel, or assign. All or nothing: the first failure rolls every change back and answers
   * with its code and the item it was about.
   */
  app.post('/bulk', async (c) => {
    authorize(c, 'work_item.update');
    const body = await parseBody(c.req.raw, Bulk);
    const trx = c.get('trx');
    const member = c.get('member');
    const updated = [];
    for (const entry of body.items) {
      const update: WorkItemUpdate =
        entry.action === 'due'
          ? LocalDate.safeParse(entry.value).success
            ? { expectedVersion: entry.expectedVersion, dueOn: entry.value }
            : { expectedVersion: entry.expectedVersion, dueAt: entry.value }
          : entry.action === 'clear_due'
            ? { expectedVersion: entry.expectedVersion, dueOn: null, dueAt: null }
            : entry.action === 'cancel'
              ? { expectedVersion: entry.expectedVersion, status: 'cancelled' }
              : { expectedVersion: entry.expectedVersion, ownerMemberId: entry.value };
      try {
        updated.push(await applyUpdate(trx, member, entry.id, update, c.get('requestId'), now));
      } catch (error) {
        // The request transaction rolls back on any 4xx, so nothing from this batch is kept.
        if (error instanceof ApiError) {
          return c.json({ error: error.code, itemId: entry.id }, error.status);
        }
        throw error;
      }
    }
    return c.json({ items: await decorateItems(trx, member.householdId, updated) });
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
          ...(body.dueOn && { due_at: null, duration_minutes: null }),
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
