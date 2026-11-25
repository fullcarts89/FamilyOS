import { BUDGET_CATEGORY_TYPES, MONARCH_PLAN_MAX_ATTEMPTS, monthsToSync } from '@familyos/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { recordAudit } from '../audit';
import type { AppEnv, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { monarchSyncScope } from '../http/middleware';
import { parseBody, uuidParam } from '../http/validation';
import { Amount, Month, MonarchCategoryId, changeView } from './budgets';

/** The largest month a sync posts, in bytes (a few hundred categories). */
export const SYNC_BUDGET_BODY_LIMIT = 256 * 1024;
export const SYNC_BUDGET_PATH = /^\/sync\/monarch\/budgets\/[^/]+$/;

const SyncCategory = z
  .object({
    id: MonarchCategoryId,
    name: z.string().trim().min(1).max(80),
    group: z.string().trim().min(1).max(80).nullable(),
    type: z.enum(BUDGET_CATEGORY_TYPES),
    budgeted: Amount.nullable(),
    actual: Amount.nullable(),
  })
  .strict();
const SyncBudget = z.object({ categories: z.array(SyncCategory).min(1).max(400) }).strict();

const Outcome = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('saved') }).strict(),
  z.object({ outcome: z.literal('conflict'), monarchAmount: Amount.nullable() }).strict(),
  z.object({ outcome: z.literal('failed'), reason: z.string().trim().min(1).max(200) }).strict(),
]);

/**
 * The Monarch sync's side of FamilyOS: a scheduled Claude task with the owner's Monarch
 * connector calls these with the household's sync key (`Authorization: Bearer fos_sync_…`).
 * FamilyOS never calls Monarch. Each run:
 *
 * 1. GET /sync/monarch/run: the months to post and the plan changes waiting for Monarch.
 * 2. For each change, the task checks Monarch's plan for that category and month, sets the new
 *    one if it still matches `fromAmount`, reads it back, and reports
 *    POST /sync/monarch/changes/:id `{outcome: saved | conflict | failed}`.
 * 3. PUT /sync/monarch/budgets/:month with every category Monarch reports for the month:
 *    Monarch's id, name, group, type, planned and actual. It replaces the month.
 *
 * Only those fields are accepted: anything else in a body (transactions, accounts, merchants) is
 * refused, not ignored.
 */
export function monarchSyncRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();
  app.use('*', monarchSyncScope(deps));

  app.get('/run', async (c) => {
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const waiting = await trx
      .selectFrom('app.budget_plan_change')
      .select([
        'id',
        'month',
        'category',
        'monarch_category_id',
        'from_amount',
        'to_amount',
        'apply_to_future',
        'attempts',
      ])
      .where('household_id', '=', householdId)
      .where('status', '=', 'waiting')
      .orderBy('requested_at')
      .execute();
    return c.json({
      timeZone: timezone,
      months: monthsToSync(
        now(),
        timezone,
        waiting.map((w) => w.month),
      ),
      changes: waiting.map((w) => ({
        id: w.id,
        month: w.month,
        category: w.category,
        monarchCategoryId: w.monarch_category_id,
        fromAmount: w.from_amount === null ? null : Number(w.from_amount),
        toAmount: Number(w.to_amount),
        applyToFuture: w.apply_to_future,
        attempts: w.attempts,
      })),
    });
  });

  app.put('/budgets/:month', async (c) => {
    const parsedMonth = Month.safeParse(c.req.param('month'));
    if (!parsedMonth.success) throw new ApiError(422, 'invalid_month');
    const month = parsedMonth.data;
    const { categories } = await parseBody(c.req.raw, SyncBudget);
    const names = new Set(categories.map((r) => r.name.toLowerCase()));
    const ids = new Set(categories.map((r) => r.id));
    if (names.size !== categories.length || ids.size !== categories.length) {
      throw new ApiError(422, 'duplicate_category');
    }
    const trx = c.get('trx');
    const member = c.get('member');
    const at = now();
    await trx
      .deleteFrom('app.budget_snapshot')
      .where('household_id', '=', member.householdId)
      .where('month', '=', month)
      .execute();
    await trx
      .insertInto('app.budget_snapshot')
      .values(
        categories.map((r) => ({
          household_id: member.householdId,
          month,
          category: r.name,
          category_group: r.group,
          category_type: r.type,
          monarch_category_id: r.id,
          source: 'monarch' as const,
          budgeted: r.budgeted,
          actual: r.actual,
          imported_at: at,
          imported_by_member_id: member.id,
        })),
      )
      .execute();
    await trx
      .updateTable('app.monarch_sync')
      .set({ last_synced_at: at })
      .where('id', '=', c.get('syncId'))
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'budget',
      entityId: member.householdId,
      action: 'budget.synced',
      payload: { month, categories: categories.length, via: 'monarch_sync' },
      requestId: c.get('requestId'),
    });
    return c.json({ month, categories: categories.length });
  });

  app.post('/changes/:changeId', async (c) => {
    const id = uuidParam(c.req.param('changeId'));
    const body = await parseBody(c.req.raw, Outcome);
    const trx = c.get('trx');
    const member = c.get('member');
    const change = await trx
      .selectFrom('app.budget_plan_change')
      .select([
        'id',
        'status',
        'month',
        'monarch_category_id',
        'to_amount',
        'apply_to_future',
        'attempts',
      ])
      .where('household_id', '=', member.householdId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!change) throw notFound();
    // Cancelled (or already answered) since the run began: leave it.
    if (change.status !== 'waiting') throw conflict('not_waiting');
    const at = now();
    const audit = (action: string, payload: Record<string, unknown> = {}) =>
      recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'budget',
        entityId: id,
        action,
        payload: { ...payload, via: 'monarch_sync' },
        requestId: c.get('requestId'),
      });
    if (body.outcome === 'saved') {
      await trx
        .updateTable('app.budget_plan_change')
        .set({ status: 'saved', resolved_at: at })
        .where('id', '=', id)
        .execute();
      // Monarch has it now: show it until the next sync posts the month again.
      await trx
        .updateTable('app.budget_snapshot')
        .set({ budgeted: change.to_amount })
        .where('household_id', '=', member.householdId)
        .where('monarch_category_id', '=', change.monarch_category_id)
        .where('month', change.apply_to_future ? '>=' : '=', change.month)
        .execute();
      await audit('budget.plan_saved');
    } else if (body.outcome === 'conflict') {
      await trx
        .updateTable('app.budget_plan_change')
        .set({ status: 'conflict', monarch_amount: body.monarchAmount, resolved_at: at })
        .where('id', '=', id)
        .execute();
      await audit('budget.plan_conflict');
    } else {
      const attempts = change.attempts + 1;
      const failed = attempts >= MONARCH_PLAN_MAX_ATTEMPTS;
      await trx
        .updateTable('app.budget_plan_change')
        .set({
          attempts,
          last_failure: body.reason,
          ...(failed && { status: 'failed' as const, resolved_at: at }),
        })
        .where('id', '=', id)
        .execute();
      await audit(failed ? 'budget.plan_failed' : 'budget.plan_refused', { attempts });
    }
    const row = await trx
      .selectFrom('app.budget_plan_change')
      .select([
        'id',
        'month',
        'category',
        'monarch_category_id',
        'from_amount',
        'to_amount',
        'apply_to_future',
        'status',
        'monarch_amount',
        'attempts',
        'last_failure',
        'requested_by_member_id',
        'requested_at',
        'resolved_at',
      ])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return c.json({ change: changeView(row) });
  });

  return app;
}
