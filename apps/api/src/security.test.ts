import { randomUUID } from 'node:crypto';
import { createDb, type Database } from '@familyos/db';
import {
  hashToken,
  purgeHouseholds,
  seedHousehold,
  seedInvite,
  seedRoutine,
  type SeededHousehold,
} from '@familyos/db/testing';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HouseholdExportSchema } from './export-schema';
import { createTestApp, LEAKED_PASSWORD } from './testing/harness';

// Gate G1, through the HTTP API against the local database. Skipped without DATABASE_URL.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 4 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

describe.skipIf(!db)('API security (G1)', () => {
  const harness = db ? createTestApp({ db }) : createTestApp();
  const { request, tokenFor, logs, accounts } = harness;
  let a: SeededHousehold;
  let b: SeededHousehold;
  let bInviteId: string;
  let bRoutineId: string;
  const created: string[] = [];

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });

  beforeAll(async () => {
    a = await seedHousehold(requireDb(), 'Alpha');
    b = await seedHousehold(requireDb(), 'Beta');
    created.push(a.id, b.id);
    bInviteId = await seedInvite(requireDb(), b, {
      email: 'beta-invitee@example.test',
      token: randomUUID(),
    });
    ({ routineId: bRoutineId } = await seedRoutine(requireDb(), b, {
      rule: { freq: 'weekly', interval: 1, weekdays: [7] },
      startOn: '2026-11-08',
    }));
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), created);
    await db?.destroy();
  });

  /** Everything in household B that an attack could change. */
  const snapshotB = async () => {
    const count = async (
      table:
        | 'app.member'
        | 'app.invite'
        | 'app.work_item'
        | 'app.audit_event'
        | 'app.recurrence_rule'
        | 'app.occurrence_exception',
    ) =>
      Number(
        (
          await requireDb()
            .selectFrom(table)
            .select((eb) => eb.fn.countAll().as('n'))
            .where('household_id', '=', b.id)
            .executeTakeFirstOrThrow()
        ).n,
      );
    const item = await requireDb()
      .selectFrom('app.work_item')
      .select(['title', 'version', 'status', 'owner_member_id'])
      .where('id', '=', b.sharedItemId)
      .executeTakeFirstOrThrow();
    const adult = await requireDb()
      .selectFrom('app.member')
      .select(['status'])
      .where('id', '=', b.adult.id)
      .executeTakeFirstOrThrow();
    const invite = await requireDb()
      .selectFrom('app.invite')
      .select(['revoked_at'])
      .where('id', '=', bInviteId)
      .executeTakeFirstOrThrow();
    return {
      members: await count('app.member'),
      invites: await count('app.invite'),
      items: await count('app.work_item'),
      rules: await count('app.recurrence_rule'),
      exceptions: await count('app.occurrence_exception'),
      audit: await count('app.audit_event'),
      item,
      adult,
      invite,
    };
  };

  describe('cross-household matrix (T-01)', () => {
    const attacks = (): [string, string, unknown?][] => [
      ['GET', `/households/${b.id}`],
      ['GET', `/households/${b.id}/invites`],
      ['POST', `/households/${b.id}/invites`, { email: 'x@example.test', role: 'adult' }],
      ['DELETE', `/households/${b.id}/invites/${bInviteId}`],
      ['POST', `/households/${b.id}/children`, { displayName: 'Intruder' }],
      ['DELETE', `/households/${b.id}/members/${b.adult.id}`],
      ['GET', `/households/${b.id}/work-items`],
      ['POST', `/households/${b.id}/work-items`, { title: 'intrusion' }],
      ['GET', `/households/${b.id}/work-items/${b.sharedItemId}`],
      [
        'PATCH',
        `/households/${b.id}/work-items/${b.sharedItemId}`,
        { expectedVersion: 1, title: 'tampered' },
      ],
      ['GET', `/households/${b.id}/export`],
      ['GET', `/households/${b.id}/today`],
      ['GET', `/households/${b.id}/inbox`],
      ['POST', `/households/${b.id}/work-items/${b.sharedItemId}/accept`, { expectedVersion: 1 }],
      ['POST', `/households/${b.id}/work-items/${b.sharedItemId}/discard`, { expectedVersion: 1 }],
      ['GET', `/households/${b.id}/work-items/${b.sharedItemId}/comments`],
      ['POST', `/households/${b.id}/work-items/${b.sharedItemId}/comments`, { body: 'intrusion' }],
      ['GET', `/households/${a.id}/work-items/${b.sharedItemId}/comments`],
      ['POST', `/households/${a.id}/work-items/${b.sharedItemId}/comments`, { body: 'intrusion' }],
      ['POST', `/households/${a.id}/work-items/${b.sharedItemId}/accept`, { expectedVersion: 1 }],
      ['GET', `/households/${b.id}/routines`],
      [
        'POST',
        `/households/${b.id}/routines`,
        { title: 'x', rule: { freq: 'daily', interval: 1 }, startOn: '2026-11-08' },
      ],
      ['GET', `/households/${b.id}/routines/${bRoutineId}`],
      ['PATCH', `/households/${b.id}/routines/${bRoutineId}`, { expectedVersion: 1, paused: true }],
      ['POST', `/households/${b.id}/routines/${bRoutineId}/end`, { expectedVersion: 1 }],
      [
        'POST',
        `/households/${b.id}/routines/${bRoutineId}/occurrences/0/skip`,
        { expectedVersion: 1 },
      ],
      // Own household, foreign resource IDs.
      ['GET', `/households/${a.id}/routines/${bRoutineId}`],
      ['PATCH', `/households/${a.id}/routines/${bRoutineId}`, { expectedVersion: 1, paused: true }],
      ['POST', `/households/${a.id}/routines/${bRoutineId}/end`, { expectedVersion: 1 }],
      [
        'POST',
        `/households/${a.id}/routines/${bRoutineId}/occurrences/0/skip`,
        { expectedVersion: 1 },
      ],
      [
        'POST',
        `/households/${a.id}/routines/${bRoutineId}/occurrences/1/swap`,
        { expectedVersion: 1, withMemberId: a.adult.id },
      ],
      ['GET', `/households/${a.id}/work-items/${b.sharedItemId}`],
      [
        'PATCH',
        `/households/${a.id}/work-items/${b.sharedItemId}`,
        { expectedVersion: 1, title: 'tampered' },
      ],
      ['DELETE', `/households/${a.id}/members/${b.adult.id}`],
      ['DELETE', `/households/${a.id}/invites/${bInviteId}`],
    ];

    it('answers every foreign request with 404 and changes nothing in the other household', async () => {
      const before = await snapshotB();
      const token = await tokenOf(a.owner);
      for (const [method, path, body] of attacks()) {
        const res = await request(path, { method, token, body });
        expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 });
      }
      expect(await snapshotB()).toEqual(before);
    });

    it("refuses to assign work to another household's member", async () => {
      const before = await snapshotB();
      const res = await request(`/households/${a.id}/work-items`, {
        method: 'POST',
        token: await tokenOf(a.owner),
        body: { title: 'assign across', ownerMemberId: b.adult.id },
      });
      expect(res.status).toBe(422);
      expect(await snapshotB()).toEqual(before);
    });

    it('treats a removed member like a stranger', async () => {
      const h = await seedHousehold(requireDb(), 'Gamma');
      created.push(h.id);
      const token = await tokenOf(h.adult);
      expect((await request(`/households/${h.id}/work-items`, { token })).status).toBe(200);
      const removed = await request(`/households/${h.id}/members/${h.adult.id}`, {
        method: 'DELETE',
        token: await tokenOf(h.owner),
      });
      expect(removed.status).toBe(204);
      expect((await request(`/households/${h.id}/work-items`, { token })).status).toBe(404);
    });
  });

  describe('role matrix (WF-05)', () => {
    it('limits caregivers to reading', async () => {
      const token = await tokenOf(a.caregiver);
      expect((await request(`/households/${a.id}/work-items`, { token })).status).toBe(200);
      expect(
        (
          await request(`/households/${a.id}/work-items`, {
            method: 'POST',
            token,
            body: { title: 'x' },
          })
        ).status,
      ).toBe(403);
      expect((await request(`/households/${a.id}/export`, { token })).status).toBe(403);
      expect((await request(`/households/${a.id}/routines`, { token })).status).toBe(200);
      expect(
        (
          await request(`/households/${a.id}/routines`, {
            method: 'POST',
            token,
            body: { title: 'x', rule: { freq: 'daily', interval: 1 }, startOn: '2026-11-08' },
          })
        ).status,
      ).toBe(403);
      expect((await request(`/households/${a.id}/invites`, { token })).status).toBe(403);
    });

    it('keeps invites and removals with the owner', async () => {
      const token = await tokenOf(a.adult);
      const invite = await request(`/households/${a.id}/invites`, {
        method: 'POST',
        token,
        body: { email: 'y@example.test', role: 'adult' },
      });
      expect(invite.status).toBe(403);
      expect(
        (
          await request(`/households/${a.id}/members/${a.caregiver.id}`, {
            method: 'DELETE',
            token,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(`/households/${a.id}/children`, {
            method: 'POST',
            token,
            body: { displayName: 'Kid' },
          })
        ).status,
      ).toBe(201);
    });

    it('rolls back writes when a request fails partway', async () => {
      const countItems = async () =>
        (
          await requireDb()
            .selectFrom('app.work_item')
            .select('id')
            .where('household_id', '=', a.id)
            .execute()
        ).length;
      const before = await countItems();
      const res = await request(`/households/${a.id}/work-items`, {
        method: 'POST',
        token: await tokenOf(a.owner),
        body: { title: 'ok', ownerMemberId: a.child.id },
      });
      expect(res.status).toBe(422);
      expect(await countItems()).toBe(before);
    });
  });

  describe('invite flow', () => {
    it('lets the owner invite, and only the invited email accept, once', async () => {
      const email = `partner-${randomUUID()}@example.test`;
      const created = await request(`/households/${a.id}/invites`, {
        method: 'POST',
        token: await tokenOf(a.owner),
        body: { email: email.toUpperCase(), role: 'adult' },
      });
      expect(created.status).toBe(201);
      const { token, link, invite } = (await created.json()) as {
        token: string;
        link: string;
        invite: { email: string };
      };
      expect(invite.email).toBe(email);
      expect(link).toContain(encodeURIComponent(token));
      // Inviting creates no account; the invitee creates theirs from the link.
      expect(accounts.has(email)).toBe(false);

      const invitee = { userId: randomUUID(), email };
      const stranger = { userId: randomUUID(), email: 'stranger@example.test' };
      const accept = async (who: typeof invitee) =>
        request('/invites/accept', {
          method: 'POST',
          token: await tokenFor(who),
          body: { token, displayName: 'Partner' },
        });

      expect((await accept(stranger)).status).toBe(404);
      const ok = await accept(invitee);
      expect(ok.status).toBe(201);
      expect((await accept(invitee)).status).toBe(404);

      const me = await request('/me', { token: await tokenFor(invitee) });
      const { households } = (await me.json()) as { households: { id: string; role: string }[] };
      expect(households).toEqual([expect.objectContaining({ id: a.id, role: 'adult' })]);

      const listed = await request(`/households/${a.id}/invites`, {
        token: await tokenOf(a.owner),
      });
      expect(JSON.stringify(await listed.json())).not.toContain(token);
    });

    it('stops a revoked invite from working', async () => {
      const email = `revoked-${randomUUID()}@example.test`;
      const ownerToken = await tokenOf(a.owner);
      const created = await request(`/households/${a.id}/invites`, {
        method: 'POST',
        token: ownerToken,
        body: { email, role: 'caregiver' },
      });
      const { token, invite } = (await created.json()) as { token: string; invite: { id: string } };
      expect(
        (
          await request(`/households/${a.id}/invites/${invite.id}`, {
            method: 'DELETE',
            token: ownerToken,
          })
        ).status,
      ).toBe(204);
      const res = await request('/invites/accept', {
        method: 'POST',
        token: await tokenFor({ userId: randomUUID(), email }),
        body: { token, displayName: 'Late' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('creating an account from an invite', () => {
    const PASSWORD = 'a long enough password';
    const invite = async (email: string) => {
      const created = await request(`/households/${a.id}/invites`, {
        method: 'POST',
        token: await tokenOf(a.owner),
        body: { email, role: 'adult' },
      });
      return (await created.json()) as { token: string; invite: { id: string } };
    };
    const claim = (body: Record<string, unknown>) =>
      request('/invites/claim', { method: 'POST', body });

    it('creates the account and joins, only for the invited email, once, without signing in', async () => {
      const email = `claim-${randomUUID()}@example.test`;
      const { token } = await invite(email);

      const wrongEmail = await claim({
        token,
        email: 'someone-else@example.test',
        password: PASSWORD,
        displayName: 'X',
      });
      expect(wrongEmail.status).toBe(404);
      expect(accounts.has('someone-else@example.test')).toBe(false);
      expect(
        (
          await claim({
            token: randomUUID() + randomUUID(),
            email,
            password: PASSWORD,
            displayName: 'X',
          })
        ).status,
      ).toBe(404);
      expect(accounts.has(email)).toBe(false);

      const ok = await claim({
        token,
        email: email.toUpperCase(),
        password: PASSWORD,
        displayName: 'Partner',
      });
      expect(ok.status).toBe(201);
      const { householdId } = (await ok.json()) as { householdId: string };
      expect(householdId).toBe(a.id);
      const account = accounts.get(email);
      expect(account?.password).toBe(PASSWORD);

      const me = await request('/me', {
        token: await tokenFor({ userId: account?.userId ?? '', email }),
      });
      const { households } = (await me.json()) as { households: { id: string; role: string }[] };
      expect(households).toEqual([expect.objectContaining({ id: a.id, role: 'adult' })]);

      // The link is used up.
      const again = await claim({
        token,
        email,
        password: 'another long password',
        displayName: 'P',
      });
      expect(again.status).toBe(404);
      expect(accounts.get(email)?.password).toBe(PASSWORD);
      expect(logs.join('\n')).not.toContain(PASSWORD);
    });

    it("makes the claimer of a new household's owner invite its owner", async () => {
      const email = `founder-${randomUUID()}@example.test`;
      const token = randomUUID() + randomUUID();
      const { rows } = await sql<{ id: string }>`
        select app.create_household_with_owner_invite(
          'Founder Home', 'America/Los_Angeles', ${email}, ${hashToken(token)}, now() + interval '1 hour'
        ) as id
      `.execute(requireDb());
      const householdId = rows[0]?.id ?? '';
      created.push(householdId);

      const res = await claim({ token, email, password: PASSWORD, displayName: 'Founder' });
      expect(res.status).toBe(201);
      const founder = { userId: accounts.get(email)?.userId ?? '', email };
      const me = await request('/me', { token: await tokenFor(founder) });
      const { households } = (await me.json()) as { households: { id: string; role: string }[] };
      expect(households).toEqual([expect.objectContaining({ id: householdId, role: 'owner' })]);

      // As owner, they can invite the second adult.
      const invited = await request(`/households/${householdId}/invites`, {
        method: 'POST',
        token: await tokenFor(founder),
        body: { email: `partner-${randomUUID()}@example.test`, role: 'adult' },
      });
      expect(invited.status).toBe(201);
      // Nobody can create another owner invite through the API.
      const ownerInvite = await request(`/households/${householdId}/invites`, {
        method: 'POST',
        token: await tokenFor(founder),
        body: { email: `second-owner-${randomUUID()}@example.test`, role: 'owner' },
      });
      expect(ownerInvite.status).toBe(422);
    });

    it('never changes an existing account, and leaves the invite usable by signing in', async () => {
      const email = `existing-${randomUUID()}@example.test`;
      accounts.set(email, { userId: randomUUID(), password: 'the original password' });
      const { token } = await invite(email);

      const res = await claim({ token, email, password: PASSWORD, displayName: 'Taken' });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'account_exists' });
      expect(accounts.get(email)?.password).toBe('the original password');

      const accept = await request('/invites/accept', {
        method: 'POST',
        token: await tokenFor({ userId: accounts.get(email)?.userId ?? '', email }),
        body: { token, displayName: 'Signed in' },
      });
      expect(accept.status).toBe(201);
    });

    it('refuses revoked invites, short passwords and leaked ones, creating nothing', async () => {
      const email = `revoked-claim-${randomUUID()}@example.test`;
      const { token, invite: created } = await invite(email);
      expect((await claim({ token, email, password: 'short', displayName: 'S' })).status).toBe(422);
      const leaked = await claim({ token, email, password: LEAKED_PASSWORD, displayName: 'S' });
      expect(leaked.status).toBe(422);
      expect(await leaked.json()).toEqual({ error: 'weak_password' });
      await request(`/households/${a.id}/invites/${created.id}`, {
        method: 'DELETE',
        token: await tokenOf(a.owner),
      });
      expect((await claim({ token, email, password: PASSWORD, displayName: 'S' })).status).toBe(
        404,
      );
      expect(accounts.has(email)).toBe(false);
    });
  });

  describe('work items', () => {
    it('enforces versions, transitions and evidence, and audits each write', async () => {
      const token = await tokenOf(a.owner);
      const base = `/households/${a.id}/work-items`;
      const created = await request(base, {
        method: 'POST',
        token,
        body: { title: 'Replace filter', ownerMemberId: a.adult.id, inbox: false },
      });
      expect(created.status).toBe(201);
      const { item } = (await created.json()) as {
        item: { id: string; version: number; status: string };
      };
      expect(item.status).toBe('ready');

      const patch = (body: Record<string, unknown>) =>
        request(`${base}/${item.id}`, { method: 'PATCH', token, body });

      expect((await patch({ expectedVersion: 1, status: 'verified_complete' })).status).toBe(422);
      expect((await patch({ expectedVersion: 1, status: 'in_progress' })).status).toBe(200);
      expect((await patch({ expectedVersion: 1, title: 'stale edit' })).status).toBe(409);
      const noEvidence = await patch({ expectedVersion: 2, status: 'verified_complete' });
      expect(await noEvidence.json()).toEqual({ error: 'evidence_required' });
      expect(
        (await patch({ expectedVersion: 2, status: 'verified_complete', confirmed: true })).status,
      ).toBe(200);

      const detail = await request(`${base}/${item.id}`, { token });
      const { timeline } = (await detail.json()) as {
        timeline: { action: string; payload: Record<string, unknown> }[];
      };
      expect(timeline.map((t) => t.action)).toEqual([
        'work_item.created',
        'work_item.updated',
        'work_item.updated',
      ]);
      expect(timeline.at(-1)?.payload).toMatchObject({
        toStatus: 'verified_complete',
        evidence: 'E3',
      });
      expect(JSON.stringify(timeline)).not.toContain('Replace filter');
    });
  });

  describe('export', () => {
    it('round-trips through the export schema with exactly the visible rows', async () => {
      const res = await request(`/households/${a.id}/export`, { token: await tokenOf(a.adult) });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const raw = await res.text();
      const parsed = HouseholdExportSchema.parse(JSON.parse(raw));

      expect(parsed.household.id).toBe(a.id);
      const ids = parsed.workItems.map((w) => w.id);
      expect(ids).toContain(a.sharedItemId);
      // The owner's private item is not the adult's to export.
      expect(ids).not.toContain(a.privateItemId);
      const dbMembers = await requireDb()
        .selectFrom('app.member')
        .select('id')
        .where('household_id', '=', a.id)
        .execute();
      expect(parsed.members.map((m) => m.id).sort()).toEqual(dbMembers.map((m) => m.id).sort());

      expect(raw).not.toContain(b.id);
      expect(raw).not.toContain('token_hash');
      expect(parsed.auditEvents.at(-1)?.action).toBe('household.exported');
    });
  });

  it('never writes household content, emails or tokens to the logs (G1)', () => {
    const text = logs.join('\n');
    for (const secret of [
      'Replace filter',
      'stale edit',
      'Partner',
      '@example.test',
      'Bearer',
      'intrusion',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(logs.length).toBeGreaterThan(20);
  });
});
