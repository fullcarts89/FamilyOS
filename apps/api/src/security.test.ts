import { randomUUID } from 'node:crypto';
import { createDb, type Database } from '@familyos/db';
import {
  hashToken,
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  seedInvite,
  seedRoutine,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { CalendarRule } from '@familyos/domain';
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
  let bEventId: string;
  let aEventId: string;
  let bCalendarId: string;
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
    const care = {
      startsAt: '2026-11-16T16:15:00Z',
      endsAt: '2026-11-16T16:35:00Z',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] } satisfies CalendarRule,
      careAction: 'drop_off' as const,
      carePlace: 'Little Oaks',
    };
    bEventId = await seedEvent(requireDb(), b, {
      ...care,
      memberIds: [b.adult.id, b.child.id],
      careMemberId: b.child.id,
    });
    bCalendarId = (
      await requireDb()
        .insertInto('app.calendar_source')
        .values({
          household_id: b.id,
          member_id: b.adult.id,
          label: 'Beta work',
          url_ciphertext: Buffer.alloc(40, 1),
          url_nonce: Buffer.alloc(12, 2),
          url_hint: 'calendar.example.test/…',
          created_by_member_id: b.adult.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    aEventId = await seedEvent(requireDb(), a, {
      ...care,
      memberIds: [a.adult.id, a.child.id],
      careMemberId: a.child.id,
    });
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
        | 'app.occurrence_exception'
        | 'app.event'
        | 'app.event_member'
        | 'app.event_exception'
        | 'app.calendar_source',
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
    const event = await requireDb()
      .selectFrom('app.event')
      .select(['title', 'version', 'care_member_id'])
      .where('id', '=', bEventId)
      .executeTakeFirstOrThrow();
    const pet = await requireDb()
      .selectFrom('app.member')
      .select(['display_name', 'color', 'version'])
      .where('id', '=', b.pet.id)
      .executeTakeFirstOrThrow();
    return {
      members: await count('app.member'),
      invites: await count('app.invite'),
      items: await count('app.work_item'),
      rules: await count('app.recurrence_rule'),
      exceptions: await count('app.occurrence_exception'),
      events: await count('app.event'),
      eventMembers: await count('app.event_member'),
      eventExceptions: await count('app.event_exception'),
      calendars: await count('app.calendar_source'),
      calendar: await requireDb()
        .selectFrom('app.calendar_source')
        .select(['label', 'member_id', 'version', 'status', 'last_synced_at'])
        .where('id', '=', bCalendarId)
        .executeTakeFirstOrThrow(),
      audit: await count('app.audit_event'),
      item,
      adult,
      invite,
      event,
      pet,
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
      // Family Rhythm: members, events, occurrences, rhythm.
      ['POST', `/households/${b.id}/members`, { role: 'pet', displayName: 'Intruder' }],
      ['PATCH', `/households/${b.id}/members/${b.pet.id}`, { expectedVersion: 1, note: 'x' }],
      ['PATCH', `/households/${a.id}/members/${b.pet.id}`, { expectedVersion: 1, note: 'x' }],
      ['GET', `/households/${b.id}/events?from=2026-11-16&to=2026-11-20`],
      [
        'POST',
        `/households/${b.id}/events`,
        { title: 'x', startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z' },
      ],
      ['GET', `/households/${b.id}/events/${bEventId}`],
      ['PATCH', `/households/${b.id}/events/${bEventId}`, { expectedVersion: 1, title: 'x' }],
      ['DELETE', `/households/${b.id}/events/${bEventId}?expectedVersion=1`],
      ['POST', `/households/${b.id}/events/${bEventId}/occurrences/2026-11-16`, { action: 'skip' }],
      ['DELETE', `/households/${b.id}/events/${bEventId}/occurrences/2026-11-16`],
      ['GET', `/households/${b.id}/rhythm?date=2026-11-16`],
      ['GET', `/households/${a.id}/events/${bEventId}`],
      ['PATCH', `/households/${a.id}/events/${bEventId}`, { expectedVersion: 1, title: 'x' }],
      ['DELETE', `/households/${a.id}/events/${bEventId}?expectedVersion=1`],
      ['POST', `/households/${a.id}/events/${bEventId}/occurrences/2026-11-16`, { action: 'skip' }],
      [
        'POST',
        `/households/${a.id}/events/${bEventId}/occurrences/2026-11-16`,
        { action: 'cover', memberId: a.adult.id },
      ],
      ['DELETE', `/households/${a.id}/events/${bEventId}/occurrences/2026-11-16`],
      // Calendar subscriptions.
      ['GET', `/households/${b.id}/calendars`],
      [
        'POST',
        `/households/${b.id}/calendars`,
        { label: 'x', url: 'https://calendar.example.test/x.ics', memberId: b.adult.id },
      ],
      ['PATCH', `/households/${b.id}/calendars/${bCalendarId}`, { expectedVersion: 1, label: 'x' }],
      ['DELETE', `/households/${b.id}/calendars/${bCalendarId}?expectedVersion=1`],
      ['POST', `/households/${b.id}/calendars/${bCalendarId}/sync`],
      ['PATCH', `/households/${a.id}/calendars/${bCalendarId}`, { expectedVersion: 1, label: 'x' }],
      ['DELETE', `/households/${a.id}/calendars/${bCalendarId}?expectedVersion=1`],
      ['POST', `/households/${a.id}/calendars/${bCalendarId}/sync`],
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

    it("refuses to put another household's members on an event or a task", async () => {
      const before = await snapshotB();
      const token = await tokenOf(a.owner);
      const times = { startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z' };
      const attempts: [string, string, unknown][] = [
        ['POST', `/households/${a.id}/events`, { title: 'x', ...times, memberIds: [b.adult.id] }],
        ['POST', `/households/${a.id}/events`, { title: 'x', ...times, careMemberId: b.child.id }],
        [
          'PATCH',
          `/households/${a.id}/events/${aEventId}`,
          { expectedVersion: 1, memberIds: [b.owner.id] },
        ],
        [
          'POST',
          `/households/${a.id}/events/${aEventId}/occurrences/2026-11-16`,
          { action: 'cover', memberId: b.adult.id },
        ],
        ['POST', `/households/${a.id}/work-items`, { title: 'x', subjectMemberId: b.pet.id }],
      ];
      for (const [method, path, body] of attempts) {
        const res = await request(path, { method, token, body });
        expect({ path, status: res.status }).toEqual({ path, status: 422 });
      }
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
      for (const path of [
        `/households/${h.id}/events?from=2026-11-16&to=2026-11-16`,
        `/households/${h.id}/rhythm`,
        `/households/${h.id}/calendars`,
      ]) {
        expect((await request(path, { token })).status).toBe(404);
      }
      const write = await request(`/households/${h.id}/members`, {
        method: 'POST',
        token,
        body: { role: 'pet', displayName: 'Removed' },
      });
      expect(write.status).toBe(404);
    });

    it('has no way for a child or pet to sign in or act', async () => {
      // They have no account: no user ID to put in a token, and no invite can make one.
      const rows = await requireDb()
        .selectFrom('app.member')
        .select('user_id')
        .where('household_id', '=', a.id)
        .where('role', 'in', ['child', 'pet'])
        .execute();
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((r) => r.user_id === null)).toBe(true);
      const invite = await request(`/households/${a.id}/invites`, {
        method: 'POST',
        token: await tokenOf(a.owner),
        body: { email: 'pet@example.test', role: 'pet' },
      });
      expect(invite.status).toBe(422);
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
      // Events: caregivers read the schedule but don't change it.
      expect(
        (await request(`/households/${a.id}/events?from=2026-11-16&to=2026-11-16`, { token }))
          .status,
      ).toBe(200);
      expect((await request(`/households/${a.id}/rhythm`, { token })).status).toBe(200);
      const writes: [string, string, unknown][] = [
        [
          'POST',
          `/households/${a.id}/events`,
          { title: 'x', startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z' },
        ],
        ['PATCH', `/households/${a.id}/events/${aEventId}`, { expectedVersion: 1, title: 'x' }],
        ['DELETE', `/households/${a.id}/events/${aEventId}?expectedVersion=1`, undefined],
        [
          'POST',
          `/households/${a.id}/events/${aEventId}/occurrences/2026-11-16`,
          { action: 'skip' },
        ],
        ['POST', `/households/${a.id}/members`, { role: 'pet', displayName: 'x' }],
        ['PATCH', `/households/${a.id}/members/${a.pet.id}`, { expectedVersion: 1, note: 'x' }],
        ['GET', `/households/${a.id}/calendars`, undefined],
        [
          'POST',
          `/households/${a.id}/calendars`,
          { label: 'x', url: 'https://calendar.example.test/x.ics', memberId: a.adult.id },
        ],
      ];
      for (const [method, path, body] of writes) {
        const res = await request(path, { method, token, body });
        expect({ path, status: res.status }).toEqual({ path, status: 403 });
      }
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
      expect(raw).not.toMatch(/url_ciphertext|url_nonce|urlCiphertext/);
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
