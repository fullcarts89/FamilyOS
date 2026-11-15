import { createDb, type Database } from '@familyos/db';
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

// The iPhone widget's endpoint (docs/operations/iphone.md), through the HTTP API.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 4 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Monday 2026-11-16, 12:00 in Los Angeles.
const NOW = new Date('2026-11-16T20:00:00Z');
const la = (date: string, time: string) => new Date(`${date}T${time}:00-08:00`).toISOString();

interface Widget {
  householdId: string;
  memberId: string;
  date: string;
  timezone: string;
  generatedAt: string;
  dueTodayCount: number;
  items: { id: string; title: string; version: number; canComplete: boolean }[];
  handoffs: { time: string; action: string; careMemberId: string; byMemberIds: string[] }[];
  members: { id: string; name: string; color: string }[];
}

describe.skipIf(!db)('widget', () => {
  const { request, tokenFor } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let other: SeededHousehold;
  const ids: Record<string, string> = {};

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const task = async (values: Record<string, unknown>) =>
    (
      await requireDb()
        .insertInto('app.work_item')
        .values({
          household_id: h.id,
          title: 'task',
          status: 'ready',
          created_by_member_id: h.owner.id,
          owner_member_id: h.owner.id,
          due_on: '2026-11-16',
          ...values,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Widget');
    other = await seedHousehold(requireDb(), 'Widget Other');
    ids.late = await task({ title: 'Renew car registration', due_on: '2026-11-13' });
    ids.timed = await task({
      title: 'Call the vet',
      due_on: null,
      due_at: la('2026-11-16', '16:00'),
    });
    ids.allDay = await task({ title: 'Pay daycare invoice' });
    ids.privateMine = await task({ title: 'Plan the surprise', visibility: 'private' });
    ids.waiting = await task({ title: 'Quote from plumber', status: 'waiting_on_others' });
    ids.tomorrow = await task({ title: 'Tomorrow', due_on: '2026-11-17' });
    ids.partner = await task({ title: 'Partner thing', owner_member_id: h.adult.id });
    // The partner's private item that is theirs to see only.
    ids.partnerPrivate = await task({
      title: 'Partner private',
      owner_member_id: h.adult.id,
      created_by_member_id: h.adult.id,
      visibility: 'private',
    });
    ids.sitter = await task({ title: 'Walk Biscuit', owner_member_id: h.caregiver.id });
    // A daily routine owned by the owner: yesterday's turn is still open, so it's the current one.
    const { ruleId } = await seedRoutine(requireDb(), h, {
      title: 'Feed the fish',
      rule: { freq: 'daily', interval: 1 },
      startOn: '2026-11-15',
      ownerMemberId: h.owner.id,
    });
    for (const [index, date] of [
      [0, '2026-11-15'],
      [1, '2026-11-16'],
    ] as const) {
      const id = await task({
        title: 'Feed the fish',
        recurrence_rule_id: ruleId,
        occurrence_index: index,
        occurrence_on: date,
        due_on: date,
      });
      ids[`fish${index}`] = id;
    }
    // Handoffs: one this morning (past), one this afternoon.
    for (const [time, action] of [
      ['08:15', 'drop_off'],
      ['17:30', 'pick_up'],
    ] as const) {
      await seedEvent(requireDb(), h, {
        title: action,
        kind: 'childcare',
        startsAt: la('2026-11-16', time),
        endsAt: la('2026-11-16', time),
        memberIds: [h.owner.id, h.child.id],
        careMemberId: h.child.id,
        careAction: action,
        carePlace: 'Little Oaks',
      });
    }
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id, other.id]);
    await db?.destroy();
  });

  it("returns the caller's own items due today or late, late first, one turn per routine", async () => {
    const res = await request(`/households/${h.id}/widget`, { token: await tokenOf(h.owner) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Widget;
    expect(Object.keys(body).sort()).toEqual([
      'date',
      'dueTodayCount',
      'generatedAt',
      'handoffs',
      'householdId',
      'items',
      'memberId',
      'members',
      'timezone',
    ]);
    expect(body).toMatchObject({
      householdId: h.id,
      memberId: h.owner.id,
      date: '2026-11-16',
      timezone: 'America/Los_Angeles',
      generatedAt: NOW.toISOString(),
    });
    expect(body.items.map((i) => i.id)).toEqual([
      ids.late,
      ids.fish0,
      ids.timed,
      ids.allDay,
      ids.privateMine,
      ids.waiting,
    ]);
    expect(body.dueTodayCount).toBe(6);
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual([
      'canComplete',
      'dueAt',
      'dueOn',
      'id',
      'ownerMemberId',
      'title',
      'version',
    ]);
    expect(body.items.find((i) => i.id === ids.waiting)?.canComplete).toBe(false);
    expect(body.items.find((i) => i.id === ids.late)?.canComplete).toBe(true);
    // Only the handoff still to come.
    expect(body.handoffs).toEqual([
      {
        time: la('2026-11-16', '17:30').replace('.000Z', 'Z'),
        action: 'pick_up',
        careMemberId: h.child.id,
        byMemberIds: [h.owner.id],
        place: 'Little Oaks',
      },
    ]);
    expect(body.members.map((m) => m.name)).toContain('Widget Pet');
    expect(body.members.every((m) => /^#[0-9A-F]{6}$/.test(m.color))).toBe(true);
  });

  it("never shows another person's items, private or not", async () => {
    const adult = (await (
      await request(`/households/${h.id}/widget`, { token: await tokenOf(h.adult) })
    ).json()) as Widget;
    expect(adult.items.map((i) => i.id)).toEqual([ids.partnerPrivate, ids.partner]);
    expect(JSON.stringify(adult)).not.toContain('Plan the surprise');
  });

  it('gives a caregiver their own items, without completing them', async () => {
    const sitter = (await (
      await request(`/households/${h.id}/widget`, { token: await tokenOf(h.caregiver) })
    ).json()) as Widget;
    expect(sitter.items.map((i) => [i.id, i.canComplete])).toEqual([[ids.sitter, false]]);
  });

  it('answers 404 for another household', async () => {
    const res = await request(`/households/${other.id}/widget`, { token: await tokenOf(h.owner) });
    expect(res.status).toBe(404);
  });
});
