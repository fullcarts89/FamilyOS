import {
  backOn,
  isCalendarRule,
  isValidRule,
  planPayback,
  type AwayPeriod,
  type OccurrenceException,
} from '@familyos/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from './schema';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * Away periods that haven't ended before `from` (a local date), first day first. Works on the
 * API's, the scheduler's and the notifier's connections: every query names the household.
 */
export async function loadAwayPeriods(
  db: Db,
  householdId: string,
  from: string,
): Promise<AwayPeriod[]> {
  const rows = await db
    .selectFrom('app.away_period')
    .select([
      'id',
      'member_id as memberId',
      'starts_on as startsOn',
      'ends_on as endsOn',
      'cover_member_id as coverMemberId',
    ])
    .where('household_id', '=', householdId)
    .where((eb) => eb.or([eb('ends_on', 'is', null), eb('ends_on', '>=', from)]))
    .orderBy('starts_on')
    .limit(500)
    .execute();
  return rows.map((r) => ({
    ...r,
    startsOn: String(r.startsOn),
    endsOn: r.endsOn === null ? null : String(r.endsOn),
  }));
}

/**
 * Gives the away member a later turn of the cover's in return for one the cover took (owner
 * decision 2026-11-24): an owner override on the cover's first turn after they're back. When
 * that turn already exists as a row, `updateRow` decides: the API moves it (if it's still open
 * and the cover's); the scheduler, which can't change rows, places no payback. Returns the
 * payback's index, or null when there's nothing to pay back yet (open-ended) or no such turn.
 */
export async function placePayback(
  db: Db,
  input: {
    householdId: string;
    ruleId: string;
    takenIndex: number;
    period: AwayPeriod;
    periods: readonly AwayPeriod[];
    /** The member making the change; null for the scheduler. */
    actorMemberId: string | null;
    updateRow:
      | ((row: { id: string; version: number; ownerMemberId: string | null }) => Promise<boolean>)
      | null;
  },
): Promise<number | null> {
  const { householdId, ruleId, period } = input;
  const cover = period.coverMemberId;
  if (cover === null) return null;
  const rule = await db
    .selectFrom('app.recurrence_rule')
    .select(['rule', 'start_on', 'rotation', 'routine_id'])
    .where('id', '=', ruleId)
    .where('household_id', '=', householdId)
    .executeTakeFirst();
  if (!rule || !isValidRule(rule.rule) || !isCalendarRule(rule.rule)) return null;
  const routine = await db
    .selectFrom('app.work_item')
    .select('owner_member_id')
    .where('id', '=', rule.routine_id)
    .where('household_id', '=', householdId)
    .executeTakeFirst();
  const exceptions: OccurrenceException[] = await db
    .selectFrom('app.occurrence_exception')
    .select(['occurrence_index as index', 'kind', 'owner_member_id as ownerMemberId'])
    .where('household_id', '=', householdId)
    .where('recurrence_rule_id', '=', ruleId)
    .execute();
  const payback = planPayback({
    rule: rule.rule,
    startOn: String(rule.start_on),
    assignment: { rotation: rule.rotation, ownerMemberId: routine?.owner_member_id ?? null },
    exceptions,
    takenIndex: input.takenIndex,
    awayMemberId: period.memberId,
    coverMemberId: cover,
    periods: input.periods,
    backOn: backOn(period),
  });
  if (!payback) return null;

  const row = await db
    .selectFrom('app.work_item')
    .select(['id', 'version', 'owner_member_id as ownerMemberId', 'status'])
    .where('household_id', '=', householdId)
    .where('recurrence_rule_id', '=', ruleId)
    .where('occurrence_index', '=', payback.index)
    .executeTakeFirst();
  if (row) {
    if (!input.updateRow) return null;
    const open = !['verified_complete', 'done_unverified', 'cancelled', 'new'].includes(row.status);
    if (!open || row.ownerMemberId !== cover) return null;
    if (!(await input.updateRow(row))) return null;
  }
  await db
    .insertInto('app.occurrence_exception')
    .values({
      household_id: householdId,
      recurrence_rule_id: ruleId,
      occurrence_index: payback.index,
      kind: 'owner',
      owner_member_id: payback.ownerMemberId,
      created_by_member_id: input.actorMemberId,
    })
    .onConflict((oc) =>
      oc.columns(['recurrence_rule_id', 'occurrence_index', 'kind']).doUpdateSet({
        owner_member_id: payback.ownerMemberId,
        created_by_member_id: input.actorMemberId,
      }),
    )
    .execute();
  return payback.index;
}
