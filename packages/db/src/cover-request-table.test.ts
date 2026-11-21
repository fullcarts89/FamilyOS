import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withNotifierContext, withRequestContext } from './context';
import { purgeHouseholds, seedEvent, seedHousehold, type SeededHousehold } from './testing';

// app.cover_request (P1-6): constraints and row-level security, as the API and the notifier.
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

describe.skipIf(!db)('cover requests table', () => {
  let h: SeededHousehold;
  let other: SeededHousehold;
  let care: string;
  let plain: string;
  let imported: string;
  const ids: Record<string, string> = {};

  const insert = (values: {
    event_id: string;
    occurrence_date: string;
    asked_member_id: string;
    asked_by_member_id?: string;
    household_id?: string;
  }) =>
    requireDb()
      .insertInto('app.cover_request')
      .values({ household_id: h.id, asked_by_member_id: h.owner.id, ...values })
      .returning('id')
      .executeTakeFirstOrThrow();

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Cover Table');
    other = await seedHousehold(requireDb(), 'Cover Table Other');
    const times = { startsAt: '2026-11-17T16:15:00Z', endsAt: '2026-11-17T16:35:00Z' };
    care = await seedEvent(requireDb(), h, {
      ...times,
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'drop_off',
    });
    plain = await seedEvent(requireDb(), h, { ...times, memberIds: [h.owner.id] });
    // An imported event of the owner's: adults only.
    const calendar = await requireDb()
      .insertInto('app.calendar_source')
      .values({
        household_id: h.id,
        member_id: h.owner.id,
        label: 'Work',
        url_ciphertext: Buffer.alloc(32, 1),
        url_nonce: Buffer.alloc(12, 2),
        url_hint: 'example.test/…',
        created_by_member_id: h.owner.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    imported = (
      await requireDb()
        .insertInto('app.event')
        .values({
          household_id: h.id,
          title: 'Standup',
          starts_at: times.startsAt,
          ends_at: times.endsAt,
          timezone: 'America/Los_Angeles',
          source_calendar_id: calendar.id,
          external_uid: 'u1',
          external_recurrence_id: 'single',
          created_by_member_id: h.owner.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    ids.care = (
      await insert({ event_id: care, occurrence_date: '2026-11-17', asked_member_id: h.adult.id })
    ).id;
    ids.plain = (
      await insert({ event_id: plain, occurrence_date: '2026-11-17', asked_member_id: h.adult.id })
    ).id;
    ids.imported = (
      await insert({
        event_id: imported,
        occurrence_date: '2026-11-17',
        asked_member_id: h.adult.id,
      })
    ).id;
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
    await db?.destroy();
  });

  it('keeps one pending request per occurrence, never to oneself, a child or a pet', async () => {
    await expect(
      insert({ event_id: care, occurrence_date: '2026-11-17', asked_member_id: h.caregiver.id }),
    ).rejects.toThrow(/cover_request_one_pending/);
    for (const asked of [h.child.id, h.pet.id]) {
      await expect(
        insert({ event_id: care, occurrence_date: '2026-11-18', asked_member_id: asked }),
      ).rejects.toThrow(/cover must be an adult/);
    }
    await expect(
      insert({ event_id: care, occurrence_date: '2026-11-18', asked_member_id: h.owner.id }),
    ).rejects.toThrow(/cover_request_not_self/);
    // Another household's members can't be named.
    await expect(
      insert({ event_id: care, occurrence_date: '2026-11-18', asked_member_id: other.adult.id }),
    ).rejects.toThrow();
  });

  it('shows requests exactly when their event is visible, inside one household', async () => {
    const seen = (household: SeededHousehold, member: SeededHousehold['owner']) =>
      withRequestContext(requireDb(), asMember(household, member), async (trx) =>
        (await trx.selectFrom('app.cover_request').select('id').execute()).map((r) => r.id).sort(),
      );
    expect(await seen(h, h.adult)).toEqual([ids.care, ids.plain, ids.imported].sort());
    // A caregiver sees the household's own events, never an adult's imported calendar.
    expect(await seen(h, h.caregiver)).toEqual([ids.care, ids.plain].sort());
    expect(await seen(other, other.owner)).toEqual([]);
  });

  it('lets the API update but never delete, and not move a request to another household', async () => {
    await withRequestContext(requireDb(), asMember(h, h.owner), async (trx) => {
      await expect(
        trx
          .deleteFrom('app.cover_request')
          .where('id', '=', ids.plain ?? '')
          .execute(),
      ).rejects.toThrow(/permission denied/);
    });
    await withRequestContext(requireDb(), asMember(other, other.owner), async (trx) => {
      const changed = await trx
        .updateTable('app.cover_request')
        .set({ status: 'cancelled', responded_at: new Date() })
        .where('id', '=', ids.plain ?? '')
        .executeTakeFirst();
      expect(changed.numUpdatedRows).toBe(0n);
    });
  });

  it('lets the notifier read requests about care events only, and only their IDs and dates', async () => {
    const rows = await withNotifierContext(requireDb(), h.id, (trx) =>
      trx.selectFrom('app.cover_request').select(['id', 'status', 'occurrence_date']).execute(),
    );
    expect(rows.map((r) => r.id)).toEqual([ids.care]);
    await expect(
      withNotifierContext(requireDb(), h.id, (trx) =>
        trx.selectFrom('app.cover_request').select('version').execute(),
      ),
    ).rejects.toThrow(/permission denied/);
    expect(
      await withNotifierContext(requireDb(), other.id, (trx) =>
        trx.selectFrom('app.cover_request').select('id').execute(),
      ),
    ).toEqual([]);
  });
});
