import { createDb, materializeRoutine, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedHousehold,
  seedRoutine,
  type SeededHousehold,
} from '@familyos/db/testing';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HouseholdExportSchema } from './export-schema';
import { createTestApp } from './testing/harness';

// Rollback safety (P0-4). The Family Rhythm release adds pets: household members without
// accounts, like children. If production rolls back to this version after a pet exists, a pet
// must never own a task or take a routine turn, and the household must still export. The test
// database gets the newer release's pet role below, so this code meets the data it would meet.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 4 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Sunday 2026-11-08, 09:00 in Los Angeles (seeded households use America/Los_Angeles).
const NOW = new Date('2026-11-08T17:00:00Z');

/**
 * Only as much of the newer schema as a pet member needs (its migrations 20261115000100 and
 * 20261115000200): the 'pet' role, and pets, like children, without an account. Idempotent, and
 * a no-op on a database that already has the newer migrations. Changes nothing for other roles.
 */
async function allowPets(database: Kysely<Database>) {
  // On its own: a new enum value can't be used in the transaction that adds it.
  await sql`alter type app.member_role add value if not exists 'pet'`.execute(database);
  await sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'app.member'::regclass
          and conname = 'member_account_matches_role'
          and pg_get_constraintdef(oid) like '%pet%'
      ) then
        alter table app.member drop constraint if exists member_account_matches_role;
        alter table app.member add constraint member_account_matches_role
          check ((role in ('child', 'pet')) = (user_id is null));
      end if;
    end $$`.execute(database);
}

describe.skipIf(!db)('a pet left by a newer release (rollback safety)', () => {
  const { request, tokenFor } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let token: string;
  let petId: string;

  const base = () => `/households/${h.id}`;
  const json = async <T>(res: Response) => (await res.json()) as T;
  const post = (path: string, body: unknown) =>
    request(`${base()}${path}`, { method: 'POST', token, body });

  beforeAll(async () => {
    await allowPets(requireDb());
    h = await seedHousehold(requireDb(), 'Rollback pet');
    token = await tokenFor({ userId: h.owner.userId ?? '', email: `${h.owner.id}@example.test` });
    // What the newer release stores for a pet. Raw SQL: this version's types have no 'pet'.
    const pet = await sql<{ id: string }>`
      insert into app.member (household_id, display_name, role)
      values (${h.id}, 'Biscuit', 'pet')
      returning id`.execute(requireDb());
    petId = pet.rows[0]?.id ?? '';
    expect(petId).not.toBe('');
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('refuses a pet as a task owner', async () => {
    const created = await post('/work-items', {
      title: 'Walk the dog',
      ownerMemberId: petId,
      inbox: false,
    });
    expect(created.status).toBe(422);
    expect(await json(created)).toEqual({ error: 'invalid_owner' });

    const patched = await request(`${base()}/work-items/${h.sharedItemId}`, {
      method: 'PATCH',
      token,
      body: { expectedVersion: 1, ownerMemberId: petId },
    });
    expect(patched.status).toBe(422);
    expect(await json(patched)).toEqual({ error: 'invalid_owner' });

    const inboxItem = await post('/work-items', { title: 'Buy dog food' });
    expect(inboxItem.status).toBe(201);
    const { item } = await json<{ item: { id: string; version: number } }>(inboxItem);
    const accepted = await post(`/work-items/${item.id}/accept`, {
      expectedVersion: item.version,
      ownerMemberId: petId,
    });
    expect(accepted.status).toBe(422);

    const owners = await requireDb()
      .selectFrom('app.work_item')
      .select('id')
      .where('household_id', '=', h.id)
      .where('owner_member_id', '=', petId)
      .execute();
    expect(owners).toEqual([]);
  });

  it('refuses a pet as a routine owner, in a rotation, or in a swap', async () => {
    const ok = {
      title: 'Take out the trash',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
    };
    expect((await post('/routines', { ...ok, ownerMemberId: petId })).status).toBe(422);
    expect((await post('/routines', { ...ok, rotation: [h.owner.id, petId] })).status).toBe(422);

    const created = await post('/routines', { ...ok, rotation: [h.owner.id, h.adult.id] });
    expect(created.status).toBe(201);
    const { routine } = await json<{ routine: { id: string; version: number } }>(created);
    const patched = await request(`${base()}/routines/${routine.id}`, {
      method: 'PATCH',
      token,
      body: { expectedVersion: routine.version, rotation: [h.owner.id, petId] },
    });
    expect(patched.status).toBe(422);
    const swapped = await post(`/routines/${routine.id}/occurrences/0/swap`, {
      expectedVersion: routine.version,
      withMemberId: petId,
    });
    expect(swapped.status).toBe(422);
  });

  it('never gives a pet a turn, even if stored data names one', async () => {
    const rotation = await seedRoutine(requireDb(), h, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-06',
      rotation: [h.owner.id, petId],
    });
    const fixed = await seedRoutine(requireDb(), h, {
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-08',
      ownerMemberId: petId,
    });
    for (const { routineId } of [rotation, fixed]) {
      await materializeRoutine(requireDb(), {
        householdId: h.id,
        routineId,
        now: NOW,
        requestId: 'test',
      });
    }
    const owners = async (ruleId: string) =>
      (
        await requireDb()
          .selectFrom('app.work_item')
          .select('owner_member_id as owner')
          .where('recurrence_rule_id', '=', ruleId)
          .orderBy('occurrence_index')
          .execute()
      ).map((o) => o.owner);
    // The pet's turns are left unassigned, the way a removed member's are.
    expect(await owners(rotation.ruleId)).toEqual([h.owner.id, null, h.owner.id, null]);
    expect(await owners(fixed.ruleId)).toEqual([null, null]);
  });

  it('still exports the household, with the pet as stored', async () => {
    const res = await request(`${base()}/export`, { token });
    expect(res.status).toBe(200);
    const parsed = HouseholdExportSchema.parse(await res.json());
    expect(parsed.members.find((m) => m.id === petId)?.role).toBe('pet');
  });
});
