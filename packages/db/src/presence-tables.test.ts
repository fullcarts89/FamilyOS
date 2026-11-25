import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withNotifierContext, withRequestContext, withSchedulerContext } from './context';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from './testing';

// Who's in town (docs/plan/whos-in-town.md): the tables' rules and row-level security, as the
// API, the scheduler and the notifier.
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

describe.skipIf(!db)('who’s in town tables', () => {
  let h: SeededHousehold;
  let other: SeededHousehold;
  let period: string;

  const away = (values: {
    member_id: string;
    starts_on: string;
    ends_on: string | null;
    cover_member_id?: string | null;
  }) =>
    requireDb()
      .insertInto('app.away_period')
      .values({ household_id: h.id, created_by_member_id: h.owner.id, ...values })
      .returning('id')
      .executeTakeFirstOrThrow();

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'In Town Table');
    other = await seedHousehold(requireDb(), 'In Town Table Other');
    period = (
      await away({
        member_id: h.adult.id,
        starts_on: '2026-12-01',
        ends_on: '2026-12-04',
        cover_member_id: h.owner.id,
      })
    ).id;
    await requireDb()
      .insertInto('app.visitor')
      .values({
        household_id: h.id,
        name: 'Grandma',
        arrives_on: '2026-12-10',
        leaves_on: '2026-12-12',
        created_by_member_id: h.owner.id,
      })
      .execute();
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
    await db?.destroy();
  });

  it('refuses overlapping periods, a child or caregiver as cover, and backwards dates', async () => {
    await expect(
      away({ member_id: h.adult.id, starts_on: '2026-12-04', ends_on: null }),
    ).rejects.toThrow(/overlap/);
    await expect(
      away({
        member_id: h.owner.id,
        starts_on: '2026-12-01',
        ends_on: null,
        cover_member_id: h.child.id,
      }),
    ).rejects.toThrow(/cover must be an adult/);
    await expect(
      away({
        member_id: h.owner.id,
        starts_on: '2026-12-01',
        ends_on: null,
        cover_member_id: h.caregiver.id,
      }),
    ).rejects.toThrow(/cover must be an adult/);
    await expect(
      away({ member_id: h.owner.id, starts_on: '2026-12-04', ends_on: '2026-12-01' }),
    ).rejects.toThrow(/away_period_dates/);
    // The day after the last day is free.
    const next = await away({ member_id: h.adult.id, starts_on: '2026-12-05', ends_on: null });
    await requireDb().deleteFrom('app.away_period').where('id', '=', next.id).execute();
  });

  it('keeps each household’s away periods and visitors to itself', async () => {
    const mine = await withRequestContext(requireDb(), asMember(h, h.caregiver), async (trx) => [
      await trx.selectFrom('app.away_period').select('id').execute(),
      await trx.selectFrom('app.visitor').select('name').execute(),
    ]);
    expect(mine[0]).toHaveLength(1);
    expect(mine[1]).toEqual([{ name: 'Grandma' }]);
    const theirs = await withRequestContext(
      requireDb(),
      asMember(other, other.owner),
      async (trx) => [
        await trx.selectFrom('app.away_period').select('id').execute(),
        await trx.selectFrom('app.visitor').select('id').execute(),
      ],
    );
    expect(theirs).toEqual([[], []]);
  });

  it('shows a hand-over only to members who can see its item', async () => {
    // The fixture's private item is the owner's; a hand-over row about it (which the API never
    // writes) stays invisible to the adult.
    await requireDb()
      .insertInto('app.away_handover')
      .values({
        household_id: h.id,
        away_period_id: period,
        work_item_id: h.privateItemId,
        from_member_id: h.adult.id,
        to_member_id: h.owner.id,
        outcome: 'kept',
        created_by_member_id: h.owner.id,
      })
      .execute();
    const seen = (member: SeededHousehold['owner']) =>
      withRequestContext(requireDb(), asMember(h, member), (trx) =>
        trx.selectFrom('app.away_handover').select('work_item_id').execute(),
      );
    expect(await seen(h.owner)).toHaveLength(1);
    expect(await seen(h.adult)).toEqual([]);
  });

  it('lets the scheduler and the notifier read who’s away, but never visitors', async () => {
    const scheduler = await withSchedulerContext(requireDb(), h.id, (trx) =>
      trx.selectFrom('app.away_period').select(['member_id', 'cover_member_id']).execute(),
    );
    expect(scheduler).toEqual([{ member_id: h.adult.id, cover_member_id: h.owner.id }]);
    const notifier = await withNotifierContext(requireDb(), h.id, (trx) =>
      trx.selectFrom('app.away_period').select(['member_id']).execute(),
    );
    expect(notifier).toEqual([{ member_id: h.adult.id }]);
    await expect(
      withNotifierContext(requireDb(), h.id, (trx) =>
        trx.selectFrom('app.visitor').select('name').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    // Scoped to its household: the other one's rows don't show.
    const elsewhere = await withSchedulerContext(requireDb(), other.id, (trx) =>
      trx.selectFrom('app.away_period').select('id').execute(),
    );
    expect(elsewhere).toEqual([]);
  });
});
