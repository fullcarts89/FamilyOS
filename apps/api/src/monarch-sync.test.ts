import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// The Monarch budget sync through the HTTP API: the sync key, what the scheduled task posts and
// reports, and the plans the adults send to Monarch.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 4 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// 11:30am on Wednesday Nov 25 in Los Angeles (the seeded households' zone).
const NOW = new Date('2026-11-25T19:30:00Z');

interface Change {
  id: string;
  month: string;
  category: string;
  monarchCategoryId: string;
  fromAmount: number | null;
  toAmount: number;
  applyToFuture: boolean;
  status: string;
  monarchAmount: number | null;
  attempts: number;
  lastFailure: string | null;
}
interface Month {
  month: string;
  source: string | null;
  categories: {
    category: string;
    type: string;
    monarchCategoryId: string | null;
    budgeted: number | null;
    actual: number | null;
  }[];
  groups: { group: string | null; budgeted: number; actual: number }[];
  totals: { budgeted: number; actual: number };
  income: { budgeted: number; actual: number } | null;
  unplanned: { actual: number; count: number };
  changes: Change[];
  sync: {
    connected: boolean;
    lastSyncedAt: string | null;
    nextSyncAround: { time: string; tomorrow: boolean } | null;
  };
}

const NOVEMBER = [
  {
    id: '101',
    name: 'Groceries',
    group: 'Food & Dining',
    type: 'expense',
    budgeted: 1300,
    actual: 875.79,
  },
  {
    id: '102',
    name: 'Restaurants & Bars',
    group: 'Food & Dining',
    type: 'expense',
    budgeted: 1500,
    actual: 734.03,
  },
  {
    id: '103',
    name: 'Home Improvement',
    group: 'Housing',
    type: 'expense',
    budgeted: 200,
    actual: 7239.91,
  },
  { id: '104', name: 'Cleaners', group: 'Housing', type: 'expense', budgeted: 0, actual: 400 },
  {
    id: '105',
    name: 'Entertainment & Recreation',
    group: 'Travel & Lifestyle',
    type: 'expense',
    budgeted: 700,
    actual: -237.4,
  },
  {
    id: '201',
    name: 'Paychecks',
    group: 'Income',
    type: 'income',
    budgeted: 23000,
    actual: 16253.52,
  },
  {
    id: '301',
    name: 'Credit Card Payment',
    group: 'Transfers',
    type: 'transfer',
    budgeted: 0,
    actual: -16827.46,
  },
];

describe.skipIf(!db)('Monarch sync', () => {
  const harness = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  const { request, tokenFor, app, logs } = harness;
  let h: SeededHousehold;
  let other: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;
  let key: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const sync = (path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
    app.request(`/sync/monarch${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${init.key ?? key}`,
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
  const json = async <T>(res: Response) => (await res.json()) as T;
  const month = async (m = '2026-11-01', token = owner) =>
    json<Month>(await request(`/households/${h.id}/budgets?month=${m}`, { token }));
  const plan = (body: Record<string, unknown>, token = adult) =>
    request(`/households/${h.id}/budgets/changes`, { method: 'POST', token, body });
  const report = (id: string, body: Record<string, unknown>) =>
    sync(`/changes/${id}`, { method: 'POST', body });

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Monarch Sync');
    other = await seedHousehold(requireDb(), 'Monarch Sync Other');
    [owner, adult, caregiver] = await Promise.all([
      tokenOf(h.owner),
      tokenOf(h.adult),
      tokenOf(h.caregiver),
    ]);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
    await db?.destroy();
  });

  describe('the sync key', () => {
    it('is made by an adult, shown once, and only its last four characters after', async () => {
      const res = await request(`/households/${h.id}/budgets/sync/key`, {
        method: 'POST',
        token: adult,
      });
      expect(res.status).toBe(201);
      const made = await json<{
        key: string;
        sync: { keyHint: string; createdByMemberId: string };
      }>(res);
      expect(made.key).toMatch(/^fos_sync_[A-Za-z0-9_-]{43}$/);
      expect(made.sync).toMatchObject({
        keyHint: made.key.slice(-4),
        createdByMemberId: h.adult.id,
      });
      key = made.key;
      const shown = await json<{ sync: Record<string, unknown> }>(
        await request(`/households/${h.id}/budgets/sync`, { token: owner }),
      );
      expect(JSON.stringify(shown)).not.toContain(key);
      expect(shown.sync).toMatchObject({ keyHint: key.slice(-4), lastSyncedAt: null });
      // Never in the logs.
      expect(JSON.stringify(logs)).not.toContain(key);
    });

    it('is not for caregivers', async () => {
      for (const [method, path] of [
        ['GET', '/budgets/sync'],
        ['POST', '/budgets/sync/key'],
        ['DELETE', '/budgets/sync/key'],
      ] as const) {
        const res = await request(`/households/${h.id}${path}`, { method, token: caregiver });
        expect({ path, status: res.status }).toEqual({ path, status: 403 });
      }
    });

    it('refuses no key, a wrong key, a user’s sign-in, and a key in the wrong shape', async () => {
      for (const auth of [
        undefined,
        `Bearer fos_sync_${'A'.repeat(43)}`,
        `Bearer ${owner}`,
        `Bearer ${key}x`,
        key,
      ]) {
        const res = await app.request('/sync/monarch/run', {
          headers: auth ? { authorization: auth } : {},
        });
        expect(res.status).toBe(401);
      }
    });
  });

  describe('a sync run', () => {
    it('asks for this month and has nothing waiting at first', async () => {
      const res = await sync('/run');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        timeZone: 'America/Los_Angeles',
        months: ['2026-11-01'],
        changes: [],
      });
    });

    it('posts a month: spending by group, income apart, transfers left out', async () => {
      const res = await sync('/budgets/2026-11-01', {
        method: 'PUT',
        body: { categories: NOVEMBER },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ month: '2026-11-01', categories: 7 });
      const view = await month();
      expect(view.source).toBe('monarch');
      expect(view.totals).toEqual({ budgeted: 3700, actual: 9012.33 });
      expect(view.income).toEqual({ budgeted: 23000, actual: 16253.52 });
      expect(view.unplanned).toEqual({ actual: 400, count: 1 });
      expect(view.groups.map((g) => g.group)).toEqual([
        'Food & Dining',
        'Housing',
        'Travel & Lifestyle',
      ]);
      expect(view.categories.find((c) => c.category === 'Groceries')).toMatchObject({
        type: 'expense',
        monarchCategoryId: '101',
        budgeted: 1300,
      });
      expect(view.sync).toEqual({
        connected: true,
        lastSyncedAt: NOW.toISOString(),
        nextSyncAround: { time: '12:00', tomorrow: false },
      });
    });

    it('refuses anything but the agreed fields, duplicates, a bad month, and an empty month', async () => {
      const bad: [string, unknown][] = [
        ['/budgets/2026-11-01', { categories: [{ ...NOVEMBER[0], transactions: [] }] }],
        ['/budgets/2026-11-01', { categories: NOVEMBER, accounts: [] }],
        ['/budgets/2026-11-01', { categories: [NOVEMBER[0], { ...NOVEMBER[0], id: '999' }] }],
        ['/budgets/2026-11-01', { categories: [{ ...NOVEMBER[0], type: 'savings' }] }],
        ['/budgets/2026-11-01', { categories: [{ ...NOVEMBER[0], id: 'not an id' }] }],
        ['/budgets/2026-11-01', { categories: [] }],
        ['/budgets/2026-13-01', { categories: NOVEMBER }],
      ];
      for (const [path, body] of bad) {
        const res = await sync(path, { method: 'PUT', body });
        expect(res.status).toBe(422);
      }
      // The month is as the good post left it.
      expect((await month()).categories).toHaveLength(7);
    });
  });

  describe('a plan sent to Monarch', () => {
    let first: Change;

    it('waits for the next sync, and a newer plan for the same category replaces it', async () => {
      const res = await plan({ month: '2026-11-01', monarchCategoryId: '101', amount: 1400 });
      expect(res.status).toBe(201);
      first = (await json<{ change: Change }>(res)).change;
      expect(first).toMatchObject({
        category: 'Groceries',
        fromAmount: 1300,
        toAmount: 1400,
        applyToFuture: false,
        status: 'waiting',
      });
      const second = await json<{ change: Change }>(
        await plan({ month: '2026-11-01', monarchCategoryId: '101', amount: 1450 }, owner),
      );
      const run = await json<{ months: string[]; changes: Change[] }>(await sync('/run'));
      expect(run.changes).toEqual([
        expect.objectContaining({ id: second.change.id, toAmount: 1450, fromAmount: 1300 }),
      ]);
      expect((await month()).changes).toEqual([
        expect.objectContaining({ id: second.change.id, status: 'waiting' }),
      ]);
      first = second.change;
    });

    it('is saved once Monarch confirms it, and the page shows the new plan', async () => {
      const res = await report(first.id, { outcome: 'saved' });
      expect(res.status).toBe(200);
      expect((await json<{ change: Change }>(res)).change.status).toBe('saved');
      const view = await month();
      expect(view.categories.find((c) => c.category === 'Groceries')?.budgeted).toBe(1450);
      expect(view.changes).toEqual([expect.objectContaining({ id: first.id, status: 'saved' })]);
      // Answered already: a second answer is refused.
      expect((await report(first.id, { outcome: 'saved' })).status).toBe(409);
      expect((await json<{ changes: Change[] }>(await sync('/run'))).changes).toEqual([]);
    });

    it('reports a conflict without overwriting, and an adult can put it away', async () => {
      const made = await json<{ change: Change }>(
        await plan({ month: '2026-11-01', monarchCategoryId: '102', amount: 1200 }),
      );
      const res = await report(made.change.id, { outcome: 'conflict', monarchAmount: 1350 });
      expect((await json<{ change: Change }>(res)).change).toMatchObject({
        status: 'conflict',
        monarchAmount: 1350,
      });
      expect((await month()).changes.find((c) => c.id === made.change.id)?.status).toBe('conflict');
      const dismissed = await request(`/households/${h.id}/budgets/changes/${made.change.id}`, {
        method: 'DELETE',
        token: owner,
      });
      expect(dismissed.status).toBe(204);
      expect((await month()).changes.find((c) => c.id === made.change.id)).toBeUndefined();
    });

    it('tries three times before it is marked failed', async () => {
      const made = await json<{ change: Change }>(
        await plan({ month: '2026-11-01', monarchCategoryId: '103', amount: 7500 }),
      );
      for (const attempts of [1, 2]) {
        const res = await report(made.change.id, { outcome: 'failed', reason: 'Monarch said no' });
        expect((await json<{ change: Change }>(res)).change).toMatchObject({
          status: 'waiting',
          attempts,
          lastFailure: 'Monarch said no',
        });
      }
      const last = await report(made.change.id, { outcome: 'failed', reason: 'Still no' });
      expect((await json<{ change: Change }>(last)).change).toMatchObject({
        status: 'failed',
        attempts: 3,
      });
    });

    it('adds a plan where there was none, and can set every later month too', async () => {
      await sync('/budgets/2026-12-01', { method: 'PUT', body: { categories: NOVEMBER } });
      const made = await json<{ change: Change }>(
        await plan({
          month: '2026-11-01',
          monarchCategoryId: '104',
          amount: 400,
          applyToFuture: true,
        }),
      );
      expect(made.change).toMatchObject({ fromAmount: 0, toAmount: 400, applyToFuture: true });
      await report(made.change.id, { outcome: 'saved' });
      for (const m of ['2026-11-01', '2026-12-01']) {
        expect((await month(m)).categories.find((c) => c.category === 'Cleaners')?.budgeted).toBe(
          400,
        );
      }
    });

    it('sends nothing when the plan is Monarch’s own, and refuses what it can’t send', async () => {
      const same = await plan({ month: '2026-11-01', monarchCategoryId: '105', amount: 700 });
      expect(same.status).toBe(200);
      expect(await same.json()).toEqual({ change: null });
      // Income, transfers and unknown categories aren't planned from here.
      for (const id of ['201', '301', '999']) {
        const res = await plan({ month: '2026-11-01', monarchCategoryId: id, amount: 10 });
        expect(res.status).toBe(404);
      }
      for (const body of [
        { month: '2026-11-01', monarchCategoryId: '101', amount: -5 },
        { month: '2026-11-01', monarchCategoryId: '101', amount: 10, note: 'x' },
        { month: 'November', monarchCategoryId: '101', amount: 10 },
      ]) {
        expect((await plan(body)).status).toBe(422);
      }
      expect(
        (await plan({ month: '2026-11-01', monarchCategoryId: '101', amount: 10 }, caregiver))
          .status,
      ).toBe(403);
    });
  });

  describe('isolation', () => {
    it('keeps a key to its own household', async () => {
      const theirs = await json<{ key: string }>(
        await request(`/households/${other.id}/budgets/sync/key`, {
          method: 'POST',
          token: await tokenOf(other.owner),
        }),
      );
      const waiting = await json<{ change: Change }>(
        await plan({ month: '2026-11-01', monarchCategoryId: '102', amount: 999 }),
      );
      // Their key can't see or answer our change, and its posts land in their household only.
      const run = await json<{ changes: Change[] }>(await sync('/run', { key: theirs.key }));
      expect(run.changes).toEqual([]);
      const answer = await sync(`/changes/${waiting.change.id}`, {
        method: 'POST',
        key: theirs.key,
        body: { outcome: 'saved' },
      });
      expect(answer.status).toBe(404);
      await sync('/budgets/2026-11-01', {
        method: 'PUT',
        key: theirs.key,
        body: { categories: [{ ...NOVEMBER[0], budgeted: 1 }] },
      });
      expect((await month()).categories.find((c) => c.category === 'Groceries')?.budgeted).toBe(
        1450,
      );
    });

    it('stops a key when a new one is made, or it is turned off, or its maker is no longer an adult', async () => {
      const replaced = await json<{ key: string }>(
        await request(`/households/${h.id}/budgets/sync/key`, { method: 'POST', token: adult }),
      );
      expect((await sync('/run')).status).toBe(401);
      expect((await sync('/run', { key: replaced.key })).status).toBe(200);
      // The adult who made it becomes a caregiver: the key stops; back to adult, it works again.
      const setRole = (role: 'adult' | 'caregiver') =>
        requireDb().updateTable('app.member').set({ role }).where('id', '=', h.adult.id).execute();
      await setRole('caregiver');
      expect((await sync('/run', { key: replaced.key })).status).toBe(401);
      await setRole('adult');
      expect((await sync('/run', { key: replaced.key })).status).toBe(200);
      const off = await request(`/households/${h.id}/budgets/sync/key`, {
        method: 'DELETE',
        token: owner,
      });
      expect(off.status).toBe(204);
      expect((await sync('/run', { key: replaced.key })).status).toBe(401);
      expect((await month()).sync.connected).toBe(false);
      // No sync: a plan would never reach Monarch.
      const res = await plan({ month: '2026-11-01', monarchCategoryId: '101', amount: 1 });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'sync_not_set_up' });
    });
  });
});
