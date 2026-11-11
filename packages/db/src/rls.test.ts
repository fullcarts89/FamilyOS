import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext } from './context';
import {
  hashToken,
  purgeHouseholds,
  seedHousehold,
  seedInvite,
  type SeededHousehold,
} from './testing';

// Row-level security, tested directly in Postgres (gate G1: T-01, T-02, T-05).
const url = process.env.DATABASE_URL;
const db = url ? createDb({ connectionString: url, maxConnections: 4 }) : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

describe.skipIf(!db)('row-level security', () => {
  let a: SeededHousehold;
  let b: SeededHousehold;

  const asMember = (h: SeededHousehold, member: SeededHousehold['owner']) => ({
    userId: member.userId ?? randomUUID(),
    householdId: h.id,
    memberId: member.id,
  });

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Alpha');
    b = await seedHousehold(requireDb(), 'Beta');
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [a.id, b.id]);
    await db?.destroy();
  });

  it('shows a member only their own household', async () => {
    const rows = await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx.selectFrom('app.household').select('id').execute(),
    );
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });

  it('returns nothing when the request names another household', async () => {
    // Alpha's owner asks for Beta's context: not a member there, so every table is empty.
    const ctx = { userId: a.owner.userId ?? '', householdId: b.id, memberId: a.owner.id };
    const counts = await withRequestContext(requireDb(), ctx, async (trx) => ({
      // Only their own household is listed (policy household_list_own); never the one named.
      households: (await trx.selectFrom('app.household').select('id').execute()).map((r) => r.id),
      members: (
        await trx.selectFrom('app.member').selectAll().where('household_id', '=', b.id).execute()
      ).length,
      items: (await trx.selectFrom('app.work_item').selectAll().execute()).length,
      audit: (await trx.selectFrom('app.audit_event').selectAll().execute()).length,
      invites: (await trx.selectFrom('app.invite').selectAll().execute()).length,
    }));
    expect(counts).toEqual({ households: [a.id], members: 0, items: 0, audit: 0, invites: 0 });
  });

  it('rejects writes into another household', async () => {
    await expect(
      withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
        trx
          .insertInto('app.work_item')
          .values({ household_id: b.id, title: 'intrusion', created_by_member_id: a.owner.id })
          .execute(),
      ),
    ).rejects.toThrow();

    const updated = await withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
      trx
        .updateTable('app.work_item')
        .set({ title: 'tampered' })
        .where('id', '=', b.sharedItemId)
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(0n);
  });

  it('cannot move an item into another household', async () => {
    await expect(
      withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
        trx
          .updateTable('app.work_item')
          .set({ household_id: b.id })
          .where('id', '=', a.sharedItemId)
          .execute(),
      ),
    ).rejects.toThrow();
  });

  it('hides private items from other members, but not from their creator', async () => {
    const visibleTo = async (member: SeededHousehold['owner']) =>
      withRequestContext(requireDb(), asMember(a, member), async (trx) =>
        (await trx.selectFrom('app.work_item').select('id').execute()).map((r) => r.id).sort(),
      );
    expect(await visibleTo(a.owner)).toEqual([a.sharedItemId, a.privateItemId].sort());
    expect(await visibleTo(a.adult)).toEqual([a.sharedItemId]);
  });

  it('keeps the audit trail append-only', async () => {
    await requireDb()
      .insertInto('app.audit_event')
      .values({
        household_id: a.id,
        entity_type: 'household',
        entity_id: a.id,
        action: 'test.event',
      })
      .execute();
    await expect(
      sql`update app.audit_event set action = 'changed' where household_id = ${a.id}`.execute(
        requireDb(),
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      sql`delete from app.audit_event where household_id = ${a.id}`.execute(requireDb()),
    ).rejects.toThrow(/append-only/);
  });

  it('cuts off a removed member immediately', async () => {
    const h = await seedHousehold(requireDb(), 'Gamma');
    await requireDb()
      .updateTable('app.member')
      .set({ status: 'removed', removed_at: new Date() })
      .where('id', '=', h.adult.id)
      .execute();
    const rows = await withRequestContext(requireDb(), asMember(h, h.adult), (trx) =>
      trx.selectFrom('app.work_item').select('id').execute(),
    );
    expect(rows).toEqual([]);
    await purgeHouseholds(requireDb(), [h.id]);
  });

  it('grants anon and authenticated nothing in schema app', async () => {
    const { rows } = await sql<{ grantee: string }>`
      select grantee from information_schema.role_table_grants
      where table_schema = 'app' and grantee in ('anon', 'authenticated', 'PUBLIC')
    `.execute(requireDb());
    expect(rows).toEqual([]);
  });

  it('does not let the API role purge households', async () => {
    await expect(
      withRequestContext(requireDb(), asMember(a, a.owner), (trx) =>
        sql`select app.purge_household(${a.id}::uuid)`.execute(trx),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  describe('invite acceptance', () => {
    const accept = (token: string, email: string, userId = randomUUID()) =>
      withRequestContext(requireDb(), { userId }, (trx) =>
        sql<{ household_id: string; member_id: string }>`
          select * from app.accept_invite(${hashToken(token)}, ${userId}::uuid, ${email}, 'New Adult', 'req-test')
        `.execute(trx),
      );

    it('accepts a valid invite once, for the invited email only', async () => {
      const token = randomUUID();
      await seedInvite(requireDb(), a, { email: 'invitee@example.test', token });

      await expect(accept(token, 'someone-else@example.test')).rejects.toThrow(/invite_not_found/);
      const { rows } = await accept(token, 'Invitee@Example.test');
      expect(rows[0]?.household_id).toBe(a.id);
      await expect(accept(token, 'invitee@example.test')).rejects.toThrow(/invite_not_found/);
    });

    it('tells the claim check only whether a pending invite matches that email', async () => {
      const claimable = (token: string, email: string) =>
        withRequestContext(requireDb(), { userId: randomUUID() }, (trx) =>
          sql<{
            ok: boolean;
          }>`select app.invite_claimable(${hashToken(token)}, ${email}) as ok`.execute(trx),
        ).then((r) => r.rows[0]?.ok);

      const token = randomUUID();
      const id = await seedInvite(requireDb(), a, { email: 'claimer@example.test', token });
      expect(await claimable(token, 'Claimer@Example.test')).toBe(true);
      expect(await claimable(token, 'other@example.test')).toBe(false);
      expect(await claimable(randomUUID(), 'claimer@example.test')).toBe(false);

      const expired = randomUUID();
      await seedInvite(requireDb(), a, {
        email: 'claimer@example.test',
        token: expired,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await claimable(expired, 'claimer@example.test')).toBe(false);

      await requireDb()
        .updateTable('app.invite')
        .set({ revoked_at: new Date() })
        .where('id', '=', id)
        .execute();
      expect(await claimable(token, 'claimer@example.test')).toBe(false);

      const used = randomUUID();
      await seedInvite(requireDb(), a, { email: 'used@example.test', token: used });
      await accept(used, 'used@example.test');
      expect(await claimable(used, 'used@example.test')).toBe(false);
    });

    it('rejects expired and revoked invites with the same error', async () => {
      const expired = randomUUID();
      await seedInvite(requireDb(), a, {
        email: 'late@example.test',
        token: expired,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(accept(expired, 'late@example.test')).rejects.toThrow(/invite_not_found/);

      const revoked = randomUUID();
      const id = await seedInvite(requireDb(), a, {
        email: 'revoked@example.test',
        token: revoked,
      });
      await requireDb()
        .updateTable('app.invite')
        .set({ revoked_at: new Date() })
        .where('id', '=', id)
        .execute();
      await expect(accept(revoked, 'revoked@example.test')).rejects.toThrow(/invite_not_found/);
      await expect(accept(randomUUID(), 'nobody@example.test')).rejects.toThrow(/invite_not_found/);
    });
  });
});
