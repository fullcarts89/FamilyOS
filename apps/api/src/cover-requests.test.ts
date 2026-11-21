import { createDb, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Childcare coverage by request and acceptance (P1-6), through the HTTP API.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Monday 2026-11-16, 07:00 in Los Angeles.
const NOW = new Date('2026-11-16T15:00:00Z');

interface CoverRequest {
  id: string;
  eventId: string;
  date: string;
  askedMemberId: string;
  askedByMemberId: string;
  status: string;
  respondedAt: string | null;
  version: number;
}
interface Occurrence {
  eventId: string;
  date: string;
  memberIds: string[];
  cover: { memberId: string } | null;
  coverRequest: CoverRequest | null;
}

describe.skipIf(!db)('cover requests', () => {
  let clock = NOW;
  const { request, tokenFor } = db ? createTestApp({ db, now: () => clock }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;
  let dropOff: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;
  const ask = (date: string, memberId: string, token = owner) =>
    call(`/events/${dropOff}/occurrences/${date}/cover-requests`, {
      method: 'POST',
      body: { memberId },
      token,
    });
  const answer = (id: string, verb: 'accept' | 'decline' | 'cancel', token: string) =>
    call(`/cover-requests/${id}/${verb}`, { method: 'POST', token });
  const occurrenceOn = async (date: string, token = owner) =>
    (
      await json<{ occurrences: Occurrence[] }>(
        await call(`/events?from=${date}&to=${date}`, { token }),
      )
    ).occurrences.find((o) => o.eventId === dropOff);
  const exceptions = () =>
    requireDb()
      .selectFrom('app.event_exception')
      .select(['occurrence_date', 'kind', 'cover_member_id'])
      .where('event_id', '=', dropOff)
      .orderBy('occurrence_date')
      .execute();
  const status = async (id: string) =>
    (
      await requireDb()
        .selectFrom('app.cover_request')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).status;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Cover');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
    caregiver = await tokenOf(h.caregiver);
    // Weekday drop-offs at 08:15, the owner's.
    dropOff = await seedEvent(requireDb(), h, {
      title: 'Daycare drop-off',
      startsAt: '2026-11-16T16:15:00Z',
      endsAt: '2026-11-16T16:35:00Z',
      kind: 'childcare',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] },
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'drop_off',
      carePlace: 'Little Oaks',
    });
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('asking changes nobody’s responsibility until the asked adult accepts', async () => {
    const date = '2026-11-17';
    const res = await ask(date, h.adult.id);
    expect(res.status).toBe(201);
    const { coverRequest, occurrence } = await json<{
      coverRequest: CoverRequest;
      occurrence: Occurrence;
    }>(res);
    expect(coverRequest).toMatchObject({
      eventId: dropOff,
      date,
      askedMemberId: h.adult.id,
      askedByMemberId: h.owner.id,
      status: 'pending',
      respondedAt: null,
      version: 1,
    });
    // Still the owner's, with the request showing on the occurrence.
    expect(occurrence).toMatchObject({ memberIds: [h.owner.id, h.child.id].sort(), cover: null });
    expect(occurrence.coverRequest?.id).toBe(coverRequest.id);
    expect(await exceptions()).toEqual([]);
    // Today and the Week load /events: each side sees it in their own list.
    const theirs = await json<{ coverRequests: Record<string, CoverRequest[]> }>(
      await call('/events?from=2026-11-16&to=2026-11-22', { token: adult }),
    );
    expect(theirs.coverRequests.askedOfMe?.map((r) => r.id)).toEqual([coverRequest.id]);
    expect(theirs.coverRequests.askedByMe).toEqual([]);
    const mine = await json<{ askedOfMe: CoverRequest[]; askedByMe: CoverRequest[] }>(
      await call('/cover-requests'),
    );
    expect(mine.askedByMe.map((r) => r.id)).toEqual([coverRequest.id]);
    expect(mine.askedOfMe).toEqual([]);

    // Asking again is a retry; asking someone else while it waits is refused.
    const again = await ask(date, h.adult.id);
    expect(again.status).toBe(200);
    expect((await json<{ coverRequest: CoverRequest }>(again)).coverRequest.id).toBe(
      coverRequest.id,
    );
    expect(await json(await ask(date, h.caregiver.id))).toEqual({ error: 'request_pending' });

    // Only the asked adult answers.
    expect((await answer(coverRequest.id, 'accept', owner)).status).toBe(403);
    expect((await answer(coverRequest.id, 'decline', caregiver)).status).toBe(403);
    expect((await answer(coverRequest.id, 'cancel', adult)).status).toBe(403);
    expect(await status(coverRequest.id)).toBe('pending');

    const accepted = await answer(coverRequest.id, 'accept', adult);
    expect(accepted.status).toBe(200);
    expect((await json<{ coverRequest: CoverRequest }>(accepted)).coverRequest).toMatchObject({
      status: 'accepted',
      version: 2,
      respondedAt: NOW.toISOString(),
    });
    expect(await exceptions()).toEqual([
      { occurrence_date: date, kind: 'cover', cover_member_id: h.adult.id },
    ]);
    const after = await occurrenceOn(date);
    expect(after).toMatchObject({ cover: { memberId: h.adult.id }, coverRequest: null });
    expect(after?.memberIds).toContain(h.adult.id);
    expect(after?.memberIds).not.toContain(h.owner.id);

    // Accepting again changes nothing; declining or cancelling now is too late.
    const twice = await answer(coverRequest.id, 'accept', adult);
    expect(twice.status).toBe(200);
    expect((await json<{ coverRequest: CoverRequest }>(twice)).coverRequest.version).toBe(2);
    expect(await json(await answer(coverRequest.id, 'decline', adult))).toEqual({
      error: 'request_closed',
    });
    expect(await json(await answer(coverRequest.id, 'cancel', owner))).toEqual({
      error: 'request_closed',
    });
    expect(await exceptions()).toHaveLength(1);
  });

  it('declines and cancels, leaving the handoff where it was', async () => {
    const declinedDate = '2026-11-18';
    const asked = (await json<{ coverRequest: CoverRequest }>(await ask(declinedDate, h.adult.id)))
      .coverRequest;
    const declined = await answer(asked.id, 'decline', adult);
    expect((await json<{ coverRequest: CoverRequest }>(declined)).coverRequest.status).toBe(
      'declined',
    );
    expect((await answer(asked.id, 'decline', adult)).status).toBe(200);
    expect(await json(await answer(asked.id, 'accept', adult))).toEqual({
      error: 'request_closed',
    });
    expect((await occurrenceOn(declinedDate))?.memberIds).toContain(h.owner.id);

    // Declined, so it can be asked again (of someone else, here the caregiver).
    const cancelledDate = '2026-11-19';
    const second = (
      await json<{ coverRequest: CoverRequest }>(await ask(cancelledDate, h.adult.id))
    ).coverRequest;
    expect((await answer(second.id, 'cancel', owner)).status).toBe(200);
    expect((await answer(second.id, 'cancel', owner)).status).toBe(200);
    expect(await json(await answer(second.id, 'accept', adult))).toEqual({
      error: 'request_closed',
    });
    const toSitter = await ask(cancelledDate, h.caregiver.id);
    expect(toSitter.status).toBe(201);
    // A caregiver can be asked and accept (they cover handoffs), though they can't ask.
    const sitterRequest = (await json<{ coverRequest: CoverRequest }>(toSitter)).coverRequest;
    expect((await ask('2026-11-20', h.adult.id, caregiver)).status).toBe(403);
    expect((await answer(sitterRequest.id, 'accept', caregiver)).status).toBe(200);
    expect((await exceptions()).map((e) => [e.occurrence_date, e.cover_member_id])).toContainEqual([
      cancelledDate,
      h.caregiver.id,
    ]);
    expect(await exceptions()).not.toContainEqual(
      expect.objectContaining({ occurrence_date: declinedDate }),
    );
  });

  it('refuses a direct cover for someone else; covering it yourself stays immediate', async () => {
    const date = '2026-11-20';
    const direct = (memberId: string, token: string) =>
      call(`/events/${dropOff}/occurrences/${date}`, {
        method: 'POST',
        token,
        body: { action: 'cover', memberId },
      });
    for (const [memberId, token] of [
      [h.adult.id, owner],
      [h.caregiver.id, owner],
      [h.owner.id, adult],
    ] as const) {
      const res = await direct(memberId, token);
      expect({ status: res.status, body: await res.json() }).toEqual({
        status: 422,
        body: { error: 'use_request' },
      });
    }
    expect(await exceptions()).not.toContainEqual(
      expect.objectContaining({ occurrence_date: date }),
    );

    // A pending request is answered by the asked adult covering it themselves.
    const asked = (await json<{ coverRequest: CoverRequest }>(await ask(date, h.adult.id)))
      .coverRequest;
    expect((await direct(h.adult.id, adult)).status).toBe(200);
    expect(await status(asked.id)).toBe('accepted');
    await call(`/events/${dropOff}/occurrences/${date}`, { method: 'DELETE' });
    // Asking, then skipping the occurrence, cancels the request.
    const again = (await json<{ coverRequest: CoverRequest }>(await ask(date, h.adult.id)))
      .coverRequest;
    expect(
      (
        await call(`/events/${dropOff}/occurrences/${date}`, {
          method: 'POST',
          body: { action: 'skip' },
        })
      ).status,
    ).toBe(200);
    expect(await status(again.id)).toBe('cancelled');
    expect(await json(await ask(date, h.adult.id))).toEqual({ error: 'occurrence_skipped' });
    await call(`/events/${dropOff}/occurrences/${date}`, { method: 'DELETE' });

    // The owner covering it themselves is immediate.
    expect((await direct(h.owner.id, owner)).status).toBe(200);
    expect(await json(await ask(date, h.adult.id))).toEqual({ error: 'already_covered' });
    await call(`/events/${dropOff}/occurrences/${date}`, { method: 'DELETE' });
  });

  it('validates who can be asked and which occurrence', async () => {
    expect(await json(await ask('2026-11-23', h.owner.id))).toEqual({ error: 'cannot_ask_self' });
    expect(await json(await ask('2026-11-23', h.child.id))).toEqual({ error: 'invalid_cover' });
    expect(await json(await ask('2026-11-23', h.pet.id))).toEqual({ error: 'invalid_cover' });
    expect((await ask('2026-11-21', h.adult.id)).status).toBe(404); // Saturday: no occurrence
    expect(
      (
        await call(`/events/${dropOff}/occurrences/2026-11-23/cover-requests`, {
          method: 'POST',
          body: {},
        })
      ).status,
    ).toBe(422);
    expect((await answer('00000000-0000-4000-8000-000000000000', 'accept', adult)).status).toBe(
      404,
    );
  });

  it('answers 409 when someone else covered it meanwhile, and keeps the request open', async () => {
    const date = '2026-11-24';
    const asked = (await json<{ coverRequest: CoverRequest }>(await ask(date, h.adult.id)))
      .coverRequest;
    // The caregiver's cover landed first (written directly, as a concurrent request would).
    await requireDb()
      .insertInto('app.event_exception')
      .values({
        household_id: h.id,
        event_id: dropOff,
        occurrence_date: date,
        kind: 'cover',
        cover_member_id: h.caregiver.id,
        created_by_member_id: h.caregiver.id,
      })
      .execute();
    expect(await json(await answer(asked.id, 'accept', adult))).toEqual({
      error: 'already_covered',
    });
    expect(await status(asked.id)).toBe('pending');
    expect((await exceptions()).find((e) => e.occurrence_date === date)?.cover_member_id).toBe(
      h.caregiver.id,
    );
    expect((await answer(asked.id, 'cancel', owner)).status).toBe(200);
  });

  it('accepts once when the same answer arrives twice at once', async () => {
    const date = '2026-11-25';
    const asked = (await json<{ coverRequest: CoverRequest }>(await ask(date, h.adult.id)))
      .coverRequest;
    const both = await Promise.all([
      answer(asked.id, 'accept', adult),
      answer(asked.id, 'accept', adult),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect((await exceptions()).filter((e) => e.occurrence_date === date)).toHaveLength(1);
  });

  it('keeps requests to their household', async () => {
    const other = await seedHousehold(requireDb(), 'Cover Other');
    try {
      const asked = (
        await json<{ coverRequest: CoverRequest }>(await ask('2026-11-26', h.adult.id))
      ).coverRequest;
      const stranger = await tokenOf(other.owner);
      for (const verb of ['accept', 'decline', 'cancel'] as const) {
        const own = await request(`/households/${other.id}/cover-requests/${asked.id}/${verb}`, {
          method: 'POST',
          token: stranger,
        });
        expect(own.status).toBe(404);
        const theirs = await request(`/households/${h.id}/cover-requests/${asked.id}/${verb}`, {
          method: 'POST',
          token: stranger,
        });
        expect(theirs.status).toBe(404);
      }
      const list = await json<{ askedOfMe: unknown[]; askedByMe: unknown[] }>(
        await request(`/households/${other.id}/cover-requests`, { token: stranger }),
      );
      expect(list).toEqual({ askedOfMe: [], askedByMe: [] });
      expect(await status(asked.id)).toBe('pending');
      expect((await answer(asked.id, 'cancel', owner)).status).toBe(200);
    } finally {
      await purgeHouseholds(requireDb(), [other.id]);
    }
  });

  it('audits with IDs only and shows asked, accepted and declined in partner activity', async () => {
    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload', 'actor_member_id'])
      .where('household_id', '=', h.id)
      .where('action', 'like', 'event.cover_%')
      .orderBy('id')
      .execute();
    expect(new Set(audit.map((a) => a.action))).toEqual(
      new Set([
        'event.cover_requested',
        'event.cover_accepted',
        'event.cover_declined',
        'event.cover_cancelled',
      ]),
    );
    for (const row of audit) {
      expect(Object.keys(row.payload).sort()).toEqual(['askedMemberId', 'date', 'requestId']);
    }
    expect(JSON.stringify(audit)).not.toMatch(/Little Oaks|drop-off|Daycare/);

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { activity } = await json<{
      activity: { action: string; actorMemberId: string; memberId: string; title: string }[];
    }>(await call(`/activity?since=${since}`));
    const lines = new Set(activity.map((a) => `${a.action}|${a.actorMemberId}|${a.memberId}`));
    expect(lines).toContain(`event.cover_accepted|${h.adult.id}|${h.adult.id}`);
    expect(lines).toContain(`event.cover_declined|${h.adult.id}|${h.adult.id}`);
    const theirs = await json<{ activity: { action: string; title: string }[] }>(
      await call(`/activity?since=${since}`, { token: adult }),
    );
    expect(theirs.activity.find((a) => a.action === 'event.cover_requested')?.title).toBe(
      'Daycare drop-off',
    );
  });

  describe('removing a cover', () => {
    const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
    const cover = (date: string, memberId: string, token: string, eventId = dropOff) =>
      call(`/events/${eventId}/occurrences/${date}`, {
        method: 'POST',
        token,
        body: { action: 'cover', memberId },
      });
    const remove = (date: string, token: string, eventId = dropOff) =>
      call(`/events/${eventId}/occurrences/${date}`, { method: 'DELETE', token });
    const auditCount = async () =>
      (
        await requireDb()
          .selectFrom('app.audit_event')
          .select('id')
          .where('household_id', '=', h.id)
          .execute()
      ).length;
    /** A refusal: 422 hand_back, the cover still there, nothing audited. */
    const refused = async (date: string, token: string, eventId = dropOff) => {
      const before = await auditCount();
      const res = await remove(date, token, eventId);
      const exception = await requireDb()
        .selectFrom('app.event_exception')
        .select(['kind', 'cover_member_id'])
        .where('event_id', '=', eventId)
        .where('occurrence_date', '=', date)
        .executeTakeFirst();
      return {
        status: res.status,
        body: await res.json(),
        kind: exception?.kind,
        audited: (await auditCount()) - before,
      };
    };
    const refusal = { status: 422, body: { error: 'hand_back' }, kind: 'cover', audited: 0 };
    let thirdAdult: string;

    beforeAll(async () => {
      const userId = crypto.randomUUID();
      const third = await requireDb()
        .insertInto('app.member')
        .values({
          household_id: h.id,
          user_id: userId,
          display_name: 'Cover Grandpa',
          role: 'adult',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      thirdAdult = await tokenFor({ userId, email: `${third.id}@example.test` });
    });
    afterEach(() => {
      clock = NOW;
    });

    it('lets the usual adult take it back', async () => {
      expect((await cover('2026-12-01', h.adult.id, adult)).status).toBe(200);
      clock = minutes(60);
      expect((await remove('2026-12-01', owner)).status).toBe(200);
    });

    it('lets the adult who covered it undo within 10 minutes, and not after', async () => {
      expect((await cover('2026-12-02', h.adult.id, adult)).status).toBe(200);
      clock = minutes(10);
      expect((await remove('2026-12-02', adult)).status).toBe(200);
      clock = NOW;
      expect((await cover('2026-12-02', h.adult.id, adult)).status).toBe(200);
      clock = minutes(11);
      expect(await refused('2026-12-02', adult)).toEqual(refusal);
    });

    it('refuses anyone else, and a caregiver can’t remove covers at all', async () => {
      expect((await cover('2026-12-03', h.adult.id, adult)).status).toBe(200);
      expect(await refused('2026-12-03', thirdAdult)).toEqual(refusal);
      expect((await remove('2026-12-03', caregiver)).status).toBe(403);
      // The usual adult still can.
      expect((await remove('2026-12-03', owner)).status).toBe(200);
    });

    it('counts a cover that replaced a skip from when it was made', async () => {
      clock = minutes(-60);
      expect(
        (
          await call(`/events/${dropOff}/occurrences/2026-12-04`, {
            method: 'POST',
            body: { action: 'skip' },
          })
        ).status,
      ).toBe(200);
      clock = NOW;
      expect((await cover('2026-12-04', h.adult.id, adult)).status).toBe(200);
      clock = minutes(5);
      expect((await remove('2026-12-04', adult)).status).toBe(200);
    });

    it('keeps an accepted cover with the adult who accepted it, past the undo window', async () => {
      const asked = (
        await json<{ coverRequest: CoverRequest }>(await ask('2026-12-07', h.adult.id))
      ).coverRequest;
      expect((await answer(asked.id, 'accept', adult)).status).toBe(200);
      clock = minutes(11);
      expect(await refused('2026-12-07', adult)).toEqual(refusal);
      expect(await refused('2026-12-07', thirdAdult)).toEqual(refusal);
      expect((await remove('2026-12-07', owner)).status).toBe(200);
    });

    it('lets anyone remove a cover that replaced nobody, and a skip as before', async () => {
      const childOnly = await seedEvent(requireDb(), h, {
        title: 'Swim lesson',
        startsAt: '2026-12-08T01:00:00Z',
        endsAt: '2026-12-08T01:45:00Z',
        memberIds: [h.child.id],
        careMemberId: h.child.id,
        careAction: 'drop_off',
      });
      expect((await cover('2026-12-07', h.adult.id, adult, childOnly)).status).toBe(200);
      clock = minutes(30);
      expect((await remove('2026-12-07', thirdAdult, childOnly)).status).toBe(200);
      expect(
        (
          await call(`/events/${dropOff}/occurrences/2026-12-08`, {
            method: 'POST',
            token: adult,
            body: { action: 'skip' },
          })
        ).status,
      ).toBe(200);
      expect((await remove('2026-12-08', thirdAdult)).status).toBe(200);
    });
  });

  it('cancels what a removed member asked or was asked', async () => {
    const asked = (await json<{ coverRequest: CoverRequest }>(await ask('2026-11-27', h.adult.id)))
      .coverRequest;
    expect((await call(`/members/${h.adult.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await status(asked.id)).toBe('cancelled');
  });
});
