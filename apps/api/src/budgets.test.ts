import { readFileSync } from 'node:fs';
import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Monarch budgets by CSV upload, through the HTTP API.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 4 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

const NOW = new Date('2026-11-16T15:00:00Z');
const fixture = (name: string) =>
  readFileSync(
    new URL(`../../../packages/domain/src/fixtures/budgets/${name}`, import.meta.url),
    'utf8',
  );

interface BudgetView {
  month: string;
  importedAt: string | null;
  source: 'csv' | 'monarch' | null;
  categories: {
    category: string;
    group: string | null;
    budgeted: number | null;
    actual: number | null;
    remaining: number | null;
  }[];
  groups: { group: string | null; budgeted: number; actual: number }[];
  totals: { budgeted: number; actual: number };
  availableMonths: string[];
}

describe.skipIf(!db)('budgets', () => {
  const harness = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  const { request, tokenFor, app, logs } = harness;
  let h: SeededHousehold;
  let owner: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const raw = (path: string, init: { body: string | FormData; type?: string; token?: string }) =>
    app.request(`/households/${h.id}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${init.token ?? owner}`,
        ...(init.type && { 'content-type': init.type }),
      },
      body: init.body,
    });
  const json = async <T>(res: Response) => (await res.json()) as T;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Budgets');
    owner = await tokenOf(h.owner);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('imports a Monarch export as multipart and shows the month', async () => {
    const form = new FormData();
    form.set('file', new File([fixture('monarch-long.csv')], 'budget.csv', { type: 'text/csv' }));
    const res = await raw('/budgets/import', { body: form });
    expect(res.status).toBe(201);
    const body = await json<{ months: string[]; imported: number; budget: BudgetView }>(res);
    expect(body).toMatchObject({ months: ['2026-10-01', '2026-11-01'], imported: 5 });
    expect(body.budget.month).toBe('2026-11-01');

    const view = await json<BudgetView>(
      await request(`/households/${h.id}/budgets`, { token: await tokenOf(h.adult) }),
    );
    expect(view.month).toBe('2026-11-01');
    expect(view.categories.find((c) => c.category === 'Restaurants')).toEqual({
      category: 'Restaurants',
      group: 'Food & Dining',
      type: 'expense',
      monarchCategoryId: null,
      budgeted: 250,
      actual: 312.4,
      remaining: -62.4,
    });
    expect(view.source).toBe('csv');
    expect(view.totals).toEqual({ budgeted: 3320, actual: 3069.56 });
    expect(view.groups.map((g) => g.group)).toEqual(['Childcare', 'Food & Dining', 'Pets']);
    expect(view.availableMonths).toEqual(['2026-11-01', '2026-10-01']);
  });

  it('takes JSON or raw CSV, with the month from the upload, and replaces that month', async () => {
    const res = await request(`/households/${h.id}/budgets/import`, {
      method: 'POST',
      token: owner,
      body: { csv: fixture('semicolon-no-month.csv'), month: '2026-11' },
    });
    expect(res.status).toBe(201);
    const view = await json<BudgetView>(
      await request(`/households/${h.id}/budgets?month=2026-11`, { token: owner }),
    );
    // November now holds the new file's categories only; October is untouched.
    expect(view.categories.map((c) => c.category)).toEqual(['Groceries', 'Kids "fun" money']);
    expect(view.availableMonths).toEqual(['2026-11-01', '2026-10-01']);

    const text = await raw('/budgets/import?month=2026-12', {
      body: fixture('monarch-wide.csv'),
      type: 'text/csv',
    });
    expect(text.status).toBe(201);
    expect((await json<{ months: string[] }>(text)).months).toEqual(['2026-10-01', '2026-11-01']);
  });

  it('keeps income and transfers out of spending', async () => {
    const res = await request(`/households/${h.id}/budgets/import`, {
      method: 'POST',
      token: owner,
      body: {
        csv: [
          'Month,Category Group,Category,Budgeted,Actual',
          '2027-02-01,Food & Dining,Groceries,500,420',
          '2027-02-01,Income,Paychecks,6000,5800',
          '2027-02-01,Transfers,Credit Card Payment,0,-1500',
        ].join('\n'),
      },
    });
    expect(res.status).toBe(201);
    const view = await json<BudgetView & { income: { budgeted: number; actual: number } | null }>(
      await request(`/households/${h.id}/budgets?month=2027-02`, { token: owner }),
    );
    expect(view.totals).toEqual({ budgeted: 500, actual: 420 });
    expect(view.income).toEqual({ budgeted: 6000, actual: 5800 });
    expect(view.groups.map((g) => g.group)).toEqual(['Food & Dining']);
  });

  it('explains a file it does not recognize and refuses transaction exports', async () => {
    const unknown = await raw('/budgets/import', {
      body: fixture('unrecognized.csv'),
      type: 'text/csv',
    });
    expect(unknown.status).toBe(422);
    const body = await json<{ error: string; expectedHeaders: Record<string, string[]> }>(unknown);
    expect(body.error).toBe('unrecognized_csv');
    expect(body.expectedHeaders.category).toContain('category');
    expect(body.expectedHeaders.budgeted).toContain('budgeted');
    expect(JSON.stringify(body)).not.toContain('foo');

    const transactions = await raw('/budgets/import', {
      body: fixture('transactions.csv'),
      type: 'text/csv',
    });
    expect(await json(transactions)).toEqual({ error: 'transactions_csv' });
    const missing = await raw('/budgets/import', {
      body: fixture('semicolon-no-month.csv'),
      type: 'text/csv',
    });
    expect(await json(missing)).toEqual({ error: 'month_missing' });
    expect((await raw('/budgets/import', { body: '{}', type: 'application/xml' })).status).toBe(
      422,
    );
    // Nothing from the refused files was stored.
    const rows = await requireDb()
      .selectFrom('app.budget_snapshot')
      .select('category')
      .where('household_id', '=', h.id)
      .execute();
    expect(rows.some((r) => r.category === 'foo' || r.category === 'bar')).toBe(false);
  });

  it('accepts up to 1 MB on this route only', async () => {
    const header = 'Month,Category,Budgeted,Actual\n';
    const big = header + 'x'.repeat(1024 * 1024 + 10);
    expect((await raw('/budgets/import', { body: big, type: 'text/csv' })).status).toBe(413);
    // Larger than any other route allows, but within the import's limit.
    const rows = Array.from(
      { length: 2000 },
      (_, i) => `2026-09,Household category number ${i} with a longer name,10,5`,
    ).join('\n');
    const ok = await raw('/budgets/import', { body: header + rows, type: 'text/csv' });
    expect(ok.status).toBe(201);
    expect((header + rows).length).toBeGreaterThan(64 * 1024);
    const elsewhere = await request(`/households/${h.id}/contacts`, {
      method: 'POST',
      token: owner,
      body: { name: 'x', notes: 'y'.repeat(70 * 1024) },
    });
    expect(elsewhere.status).toBe(413);
  });

  it('keeps budgets from caregivers, and audits imports without amounts or names', async () => {
    const caregiver = await tokenOf(h.caregiver);
    expect((await request(`/households/${h.id}/budgets`, { token: caregiver })).status).toBe(403);
    expect(
      (
        await raw('/budgets/import', {
          body: fixture('monarch-long.csv'),
          type: 'text/csv',
          token: caregiver,
        })
      ).status,
    ).toBe(403);
    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload'])
      .where('household_id', '=', h.id)
      .where('entity_type', '=', 'budget')
      .execute();
    expect(audit.map((a) => a.action)).toEqual([
      'budget.imported',
      'budget.imported',
      'budget.imported',
      'budget.imported',
      'budget.imported',
    ]);
    const text = JSON.stringify(audit) + logs.join('\n');
    for (const secret of ['Groceries', 'Restaurants', '842.17', 'Mortgage']) {
      expect(text).not.toContain(secret);
    }
  });
});
