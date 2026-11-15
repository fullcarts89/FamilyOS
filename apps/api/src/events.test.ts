import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Family Rhythm through the HTTP API: pets and member identity, events, occurrences, rhythm.
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

interface Member {
  id: string;
  displayName: string;
  role: string;
  color: string;
  species: string | null;
  note: string | null;
  version: number;
}
interface Occurrence {
  key: string;
  eventId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  title: string;
  memberIds: string[];
  skipped: boolean;
  cover: { memberId: string; replacedMemberIds: string[] } | null;
  careAction: string | null;
  version: number;
}
interface EventView {
  id: string;
  version: number;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  startsOn: string;
  endsOn: string;
  memberIds: string[];
  careMemberId: string | null;
  careAction: string | null;
  carePlace: string | null;
  summary: string | null;
  recurrence: unknown;
}

describe.skipIf(!db)('Family Rhythm API', () => {
  const { request, tokenFor, logs } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const base = () => `/households/${h.id}`;
  const json = async <T>(res: Response) => (await res.json()) as T;
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`${base()}${path}`, { ...init, token: init.token ?? owner });

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Rhythm');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
    caregiver = await tokenOf(h.caregiver);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('members', () => {
    it('lists members with color, species and note', async () => {
      const { members } = await json<{ members: Member[] }>(await call(''));
      const pet = members.find((m) => m.id === h.pet.id);
      expect(pet).toMatchObject({ role: 'pet', color: expect.stringMatching(/^#[0-9A-F]{6}$/) });
      expect(new Set(members.map((m) => m.color)).size).toBe(members.length);
    });

    it('lets an adult add a pet and a child, and refuses species on a child', async () => {
      const pet = await call('/members', {
        method: 'POST',
        token: adult,
        body: { role: 'pet', displayName: 'Biscuit', species: 'Dog', color: '#8a6a4f' },
      });
      expect(pet.status).toBe(201);
      expect((await json<{ member: Member }>(pet)).member).toMatchObject({
        role: 'pet',
        displayName: 'Biscuit',
        species: 'Dog',
        color: '#8A6A4F',
        version: 1,
      });
      const child = await call('/members', {
        method: 'POST',
        token: adult,
        body: { role: 'child', displayName: 'June', note: 'Age 2' },
      });
      expect(child.status).toBe(201);
      const bad = [
        { role: 'child', displayName: 'X', species: 'Dog' },
        { role: 'adult', displayName: 'X' },
        { role: 'pet', displayName: '' },
        { role: 'pet', displayName: 'X', color: 'blue' },
        { role: 'pet', displayName: 'X', userId: h.owner.userId },
      ];
      for (const body of bad) {
        expect((await call('/members', { method: 'POST', body })).status).toBe(422);
      }
      expect(
        (
          await call('/members', {
            method: 'POST',
            token: caregiver,
            body: { role: 'pet', displayName: 'X' },
          })
        ).status,
      ).toBe(403);
    });

    it('edits children, pets and yourself, versioned', async () => {
      const patch = (id: string, body: unknown, token = adult) =>
        call(`/members/${id}`, { method: 'PATCH', token, body });
      const res = await patch(h.pet.id, { expectedVersion: 1, species: 'Cat', note: 'Shy' });
      expect(res.status).toBe(200);
      expect((await json<{ member: Member }>(res)).member).toMatchObject({
        species: 'Cat',
        note: 'Shy',
        version: 2,
      });
      expect((await patch(h.pet.id, { expectedVersion: 1, note: 'stale' })).status).toBe(409);
      expect((await patch(h.child.id, { expectedVersion: 1, species: 'Dog' })).status).toBe(422);
      expect((await patch(h.adult.id, { expectedVersion: 1, color: '#123ABC' })).status).toBe(200);
      // An adult can't edit another adult; the owner can.
      expect((await patch(h.owner.id, { expectedVersion: 1, color: '#123ABC' })).status).toBe(403);
      expect(
        (await patch(h.caregiver.id, { expectedVersion: 1, note: 'Sitter' }, owner)).status,
      ).toBe(200);
      expect((await patch(h.pet.id, { expectedVersion: 2 })).status).toBe(422);
      expect((await patch(h.pet.id, { expectedVersion: 2, note: 'x' }, caregiver)).status).toBe(
        403,
      );
    });

    it('never makes a child or pet the owner of work, only its subject', async () => {
      for (const ownerMemberId of [h.child.id, h.pet.id]) {
        const res = await call('/work-items', {
          method: 'POST',
          body: { title: 'x', ownerMemberId, inbox: false },
        });
        expect(res.status).toBe(422);
      }
      const ok = await call('/work-items', {
        method: 'POST',
        body: {
          title: 'Flea meds',
          ownerMemberId: h.adult.id,
          subjectMemberId: h.pet.id,
          inbox: false,
        },
      });
      expect(ok.status).toBe(201);
      const { item } = await json<{
        item: { id: string; subjectMemberId: string; version: number };
      }>(ok);
      expect(item.subjectMemberId).toBe(h.pet.id);
      const notCaredFor = await call('/work-items', {
        method: 'POST',
        body: { title: 'x', subjectMemberId: h.adult.id },
      });
      expect(await json(notCaredFor)).toEqual({ error: 'invalid_subject' });
      const cleared = await call(`/work-items/${item.id}`, {
        method: 'PATCH',
        body: { expectedVersion: item.version, subjectMemberId: null },
      });
      expect(
        (await json<{ item: { subjectMemberId: null } }>(cleared)).item.subjectMemberId,
      ).toBeNull();
      const listed = await call(`/work-items?subjectMemberId=${h.pet.id}`);
      expect((await json<{ items: unknown[] }>(listed)).items).toEqual([]);
    });

    it('gives a routine a subject that its occurrences carry', async () => {
      const res = await call('/routines', {
        method: 'POST',
        body: {
          title: "Biscuit's flea meds",
          rule: { freq: 'monthly', interval: 1, dayOfMonth: 1 },
          startOn: '2026-12-01',
          ownerMemberId: h.owner.id,
          subjectMemberId: h.pet.id,
        },
      });
      expect(res.status).toBe(201);
      const { routine } = await json<{
        routine: { id: string; subjectMemberId: string; version: number };
      }>(res);
      expect(routine.subjectMemberId).toBe(h.pet.id);
      const occurrences = await requireDb()
        .selectFrom('app.work_item')
        .select(['subject_member_id', 'owner_member_id'])
        .where('household_id', '=', h.id)
        .where('recurrence_rule_id', 'is not', null)
        .where('title', '=', "Biscuit's flea meds")
        .execute();
      expect(occurrences).toEqual([{ subject_member_id: h.pet.id, owner_member_id: h.owner.id }]);
      const moved = await call(`/routines/${routine.id}`, {
        method: 'PATCH',
        body: { expectedVersion: routine.version, subjectMemberId: h.child.id },
      });
      expect(moved.status).toBe(200);
      const after = await requireDb()
        .selectFrom('app.work_item')
        .select('subject_member_id')
        .where('household_id', '=', h.id)
        .where('title', '=', "Biscuit's flea meds")
        .execute();
      expect(after.every((r) => r.subject_member_id === h.child.id)).toBe(true);
      expect(
        (
          await call('/routines', {
            method: 'POST',
            body: {
              title: 'x',
              rule: { freq: 'daily', interval: 1 },
              startOn: '2026-12-01',
              subjectMemberId: h.owner.id,
            },
          })
        ).status,
      ).toBe(422);
    });
  });

  describe('events', () => {
    let dropOffId: string;
    let pickUpId: string;

    const create = async (body: Record<string, unknown>, token = owner) => {
      const res = await call('/events', { method: 'POST', token, body });
      expect(res.status).toBe(201);
      return (await json<{ event: EventView }>(res)).event;
    };
    const list = async (from: string, to: string, token = owner) => {
      const res = await call(`/events?from=${from}&to=${to}`, { token });
      expect(res.status).toBe(200);
      return (await json<{ occurrences: Occurrence[]; timezone: string }>(res)).occurrences;
    };

    it('creates recurring care events and expands them in the household timezone', async () => {
      const weekdays = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
      const dropOff = await create({
        title: 'Daycare drop-off',
        kind: 'childcare',
        startsAt: '2026-10-26T08:15:00-07:00',
        endsAt: '2026-10-26T08:35:00-07:00',
        recurrence: weekdays,
        memberIds: [h.adult.id, h.child.id],
        careMemberId: h.child.id,
        careAction: 'drop_off',
        carePlace: 'Little Oaks',
      });
      dropOffId = dropOff.id;
      expect(dropOff).toMatchObject({
        startsOn: '2026-10-26',
        summary: 'Every Mon, Tue, Wed, Thu and Fri',
        careAction: 'drop_off',
        version: 1,
      });
      pickUpId = (
        await create({
          title: 'Daycare pickup',
          kind: 'childcare',
          startsAt: '2026-10-26T17:30:00-07:00',
          endsAt: '2026-10-26T17:50:00-07:00',
          recurrence: weekdays,
          memberIds: [h.owner.id, h.child.id],
          careMemberId: h.child.id,
          careAction: 'pick_up',
          carePlace: 'Little Oaks',
        })
      ).id;

      // Across the fall-back change: 08:15 local both before and after.
      const got = await list('2026-10-30', '2026-11-02');
      const drops = got.filter((o) => o.eventId === dropOffId);
      expect(drops.map((o) => [o.key, o.startsAt])).toEqual([
        [`${dropOffId}:2026-10-30`, '2026-10-30T15:15:00Z'],
        [`${dropOffId}:2026-11-02`, '2026-11-02T16:15:00Z'],
      ]);
      expect(drops[0]).toMatchObject({
        memberIds: [h.adult.id, h.child.id],
        careAction: 'drop_off',
      });
      // Caregivers can read the schedule.
      expect((await list('2026-11-16', '2026-11-16', caregiver)).length).toBe(2);
    });

    it('creates all-day and one-off events', async () => {
      const closed = await create({
        title: 'Daycare closed',
        kind: 'childcare',
        allDay: true,
        startsOn: '2026-11-26',
        endsOn: '2026-11-27',
        memberIds: [h.child.id],
      });
      expect(closed).toMatchObject({
        allDay: true,
        startsAt: '2026-11-26T08:00:00.000Z',
        endsAt: '2026-11-28T08:00:00.000Z',
        startsOn: '2026-11-26',
        endsOn: '2026-11-27',
      });
      const keys = (await list('2026-11-27', '2026-11-27')).map((o) => o.key);
      expect(keys).toContain(`${closed.id}:2026-11-26`);
      expect((await list('2026-11-28', '2026-11-28')).map((o) => o.eventId)).not.toContain(
        closed.id,
      );
    });

    it('rejects invalid events', async () => {
      const ok = {
        title: 'Dentist',
        startsAt: '2026-11-17T11:00:00-08:00',
        endsAt: '2026-11-17T11:45:00-08:00',
      };
      const cases: [Record<string, unknown>, string][] = [
        [{ ...ok, endsAt: '2026-11-17T10:00:00-08:00' }, 'invalid_times'],
        [{ ...ok, endsAt: '2027-01-17T10:00:00-08:00' }, 'invalid_times'],
        [{ title: 'x', allDay: true }, 'invalid_times'],
        [
          { title: 'x', allDay: true, startsOn: '2026-11-17', endsOn: '2026-11-16' },
          'invalid_times',
        ],
        [{ ...ok, allDay: true }, 'invalid_times'],
        [{ ...ok, title: '' }, 'invalid_body'],
        [{ ...ok, title: 'x'.repeat(201) }, 'invalid_body'],
        [{ ...ok, location: 'x'.repeat(201) }, 'invalid_body'],
        [{ ...ok, notes: 'x'.repeat(2001) }, 'invalid_body'],
        [{ ...ok, kind: 'party' }, 'invalid_body'],
        [{ ...ok, recurrence: { freq: 'after_completion', intervalDays: 3 } }, 'invalid_body'],
        [{ ...ok, recurrence: { freq: 'weekly', interval: 1, weekdays: [] } }, 'invalid_body'],
        [{ ...ok, recursUntil: '2026-12-01' }, 'invalid_body'],
        [
          { ...ok, recurrence: { freq: 'daily', interval: 1 }, recursUntil: '2026-11-01' },
          'invalid_times',
        ],
        [{ ...ok, careMemberId: h.adult.id }, 'invalid_care_member'],
        [{ ...ok, careAction: 'pick_up' }, 'invalid_care_member'],
        [{ ...ok, memberIds: [h.adult.id, h.adult.id] }, 'invalid_body'],
        [{ ...ok, memberIds: ['00000000-0000-4000-8000-000000000000'] }, 'invalid_member'],
        [{ ...ok, careAction: 'carry', careMemberId: h.child.id }, 'invalid_body'],
      ];
      for (const [body, error] of cases) {
        const res = await call('/events', { method: 'POST', body });
        expect({
          body,
          status: res.status,
          error: (await json<{ error: string }>(res)).error,
        }).toEqual({
          body,
          status: 422,
          error,
        });
      }
      expect((await call('/events', { method: 'POST', token: caregiver, body: ok })).status).toBe(
        403,
      );
      for (const query of [
        '',
        '?from=2026-11-01',
        '?from=2026-11-10&to=2026-11-01',
        '?from=x&to=y',
      ]) {
        expect((await call(`/events${query}`)).status).toBe(422);
      }
      expect(await json(await call('/events?from=2026-11-01&to=2027-01-02'))).toEqual({
        error: 'range_too_long',
      });
    });

    it('edits an event with optimistic concurrency, and deletes it', async () => {
      const event = await create({
        title: 'Dentist',
        kind: 'appointment',
        startsAt: '2026-11-17T11:00:00-08:00',
        endsAt: '2026-11-17T11:45:00-08:00',
        memberIds: [h.adult.id],
      });
      const patch = (body: Record<string, unknown>) =>
        call(`/events/${event.id}`, { method: 'PATCH', body });
      const moved = await patch({
        expectedVersion: 1,
        startsAt: '2026-11-18T09:00:00-08:00',
        endsAt: '2026-11-18T09:30:00-08:00',
        memberIds: [h.owner.id, h.child.id],
        location: 'Hawthorne Dental',
      });
      expect(moved.status).toBe(200);
      expect((await json<{ event: EventView }>(moved)).event).toMatchObject({
        startsOn: '2026-11-18',
        memberIds: expect.arrayContaining([h.owner.id, h.child.id]),
        version: 2,
      });
      expect((await patch({ expectedVersion: 1, title: 'stale' })).status).toBe(409);
      expect((await patch({ expectedVersion: 2 })).status).toBe(422);
      expect(
        (await patch({ expectedVersion: 2, endsAt: '2026-11-18T08:00:00-08:00' })).status,
      ).toBe(422);
      // Switching to all-day needs the dates.
      expect((await patch({ expectedVersion: 2, allDay: true })).status).toBe(422);
      const allDay = await patch({ expectedVersion: 2, allDay: true, startsOn: '2026-11-18' });
      expect((await json<{ event: EventView }>(allDay)).event).toMatchObject({
        allDay: true,
        startsOn: '2026-11-18',
        endsOn: '2026-11-18',
        version: 3,
      });
      const del = (q: string) => call(`/events/${event.id}${q}`, { method: 'DELETE' });
      expect((await del('')).status).toBe(422);
      expect((await del('?expectedVersion=2')).status).toBe(409);
      expect((await del('?expectedVersion=3')).status).toBe(204);
      expect((await call(`/events/${event.id}`)).status).toBe(404);

      const audit = await requireDb()
        .selectFrom('app.audit_event')
        .select(['action', 'payload'])
        .where('household_id', '=', h.id)
        .where('entity_id', '=', event.id)
        .orderBy('id')
        .execute();
      expect(audit.map((a) => a.action)).toEqual([
        'event.created',
        'event.updated',
        'event.updated',
        'event.deleted',
      ]);
      expect(audit[1]?.payload).toEqual({
        fields: ['all_day', 'ends_at', 'location', 'members', 'starts_at'],
        version: 2,
      });
      expect(JSON.stringify(audit)).not.toMatch(/Dentist|Hawthorne/);
    });

    it('skips and covers single occurrences, and undoes them', async () => {
      const date = '2026-11-19';
      const occ = (body: unknown, d = date, token = owner) =>
        call(`/events/${pickUpId}/occurrences/${d}`, { method: 'POST', body, token });
      const covered = await occ({ action: 'cover', memberId: h.adult.id });
      expect(covered.status).toBe(200);
      expect((await json<{ occurrence: Occurrence }>(covered)).occurrence).toMatchObject({
        key: `${pickUpId}:${date}`,
        memberIds: [h.adult.id, h.child.id],
        cover: { memberId: h.adult.id, replacedMemberIds: [h.owner.id] },
      });
      const listed = (await list(date, date)).find((o) => o.eventId === pickUpId);
      expect(listed?.cover?.memberId).toBe(h.adult.id);

      // Skipping replaces the cover.
      const skipped = await occ({ action: 'skip' });
      expect((await json<{ occurrence: Occurrence }>(skipped)).occurrence).toMatchObject({
        skipped: true,
        cover: null,
      });
      const undo = await call(`/events/${pickUpId}/occurrences/${date}`, { method: 'DELETE' });
      expect((await json<{ occurrence: Occurrence }>(undo)).occurrence.skipped).toBe(false);
      expect(
        (await call(`/events/${pickUpId}/occurrences/${date}`, { method: 'DELETE' })).status,
      ).toBe(404);

      // Validation: covers are adults, dates are occurrences.
      expect((await occ({ action: 'cover', memberId: h.child.id })).status).toBe(422);
      expect((await occ({ action: 'cover', memberId: h.pet.id })).status).toBe(422);
      expect((await occ({ action: 'cover' })).status).toBe(422);
      expect((await occ({ action: 'skip', memberId: h.adult.id })).status).toBe(422);
      expect((await occ({ action: 'skip' }, '2026-11-21')).status).toBe(404); // Saturday
      expect((await occ({ action: 'skip' }, '2026-02-30')).status).toBe(404);
      expect((await occ({ action: 'skip' }, date, caregiver)).status).toBe(403);
      // Caregivers can cover (they're adults), when an adult records it.
      expect((await occ({ action: 'cover', memberId: h.caregiver.id })).status).toBe(200);
      await call(`/events/${pickUpId}/occurrences/${date}`, { method: 'DELETE' });
    });

    it('builds the rhythm for a day with handoffs and heads-ups', async () => {
      const date = '2026-11-19';
      await create({
        title: 'Quarterly planning',
        kind: 'work',
        startsAt: '2026-11-19T14:00:00-08:00',
        endsAt: '2026-11-19T18:00:00-08:00',
        memberIds: [h.owner.id],
        notes: 'PRIVATE NOTE',
      });
      await create({
        title: 'Vet',
        startsAt: '2026-11-19T10:00:00-08:00',
        endsAt: '2026-11-19T10:30:00-08:00',
        careMemberId: h.pet.id,
      });
      const res = await call(`/rhythm?date=${date}`);
      expect(res.status).toBe(200);
      const view = await json<{
        date: string;
        lanes: {
          memberId: string;
          caredFor: boolean;
          segments: { location: { kind: string } }[];
        }[];
        handoffs: { action: string; from: unknown; to: unknown }[];
        headsUps: { type: string; text: string }[];
        members: { id: string; color: string }[];
      }>(res);
      expect(view.date).toBe(date);
      expect(view.lanes.map((l) => l.memberId)).toEqual(
        expect.arrayContaining([h.owner.id, h.adult.id, h.child.id, h.pet.id]),
      );
      const child = view.lanes.find((l) => l.memberId === h.child.id);
      expect(child?.segments.map((s) => s.location.kind)).toEqual(['home', 'away', 'home']);
      expect(view.handoffs.map((x) => [x.action, x.from, x.to])).toEqual([
        [
          'drop_off',
          { kind: 'member', memberId: h.adult.id },
          { kind: 'place', place: 'Little Oaks' },
        ],
        [
          'pick_up',
          { kind: 'place', place: 'Little Oaks' },
          { kind: 'member', memberId: h.owner.id },
        ],
      ]);
      expect(view.headsUps.map((x) => x.type)).toEqual(['handoff_conflict', 'care_unassigned']);
      expect(view.headsUps[0]?.text).toContain('“Quarterly planning”');
      expect(JSON.stringify(view.headsUps)).not.toContain('PRIVATE NOTE');

      // Covering the pickup resolves the conflict.
      await call(`/events/${pickUpId}/occurrences/${date}`, {
        method: 'POST',
        body: { action: 'cover', memberId: h.adult.id },
      });
      const after = await json<{ headsUps: { type: string }[] }>(
        await call(`/rhythm?date=${date}`),
      );
      expect(after.headsUps.map((x) => x.type)).toEqual(['care_unassigned']);
      expect((await call('/rhythm?date=tomorrow')).status).toBe(422);
      // Default date is today in the household timezone.
      expect((await json<{ date: string }>(await call('/rhythm'))).date).toBe('2026-11-16');
      expect((await call('/rhythm', { token: caregiver })).status).toBe(200);
    });

    it('flags overdue routine occurrences in the rhythm', async () => {
      const res = await call('/routines', {
        method: 'POST',
        body: {
          title: 'Trash and recycling',
          rule: { freq: 'weekly', interval: 1, weekdays: [3] },
          startOn: '2026-11-11',
          time: '20:00',
          ownerMemberId: h.adult.id,
        },
      });
      expect(res.status).toBe(201);
      // Backdate generation so last Wednesday's occurrence exists and is open.
      await requireDb()
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title: 'Trash and recycling',
          status: 'ready',
          owner_member_id: h.adult.id,
          created_by_member_id: h.owner.id,
          recurrence_rule_id: (
            await requireDb()
              .selectFrom('app.recurrence_rule as r')
              .innerJoin('app.work_item as w', 'w.id', 'r.routine_id')
              .select('r.id')
              .where('w.title', '=', 'Trash and recycling')
              .where('w.household_id', '=', h.id)
              .executeTakeFirstOrThrow()
          ).id,
          occurrence_index: 0,
          occurrence_on: '2026-11-11',
          due_at: '2026-11-12T04:00:00Z',
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
      const view = await json<{ headsUps: { type: string; text: string }[] }>(
        await call('/rhythm?date=2026-11-16'),
      );
      expect(view.headsUps.filter((x) => x.type === 'overdue_routine').map((x) => x.text)).toEqual([
        '“Trash and recycling” was due Wed, Nov 11 and is still open for Rhythm Adult.',
      ]);
    });
  });

  it('never writes event or member content to the logs', () => {
    const text = logs.join('\n');
    for (const secret of ['Little Oaks', 'Biscuit', 'Quarterly planning', 'PRIVATE NOTE']) {
      expect(text).not.toContain(secret);
    }
  });
});
