import {
  ASSIGNABLE_ROLES,
  addDays,
  dueAfterCompletion,
  isCalendarRule,
  isSkipped,
  isValidRule,
  localDateOf,
  nextOccurrenceAfter,
  occurrenceDue,
  occurrencesFrom,
  plannedOwner,
  type OccurrenceException,
} from '@familyos/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from './schema';

type Db = Kysely<Database> | Transaction<Database>;

/** Caps one run's backfill (for example after the worker was down for weeks). */
const MAX_PER_RUN = 60;
const CLOSED = ['verified_complete', 'done_unverified', 'cancelled'] as const;

export async function loadExceptions(
  db: Db,
  householdId: string,
  ruleId: string,
): Promise<OccurrenceException[]> {
  const rows = await db
    .selectFrom('app.occurrence_exception')
    .select(['occurrence_index as index', 'kind', 'owner_member_id as ownerMemberId'])
    .where('household_id', '=', householdId)
    .where('recurrence_rule_id', '=', ruleId)
    .execute();
  return rows;
}

/** Members who can own occurrences: active adults with accounts (never children or pets). */
async function assignableMembers(db: Db, householdId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom('app.member')
    .select('id')
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .where('role', 'in', ASSIGNABLE_ROLES)
    .execute();
  return new Set(rows.map((r) => r.id));
}

interface Planned {
  index: number;
  date: string;
}

/**
 * Creates the occurrences a routine should have by `now` (ADR-001 §5: scheduler). For calendar
 * rules that is every occurrence due up to today that doesn't exist yet, plus the next upcoming
 * one, so both adults always see what's coming. For after-completion rules it is the next one,
 * once the previous one is closed. Skipped occurrences are never created.
 *
 * Idempotent: each occurrence has a unique (rule, index), so running twice creates nothing
 * extra. No model call anywhere (PRD WF-02). Every query names the household explicitly, so it
 * is safe on the worker's connection as well as inside a request.
 */
export async function materializeRoutine(
  db: Db,
  options: { householdId: string; routineId: string; now: Date; requestId: string },
): Promise<number> {
  const { householdId, routineId, now, requestId } = options;
  const routine = await db
    .selectFrom('app.work_item as w')
    .innerJoin('app.recurrence_rule as r', (join) =>
      join.onRef('r.routine_id', '=', 'w.id').onRef('r.household_id', '=', 'w.household_id'),
    )
    .select([
      'w.title',
      'w.description',
      'w.status',
      'w.owner_member_id',
      'w.visibility',
      'w.created_by_member_id',
      'w.subject_member_id',
      'r.id as rule_id',
      'r.rule',
      'r.timezone',
      'r.start_on',
      'r.local_time',
      'r.rotation',
      'r.paused_at',
      'r.generate_from',
      'r.materialized_through',
    ])
    .where('w.id', '=', routineId)
    .where('w.household_id', '=', householdId)
    .where('w.type', '=', 'routine')
    .executeTakeFirst();
  if (!routine || routine.status === 'cancelled' || routine.paused_at) return 0;
  if (!isValidRule(routine.rule)) throw new Error('stored recurrence rule is invalid');

  const rule = routine.rule;
  const today = localDateOf(now, routine.timezone);
  const exceptions = await loadExceptions(db, householdId, routine.rule_id);
  const planned: Planned[] = [];

  if (isCalendarRule(rule)) {
    const resumeAt = routine.materialized_through
      ? addDays(routine.materialized_through, 1)
      : routine.generate_from;
    const from = resumeAt > routine.generate_from ? resumeAt : routine.generate_from;
    // The horizon is the first occurrence after today, not before generate_from, that isn't
    // skipped: skipping next week's turn brings the one after it into view.
    const beforeFirst = addDays(routine.generate_from, -1);
    let nextUp = nextOccurrenceAfter(
      rule,
      routine.start_on,
      today > beforeFirst ? today : beforeFirst,
    );
    for (let guard = 0; isSkipped(nextUp.index, exceptions) && guard < 400; guard++) {
      nextUp = nextOccurrenceAfter(rule, routine.start_on, nextUp.date);
    }
    for (const occurrence of occurrencesFrom(rule, routine.start_on, from)) {
      if (occurrence.date > nextUp.date || planned.length >= MAX_PER_RUN) break;
      planned.push(occurrence);
    }
  } else {
    const open = await db
      .selectFrom('app.work_item')
      .select('id')
      .where('household_id', '=', householdId)
      .where('recurrence_rule_id', '=', routine.rule_id)
      .where('status', 'not in', CLOSED)
      .executeTakeFirst();
    if (!open) {
      const last = await db
        .selectFrom('app.work_item')
        .select(['occurrence_index', 'completed_at', 'updated_at'])
        .where('household_id', '=', householdId)
        .where('recurrence_rule_id', '=', routine.rule_id)
        .orderBy('occurrence_index', 'desc')
        .executeTakeFirst();
      if (!last) {
        planned.push({ index: 0, date: routine.generate_from });
      } else {
        const closedOn = localDateOf(
          new Date(last.completed_at ?? last.updated_at),
          routine.timezone,
        );
        const due = dueAfterCompletion(rule, closedOn);
        planned.push({
          index: (last.occurrence_index ?? 0) + 1,
          date: due > routine.generate_from ? due : routine.generate_from,
        });
      }
    }
  }

  const assignable = await assignableMembers(db, householdId);
  const assignment = { rotation: routine.rotation, ownerMemberId: routine.owner_member_id };
  let created = 0;
  for (const occurrence of planned) {
    if (isSkipped(occurrence.index, exceptions)) continue;
    const owner = plannedOwner(assignment, occurrence.index, exceptions);
    const due = occurrenceDue(occurrence.date, routine.local_time, routine.timezone);
    const inserted = await db
      .insertInto('app.work_item')
      .values({
        household_id: householdId,
        type: 'task',
        title: routine.title,
        description: routine.description,
        status: 'ready',
        owner_member_id: owner && assignable.has(owner) ? owner : null,
        visibility: routine.visibility,
        created_by_member_id: routine.created_by_member_id,
        subject_member_id: routine.subject_member_id,
        recurrence_rule_id: routine.rule_id,
        occurrence_index: occurrence.index,
        occurrence_on: occurrence.date,
        due_on: due.dueOn,
        due_at: due.dueAt,
      })
      .onConflict((oc) =>
        oc
          .columns(['recurrence_rule_id', 'occurrence_index'])
          .where('recurrence_rule_id', 'is not', null)
          .doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (!inserted) continue;
    created++;
    await db
      .insertInto('app.audit_event')
      .values({
        household_id: householdId,
        actor_member_id: null,
        entity_type: 'work_item',
        entity_id: inserted.id,
        action: 'routine.occurrence_created',
        payload: { routineId, index: occurrence.index },
        request_id: requestId,
      })
      .execute();
  }

  const last = planned.at(-1);
  if (isCalendarRule(rule) && last && last.date !== routine.materialized_through) {
    await db
      .updateTable('app.recurrence_rule')
      .set({ materialized_through: last.date })
      .where('id', '=', routine.rule_id)
      .where('household_id', '=', householdId)
      .execute();
  }
  return created;
}

/** Runs the scheduler over every active routine in one household. */
export async function materializeHousehold(
  db: Db,
  options: { householdId: string; now: Date; requestId: string },
): Promise<number> {
  const routines = await db
    .selectFrom('app.work_item as w')
    .innerJoin('app.recurrence_rule as r', (join) =>
      join.onRef('r.routine_id', '=', 'w.id').onRef('r.household_id', '=', 'w.household_id'),
    )
    .select('w.id')
    .where('w.household_id', '=', options.householdId)
    .where('w.type', '=', 'routine')
    .where('w.status', '!=', 'cancelled')
    .where('r.paused_at', 'is', null)
    .execute();
  let created = 0;
  for (const { id } of routines) {
    created += await materializeRoutine(db, { ...options, routineId: id });
  }
  return created;
}
