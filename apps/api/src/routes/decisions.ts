import { MAX_DECISION_OPTIONS, agreedOption, type DecisionStatus } from '@familyos/domain';
import type { Database } from '@familyos/db';
import { Hono, type Context } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';

const Uuid = z.uuid();
const LocalDate = z.iso.date();
const Version = z.number().int().min(1);
const Question = z.string().trim().min(1).max(200);
const DecisionContext = z.string().trim().min(1).max(1000);
const Label = z.string().trim().min(1).max(80);
const Detail = z.string().trim().min(1).max(200);
const NewOption = z.object({ label: Label, detail: Detail.nullish() }).strict();

const CreateDecision = z
  .object({
    question: Question,
    context: DecisionContext.nullish(),
    dueOn: LocalDate.nullish(),
    options: z.array(NewOption).max(MAX_DECISION_OPTIONS).default([]),
  })
  .strict();
const UpdateDecision = z
  .object({
    expectedVersion: Version,
    question: Question.optional(),
    context: DecisionContext.nullable().optional(),
    dueOn: LocalDate.nullable().optional(),
  })
  .strict();
const AddOption = NewOption.extend({ expectedVersion: Version }).strict();
const UpdateOption = z
  .object({
    expectedVersion: Version,
    label: Label.optional(),
    detail: Detail.nullable().optional(),
    position: z.number().int().min(0).max(99).optional(),
  })
  .strict();
const Vote = z.object({ optionId: Uuid, expectedVersion: Version.optional() }).strict();
const Decide = z.object({ optionId: Uuid, expectedVersion: Version }).strict();
const VersionOnly = z.object({ expectedVersion: Version }).strict();

const STATUSES = ['open', 'decided', 'dropped', 'all'] as const;
const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

/** Active owners and adults: the people who vote. */
async function adultIds(trx: Transaction<Database>, householdId: string): Promise<string[]> {
  const rows = await trx
    .selectFrom('app.member')
    .select('id')
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .where('role', 'in', ['owner', 'adult'])
    .orderBy('created_at')
    .execute();
  return rows.map((r) => r.id);
}

/** Decisions with their options and votes, as the API returns them. */
export async function loadDecisions(
  trx: Transaction<Database>,
  member: CurrentMember,
  filter: { id: string } | { status: (typeof STATUSES)[number] },
) {
  let query = trx
    .selectFrom('app.decision')
    .selectAll()
    .where('household_id', '=', member.householdId);
  if ('id' in filter) query = query.where('id', '=', filter.id);
  else if (filter.status !== 'all') query = query.where('status', '=', filter.status);
  const rows = await query
    .orderBy('due_on', (ob) => ob.asc().nullsLast())
    .orderBy('created_at')
    .limit(200)
    .execute();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const options = await trx
    .selectFrom('app.decision_option')
    .select(['id', 'decision_id', 'label', 'detail', 'position'])
    .where('household_id', '=', member.householdId)
    .where('decision_id', 'in', ids)
    .orderBy('position')
    .orderBy('created_at')
    .execute();
  const votes = await trx
    .selectFrom('app.decision_vote')
    .select(['decision_id', 'member_id', 'option_id', 'voted_at'])
    .where('household_id', '=', member.householdId)
    .where('decision_id', 'in', ids)
    .orderBy('voted_at')
    .execute();
  const adults = await adultIds(trx, member.householdId);
  return rows.map((r) => {
    const mine = votes.filter((v) => v.decision_id === r.id);
    return {
      id: r.id,
      question: r.question,
      context: r.context,
      dueOn: r.due_on,
      status: r.status,
      decidedOptionId: r.decided_option_id,
      decidedAt: iso(r.decided_at),
      decidedVia: r.decided_via,
      decidedByMemberId: r.decided_by_member_id,
      options: options
        .filter((o) => o.decision_id === r.id)
        .map((o) => ({ id: o.id, label: o.label, detail: o.detail, position: o.position })),
      votes: mine.map((v) => ({
        memberId: v.member_id,
        optionId: v.option_id,
        votedAt: iso(v.voted_at),
      })),
      myVoteOptionId: mine.find((v) => v.member_id === member.id)?.option_id ?? null,
      /** Adults who haven't voted yet (open decisions only). */
      waitingOn:
        r.status === 'open' ? adults.filter((id) => !mine.some((v) => v.member_id === id)) : [],
      createdByMemberId: r.created_by_member_id,
      version: r.version,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    };
  });
}

/**
 * Household decisions (Weekly Reset, "Decide"): a question with options; each adult votes once
 * and can change their vote; decided by agreement when every adult picked the same option, or
 * when an adult makes the call. Adults only: caregivers neither see nor vote on decisions.
 */
export function decisionRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const one = async (trx: Transaction<Database>, member: CurrentMember, id: string) => {
    const [decision] = await loadDecisions(trx, member, { id });
    if (!decision) throw notFound();
    return decision;
  };

  /** Locks the decision; checks the version when one is given. */
  const lock = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    id: string,
    expectedVersion: number | undefined,
  ) => {
    const row = await trx
      .selectFrom('app.decision')
      .select(['id', 'status', 'version'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw conflict();
    return row;
  };
  const lockOpen = async (...args: Parameters<typeof lock>) => {
    const row = await lock(...args);
    if (row.status !== 'open') throw new ApiError(422, 'decision_closed');
    return row;
  };

  const bump = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    row: { id: string; version: number },
    changes: Partial<{
      question: string;
      context: string | null;
      due_on: string | null;
      status: DecisionStatus;
      decided_option_id: string | null;
      decided_at: Date | null;
      decided_via: 'agreement' | 'call' | null;
      decided_by_member_id: string | null;
    }> = {},
  ) => {
    const updated = await trx
      .updateTable('app.decision')
      .set({ ...changes, version: row.version + 1, updated_at: now() })
      .where('id', '=', row.id)
      .where('household_id', '=', member.householdId)
      .where('version', '=', row.version)
      .returning('version')
      .executeTakeFirst();
    if (!updated) throw conflict();
    return updated.version;
  };

  const audit = (
    c: Context<AppEnv>,
    id: string,
    action: string,
    payload: Record<string, unknown> = {},
  ) =>
    recordAudit(c.get('trx'), {
      householdId: c.get('member').householdId,
      actorMemberId: c.get('member').id,
      entityType: 'decision',
      entityId: id,
      action,
      payload,
      requestId: c.get('requestId'),
    });

  const assertOption = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    decisionId: string,
    optionId: string,
  ) => {
    const option = await trx
      .selectFrom('app.decision_option')
      .select('id')
      .where('id', '=', optionId)
      .where('decision_id', '=', decisionId)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (!option) throw new ApiError(422, 'invalid_option');
  };

  const decided = (memberId: string, optionId: string, via: 'agreement' | 'call') => ({
    status: 'decided' as const,
    decided_option_id: optionId,
    decided_at: now(),
    decided_via: via,
    decided_by_member_id: memberId,
  });

  app.get('/', async (c) => {
    authorize(c, 'decision.read');
    const status = z.enum(STATUSES).safeParse(c.req.query('status') ?? 'open');
    if (!status.success) throw new ApiError(422, 'invalid_status');
    return c.json({
      decisions: await loadDecisions(c.get('trx'), c.get('member'), { status: status.data }),
    });
  });

  app.post('/', async (c) => {
    authorize(c, 'decision.manage');
    const body = await parseBody(c.req.raw, CreateDecision);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .insertInto('app.decision')
      .values({
        household_id: member.householdId,
        question: body.question,
        context: body.context ?? null,
        due_on: body.dueOn ?? null,
        created_by_member_id: member.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (body.options.length > 0) {
      await trx
        .insertInto('app.decision_option')
        .values(
          body.options.map((o, position) => ({
            household_id: member.householdId,
            decision_id: row.id,
            label: o.label,
            detail: o.detail ?? null,
            position,
          })),
        )
        .execute();
    }
    await audit(c, row.id, 'decision.created', {
      options: body.options.length,
      ...(body.dueOn && { dueOn: body.dueOn }),
    });
    return c.json({ decision: await one(trx, member, row.id) }, 201);
  });

  app.get('/:decisionId', async (c) => {
    authorize(c, 'decision.read');
    const id = uuidParam(c.req.param('decisionId'));
    return c.json({ decision: await one(c.get('trx'), c.get('member'), id) });
  });

  app.patch('/:decisionId', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, UpdateDecision);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    const changes = {
      ...(body.question !== undefined && { question: body.question }),
      ...(body.context !== undefined && { context: body.context }),
      ...(body.dueOn !== undefined && { due_on: body.dueOn }),
    };
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    const version = await bump(trx, member, row, changes);
    await audit(c, id, 'decision.updated', { fields, version });
    return c.json({ decision: await one(trx, member, id) });
  });

  app.delete('/:decisionId', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, expected.data);
    await trx
      .deleteFrom('app.decision')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audit(c, id, 'decision.deleted', { version: row.version });
    return c.body(null, 204);
  });

  app.post('/:decisionId/options', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, AddOption);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    const existing = await trx
      .selectFrom('app.decision_option')
      .select('position')
      .where('household_id', '=', member.householdId)
      .where('decision_id', '=', id)
      .execute();
    if (existing.length >= MAX_DECISION_OPTIONS) throw new ApiError(422, 'too_many_options');
    const option = await trx
      .insertInto('app.decision_option')
      .values({
        household_id: member.householdId,
        decision_id: id,
        label: body.label,
        detail: body.detail ?? null,
        position: Math.min(99, Math.max(-1, ...existing.map((o) => o.position)) + 1),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const version = await bump(trx, member, row);
    await audit(c, id, 'decision.option_added', { optionId: option.id, version });
    return c.json({ decision: await one(trx, member, id) }, 201);
  });

  app.patch('/:decisionId/options/:optionId', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const optionId = uuidParam(c.req.param('optionId'));
    const body = await parseBody(c.req.raw, UpdateOption);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    const changes = {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.detail !== undefined && { detail: body.detail }),
      ...(body.position !== undefined && { position: body.position }),
    };
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    const updated = await trx
      .updateTable('app.decision_option')
      .set(changes)
      .where('id', '=', optionId)
      .where('decision_id', '=', id)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (updated.numUpdatedRows === 0n) throw notFound();
    const version = await bump(trx, member, row);
    await audit(c, id, 'decision.option_updated', { optionId, fields, version });
    return c.json({ decision: await one(trx, member, id) });
  });

  // Removing an option removes the votes for it.
  app.delete('/:decisionId/options/:optionId', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const optionId = uuidParam(c.req.param('optionId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, expected.data);
    const removed = await trx
      .deleteFrom('app.decision_option')
      .where('id', '=', optionId)
      .where('decision_id', '=', id)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (removed.numDeletedRows === 0n) throw notFound();
    const version = await bump(trx, member, row);
    await audit(c, id, 'decision.option_removed', { optionId, version });
    return c.json({ decision: await one(trx, member, id) });
  });

  // Cast or change my vote. When every adult has picked the same option, it's decided.
  app.post('/:decisionId/vote', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, Vote);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    await assertOption(trx, member, id, body.optionId);
    await trx
      .insertInto('app.decision_vote')
      .values({
        household_id: member.householdId,
        decision_id: id,
        member_id: member.id,
        option_id: body.optionId,
        voted_at: now(),
      })
      .onConflict((oc) =>
        oc.columns(['decision_id', 'member_id']).doUpdateSet({
          option_id: body.optionId,
          voted_at: now(),
        }),
      )
      .execute();
    const votes = await trx
      .selectFrom('app.decision_vote')
      .select(['member_id as memberId', 'option_id as optionId'])
      .where('household_id', '=', member.householdId)
      .where('decision_id', '=', id)
      .execute();
    const agreed = agreedOption(await adultIds(trx, member.householdId), votes);
    const version = await bump(
      trx,
      member,
      row,
      agreed ? decided(member.id, agreed, 'agreement') : {},
    );
    await audit(c, id, 'decision.voted', { optionId: body.optionId, version });
    if (agreed) await audit(c, id, 'decision.decided', { optionId: agreed, via: 'agreement' });
    return c.json({ decision: await one(trx, member, id) });
  });

  app.delete('/:decisionId/vote', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, undefined);
    const removed = await trx
      .deleteFrom('app.decision_vote')
      .where('household_id', '=', member.householdId)
      .where('decision_id', '=', id)
      .where('member_id', '=', member.id)
      .executeTakeFirst();
    if (removed.numDeletedRows === 0n) throw new ApiError(422, 'no_vote');
    const version = await bump(trx, member, row);
    await audit(c, id, 'decision.vote_withdrawn', { version });
    return c.json({ decision: await one(trx, member, id) });
  });

  // An adult makes the call, whatever the votes say.
  app.post('/:decisionId/decide', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, Decide);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    await assertOption(trx, member, id, body.optionId);
    const version = await bump(trx, member, row, decided(member.id, body.optionId, 'call'));
    await audit(c, id, 'decision.decided', { optionId: body.optionId, via: 'call', version });
    return c.json({ decision: await one(trx, member, id) });
  });

  app.post('/:decisionId/drop', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockOpen(trx, member, id, body.expectedVersion);
    const version = await bump(trx, member, row, { status: 'dropped' });
    await audit(c, id, 'decision.dropped', { version });
    return c.json({ decision: await one(trx, member, id) });
  });

  // Back to open; votes stay as they were.
  app.post('/:decisionId/reopen', async (c) => {
    authorize(c, 'decision.manage');
    const id = uuidParam(c.req.param('decisionId'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, body.expectedVersion);
    if (row.status === 'open') throw new ApiError(422, 'decision_open');
    const version = await bump(trx, member, row, {
      status: 'open',
      decided_option_id: null,
      decided_at: null,
      decided_via: null,
      decided_by_member_id: null,
    });
    await audit(c, id, 'decision.reopened', { fromStatus: row.status, version });
    return c.json({ decision: await one(trx, member, id) });
  });

  return app;
}
