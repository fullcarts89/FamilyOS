import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext } from './context';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from './testing';

// Monarch budget sync (supabase/migrations/20261125000100_monarch_sync.sql): the sync key, plan
// changes and the new budget fields, under row-level security as the API.
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 4 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

const asMember = (h: SeededHousehold, member: SeededHousehold['owner']) => ({
  userId: member.userId ?? randomUUID(),
  householdId: h.id,
  memberId: member.id,
});
const hash = (key: string) => createHash('sha256').update(key).digest();

describe.skipIf(!db)('Monarch sync tables', () => {
  let h: SeededHousehold;
  let other: SeededHousehold;
  const key = `fos_sync_${randomUUID()}`;

  const lookup = (k: string) =>
    withRequestContext(
      requireDb(),
      { userId: randomUUID() },
      async (trx) =>
        (
          await sql<{
            sync_id: string;
            household_id: string;
            member_id: string;
            user_id: string;
          }>`select * from app.monarch_sync_for_key(${hash(k)})`.execute(trx)
        ).rows,
    );

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Monarch Sync Table');
    other = await seedHousehold(requireDb(), 'Monarch Sync Table Other');
    await withRequestContext(requireDb(), asMember(h, h.adult), async (trx) => {
      await trx
        .insertInto('app.monarch_sync')
        .values({
          household_id: h.id,
          key_hash: hash(key),
          key_hint: key.slice(-4),
          created_by_member_id: h.adult.id,
        })
        .execute();
      await trx
        .insertInto('app.budget_plan_change')
        .values({
          household_id: h.id,
          month: '2026-11-01',
          category: 'Groceries',
          monarch_category_id: '1234567890',
          from_amount: 1300,
          to_amount: 1400,
          requested_by_member_id: h.adult.id,
        })
        .execute();
    });
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
    await db?.destroy();
  });

  it('finds a live key by its hash, as the adult who made it', async () => {
    expect(await lookup(key)).toEqual([
      {
        sync_id: expect.any(String),
        household_id: h.id,
        member_id: h.adult.id,
        user_id: h.adult.userId,
      },
    ]);
    expect(await lookup(`${key}x`)).toEqual([]);
  });

  it('never lets the API read a key’s hash back', async () => {
    await expect(
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        sql`select key_hash from app.monarch_sync`.execute(trx),
      ),
    ).rejects.toThrow(/permission denied/);
    const hint = await withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
      trx.selectFrom('app.monarch_sync').select(['key_hint', 'created_by_member_id']).execute(),
    );
    expect(hint).toEqual([{ key_hint: key.slice(-4), created_by_member_id: h.adult.id }]);
  });

  it('keeps one live key per household', async () => {
    await expect(
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        trx
          .insertInto('app.monarch_sync')
          .values({
            household_id: h.id,
            key_hash: hash('another'),
            key_hint: 'ther',
            created_by_member_id: h.owner.id,
          })
          .execute(),
      ),
    ).rejects.toThrow(/monarch_sync_one_live/);
  });

  it('shows keys and plan changes to the household’s adults only', async () => {
    const seen = (as: ReturnType<typeof asMember>) =>
      withRequestContext(requireDb(), as, async (trx) => [
        (await trx.selectFrom('app.monarch_sync').select('id').execute()).length,
        (await trx.selectFrom('app.budget_plan_change').select('id').execute()).length,
      ]);
    expect(await seen(asMember(h, h.owner))).toEqual([1, 1]);
    expect(await seen(asMember(h, h.caregiver))).toEqual([0, 0]);
    expect(await seen(asMember(other, other.owner))).toEqual([0, 0]);
    // Another household's owner naming this household gets nothing either.
    expect(
      await seen({ userId: other.owner.userId ?? '', householdId: h.id, memberId: other.owner.id }),
    ).toEqual([0, 0]);
  });

  it('keeps one waiting change per category and month, and resolves the rest with a time', async () => {
    const change = (status?: 'waiting') =>
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        trx
          .insertInto('app.budget_plan_change')
          .values({
            household_id: h.id,
            month: '2026-11-01',
            category: 'Groceries',
            monarch_category_id: '1234567890',
            from_amount: 1300,
            to_amount: 1500,
            requested_by_member_id: h.owner.id,
            ...(status && { status }),
          })
          .execute(),
      );
    await expect(change()).rejects.toThrow(/budget_plan_change_one_waiting/);
    await expect(
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        trx
          .updateTable('app.budget_plan_change')
          .set({ status: 'saved' })
          .where('household_id', '=', h.id)
          .execute(),
      ),
    ).rejects.toThrow(/budget_plan_change_resolved/);
  });

  it('stops a key working once its maker is no longer an active adult, or it is revoked', async () => {
    await requireDb()
      .updateTable('app.member')
      .set({ role: 'caregiver' })
      .where('id', '=', h.adult.id)
      .execute();
    expect(await lookup(key)).toEqual([]);
    await requireDb()
      .updateTable('app.member')
      .set({ role: 'adult' })
      .where('id', '=', h.adult.id)
      .execute();
    expect(await lookup(key)).toHaveLength(1);
    await withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
      trx
        .updateTable('app.monarch_sync')
        .set({ revoked_at: new Date(), revoked_by_member_id: h.owner.id })
        .where('household_id', '=', h.id)
        .execute(),
    );
    expect(await lookup(key)).toEqual([]);
  });

  it('stores a budget row’s type, Monarch id and source', async () => {
    await withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
      trx
        .insertInto('app.budget_snapshot')
        .values({
          household_id: h.id,
          month: '2026-11-01',
          category: 'Paychecks',
          category_group: 'Income',
          budgeted: 100,
          actual: 90,
          imported_by_member_id: h.owner.id,
          category_type: 'income',
          monarch_category_id: '987',
          source: 'monarch',
        })
        .execute(),
    );
    await expect(
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        trx
          .insertInto('app.budget_snapshot')
          .values({
            household_id: h.id,
            month: '2026-11-01',
            category: 'Odd',
            category_group: null,
            budgeted: 1,
            actual: 1,
            imported_by_member_id: h.owner.id,
            monarch_category_id: 'not an id!',
          })
          .execute(),
      ),
    ).rejects.toThrow(/monarch_category_id_check/);
  });
});
