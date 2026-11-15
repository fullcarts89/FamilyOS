import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext, withSchedulerContext } from './context';
import { purgeHouseholds, seedEvent, seedHousehold, type SeededHousehold } from './testing';

// Family Rhythm tables (pets, member identity, events): constraints and row-level security.
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

describe.skipIf(!db)('members: pets and identity', () => {
  let h: SeededHousehold;
  let other: SeededHousehold;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Identity');
    other = await seedHousehold(requireDb(), 'Identity Other');
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
  });

  it('gives each new member a distinct palette color', async () => {
    const rows = await requireDb()
      .selectFrom('app.member')
      .select(['role', 'color'])
      .where('household_id', '=', h.id)
      .orderBy('created_at')
      .execute();
    expect(rows.map((r) => r.color)).toEqual([
      '#D2553F',
      '#2F6FB3',
      '#D99A1C',
      '#6B8E5A',
      '#8A5FA8',
    ]);
  });

  it('keeps pets and children without accounts, and species for pets only', async () => {
    const insert = (role: 'pet' | 'child' | 'adult', userId: string | null, species?: string) =>
      requireDb()
        .insertInto('app.member')
        .values({
          household_id: h.id,
          user_id: userId,
          display_name: 'X',
          role,
          ...(species && { species }),
        })
        .execute();
    await expect(insert('pet', randomUUID())).rejects.toThrow(/member_account_matches_role/);
    await expect(insert('adult', null)).rejects.toThrow(/member_account_matches_role/);
    await expect(insert('child', null, 'Dog')).rejects.toThrow(/member_species_pets_only/);
    await expect(insert('pet', null, 'Cat')).resolves.toBeDefined();
  });

  it('accepts only #RRGGBB colors', async () => {
    await expect(
      requireDb()
        .updateTable('app.member')
        .set({ color: 'red' })
        .where('id', '=', h.pet.id)
        .execute(),
    ).rejects.toThrow(/color_check/);
  });

  it('lets a task be about a child or pet in the same household only', async () => {
    const insert = (subject: string) =>
      requireDb()
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title: 'about someone',
          created_by_member_id: h.owner.id,
          subject_member_id: subject,
        })
        .execute();
    await expect(insert(h.pet.id)).resolves.toBeDefined();
    await expect(insert(h.child.id)).resolves.toBeDefined();
    await expect(insert(h.adult.id)).rejects.toThrow(/subject must be a child or pet/);
    // Another household's pet fails the subject check (and the composite key behind it).
    await expect(insert(other.pet.id)).rejects.toThrow();
  });
});

describe.skipIf(!db)('events: row-level security', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;
  let aEvent: string;
  let bEvent: string;

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Events Alpha');
    b = await seedHousehold(requireDb(), 'Events Beta');
    aEvent = await seedEvent(requireDb(), a, {
      startsAt: '2026-11-19T16:15:00Z',
      endsAt: '2026-11-19T16:35:00Z',
      memberIds: [a.adult.id, a.child.id],
      careMemberId: a.child.id,
      careAction: 'drop_off',
      carePlace: 'Little Oaks',
    });
    bEvent = await seedEvent(requireDb(), b, {
      startsAt: '2026-11-19T16:15:00Z',
      endsAt: '2026-11-19T16:35:00Z',
      memberIds: [b.adult.id],
    });
    for (const [h, eventId] of [
      [a, aEvent],
      [b, bEvent],
    ] as const) {
      await requireDb()
        .insertInto('app.event_exception')
        .values({
          household_id: h.id,
          event_id: eventId,
          occurrence_date: '2026-11-19',
          kind: 'cover',
          cover_member_id: h.owner.id,
          created_by_member_id: h.owner.id,
        })
        .execute();
    }
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
    await db?.destroy();
  });

  const visible = (ctx: ReturnType<typeof asMember>) =>
    withRequestContext(requireDb(), ctx, async (trx) => ({
      events: (await trx.selectFrom('app.event').select('id').execute()).map((r) => r.id),
      members: (await trx.selectFrom('app.event_member').select('event_id').execute()).length,
      exceptions: (await trx.selectFrom('app.event_exception').select('event_id').execute()).length,
    }));

  it("shows a member only their own household's events, members and exceptions", async () => {
    expect(await visible(asMember(a, a.adult))).toEqual({
      events: [aEvent],
      members: 2,
      exceptions: 1,
    });
    // Naming another household in the request context shows nothing at all.
    expect(
      await visible({ userId: a.owner.userId ?? '', householdId: b.id, memberId: a.owner.id }),
    ).toEqual({ events: [], members: 0, exceptions: 0 });
  });

  it('rejects writes into another household', async () => {
    const ctx = asMember(a, a.owner);
    await expect(
      withRequestContext(requireDb(), ctx, (trx) =>
        trx
          .insertInto('app.event')
          .values({
            household_id: b.id,
            title: 'intrusion',
            starts_at: '2026-11-19T16:00:00Z',
            ends_at: '2026-11-19T17:00:00Z',
            timezone: 'UTC',
            created_by_member_id: a.owner.id,
          })
          .execute(),
      ),
    ).rejects.toThrow();
    await expect(
      withRequestContext(requireDb(), ctx, (trx) =>
        trx
          .insertInto('app.event_member')
          .values({ household_id: b.id, event_id: bEvent, member_id: b.owner.id })
          .execute(),
      ),
    ).rejects.toThrow();
    const result = await withRequestContext(requireDb(), ctx, async (trx) => ({
      updated: (
        await trx
          .updateTable('app.event')
          .set({ title: 'tampered' })
          .where('id', '=', bEvent)
          .executeTakeFirst()
      ).numUpdatedRows,
      deleted: (
        await trx
          .deleteFrom('app.event_exception')
          .where('event_id', '=', bEvent)
          .executeTakeFirst()
      ).numDeletedRows,
    }));
    expect(result).toEqual({ updated: 0n, deleted: 0n });
    await expect(
      withRequestContext(requireDb(), ctx, (trx) =>
        trx.updateTable('app.event').set({ household_id: b.id }).where('id', '=', aEvent).execute(),
      ),
    ).rejects.toThrow();
  });

  it('keeps references inside the household', async () => {
    // Composite keys: another household's member can't attend, be cared for or cover.
    await expect(
      requireDb()
        .insertInto('app.event_member')
        .values({ household_id: a.id, event_id: aEvent, member_id: b.adult.id })
        .execute(),
    ).rejects.toThrow(/foreign key/);
    await expect(
      requireDb()
        .insertInto('app.event_member')
        .values({ household_id: a.id, event_id: bEvent, member_id: a.adult.id })
        .execute(),
    ).rejects.toThrow(/foreign key/);
  });

  it('cares only for children and pets, and covers only with adults', async () => {
    await expect(
      requireDb()
        .updateTable('app.event')
        .set({ care_member_id: a.adult.id })
        .where('id', '=', aEvent)
        .execute(),
    ).rejects.toThrow(/care member must be a child or pet/);
    await expect(
      requireDb()
        .updateTable('app.event')
        .set({ care_member_id: a.pet.id })
        .where('id', '=', aEvent)
        .execute(),
    ).resolves.toBeDefined();
    await expect(
      requireDb()
        .updateTable('app.event_exception')
        .set({ cover_member_id: a.child.id })
        .where('event_id', '=', aEvent)
        .execute(),
    ).rejects.toThrow(/cover must be an adult/);
    await expect(
      requireDb()
        .updateTable('app.event')
        .set({ care_member_id: null })
        .where('id', '=', aEvent)
        .execute(),
    ).rejects.toThrow(/event_care_needs_member/);
  });

  it('checks times and series rules', async () => {
    const insert = (values: Record<string, unknown>) =>
      sql`insert into app.event (household_id, title, starts_at, ends_at, timezone, created_by_member_id, recurrence, recurs_until)
          values (${a.id}::uuid, 'x', ${values.startsAt as string}::timestamptz, ${values.endsAt as string}::timestamptz, 'UTC',
                  ${a.owner.id}::uuid, ${(values.recurrence as string) ?? null}::jsonb, ${(values.until as string) ?? null}::date)`.execute(
        requireDb(),
      );
    await expect(
      insert({ startsAt: '2026-11-19T17:00:00Z', endsAt: '2026-11-19T16:00:00Z' }),
    ).rejects.toThrow(/event_ends_after_start/);
    await expect(
      insert({
        startsAt: '2026-11-19T16:00:00Z',
        endsAt: '2026-11-19T17:00:00Z',
        recurrence: '{"freq":"after_completion","intervalDays":3}',
      }),
    ).rejects.toThrow(/recurrence_check/);
    await expect(
      insert({
        startsAt: '2026-11-19T16:00:00Z',
        endsAt: '2026-11-19T17:00:00Z',
        until: '2026-12-01',
      }),
    ).rejects.toThrow(/event_until_needs_rule/);
  });

  it('cuts off a removed member immediately', async () => {
    await requireDb()
      .updateTable('app.member')
      .set({ status: 'removed', removed_at: new Date() })
      .where('id', '=', a.caregiver.id)
      .execute();
    expect(await visible(asMember(a, a.caregiver))).toEqual({
      events: [],
      members: 0,
      exceptions: 0,
    });
  });

  it('gives the scheduler no access to events', async () => {
    for (const table of ['app.event', 'app.event_member', 'app.event_exception'] as const) {
      await expect(
        withSchedulerContext(requireDb(), a.id, (trx) =>
          trx.selectFrom(table).selectAll().execute(),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('accepts audit rows about events', async () => {
    await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx
        .insertInto('app.audit_event')
        .values({
          household_id: a.id,
          actor_member_id: a.owner.id,
          entity_type: 'event',
          entity_id: aEvent,
          action: 'event.test',
        })
        .execute(),
    );
  });
});
