import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext, withSchedulerContext } from './context';
import type { Database } from './schema';
import { purgeHouseholds, seedEvent, seedHousehold, type SeededHousehold } from './testing';

// Weekly Reset tables (contacts, decisions, meals, groceries, weekly plans, budgets) and the
// adults-only view of imported calendar events: constraints and row-level security.
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 4 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

afterAll(async () => {
  await db?.destroy();
});

const asMember = (h: SeededHousehold, member: SeededHousehold['owner']) => ({
  userId: member.userId ?? randomUUID(),
  householdId: h.id,
  memberId: member.id,
});

type Table =
  | 'app.contact'
  | 'app.decision'
  | 'app.decision_option'
  | 'app.decision_vote'
  | 'app.meal'
  | 'app.grocery_item'
  | 'app.weekly_plan'
  | 'app.budget_snapshot';
const TABLES: Table[] = [
  'app.contact',
  'app.decision',
  'app.decision_option',
  'app.decision_vote',
  'app.meal',
  'app.grocery_item',
  'app.weekly_plan',
  'app.budget_snapshot',
];
/** Sitters see contacts, meals and groceries; never decisions, plans or budgets. */
const CAREGIVER_VISIBLE: Table[] = ['app.contact', 'app.meal', 'app.grocery_item'];

describe.skipIf(!db)('Weekly Reset tables: row-level security', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;
  const ids: Record<string, Record<string, string>> = {};

  /** One row in every table, written on the privileged connection like an operator would. */
  const fill = async (h: SeededHousehold) => {
    const d = requireDb();
    const contact = await d
      .insertInto('app.contact')
      .values({
        household_id: h.id,
        name: `${h.name} vet`,
        category: 'pets',
        for_member_id: h.pet.id,
        created_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const decision = await d
      .insertInto('app.decision')
      .values({
        household_id: h.id,
        question: 'Which preschool?',
        created_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const option = await d
      .insertInto('app.decision_option')
      .values({ household_id: h.id, decision_id: decision.id, label: 'Little Oaks' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await d
      .insertInto('app.decision_vote')
      .values({
        household_id: h.id,
        decision_id: decision.id,
        member_id: h.adult.id,
        option_id: option.id,
        voted_at: new Date(),
      })
      .execute();
    const meal = await d
      .insertInto('app.meal')
      .values({
        household_id: h.id,
        on_date: '2026-11-16',
        title: 'Tacos',
        cook_member_id: h.adult.id,
        created_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const grocery = await d
      .insertInto('app.grocery_item')
      .values({
        household_id: h.id,
        name: 'Milk',
        aisle: 'dairy_eggs',
        added_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const plan = await d
      .insertInto('app.weekly_plan')
      .values({ household_id: h.id, week_start: '2026-11-16' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await d
      .insertInto('app.budget_snapshot')
      .values({
        household_id: h.id,
        month: '2026-11-01',
        category: 'Groceries',
        budgeted: 900,
        actual: '712.50',
        imported_by_member_id: h.owner.id,
      })
      .execute();
    ids[h.id] = {
      contact: contact.id,
      decision: decision.id,
      option: option.id,
      meal: meal.id,
      grocery: grocery.id,
      plan: plan.id,
    };
  };

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Reset Alpha');
    b = await seedHousehold(requireDb(), 'Reset Beta');
    await fill(a);
    await fill(b);
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
  });

  const counts = (ctx: ReturnType<typeof asMember>) =>
    withRequestContext(requireDb(), ctx, async (trx) => {
      const out: Partial<Record<Table, number>> = {};
      for (const table of TABLES) {
        out[table] = (await trx.selectFrom(table).select('household_id').execute()).length;
      }
      return out;
    });

  it("shows adults their own household's rows only", async () => {
    expect(await counts(asMember(a, a.adult))).toEqual(
      Object.fromEntries(TABLES.map((t) => [t, 1])),
    );
    // Naming another household in the request context shows nothing at all.
    expect(
      await counts({ userId: a.owner.userId ?? '', householdId: b.id, memberId: a.owner.id }),
    ).toEqual(Object.fromEntries(TABLES.map((t) => [t, 0])));
  });

  it('shows a caregiver contacts, meals and groceries, never decisions, plans or budgets', async () => {
    expect(await counts(asMember(a, a.caregiver))).toEqual(
      Object.fromEntries(TABLES.map((t) => [t, CAREGIVER_VISIBLE.includes(t) ? 1 : 0])),
    );
    await expect(
      withRequestContext(requireDb(), asMember(a, a.caregiver), (trx) =>
        trx
          .insertInto('app.budget_snapshot')
          .values({
            household_id: a.id,
            month: '2026-12-01',
            category: 'x',
            budgeted: 1,
            actual: 1,
            imported_by_member_id: a.caregiver.id,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('rejects writes into another household', async () => {
    const ctx = asMember(a, a.owner);
    const other = ids[b.id] ?? {};
    const inserts: [string, (trx: Transaction<Database>) => Promise<unknown>][] = [
      [
        'contact',
        (trx) =>
          trx
            .insertInto('app.contact')
            .values({ household_id: b.id, name: 'x', created_by_member_id: a.owner.id })
            .execute(),
      ],
      [
        'meal',
        (trx) =>
          trx
            .insertInto('app.meal')
            .values({
              household_id: b.id,
              on_date: '2026-11-17',
              title: 'x',
              created_by_member_id: a.owner.id,
            })
            .execute(),
      ],
      [
        'grocery',
        (trx) =>
          trx
            .insertInto('app.grocery_item')
            .values({ household_id: b.id, name: 'x', added_by_member_id: a.owner.id })
            .execute(),
      ],
      [
        'vote',
        (trx) =>
          trx
            .insertInto('app.decision_vote')
            .values({
              household_id: b.id,
              decision_id: other.decision ?? '',
              member_id: a.owner.id,
              option_id: other.option ?? '',
              voted_at: new Date(),
            })
            .execute(),
      ],
      [
        'plan',
        (trx) =>
          trx
            .insertInto('app.weekly_plan')
            .values({ household_id: b.id, week_start: '2026-11-23' })
            .execute(),
      ],
    ];
    for (const [, insert] of inserts) {
      await expect(withRequestContext(requireDb(), ctx, insert)).rejects.toThrow();
    }
    const changed = await withRequestContext(requireDb(), ctx, async (trx) => [
      (
        await trx
          .updateTable('app.contact')
          .set({ name: 'x' })
          .where('id', '=', other.contact ?? '')
          .executeTakeFirst()
      ).numUpdatedRows,
      (
        await trx
          .deleteFrom('app.meal')
          .where('id', '=', other.meal ?? '')
          .executeTakeFirst()
      ).numDeletedRows,
      (
        await trx
          .deleteFrom('app.decision')
          .where('id', '=', other.decision ?? '')
          .executeTakeFirst()
      ).numDeletedRows,
      (
        await trx
          .deleteFrom('app.budget_snapshot')
          .where('household_id', '=', b.id)
          .executeTakeFirst()
      ).numDeletedRows,
      (
        await trx
          .updateTable('app.weekly_plan')
          .set({ notes: 'x' })
          .where('id', '=', other.plan ?? '')
          .executeTakeFirst()
      ).numUpdatedRows,
    ]);
    expect(changed).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  it('lets each adult cast and change only their own vote', async () => {
    const mine = ids[a.id] ?? {};
    await expect(
      withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
        trx
          .insertInto('app.decision_vote')
          .values({
            household_id: a.id,
            decision_id: mine.decision ?? '',
            member_id: a.adult.id,
            option_id: mine.option ?? '',
            voted_at: new Date(),
          })
          .onConflict((oc) =>
            oc.columns(['decision_id', 'member_id']).doUpdateSet({ voted_at: new Date() }),
          )
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
    const removed = await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx.deleteFrom('app.decision_vote').where('member_id', '=', a.adult.id).executeTakeFirst(),
    );
    expect(removed.numDeletedRows).toBe(0n);
  });

  it('keeps references inside the household and roles where they belong', async () => {
    const d = requireDb();
    const mine = ids[a.id] ?? {};
    const other = ids[b.id] ?? {};
    // A vote for another decision's option, by a caregiver, or by another household's member.
    await expect(
      d
        .insertInto('app.decision_vote')
        .values({
          household_id: a.id,
          decision_id: mine.decision ?? '',
          member_id: a.owner.id,
          option_id: other.option ?? '',
          voted_at: new Date(),
        })
        .execute(),
    ).rejects.toThrow(/foreign key/);
    await expect(
      d
        .insertInto('app.decision_vote')
        .values({
          household_id: a.id,
          decision_id: mine.decision ?? '',
          member_id: a.caregiver.id,
          option_id: mine.option ?? '',
          voted_at: new Date(),
        })
        .execute(),
    ).rejects.toThrow(/only adults vote/);
    await expect(
      d
        .updateTable('app.meal')
        .set({ cook_member_id: a.child.id })
        .where('id', '=', mine.meal ?? '')
        .execute(),
    ).rejects.toThrow(/the cook must be an adult/);
    await expect(
      d
        .updateTable('app.meal')
        .set({ cook_member_id: b.adult.id })
        .where('id', '=', mine.meal ?? '')
        .execute(),
    ).rejects.toThrow();
    await expect(
      d
        .updateTable('app.contact')
        .set({ for_member_id: b.pet.id })
        .where('id', '=', mine.contact ?? '')
        .execute(),
    ).rejects.toThrow(/foreign key/);
    await expect(
      d
        .updateTable('app.work_item')
        .set({ contact_id: other.contact ?? '' })
        .where('id', '=', a.sharedItemId)
        .execute(),
    ).rejects.toThrow(/foreign key/);
    // A decided decision names one of its own options.
    await expect(
      d
        .updateTable('app.decision')
        .set({
          status: 'decided',
          decided_option_id: other.option ?? '',
          decided_at: new Date(),
          decided_via: 'call',
          decided_by_member_id: a.owner.id,
        })
        .where('id', '=', mine.decision ?? '')
        .execute(),
    ).rejects.toThrow(/foreign key/);
    await expect(
      d
        .updateTable('app.decision')
        .set({ status: 'decided' })
        .where('id', '=', mine.decision ?? '')
        .execute(),
    ).rejects.toThrow(/decision_decided_fields/);
  });

  it('checks shapes: one meal per slot, Monday weeks, first-of-month budgets, checked fields', async () => {
    const d = requireDb();
    await expect(
      d
        .insertInto('app.meal')
        .values({
          household_id: a.id,
          on_date: '2026-11-16',
          title: 'Again',
          created_by_member_id: a.owner.id,
        })
        .execute(),
    ).rejects.toThrow(/meal_household_id_on_date_slot_key/);
    await expect(
      d
        .insertInto('app.weekly_plan')
        .values({ household_id: a.id, week_start: '2026-11-17' })
        .execute(),
    ).rejects.toThrow(/week_start_check/);
    await expect(
      d
        .insertInto('app.budget_snapshot')
        .values({
          household_id: a.id,
          month: '2026-11-15',
          category: 'x',
          budgeted: 1,
          actual: 1,
          imported_by_member_id: a.owner.id,
        })
        .execute(),
    ).rejects.toThrow(/month_check/);
    await expect(
      d
        .updateTable('app.grocery_item')
        .set({ checked_at: new Date() })
        .where('id', '=', ids[a.id]?.grocery ?? '')
        .execute(),
    ).rejects.toThrow(/grocery_item_checked_fields/);
  });

  it('unlinks tasks from a contact that is removed', async () => {
    const d = requireDb();
    const contact = await d
      .insertInto('app.contact')
      .values({ household_id: a.id, name: 'Plumber', created_by_member_id: a.owner.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    await d
      .updateTable('app.work_item')
      .set({ contact_id: contact.id })
      .where('id', '=', a.privateItemId)
      .execute();
    await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx.deleteFrom('app.contact').where('id', '=', contact.id).execute(),
    );
    const item = await d
      .selectFrom('app.work_item')
      .select('contact_id')
      .where('id', '=', a.privateItemId)
      .executeTakeFirstOrThrow();
    expect(item.contact_id).toBeNull();
  });

  it('gives the scheduler none of these tables', async () => {
    for (const table of TABLES) {
      await expect(
        withSchedulerContext(requireDb(), a.id, (trx) =>
          trx.selectFrom(table).select('household_id').execute(),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe.skipIf(!db)('imported events: adults only', () => {
  let h: SeededHousehold;
  let ownEvent: string;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Imported Privacy');
    ownEvent = await seedEvent(requireDb(), h, {
      startsAt: '2026-11-19T16:15:00Z',
      endsAt: '2026-11-19T16:35:00Z',
      memberIds: [h.adult.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'drop_off',
    });
    const source = await requireDb()
      .insertInto('app.calendar_source')
      .values({
        household_id: h.id,
        member_id: h.adult.id,
        label: 'Work',
        url_ciphertext: Buffer.alloc(40, 1),
        url_nonce: Buffer.alloc(12, 2),
        url_hint: 'calendar.example.test/…',
        created_by_member_id: h.adult.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const imported = await requireDb()
      .insertInto('app.event')
      .values({
        household_id: h.id,
        title: 'Therapy',
        starts_at: '2026-11-19T18:00:00Z',
        ends_at: '2026-11-19T19:00:00Z',
        timezone: 'UTC',
        created_by_member_id: h.adult.id,
        source_calendar_id: source.id,
        external_uid: 'uid-1',
        external_recurrence_id: 'single',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await requireDb()
      .insertInto('app.event_member')
      .values({ household_id: h.id, event_id: imported.id, member_id: h.adult.id })
      .execute();
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
  });

  const seen = (member: SeededHousehold['owner']) =>
    withRequestContext(requireDb(), asMember(h, member), async (trx) => ({
      events: (
        await trx.selectFrom('app.event').select('title').orderBy('starts_at').execute()
      ).map((r) => r.title),
      attendance: (await trx.selectFrom('app.event_member').select('event_id').execute()).length,
      calendars: (await trx.selectFrom('app.calendar_source').select('id').execute()).length,
    }));

  it('shows adults both kinds of events, and caregivers only the household’s own', async () => {
    expect(await seen(h.owner)).toEqual({
      events: ['Imported Privacy event', 'Therapy'],
      attendance: 3,
      calendars: 1,
    });
    expect(await seen(h.caregiver)).toEqual({
      events: ['Imported Privacy event'],
      attendance: 2,
      calendars: 0,
    });
    const updated = await withRequestContext(requireDb(), asMember(h, h.caregiver), (trx) =>
      trx
        .updateTable('app.event')
        .set({ title: 'x' })
        .where('source_calendar_id', 'is not', null)
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(0n);
    expect(ownEvent).toBeTruthy();
  });
});
