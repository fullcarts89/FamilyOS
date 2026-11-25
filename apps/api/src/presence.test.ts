import { createDb, materializeRoutine, withSchedulerContext, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  seedRoutine,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Who's in town (docs/plan/whos-in-town.md), through the HTTP API and the scheduler.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Monday 2026-11-16, 07:00 in Los Angeles.
const MONDAY = new Date('2026-11-16T15:00:00Z');
const at = (date: string) => new Date(`${date}T15:00:00Z`);

interface AwayPeriod {
  id: string;
  memberId: string;
  startsOn: string;
  endsOn: string | null;
  backOn: string | null;
  coverMemberId: string | null;
  version: number;
}
interface Suggestion {
  item: { id: string; version: number; title: string };
  date: string;
  coverMemberId: string;
}

describe.skipIf(!db)('who’s in town', () => {
  let clock = MONDAY;
  const { request, tokenFor } = db ? createTestApp({ db, now: () => clock }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;

  const task = async (
    title: string,
    values: { owner?: string | null; dueOn?: string | null; visibility?: 'household' | 'private' },
  ) =>
    (
      await requireDb()
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title,
          status: 'ready',
          owner_member_id: values.owner === undefined ? h.owner.id : values.owner,
          due_on: values.dueOn === undefined ? '2026-11-18' : values.dueOn,
          visibility: values.visibility ?? 'household',
          created_by_member_id: values.owner ?? h.owner.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const ownerOf = async (id: string) =>
    (
      await requireDb()
        .selectFrom('app.work_item')
        .select('owner_member_id')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).owner_member_id;
  const markAway = async (
    body: Record<string, unknown>,
    token = owner,
  ): Promise<{ awayPeriod: AwayPeriod; suggestions: Suggestion[] }> => {
    const res = await call('/away-periods', { method: 'POST', body, token });
    expect(res.status).toBe(201);
    return json(res);
  };
  const remove = (p: { id: string; version: number }, token = owner) =>
    call(`/away-periods/${p.id}?expectedVersion=${p.version}`, { method: 'DELETE', token });
  const materialize = (routineId: string) =>
    withSchedulerContext(requireDb(), h.id, (trx) =>
      materializeRoutine(trx, { householdId: h.id, routineId, now: clock, requestId: 'test' }),
    );

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'InTown');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
    caregiver = await tokenOf(h.caregiver);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('suggests what goes to the adult at home, and moves only what an adult confirms', async () => {
    clock = MONDAY;
    const wednesday = await task('Pay daycare', { dueOn: '2026-11-18' });
    const friday = await task('Return library books', { dueOn: '2026-11-20' });
    const backDay = await task('Dentist forms', { dueOn: '2026-11-21' });
    const undated = await task('Sort the garage', { dueOn: null });
    const secret = await task('Anniversary gift', { visibility: 'private' });

    // The owner is away Wednesday to Friday; the adult covers by default.
    const { awayPeriod, suggestions } = await markAway({
      memberId: h.owner.id,
      startsOn: '2026-11-18',
      endsOn: '2026-11-20',
    });
    expect(awayPeriod).toMatchObject({
      memberId: h.owner.id,
      coverMemberId: h.adult.id,
      backOn: '2026-11-21',
      version: 1,
    });
    expect(suggestions.map((s) => s.item.id)).toEqual([wednesday, friday]);
    expect(suggestions.every((s) => s.coverMemberId === h.adult.id)).toBe(true);
    // Nothing has moved yet.
    expect(await ownerOf(wednesday)).toBe(h.owner.id);

    // The adult sees the suggestion count too, but not the owner's private item.
    const seen = await json<{ handovers: { awayPeriodId: string; count: number }[] }>(
      await call('/presence', { token: adult }),
    );
    expect(seen.handovers).toEqual([{ awayPeriodId: awayPeriod.id, count: 2 }]);

    // Move Wednesday's, keep Friday's with the owner.
    const wed = suggestions.find((s) => s.item.id === wednesday);
    const res = await call(`/away-periods/${awayPeriod.id}/handover`, {
      method: 'POST',
      body: { move: [{ id: wednesday, expectedVersion: wed?.item.version }], keep: [friday] },
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ moved: 1, kept: 1, suggestions: [] });
    expect(await ownerOf(wednesday)).toBe(h.adult.id);
    expect(await ownerOf(friday)).toBe(h.owner.id);
    for (const id of [backDay, undated, secret]) expect(await ownerOf(id)).toBe(h.owner.id);

    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload'])
      .where('entity_id', '=', wednesday)
      .execute();
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'work_item.handed_over',
        payload: expect.objectContaining({
          ownerMemberId: h.adult.id,
          fromOwnerMemberId: h.owner.id,
          awayPeriodId: awayPeriod.id,
        }),
      }),
    ]);

    // Today (Wednesday) says who's away and that the adult is covering it.
    clock = at('2026-11-18');
    const rhythm = await json<{
      presence: { away: { id: string }[] };
      covering: { workItemId: string; forMemberId: string }[];
      lanes: { memberId: string; away: { id: string } | null }[];
    }>(await call('/rhythm', { token: adult }));
    expect(rhythm.presence.away.map((p) => p.id)).toEqual([awayPeriod.id]);
    expect(rhythm.covering).toEqual([{ workItemId: wednesday, forMemberId: h.owner.id }]);
    expect(rhythm.lanes.find((l) => l.memberId === h.owner.id)?.away?.id).toBe(awayPeriod.id);

    // Removing the period gives back what's still ahead and untouched; nothing late moves.
    clock = MONDAY;
    const removed = await remove(awayPeriod);
    expect(await json(removed)).toEqual({ returned: 1 });
    expect(await ownerOf(wednesday)).toBe(h.owner.id);
  });

  it('refuses a private item, an overlap, and a child or pet as cover; caregivers only read', async () => {
    clock = MONDAY;
    const secret = await task('Surprise party', { visibility: 'private' });
    const { awayPeriod } = await markAway({
      memberId: h.owner.id,
      startsOn: '2026-11-23',
      endsOn: '2026-11-24',
    });
    const res = await call(`/away-periods/${awayPeriod.id}/handover`, {
      method: 'POST',
      body: { move: [{ id: secret, expectedVersion: 1 }] },
    });
    expect(res.status).toBe(409);
    expect(await ownerOf(secret)).toBe(h.owner.id);

    const overlap = await call('/away-periods', {
      method: 'POST',
      body: { memberId: h.owner.id, startsOn: '2026-11-24', endsOn: null },
    });
    expect(overlap.status).toBe(409);
    expect(await json(overlap)).toMatchObject({ error: 'away_overlaps' });

    const childCover = await call('/away-periods', {
      method: 'POST',
      body: {
        memberId: h.adult.id,
        startsOn: '2026-12-01',
        endsOn: null,
        coverMemberId: h.child.id,
      },
    });
    expect(childCover.status).toBe(422);
    const backwards = await call('/away-periods', {
      method: 'POST',
      body: { memberId: h.adult.id, startsOn: '2026-12-04', endsOn: '2026-12-01' },
    });
    expect(backwards.status).toBe(422);

    expect((await call('/presence', { token: caregiver })).status).toBe(200);
    const sitter = await call('/away-periods', {
      method: 'POST',
      token: caregiver,
      body: { memberId: h.caregiver.id, startsOn: '2026-12-01', endsOn: null },
    });
    expect(sitter.status).toBe(403);
    expect((await remove(awayPeriod)).status).toBe(200);
  });

  it('routes routine turns, pays them back, and withdraws the payback when shortened', async () => {
    // Bins every day, the owner and the adult taking turns from Monday (index 0, the owner's).
    const { routineId, ruleId } = await seedRoutine(requireDb(), h, {
      title: 'Bins',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-16',
      rotation: [h.owner.id, h.adult.id],
    });
    const turns = () =>
      requireDb()
        .selectFrom('app.work_item')
        .select(['id', 'occurrence_index', 'owner_member_id', 'version'])
        .where('recurrence_rule_id', '=', ruleId)
        .orderBy('occurrence_index')
        .execute();
    const overrides = () =>
      requireDb()
        .selectFrom('app.occurrence_exception')
        .select(['occurrence_index', 'owner_member_id'])
        .where('recurrence_rule_id', '=', ruleId)
        .where('kind', '=', 'owner')
        .orderBy('occurrence_index')
        .execute();

    // Tuesday: Wednesday's turn (index 2, the owner's) exists before anyone is away.
    clock = at('2026-11-17');
    await materialize(routineId);
    const wednesday = (await turns()).find((t) => t.occurrence_index === 2);
    expect(wednesday?.owner_member_id).toBe(h.owner.id);

    const { awayPeriod, suggestions } = await markAway({
      memberId: h.owner.id,
      startsOn: '2026-11-18',
      endsOn: '2026-11-20',
    });
    expect(suggestions.map((s) => s.item.id)).toContain(wednesday?.id);
    await call(`/away-periods/${awayPeriod.id}/handover`, {
      method: 'POST',
      body: { move: [{ id: wednesday?.id, expectedVersion: wednesday?.version }] },
    });
    expect(await ownerOf(wednesday?.id ?? '')).toBe(h.adult.id);
    // Paid back: the owner takes the adult's first turn after they're back (Saturday, index 5).
    expect(await overrides()).toEqual([{ occurrence_index: 5, owner_member_id: h.owner.id }]);

    // Thursday: the scheduler creates Friday's turn (the owner's) for the adult, on its own,
    // and pays it back with the adult's next turn after that (Monday, index 7).
    clock = at('2026-11-19');
    await materialize(routineId);
    const friday = (await turns()).find((t) => t.occurrence_index === 4);
    expect(friday?.owner_member_id).toBe(h.adult.id);
    expect(await overrides()).toEqual([
      { occurrence_index: 5, owner_member_id: h.owner.id },
      { occurrence_index: 7, owner_member_id: h.owner.id },
    ]);
    const routed = await requireDb()
      .selectFrom('app.away_handover')
      .select(['outcome', 'created_by_member_id', 'payback_index'])
      .where('work_item_id', '=', friday?.id ?? '')
      .executeTakeFirstOrThrow();
    expect(routed).toEqual({ outcome: 'moved', created_by_member_id: null, payback_index: 7 });

    // Back a day early: Friday's turn goes back to the owner and its payback is withdrawn.
    // Wednesday's (already past) stays with the adult, paid back as before.
    const res = await call(`/away-periods/${awayPeriod.id}`, {
      method: 'PATCH',
      body: { expectedVersion: awayPeriod.version, endsOn: '2026-11-19' },
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ returned: 1, awayPeriod: { backOn: '2026-11-20' } });
    expect(await ownerOf(friday?.id ?? '')).toBe(h.owner.id);
    expect(await ownerOf(wednesday?.id ?? '')).toBe(h.adult.id);
    expect(await overrides()).toEqual([{ occurrence_index: 5, owner_member_id: h.owner.id }]);

    const current = await json<{ awayPeriods: AwayPeriod[] }>(await call('/presence'));
    const p = current.awayPeriods.find((x) => x.id === awayPeriod.id);
    if (p) await remove(p);
  });

  it('puts the cover down for an away adult’s handoffs, and nudges about an away child’s', async () => {
    clock = MONDAY;
    const dropOff = await seedEvent(requireDb(), h, {
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
    const { awayPeriod } = await markAway({
      memberId: h.owner.id,
      startsOn: '2026-11-25',
      endsOn: '2026-11-25',
    });
    const week = await json<{
      occurrences: {
        eventId: string;
        date: string;
        memberIds: string[];
        away: { awayMemberIds: string[]; coverMemberId: string | null } | null;
      }[];
    }>(await call('/events?from=2026-11-24&to=2026-11-26', { token: adult }));
    const byDate = new Map(
      week.occurrences.filter((o) => o.eventId === dropOff).map((o) => [o.date, o]),
    );
    expect(byDate.get('2026-11-24')?.memberIds.sort()).toEqual([h.owner.id, h.child.id].sort());
    expect(byDate.get('2026-11-25')?.memberIds.sort()).toEqual([h.adult.id, h.child.id].sort());
    expect(byDate.get('2026-11-25')?.away).toEqual({
      awayMemberIds: [h.owner.id],
      coverMemberId: h.adult.id,
    });
    await remove(awayPeriod);

    // The child is away on Thursday: no cover, and Today offers to skip the drop-off.
    const child = await markAway({ memberId: h.child.id, startsOn: '2026-11-26', endsOn: null });
    expect(child.awayPeriod.coverMemberId).toBeNull();
    clock = at('2026-11-26');
    const rhythm = await json<{ headsUps: { type: string; eventId: string }[] }>(
      await call('/rhythm'),
    );
    expect(rhythm.headsUps).toContainEqual(
      expect.objectContaining({ type: 'care_while_away', eventId: dropOff }),
    );
    await remove(child.awayPeriod);
    await requireDb().deleteFrom('app.event').where('id', '=', dropOff).execute();
  });

  it('keeps visitors for planning ahead, on Today and in the Weekly Reset', async () => {
    clock = MONDAY;
    const res = await call('/visitors', {
      method: 'POST',
      body: {
        name: 'Grandma',
        arrivesOn: '2026-11-21',
        leavesOn: '2026-11-24',
        notes: 'Guest room',
      },
    });
    expect(res.status).toBe(201);
    const { visitor } = await json<{ visitor: { id: string; version: number } }>(res);
    expect(
      (
        await call('/visitors', {
          method: 'POST',
          token: caregiver,
          body: { name: 'Uncle', arrivesOn: '2026-11-21', leavesOn: '2026-11-22' },
        })
      ).status,
    ).toBe(403);

    // Monday: arriving Saturday, within a week.
    const today = await json<{ presence: { arriving: { id: string }[]; visiting: unknown[] } }>(
      await call('/rhythm', { token: caregiver }),
    );
    expect(today.presence.arriving.map((v) => v.id)).toEqual([visitor.id]);
    expect(today.presence.visiting).toEqual([]);

    const reset = await json<{ presence: { visiting: { id: string; notes: string }[] } }>(
      await call('/reset?week=2026-11-16'),
    );
    expect(reset.presence.visiting).toEqual([
      expect.objectContaining({ id: visitor.id, notes: 'Guest room' }),
    ]);

    const edited = await call(`/visitors/${visitor.id}`, {
      method: 'PATCH',
      body: { expectedVersion: visitor.version, leavesOn: '2026-11-20' },
    });
    expect(edited.status).toBe(422);
    const later = await call(`/visitors/${visitor.id}`, {
      method: 'PATCH',
      body: { expectedVersion: visitor.version, leavesOn: '2026-11-26', notes: null },
    });
    expect(later.status).toBe(200);
    const updated = (await json<{ visitor: { version: number; notes: string | null } }>(later))
      .visitor;
    expect(updated.notes).toBeNull();
    const gone = await call(`/visitors/${visitor.id}?expectedVersion=${updated.version}`, {
      method: 'DELETE',
    });
    expect(gone.status).toBe(200);
  });
});
