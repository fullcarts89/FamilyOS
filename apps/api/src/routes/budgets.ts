import { BUDGET_CSV_HEADERS, BudgetCsvError, localDateOf, parseBudgetCsv } from '@familyos/domain';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError } from '../http/errors';

/** The largest budget export accepted, in bytes. */
export const MAX_BUDGET_CSV_BYTES = 1024 * 1024;
/** The import route's request size: the file plus room for a multipart envelope. */
export const BUDGET_IMPORT_BODY_LIMIT = MAX_BUDGET_CSV_BYTES + 16 * 1024;
export const BUDGET_IMPORT_PATH = /^\/households\/[^/]+\/budgets\/import$/;

const Month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/)
  .transform((m) => `${m.slice(0, 7)}-01`);
const JsonImport = z
  .object({ csv: z.string().min(1).max(MAX_BUDGET_CSV_BYTES), month: Month.optional() })
  .strict();

const money = (value: string | null) => (value === null ? null : Number(value));
const sum = (values: (number | null)[]) =>
  Math.round(values.reduce<number>((total, v) => total + (v ?? 0), 0) * 100) / 100;

/**
 * Monarch budgets by CSV upload (Monarch's terms forbid automated access by other apps).
 * POST /budgets/import takes the budget export as multipart (`file`, optional `month`), as a raw
 * text/csv body (`?month=` optional), or as JSON `{csv, month?}`, up to 1 MB. Only category-level
 * budgeted and actual amounts are kept; a transactions export is refused. A re-import replaces
 * the months it contains. Owners and adults only.
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
      .select(['category', 'category_group', 'budgeted', 'actual', 'imported_at'])
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
    const categories = rows.map((r) => {
      const budgeted = money(r.budgeted);
      const actual = money(r.actual);
      return {
        category: r.category,
        group: r.category_group,
        budgeted,
        actual,
        remaining: budgeted === null ? null : Math.round((budgeted - (actual ?? 0)) * 100) / 100,
      };
    });
    const groupNames = [...new Set(categories.map((r) => r.group))];
    return {
      month,
      importedAt:
        rows.length === 0
          ? null
          : new Date(Math.max(...rows.map((r) => new Date(r.imported_at).getTime()))).toISOString(),
      categories,
      groups: groupNames.map((group) => {
        const inGroup = categories.filter((r) => r.group === group);
        return {
          group,
          budgeted: sum(inGroup.map((r) => r.budgeted)),
          actual: sum(inGroup.map((r) => r.actual)),
        };
      }),
      totals: {
        budgeted: sum(categories.map((r) => r.budgeted)),
        actual: sum(categories.map((r) => r.actual)),
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

  return app;
}
