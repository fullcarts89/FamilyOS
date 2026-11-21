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

afterAll(async () => {
  await db?.destroy();
});

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

  it("never shows the scheduler members' own events or their exceptions", async () => {
    const seen = await withSchedulerContext(requireDb(), a.id, async (trx) => ({
      events: await trx.selectFrom('app.event').select('id').execute(),
      members: await trx.selectFrom('app.event_member').select('event_id').execute(),
      updated: (
        await trx
          .updateTable('app.event')
          .set({ title: 'x' })
          .where('id', '=', aEvent)
          .executeTakeFirst()
      ).numUpdatedRows,
      deleted: (await trx.deleteFrom('app.event').where('id', '=', aEvent).executeTakeFirst())
        .numDeletedRows,
    }));
    expect(seen).toEqual({ events: [], members: [], updated: 0n, deleted: 0n });
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx.selectFrom('app.event_exception').selectAll().execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    // It can't create an event that isn't from a calendar either.
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx
          .insertInto('app.event')
          .values({
            household_id: a.id,
            title: 'x',
            starts_at: '2026-11-19T16:00:00Z',
            ends_at: '2026-11-19T17:00:00Z',
            timezone: 'UTC',
            created_by_member_id: a.owner.id,
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
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

describe.skipIf(!db)('calendar sources: row-level security', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;
  const sources: Record<string, string> = {};

  const addSource = async (h: SeededHousehold) => {
    const row = await requireDb()
      .insertInto('app.calendar_source')
      .values({
        household_id: h.id,
        member_id: h.adult.id,
        label: `${h.name} work`,
        url_ciphertext: Buffer.alloc(40, 1),
        url_nonce: Buffer.alloc(12, 2),
        url_hint: 'calendar.example.test/…',
        created_by_member_id: h.adult.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await requireDb()
      .insertInto('app.event')
      .values({
        household_id: h.id,
        title: 'Imported',
        starts_at: '2026-11-19T16:00:00Z',
        ends_at: '2026-11-19T17:00:00Z',
        timezone: 'UTC',
        created_by_member_id: h.adult.id,
        source_calendar_id: row.id,
        external_uid: 'uid-1',
        external_recurrence_id: 'single',
      })
      .execute();
    return row.id;
  };

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Calendars Alpha');
    b = await seedHousehold(requireDb(), 'Calendars Beta');
    sources.a = await addSource(a);
    sources.b = await addSource(b);
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
  });

  it("shows members only their household's calendars", async () => {
    const ids = await withRequestContext(requireDb(), asMember(a, a.owner), async (trx) =>
      (await trx.selectFrom('app.calendar_source').select('id').execute()).map((r) => r.id),
    );
    expect(ids).toEqual([sources.a]);
    const updated = await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx
        .updateTable('app.calendar_source')
        .set({ label: 'x' })
        .where('id', '=', sources.b ?? '')
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(0n);
  });

  it('gives the scheduler the sync columns and imported events of one household only', async () => {
    const seen = await withSchedulerContext(requireDb(), a.id, async (trx) => ({
      sources: (await trx.selectFrom('app.calendar_source').select('id').execute()).map(
        (r) => r.id,
      ),
      events: (await trx.selectFrom('app.event').select('title').execute()).map((r) => r.title),
    }));
    expect(seen).toEqual({ sources: [sources.a], events: ['Imported'] });
    // Labels and hints are not the scheduler's to read; nor can it rename or re-point a source.
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx.selectFrom('app.calendar_source').select('label').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx.updateTable('app.calendar_source').set({ member_id: a.owner.id }).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    // Moving an imported event into another household fails the policy.
    await expect(
      withSchedulerContext(requireDb(), a.id, (trx) =>
        trx
          .insertInto('app.event')
          .values({
            household_id: b.id,
            title: 'x',
            starts_at: '2026-11-19T16:00:00Z',
            ends_at: '2026-11-19T17:00:00Z',
            timezone: 'UTC',
            created_by_member_id: b.adult.id,
            source_calendar_id: sources.b ?? '',
            external_uid: 'intrusion',
            external_recurrence_id: 'single',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('belongs to an adult, and keeps imported events simple', async () => {
    await expect(
      requireDb()
        .updateTable('app.calendar_source')
        .set({ member_id: a.child.id })
        .where('id', '=', sources.a ?? '')
        .execute(),
    ).rejects.toThrow(/a calendar belongs to an adult/);
    await expect(
      requireDb()
        .updateTable('app.event')
        .set({ external_uid: null })
        .where('source_calendar_id', '=', sources.a ?? '')
        .execute(),
    ).rejects.toThrow(/event_imported_keys/);
    await expect(
      requireDb()
        .updateTable('app.event')
        .set({ recurrence: { freq: 'daily', interval: 1 } })
        .where('source_calendar_id', '=', sources.a ?? '')
        .execute(),
    ).rejects.toThrow(/event_imported_shape/);
  });

  it('removes imported events with their calendar', async () => {
    await requireDb()
      .deleteFrom('app.calendar_source')
      .where('id', '=', sources.b ?? '')
      .execute();
    const left = await requireDb()
      .selectFrom('app.event')
      .select('id')
      .where('household_id', '=', b.id)
      .where('source_calendar_id', 'is not', null)
      .execute();
    expect(left).toEqual([]);
  });
});

describe.skipIf(!db)('member state and acknowledgments: own rows only', () => {
  let h: SeededHousehold;
  let other: SeededHousehold;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'State');
    other = await seedHousehold(requireDb(), 'State Other');
    for (const [house, member] of [
      [h, h.owner],
      [h, h.adult],
      [other, other.owner],
    ] as const) {
      await requireDb()
        .insertInto('app.member_state')
        .values({
          member_id: member.id,
          household_id: house.id,
          quiet_hours_start: null,
          quiet_hours_end: null,
          updated_at: new Date(),
        })
        .execute();
      await requireDb()
        .insertInto('app.member_acknowledgment')
        .values({
          member_id: member.id,
          household_id: house.id,
          key: 'milestone:x',
          acknowledged_at: new Date(),
        })
        .execute();
    }
  });
  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
  });

  it("shows a member only their own state, never their partner's or another household's", async () => {
    const seen = await withRequestContext(requireDb(), asMember(h, h.owner), async (trx) => ({
      states: (await trx.selectFrom('app.member_state').select('member_id').execute()).map(
        (r) => r.member_id,
      ),
      acks: (await trx.selectFrom('app.member_acknowledgment').select('member_id').execute()).map(
        (r) => r.member_id,
      ),
      updated: (
        await trx
          .updateTable('app.member_state')
          .set({ sound: true })
          .where('member_id', '=', h.adult.id)
          .executeTakeFirst()
      ).numUpdatedRows,
    }));
    expect(seen).toEqual({ states: [h.owner.id], acks: [h.owner.id], updated: 0n });
    await expect(
      withRequestContext(requireDb(), asMember(h, h.owner), (trx) =>
        trx
          .insertInto('app.member_acknowledgment')
          .values({
            member_id: h.adult.id,
            household_id: h.id,
            key: 'forged',
            acknowledged_at: new Date(),
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('validates notification switches and quiet hours', async () => {
    const update = (values: Record<string, unknown>) =>
      requireDb()
        .updateTable('app.member_state')
        .set(values)
        .where('member_id', '=', h.owner.id)
        .execute();
    await expect(update({ notifications: { marketing: true } })).rejects.toThrow(
      /notifications_check/,
    );
    await expect(update({ notifications: { morning_checkin: 'yes' } })).rejects.toThrow(
      /notifications_check/,
    );
    await expect(update({ quiet_hours_start: '22:00' })).rejects.toThrow(
      /member_state_quiet_hours/,
    );
    await expect(update({ notifications: { morning_checkin: false } })).resolves.toBeDefined();
    await expect(
      requireDb()
        .insertInto('app.member_acknowledgment')
        .values({
          member_id: h.owner.id,
          household_id: h.id,
          key: 'free text!',
          acknowledged_at: new Date(),
        })
        .execute(),
    ).rejects.toThrow(/key_check/);
  });
});
