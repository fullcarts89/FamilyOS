import {
  IllegalTransitionError,
  SwapError,
  addDays,
  assertWorkItemTransition,
  describeSchedule,
  isCalendarRule,
  isValidRule,
  localDateOf,
  occurrenceDate,
  planSwap,
  plannedOwner,
  upcomingOccurrences,
  type Assignment,
  type OccurrenceException,
  type RecurrenceRule,
  type WorkItemStatus,
} from '@familyos/domain';
import { loadExceptions, materializeRoutine, type Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';
import { ITEM_COLUMNS, assertAssignable, assertSubject } from './work-items';

const CLOSED: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified', 'cancelled'];
const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const UPCOMING_COUNT = 8;
const FAIRNESS_DAYS = 30;

const Uuid = z.uuid();
const LocalDate = z.iso.date();
const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Rule = z.custom<RecurrenceRule>((value) => isValidRule(value));
const Rotation = z
  .array(Uuid)
  .max(6)
  .refine((ids) => ids.length !== 1, { message: 'a rotation needs two or more people' })
  .refine((ids) => new Set(ids).size === ids.length, { message: 'no repeats' });

const CreateRoutine = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).nullish(),
    visibility: z.enum(['household', 'private']).default('household'),
    rule: Rule,
    startOn: LocalDate,
    time: LocalTime.nullish(),
    ownerMemberId: Uuid.nullish(),
    /** The child or pet it's about ("Biscuit's flea meds"). */
    subjectMemberId: Uuid.nullish(),
    rotation: Rotation.optional(),
  })
  .strict()
  .refine((b) => !(b.ownerMemberId && b.rotation?.length), { message: 'owner or rotation' });

const UpdateRoutine = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    ownerMemberId: Uuid.nullable().optional(),
    subjectMemberId: Uuid.nullable().optional(),
    rotation: Rotation.optional(),
    paused: z.boolean().optional(),
  })
  .strict()
  .refine((b) => !(b.ownerMemberId && b.rotation?.length), { message: 'owner or rotation' });

const VersionOnly = z.object({ expectedVersion: z.number().int().min(1) }).strict();
const Swap = z.object({ expectedVersion: z.number().int().min(1), withMemberId: Uuid }).strict();

/** Occurrence indexes in paths; anything else is a 404 like an unknown ID. */
function indexParam(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw notFound();
  return n;
}

async function loadRoutine(
  trx: Transaction<Database>,
  householdId: string,
  routineId: string,
  lock = false,
) {
  let query = trx
    .selectFrom('app.work_item as w')
    .innerJoin('app.recurrence_rule as r', (join) =>
      join.onRef('r.routine_id', '=', 'w.id').onRef('r.household_id', '=', 'w.household_id'),
    )
    .select([
      'w.id',
      'w.title',
      'w.description',
      'w.status',
      'w.visibility',
      'w.owner_member_id as ownerMemberId',
      'w.subject_member_id as subjectMemberId',
      'w.created_by_member_id as createdByMemberId',
      'w.version',
      'w.created_at as createdAt',
      'r.id as ruleId',
      'r.rule',
      'r.timezone',
      'r.start_on as startOn',
      'r.local_time as localTime',
      'r.rotation',
      'r.paused_at as pausedAt',
      'r.generate_from as generateFrom',
      'r.materialized_through as materializedThrough',
    ])
    .where('w.id', '=', routineId)
    .where('w.household_id', '=', householdId)
    .where('w.type', '=', 'routine');
  if (lock) query = query.forUpdate('w');
  const routine = await query.executeTakeFirst();
  if (!routine) throw notFound();
  return routine;
}

type Routine = Awaited<ReturnType<typeof loadRoutine>>;
type LockedRoutine = Routine & { householdId: string };

function view(r: Routine) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    visibility: r.visibility,
    ended: r.status === 'cancelled',
    paused: r.pausedAt !== null,
    ownerMemberId: r.ownerMemberId,
    subjectMemberId: r.subjectMemberId,
    rotation: r.rotation,
    rule: r.rule,
    startOn: r.startOn,
    time: r.localTime ? r.localTime.slice(0, 5) : null,
    timezone: r.timezone,
    summary: describeSchedule(r.rule, r.localTime),
    createdByMemberId: r.createdByMemberId,
    version: r.version,
  };
}

const assignmentOf = (r: { rotation: string[]; ownerMemberId: string | null }): Assignment => ({
  rotation: r.rotation,
  ownerMemberId: r.ownerMemberId,
});

async function occurrenceRows(
  trx: Transaction<Database>,
  householdId: string,
  ruleId: string,
  filter: { indexes?: number[]; open?: boolean } = {},
) {
  let query = trx
    .selectFrom('app.work_item')
    .select([...ITEM_COLUMNS, 'occurrence_index as index'])
    .where('household_id', '=', householdId)
    .where('recurrence_rule_id', '=', ruleId);
  if (filter.indexes) {
    if (filter.indexes.length === 0) return [];
    query = query.where('occurrence_index', 'in', filter.indexes);
  }
  if (filter.open) query = query.where('status', 'not in', CLOSED);
  return query.orderBy('occurrence_index').execute();
}

export function routineRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  /** Bumps the routine's version; every schedule change goes through here (J3: stale edits get 409). */
  async function bumpRoutine(
    trx: Transaction<Database>,
    routine: LockedRoutine,
    changes: {
      title?: string;
      description?: string | null;
      owner_member_id?: string | null;
      subject_member_id?: string | null;
      status?: 'cancelled';
    } = {},
  ) {
    const row = await trx
      .updateTable('app.work_item')
      .set({ ...changes, version: routine.version + 1, updated_at: now() })
      .where('id', '=', routine.id)
      .where('household_id', '=', routine.householdId)
      .where('version', '=', routine.version)
      .returning('version')
      .executeTakeFirst();
    if (!row) throw conflict();
    return row.version;
  }

  /** Changes one occurrence row, with its own audit entry so its timeline tells the story. */
  async function updateOccurrence(
    trx: Transaction<Database>,
    member: CurrentMember,
    requestId: string,
    row: { id: string; status: WorkItemStatus; version: number },
    changes: { status?: WorkItemStatus; owner_member_id?: string | null },
    action: string,
  ) {
    if (changes.status && changes.status !== row.status) {
      try {
        assertWorkItemTransition(row.status, changes.status);
      } catch (error) {
        if (error instanceof IllegalTransitionError) throw new ApiError(422, 'illegal_transition');
        throw error;
      }
    }
    await trx
      .updateTable('app.work_item')
      .set({ ...changes, version: row.version + 1, updated_at: now() })
      .where('id', '=', row.id)
      .where('household_id', '=', member.householdId)
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: row.id,
      action,
      payload: {
        ...(changes.status && { fromStatus: row.status, toStatus: changes.status }),
        ...(changes.owner_member_id !== undefined && { ownerMemberId: changes.owner_member_id }),
        version: row.version + 1,
      },
      requestId,
    });
  }

  const routineWithHousehold = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    id: string,
    lock = false,
  ): Promise<LockedRoutine> => ({
    ...(await loadRoutine(trx, member.householdId, id, lock)),
    householdId: member.householdId,
  });

  const lockForChange = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    id: string,
    expectedVersion: number,
  ) => {
    const routine = await routineWithHousehold(trx, member, id, true);
    if (routine.version !== expectedVersion) throw conflict();
    if (routine.status === 'cancelled') throw new ApiError(422, 'routine_ended');
    return routine;
  };

  app.get('/', async (c) => {
    authorize(c, 'work_item.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const rows = await trx
      .selectFrom('app.work_item')
      .select('id')
      .where('household_id', '=', householdId)
      .where('type', '=', 'routine')
      .orderBy('created_at')
      .execute();
    const routines = [];
    for (const { id } of rows) {
      const routine = await loadRoutine(trx, householdId, id);
      // The current turn: the earliest occurrence still open, with what Done needs (its id and
      // version) and what Skip and Swap need (its index, with the routine's version).
      const next = await trx
        .selectFrom('app.work_item')
        .select([
          'id',
          'occurrence_index as index',
          'occurrence_on as date',
          'owner_member_id as ownerMemberId',
          'status',
          'due_on as dueOn',
          'due_at as dueAt',
          'version',
        ])
        .where('household_id', '=', householdId)
        .where('recurrence_rule_id', '=', routine.ruleId)
        .where('status', 'not in', CLOSED)
        .orderBy('occurrence_index')
        .executeTakeFirst();
      let nextOccurrenceIndex = next?.index ?? null;
      if (
        nextOccurrenceIndex === null &&
        isCalendarRule(routine.rule) &&
        routine.status !== 'cancelled' &&
        !routine.pausedAt
      ) {
        const today = localDateOf(now(), routine.timezone);
        const from = routine.generateFrom > today ? routine.generateFrom : today;
        const exceptions = await loadExceptions(trx, householdId, routine.ruleId);
        const planned = upcomingOccurrences(
          { rule: routine.rule, startOn: routine.startOn },
          assignmentOf(routine),
          exceptions,
          from,
          UPCOMING_COUNT,
        ).find((p) => !p.skipped);
        nextOccurrenceIndex = planned?.index ?? null;
      }
      routines.push({
        ...view(routine),
        nextOccurrenceIndex,
        next: next
          ? { ...next, dueAt: next.dueAt ? new Date(next.dueAt).toISOString() : null }
          : null,
      });
    }
    return c.json({ routines });
  });

  app.post('/', async (c) => {
    authorize(c, 'routine.manage');
    const body = await parseBody(c.req.raw, CreateRoutine);
    const trx = c.get('trx');
    const member = c.get('member');
    const rotation = body.rotation ?? [];
    for (const id of [...rotation, ...(body.ownerMemberId ? [body.ownerMemberId] : [])]) {
      await assertAssignable(trx, member.householdId, id);
    }
    if (body.subjectMemberId) await assertSubject(trx, member.householdId, body.subjectMemberId);
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', member.householdId)
      .executeTakeFirstOrThrow();
    const today = localDateOf(now(), timezone);

    const routine = await trx
      .insertInto('app.work_item')
      .values({
        household_id: member.householdId,
        type: 'routine',
        title: body.title,
        description: body.description ?? null,
        status: 'ready',
        owner_member_id: rotation.length ? null : (body.ownerMemberId ?? null),
        subject_member_id: body.subjectMemberId ?? null,
        visibility: body.visibility,
        created_by_member_id: member.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('app.recurrence_rule')
      .values({
        household_id: member.householdId,
        routine_id: routine.id,
        rule: body.rule,
        timezone,
        start_on: body.startOn,
        local_time: body.time ?? null,
        rotation,
        generate_from: body.startOn > today ? body.startOn : today,
      })
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.created',
      payload: {
        freq: body.rule.freq,
        visibility: body.visibility,
        rotationSize: rotation.length,
        ...(body.subjectMemberId && { subjectMemberId: body.subjectMemberId }),
      },
      requestId: c.get('requestId'),
    });
    await materializeRoutine(trx, {
      householdId: member.householdId,
      routineId: routine.id,
      now: now(),
      requestId: c.get('requestId'),
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routine.id)) }, 201);
  });

  app.get('/:routineId', async (c) => {
    authorize(c, 'work_item.read');
    const routineId = uuidParam(c.req.param('routineId'));
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const routine = await loadRoutine(trx, householdId, routineId);
    const today = localDateOf(now(), routine.timezone);
    const exceptions = await loadExceptions(trx, householdId, routine.ruleId);

    // Coming up: computed from the rule, joined with any rows already created.
    let upcoming: {
      index: number;
      date: string;
      ownerMemberId: string | null;
      skipped: boolean;
      itemId: string | null;
      status: WorkItemStatus | null;
    }[];
    if (isCalendarRule(routine.rule)) {
      const from = routine.generateFrom > today ? routine.generateFrom : today;
      const planned =
        routine.status === 'cancelled' || routine.pausedAt
          ? []
          : upcomingOccurrences(
              { rule: routine.rule, startOn: routine.startOn },
              assignmentOf(routine),
              exceptions,
              from,
              UPCOMING_COUNT,
            );
      const rows = await occurrenceRows(trx, householdId, routine.ruleId, {
        indexes: planned.map((p) => p.index),
      });
      upcoming = planned.map((p) => {
        const row = rows.find((r) => r.index === p.index);
        return {
          ...p,
          ownerMemberId: row ? row.ownerMemberId : p.ownerMemberId,
          itemId: row?.id ?? null,
          status: row?.status ?? null,
        };
      });
    } else {
      const open = await occurrenceRows(trx, householdId, routine.ruleId, { open: true });
      upcoming = open.map((r) => ({
        index: r.index ?? 0,
        date: r.occurrenceOn ?? '',
        ownerMemberId: r.ownerMemberId,
        skipped: false,
        itemId: r.id,
        status: r.status,
      }));
    }

    // Earlier occurrences, newest first: anything dated before today, plus anything already done.
    const history = await trx
      .selectFrom('app.work_item')
      .select([...ITEM_COLUMNS, 'occurrence_index as index'])
      .where('household_id', '=', householdId)
      .where('recurrence_rule_id', '=', routine.ruleId)
      .where((eb) => eb.or([eb('status', 'in', DONE), eb('occurrence_on', '<', today)]))
      .orderBy('occurrence_index', 'desc')
      .limit(12)
      .execute();

    // Fairness view (J3b): completions per adult, as counts.
    const since = new Date(now().getTime() - FAIRNESS_DAYS * 24 * 3600 * 1000);
    const fairness = await trx
      .selectFrom('app.work_item')
      .select(['completed_by_member_id as memberId', (eb) => eb.fn.countAll<string>().as('n')])
      .where('household_id', '=', householdId)
      .where('recurrence_rule_id', '=', routine.ruleId)
      .where('status', 'in', DONE)
      .where('completed_at', '>=', since)
      .groupBy('completed_by_member_id')
      .execute();

    return c.json({
      routine: view(routine),
      today,
      upcoming,
      history,
      fairness: {
        days: FAIRNESS_DAYS,
        counts: fairness.map((f) => ({ memberId: f.memberId, completed: Number(f.n) })),
      },
    });
  });

  app.patch('/:routineId', async (c) => {
    authorize(c, 'routine.manage');
    const routineId = uuidParam(c.req.param('routineId'));
    const body = await parseBody(c.req.raw, UpdateRoutine);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const routine = await lockForChange(trx, member, routineId, body.expectedVersion);
    const today = localDateOf(now(), routine.timezone);

    for (const id of [
      ...(body.rotation ?? []),
      ...(body.ownerMemberId ? [body.ownerMemberId] : []),
    ]) {
      await assertAssignable(trx, member.householdId, id);
    }
    if (body.subjectMemberId) await assertSubject(trx, member.householdId, body.subjectMemberId);
    const subjectChanged =
      body.subjectMemberId !== undefined && body.subjectMemberId !== routine.subjectMemberId;

    // One person or a rotation, never both.
    const rotation =
      body.rotation !== undefined ? body.rotation : body.ownerMemberId ? [] : routine.rotation;
    const ownerMemberId =
      body.ownerMemberId !== undefined
        ? body.ownerMemberId
        : rotation.length
          ? null
          : routine.ownerMemberId;
    const assignmentChanged =
      ownerMemberId !== routine.ownerMemberId || rotation.join() !== routine.rotation.join();
    const pausing = body.paused === true && !routine.pausedAt;
    const resuming = body.paused === false && routine.pausedAt !== null;

    const fields = [
      ...(body.title !== undefined ? ['title'] : []),
      ...(body.description !== undefined ? ['description'] : []),
      ...(subjectChanged ? ['subject'] : []),
      ...(assignmentChanged ? ['assignment'] : []),
      ...(pausing ? ['paused'] : []),
      ...(resuming ? ['resumed'] : []),
    ];
    if (fields.length === 0) throw new ApiError(422, 'no_changes');

    const version = await bumpRoutine(trx, routine, {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(subjectChanged && { subject_member_id: body.subjectMemberId ?? null }),
      ...(assignmentChanged && { owner_member_id: ownerMemberId }),
    });
    await trx
      .updateTable('app.recurrence_rule')
      .set({
        rotation,
        ...(pausing && { paused_at: now() }),
        ...(resuming && { paused_at: null, generate_from: today }),
        updated_at: now(),
      })
      .where('id', '=', routine.ruleId)
      .where('household_id', '=', member.householdId)
      .execute();

    // Open occurrences follow the routine's title, description and subject.
    if (body.title !== undefined || body.description !== undefined || subjectChanged) {
      await trx
        .updateTable('app.work_item')
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(subjectChanged && { subject_member_id: body.subjectMemberId ?? null }),
        })
        .where('household_id', '=', member.householdId)
        .where('recurrence_rule_id', '=', routine.ruleId)
        .where('status', 'not in', CLOSED)
        .execute();
    }

    const exceptions = await loadExceptions(trx, member.householdId, routine.ruleId);

    // New owners for open occurrences, unless someone already moved that occurrence by hand.
    if (assignmentChanged) {
      const before = assignmentOf(routine);
      const after: Assignment = { rotation, ownerMemberId };
      for (const row of await occurrenceRows(trx, member.householdId, routine.ruleId, {
        open: true,
      })) {
        const index = row.index ?? 0;
        const was = plannedOwner(before, index, exceptions);
        const will = plannedOwner(after, index, exceptions);
        if (row.ownerMemberId === was && will !== was) {
          await updateOccurrence(
            trx,
            member,
            requestId,
            row,
            { owner_member_id: will },
            'routine.occurrence_reassigned',
          );
        }
      }
    }

    // Pausing clears what's coming (today onwards, not started yet); resuming brings it back.
    if (pausing) {
      for (const row of await occurrenceRows(trx, member.householdId, routine.ruleId, {
        open: true,
      })) {
        if (row.status !== 'ready' || (row.occurrenceOn ?? '') < today) continue;
        await trx
          .insertInto('app.occurrence_exception')
          .values({
            household_id: member.householdId,
            recurrence_rule_id: routine.ruleId,
            occurrence_index: row.index ?? 0,
            kind: 'skip',
            reason: 'paused',
            created_by_member_id: member.id,
          })
          .onConflict((oc) =>
            oc.columns(['recurrence_rule_id', 'occurrence_index', 'kind']).doNothing(),
          )
          .execute();
        await updateOccurrence(
          trx,
          member,
          requestId,
          row,
          { status: 'cancelled' },
          'routine.occurrence_paused',
        );
      }
    }
    if (resuming) {
      const paused = await trx
        .deleteFrom('app.occurrence_exception')
        .where('household_id', '=', member.householdId)
        .where('recurrence_rule_id', '=', routine.ruleId)
        .where('kind', '=', 'skip')
        .where('reason', '=', 'paused')
        .returning('occurrence_index')
        .execute();
      const rows = await occurrenceRows(trx, member.householdId, routine.ruleId, {
        indexes: paused.map((p) => p.occurrence_index),
      });
      for (const row of rows) {
        if (row.status !== 'cancelled' || (row.occurrenceOn ?? '') < today) continue;
        await updateOccurrence(
          trx,
          member,
          requestId,
          row,
          { status: 'ready' },
          'routine.occurrence_resumed',
        );
      }
    }

    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.updated',
      payload: {
        fields,
        ...(assignmentChanged && { ownerMemberId, rotationSize: rotation.length }),
        version,
      },
      requestId,
    });
    await materializeRoutine(trx, {
      householdId: member.householdId,
      routineId,
      now: now(),
      requestId,
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routineId)) });
  });

  // Ending a routine stops new occurrences and cancels the ones nobody has started.
  app.post('/:routineId/end', async (c) => {
    authorize(c, 'routine.manage');
    const routineId = uuidParam(c.req.param('routineId'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const routine = await lockForChange(trx, member, routineId, body.expectedVersion);
    const version = await bumpRoutine(trx, routine, { status: 'cancelled' });
    for (const row of await occurrenceRows(trx, member.householdId, routine.ruleId, {
      open: true,
    })) {
      if (row.status !== 'ready') continue;
      await updateOccurrence(
        trx,
        member,
        requestId,
        row,
        { status: 'cancelled' },
        'routine.occurrence_cancelled',
      );
    }
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.ended',
      payload: { version },
      requestId,
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routineId)) });
  });

  /** The occurrence at `index`: its date and any row already created for it. */
  async function locateOccurrence(
    trx: Transaction<Database>,
    member: CurrentMember,
    routine: Routine,
    index: number,
  ) {
    const [row] = await occurrenceRows(trx, member.householdId, routine.ruleId, {
      indexes: [index],
    });
    const date = isCalendarRule(routine.rule)
      ? occurrenceDate(routine.rule, routine.startOn, index)
      : (row?.occurrenceOn ?? null);
    return { row, date };
  }

  // Skip one occurrence (J3 step 3). The rule is untouched; an exception records the skip.
  app.post('/:routineId/occurrences/:index/skip', async (c) => {
    authorize(c, 'routine.manage');
    const routineId = uuidParam(c.req.param('routineId'));
    const index = indexParam(c.req.param('index'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const routine = await lockForChange(trx, member, routineId, body.expectedVersion);
    const today = localDateOf(now(), routine.timezone);
    const { row, date } = await locateOccurrence(trx, member, routine, index);

    const open = row && !CLOSED.includes(row.status);
    const future = date !== null && date >= today && date >= routine.generateFrom;
    if (!(open || (!row && future && isCalendarRule(routine.rule)))) {
      throw new ApiError(422, 'not_skippable');
    }
    const inserted = await trx
      .insertInto('app.occurrence_exception')
      .values({
        household_id: member.householdId,
        recurrence_rule_id: routine.ruleId,
        occurrence_index: index,
        kind: 'skip',
        reason: 'member',
        created_by_member_id: member.id,
      })
      .onConflict((oc) =>
        oc.columns(['recurrence_rule_id', 'occurrence_index', 'kind']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (!inserted) throw new ApiError(422, 'already_skipped');
    if (row) {
      await updateOccurrence(
        trx,
        member,
        requestId,
        row,
        { status: 'cancelled' },
        'routine.occurrence_skipped',
      );
    }
    const version = await bumpRoutine(trx, routine);
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.occurrence_skipped',
      payload: { index, version },
      requestId,
    });
    await materializeRoutine(trx, {
      householdId: member.householdId,
      routineId,
      now: now(),
      requestId,
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routineId)) });
  });

  // Undo a skip, for an occurrence that hasn't happened yet.
  app.post('/:routineId/occurrences/:index/unskip', async (c) => {
    authorize(c, 'routine.manage');
    const routineId = uuidParam(c.req.param('routineId'));
    const index = indexParam(c.req.param('index'));
    const body = await parseBody(c.req.raw, VersionOnly);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const routine = await lockForChange(trx, member, routineId, body.expectedVersion);
    if (!isCalendarRule(routine.rule)) throw new ApiError(422, 'not_skippable');
    const today = localDateOf(now(), routine.timezone);
    const { row, date } = await locateOccurrence(trx, member, routine, index);
    if (date === null || date < today) throw new ApiError(422, 'not_skippable');

    const removed = await trx
      .deleteFrom('app.occurrence_exception')
      .where('household_id', '=', member.householdId)
      .where('recurrence_rule_id', '=', routine.ruleId)
      .where('occurrence_index', '=', index)
      .where('kind', '=', 'skip')
      .where('reason', '=', 'member')
      .returning('id')
      .executeTakeFirst();
    if (!removed) throw new ApiError(422, 'not_skipped');

    if (row?.status === 'cancelled') {
      await updateOccurrence(
        trx,
        member,
        requestId,
        row,
        { status: 'ready' },
        'routine.occurrence_unskipped',
      );
    } else if (!row && routine.materializedThrough && routine.materializedThrough >= date) {
      // The scheduler already passed this date; rewind it. Inserts are idempotent and skips
      // still hold, so rescanning creates only this occurrence.
      await trx
        .updateTable('app.recurrence_rule')
        .set({ materialized_through: addDays(date, -1) })
        .where('id', '=', routine.ruleId)
        .where('household_id', '=', member.householdId)
        .execute();
    }
    const version = await bumpRoutine(trx, routine);
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.occurrence_unskipped',
      payload: { index, version },
      requestId,
    });
    await materializeRoutine(trx, {
      householdId: member.householdId,
      routineId,
      now: now(),
      requestId,
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routineId)) });
  });

  // Swap a turn (J3b step 3): this one goes to `withMemberId`, their next turn comes back.
  app.post('/:routineId/occurrences/:index/swap', async (c) => {
    authorize(c, 'routine.manage');
    const routineId = uuidParam(c.req.param('routineId'));
    const index = indexParam(c.req.param('index'));
    const body = await parseBody(c.req.raw, Swap);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const routine = await lockForChange(trx, member, routineId, body.expectedVersion);
    await assertAssignable(trx, member.householdId, body.withMemberId);
    const today = localDateOf(now(), routine.timezone);
    const { row, date } = await locateOccurrence(trx, member, routine, index);
    if (row ? CLOSED.includes(row.status) : date === null || date < today) {
      throw new ApiError(422, 'not_swappable');
    }

    const exceptions: OccurrenceException[] = await loadExceptions(
      trx,
      member.householdId,
      routine.ruleId,
    );
    let plan: { index: number; ownerMemberId: string }[];
    try {
      plan = planSwap(assignmentOf(routine), exceptions, index, body.withMemberId);
    } catch (error) {
      if (error instanceof SwapError) throw new ApiError(422, error.code);
      throw error;
    }

    for (const change of plan) {
      await trx
        .insertInto('app.occurrence_exception')
        .values({
          household_id: member.householdId,
          recurrence_rule_id: routine.ruleId,
          occurrence_index: change.index,
          kind: 'owner',
          owner_member_id: change.ownerMemberId,
          created_by_member_id: member.id,
        })
        .onConflict((oc) =>
          oc.columns(['recurrence_rule_id', 'occurrence_index', 'kind']).doUpdateSet({
            owner_member_id: change.ownerMemberId,
            created_by_member_id: member.id,
          }),
        )
        .execute();
    }
    const rows = await occurrenceRows(trx, member.householdId, routine.ruleId, {
      indexes: plan.map((p) => p.index),
      open: true,
    });
    for (const r of rows) {
      const owner = plan.find((p) => p.index === r.index)?.ownerMemberId ?? null;
      if (r.ownerMemberId !== owner) {
        await updateOccurrence(
          trx,
          member,
          requestId,
          r,
          { owner_member_id: owner },
          'routine.occurrence_reassigned',
        );
      }
    }
    const version = await bumpRoutine(trx, routine);
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'work_item',
      entityId: routine.id,
      action: 'routine.turns_swapped',
      payload: { indexes: plan.map((p) => p.index), version },
      requestId,
    });
    return c.json({ routine: view(await loadRoutine(trx, member.householdId, routineId)) });
  });

  return app;
}
