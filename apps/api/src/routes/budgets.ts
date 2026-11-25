import { randomBytes } from 'node:crypto';
import type { Database } from '@familyos/db';
import {
  BUDGET_CSV_HEADERS,
  BudgetCsvError,
  MONARCH_SYNC_KEY_PREFIX,
  budgetTypeOfGroup,
  localDateOf,
  nextSyncAround,
  parseBudgetCsv,
} from '@familyos/domain';
import { Hono, type Context } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';
import { hashToken } from '../tokens';

/** The largest budget export accepted, in bytes. */
export const MAX_BUDGET_CSV_BYTES = 1024 * 1024;
/** The import route's request size: the file plus room for a multipart envelope. */
export const BUDGET_IMPORT_BODY_LIMIT = MAX_BUDGET_CSV_BYTES + 16 * 1024;
export const BUDGET_IMPORT_PATH = /^\/households\/[^/]+\/budgets\/import$/;

export const Month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/)
  .transform((m) => `${m.slice(0, 7)}-01`);
const JsonImport = z
  .object({ csv: z.string().min(1).max(MAX_BUDGET_CSV_BYTES), month: Month.optional() })
  .strict();

/** Monarch's id for a category: digits in practice; letters, `_` and `-` allowed. */
export const MonarchCategoryId = z.string().regex(/^[0-9A-Za-z_-]{1,64}$/);
/** Dollars, rounded to cents. */
export const Amount = z
  .number()
  .finite()
  .gt(-1e9)
  .lt(1e9)
  .transform((n) => Math.round(n * 100) / 100);

const NewPlanChange = z
  .object({
    month: Month,
    monarchCategoryId: MonarchCategoryId,
    amount: Amount.refine((n) => n >= 0 && n < 1e7),
    applyToFuture: z.boolean().optional(),
  })
  .strict();

const money = (value: string | null) => (value === null ? null : Number(value));
const sum = (values: (number | null)[]) =>
  Math.round(values.reduce<number>((total, v) => total + (v ?? 0), 0) * 100) / 100;
const round = (n: number) => Math.round(n * 100) / 100;

/** A saved plan change stays on the page for a day after Monarch confirmed it. */
const SAVED_SHOWN_FOR_MS = 24 * 60 * 60 * 1000;

const CHANGE_COLUMNS = [
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
] as const;

type ChangeRow = {
  id: string;
  month: string;
  category: string;
  monarch_category_id: string;
  from_amount: string | null;
  to_amount: string;
  apply_to_future: boolean;
  status: 'waiting' | 'saved' | 'conflict' | 'failed' | 'cancelled';
  monarch_amount: string | null;
  attempts: number;
  last_failure: string | null;
  requested_by_member_id: string;
  requested_at: Date;
  resolved_at: Date | null;
};

/** A plan change as the API shows it. */
export const changeView = (r: ChangeRow) => ({
  id: r.id,
  month: r.month,
  category: r.category,
  monarchCategoryId: r.monarch_category_id,
  fromAmount: money(r.from_amount),
  toAmount: Number(r.to_amount),
  applyToFuture: r.apply_to_future,
  status: r.status,
  monarchAmount: money(r.monarch_amount),
  attempts: r.attempts,
  lastFailure: r.last_failure,
  requestedByMemberId: r.requested_by_member_id,
  requestedAt: new Date(r.requested_at).toISOString(),
  resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
});

/** The household's live sync key, without its hash (which can't be read anyway). */
async function liveSync(trx: Transaction<Database>, householdId: string) {
  return trx
    .selectFrom('app.monarch_sync')
    .select([
      'id',
      'key_hint',
      'created_by_member_id',
      'created_at',
      'last_used_at',
      'last_synced_at',
    ])
    .where('household_id', '=', householdId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
}

const syncView = (row: Awaited<ReturnType<typeof liveSync>>) =>
  row
    ? {
        keyHint: row.key_hint,
        createdByMemberId: row.created_by_member_id,
        createdAt: new Date(row.created_at).toISOString(),
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
        lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      }
    : null;

/**
 * Monarch budgets, owners and adults only. Two ways in: the Monarch sync (routes/monarch-sync.ts),
 * a scheduled Claude task that posts the budget with the household's sync key; and a CSV upload,
 * the fallback. Only category-level planned and actual amounts are kept, never transactions.
 *
 * - GET /budgets?month= is the month: spending (expense categories) by group with its totals,
 *   income apart, transfers left out of both; the plan changes on their way to Monarch; and the
 *   sync's state.
 * - POST /budgets/import takes the budget export as multipart (`file`, optional `month`), as a raw
 *   text/csv body (`?month=` optional), or as JSON `{csv, month?}`, up to 1 MB. A transactions
 *   export is refused. A re-import replaces the months it contains.
 * - POST /budgets/changes sets a synced category's plan for a month (and optionally every later
 *   month); it waits for the next sync, which takes it to Monarch. DELETE /budgets/changes/:id
 *   cancels a waiting change, or puts away a conflict or failure.
 * - GET /budgets/sync, POST /budgets/sync/key (a new key, shown once; any live one stops working)
 *   and DELETE /budgets/sync/key manage the sync key.
 */
export function budgetRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  /** The file's text and any month the upload names, from whichever body shape was sent. */
  const readUpload = async (c: Context<AppEnv>) => {
    const type = (c.req.header('content-type') ?? '').toLowerCase();
    let csv: string;
    let month: string | undefined;
    const monthParam = (value: unknown) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Month.safeParse(value);
      if (!parsed.success) throw new ApiError(422, 'invalid_month');
      return parsed.data;
    };
    if (type.startsWith('multipart/form-data')) {
      let form: Record<string, unknown>;
      try {
        form = await c.req.parseBody();
      } catch {
        throw new ApiError(400, 'invalid_body');
      }
      const file = form.file;
      if (!(file instanceof File)) throw new ApiError(422, 'file_required');
      csv = await file.text();
      month = monthParam(form.month);
    } else if (type.startsWith('application/json')) {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        throw new ApiError(400, 'invalid_json');
      }
      const parsed = JsonImport.safeParse(raw);
      if (!parsed.success) throw new ApiError(422, 'invalid_body');
      csv = parsed.data.csv;
      month = parsed.data.month;
    } else if (type.startsWith('text/csv') || type.startsWith('text/plain')) {
      csv = await c.req.text();
      month = monthParam(c.req.query('month'));
    } else {
      throw new ApiError(422, 'unsupported_content_type');
    }
    if (Buffer.byteLength(csv, 'utf8') > MAX_BUDGET_CSV_BYTES) {
      throw new ApiError(413, 'body_too_large');
    }
    return { csv, month };
  };

  const monthView = async (c: Context<AppEnv>, month: string) => {
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const rows = await trx
      .selectFrom('app.budget_snapshot')
      .select([
        'category',
        'category_group',
        'category_type',
        'monarch_category_id',
        'source',
        'budgeted',
        'actual',
        'imported_at',
      ])
      .where('household_id', '=', householdId)
      .where('month', '=', month)
      .orderBy('category_group')
      .orderBy('category')
      .execute();
    const months = await trx
      .selectFrom('app.budget_snapshot')
      .select('month')
      .distinct()
      .where('household_id', '=', householdId)
      .orderBy('month', 'desc')
      .limit(36)
      .execute();
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const sync = await liveSync(trx, householdId);
    // The latest change per category this month, unless it was cancelled, or saved over a day ago.
    const changeRows = await trx
      .selectFrom('app.budget_plan_change')
      .select(CHANGE_COLUMNS)
      .where('household_id', '=', householdId)
      .where('month', '=', month)
      .orderBy('requested_at', 'desc')
      .execute();
    // Newest first; a change made in the same instant as the one it replaced wins.
    changeRows.sort(
      (a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime() ||
        Number(a.status === 'cancelled') - Number(b.status === 'cancelled'),
    );
    const seen = new Set<string>();
    const changes = changeRows
      .filter((r) => {
        if (seen.has(r.monarch_category_id)) return false;
        seen.add(r.monarch_category_id);
        if (r.status === 'cancelled') return false;
        return (
          r.status !== 'saved' ||
          now().getTime() - new Date(r.resolved_at ?? 0).getTime() < SAVED_SHOWN_FOR_MS
        );
      })
      .map(changeView);
    const categories = rows.map((r) => {
      const budgeted = money(r.budgeted);
      const actual = money(r.actual);
      return {
        category: r.category,
        group: r.category_group,
        type: r.category_type,
        monarchCategoryId: r.monarch_category_id,
        budgeted,
        actual,
        remaining: budgeted === null ? null : round(budgeted - (actual ?? 0)),
      };
    });
    const spending = categories.filter((r) => r.type === 'expense');
    const income = categories.filter((r) => r.type === 'income');
    const unplanned = spending.filter((r) => !r.budgeted && (r.actual ?? 0) !== 0);
    const groupNames = [...new Set(spending.map((r) => r.group))];
    const next = sync ? nextSyncAround(now(), timezone) : null;
    return {
      month,
      importedAt:
        rows.length === 0
          ? null
          : new Date(Math.max(...rows.map((r) => new Date(r.imported_at).getTime()))).toISOString(),
      source:
        rows.length === 0 ? null : rows.some((r) => r.source === 'monarch') ? 'monarch' : 'csv',
      categories,
      // Spending only: income is shown apart, and transfers aren't spending.
      groups: groupNames.map((group) => {
        const inGroup = spending.filter((r) => r.group === group);
        return {
          group,
          budgeted: sum(inGroup.map((r) => r.budgeted)),
          actual: sum(inGroup.map((r) => r.actual)),
        };
      }),
      totals: {
        budgeted: sum(spending.map((r) => r.budgeted)),
        actual: sum(spending.map((r) => r.actual)),
      },
      income:
        income.length === 0
          ? null
          : {
              budgeted: sum(income.map((r) => r.budgeted)),
              actual: sum(income.map((r) => r.actual)),
            },
      unplanned: { actual: sum(unplanned.map((r) => r.actual)), count: unplanned.length },
      changes,
      sync: {
        connected: !!sync,
        lastSyncedAt: syncView(sync)?.lastSyncedAt ?? null,
        nextSyncAround: next,
      },
      availableMonths: months.map((m) => m.month),
    };
  };

  app.get('/', async (c) => {
    authorize(c, 'budget.read');
    let month: string;
    const requested = c.req.query('month');
    if (requested !== undefined) {
      const parsed = Month.safeParse(requested);
      if (!parsed.success) throw new ApiError(422, 'invalid_month');
      month = parsed.data;
    } else {
      const { timezone } = await c
        .get('trx')
        .selectFrom('app.household')
        .select('timezone')
        .where('id', '=', c.get('member').householdId)
        .executeTakeFirstOrThrow();
      month = `${localDateOf(now(), timezone).slice(0, 7)}-01`;
    }
    return c.json(await monthView(c, month));
  });

  app.post('/import', async (c) => {
    authorize(c, 'budget.import');
    const { csv, month } = await readUpload(c);
    let rows;
    try {
      rows = parseBudgetCsv(csv, month ? { defaultMonth: month } : {});
    } catch (error) {
      if (!(error instanceof BudgetCsvError)) throw error;
      if (error.code === 'unrecognized_csv') {
        // Fixed alias lists, never anything from the file.
        return c.json({ error: error.code, expectedHeaders: BUDGET_CSV_HEADERS }, 422);
      }
      throw new ApiError(422, error.code);
    }
    const trx = c.get('trx');
    const member = c.get('member');
    const months = [...new Set(rows.map((r) => r.month))].sort();
    await trx
      .deleteFrom('app.budget_snapshot')
      .where('household_id', '=', member.householdId)
      .where('month', 'in', months)
      .execute();
    const importedAt = now();
    for (let i = 0; i < rows.length; i += 500) {
      await trx
        .insertInto('app.budget_snapshot')
        .values(
          rows.slice(i, i + 500).map((r) => ({
            household_id: member.householdId,
            month: r.month,
            category: r.category,
            category_group: r.group,
            category_type: budgetTypeOfGroup(r.group),
            source: 'csv' as const,
            budgeted: r.budgeted,
            actual: r.actual,
            imported_at: importedAt,
            imported_by_member_id: member.id,
          })),
        )
        .execute();
    }
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'budget',
      entityId: member.householdId,
      action: 'budget.imported',
      payload: { months, categories: rows.length },
      requestId: c.get('requestId'),
    });
    const latest = months.at(-1) ?? '';
    return c.json({ months, imported: rows.length, budget: await monthView(c, latest) }, 201);
  });

  app.post('/changes', async (c) => {
    authorize(c, 'budget.plan');
    const body = await parseBody(c.req.raw, NewPlanChange);
    const trx = c.get('trx');
    const member = c.get('member');
    // Without a sync, nothing would take the change to Monarch.
    if (!(await liveSync(trx, member.householdId))) throw conflict('sync_not_set_up');
    const row = await trx
      .selectFrom('app.budget_snapshot')
      .select(['category', 'budgeted', 'category_type'])
      .where('household_id', '=', member.householdId)
      .where('month', '=', body.month)
      .where('monarch_category_id', '=', body.monarchCategoryId)
      .executeTakeFirst();
    // Only spending categories Monarch has synced can be planned from here.
    if (!row || row.category_type !== 'expense') throw notFound();
    const at = now();
    // A new plan replaces one still waiting for the same category and month.
    const replaced = await trx
      .updateTable('app.budget_plan_change')
      .set({ status: 'cancelled', resolved_at: at, resolved_by_member_id: member.id })
      .where('household_id', '=', member.householdId)
      .where('month', '=', body.month)
      .where('monarch_category_id', '=', body.monarchCategoryId)
      .where('status', '=', 'waiting')
      .returning('id')
      .execute();
    for (const r of replaced) {
      await recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'budget',
        entityId: r.id,
        action: 'budget.plan_cancelled',
        payload: { replaced: true },
        requestId: c.get('requestId'),
      });
    }
    const current = money(row.budgeted);
    // Back to Monarch's own plan: nothing to send.
    if ((current ?? 0) === body.amount && !body.applyToFuture) {
      return c.json({ change: null });
    }
    const change = await trx
      .insertInto('app.budget_plan_change')
      .values({
        household_id: member.householdId,
        month: body.month,
        category: row.category,
        monarch_category_id: body.monarchCategoryId,
        from_amount: current,
        to_amount: body.amount,
        apply_to_future: body.applyToFuture ?? false,
        requested_by_member_id: member.id,
        requested_at: at,
      })
      .returning(CHANGE_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'budget',
      entityId: change.id,
      action: 'budget.plan_requested',
      payload: { month: body.month, applyToFuture: change.apply_to_future },
      requestId: c.get('requestId'),
    });
    return c.json({ change: changeView(change) }, 201);
  });

  app.delete('/changes/:changeId', async (c) => {
    authorize(c, 'budget.plan');
    const id = uuidParam(c.req.param('changeId'));
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .selectFrom('app.budget_plan_change')
      .select(['id', 'status'])
      .where('household_id', '=', member.householdId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound();
    if (!['waiting', 'conflict', 'failed'].includes(row.status)) throw conflict('not_open');
    await trx
      .updateTable('app.budget_plan_change')
      .set({ status: 'cancelled', resolved_at: now(), resolved_by_member_id: member.id })
      .where('id', '=', id)
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'budget',
      entityId: id,
      action: 'budget.plan_cancelled',
      payload: { from: row.status },
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  app.get('/sync', async (c) => {
    authorize(c, 'budget.sync_manage');
    return c.json({ sync: syncView(await liveSync(c.get('trx'), c.get('member').householdId)) });
  });

  app.post('/sync/key', async (c) => {
    authorize(c, 'budget.sync_manage');
    const trx = c.get('trx');
    const member = c.get('member');
    const revoked = await revokeLive(c);
    const key = `${MONARCH_SYNC_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const made = await trx
      .insertInto('app.monarch_sync')
      .values({
        household_id: member.householdId,
        key_hash: hashToken(key),
        key_hint: key.slice(-4),
        created_by_member_id: member.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'monarch_sync',
      entityId: made.id,
      action: 'monarch_sync.key_created',
      payload: { replaced: revoked !== null },
      requestId: c.get('requestId'),
    });
    // The key itself, this once: only its hash is kept.
    return c.json({ key, sync: syncView(await liveSync(trx, member.householdId)) }, 201);
  });

  app.delete('/sync/key', async (c) => {
    authorize(c, 'budget.sync_manage');
    if ((await revokeLive(c)) === null) throw notFound();
    return c.body(null, 204);
  });

  /** Turns off the live key, if there is one; its id, or null. */
  async function revokeLive(c: Context<AppEnv>): Promise<string | null> {
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .updateTable('app.monarch_sync')
      .set({ revoked_at: now(), revoked_by_member_id: member.id })
      .where('household_id', '=', member.householdId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!row) return null;
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'monarch_sync',
      entityId: row.id,
      action: 'monarch_sync.key_revoked',
      requestId: c.get('requestId'),
    });
    return row.id;
  }

  return app;
}
