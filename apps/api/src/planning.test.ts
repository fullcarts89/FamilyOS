import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Decisions, meals, groceries and contacts through the HTTP API.
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

interface Decision {
  id: string;
  status: string;
  version: number;
  options: { id: string; label: string }[];
  votes: { memberId: string; optionId: string }[];
  myVoteOptionId: string | null;
  waitingOn: string[];
  decidedOptionId: string | null;
  decidedVia: string | null;
}

describe.skipIf(!db)('planning: decisions, meals, groceries, contacts', () => {
  const { request, tokenFor } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let adult: string;
  let caregiver: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Planning');
    owner = await tokenOf(h.owner);
    adult = await tokenOf(h.adult);
    caregiver = await tokenOf(h.caregiver);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('decisions', () => {
    const create = async (body: Record<string, unknown>) => {
      const res = await call('/decisions', { method: 'POST', body });
      expect(res.status).toBe(201);
      return (await json<{ decision: Decision }>(res)).decision;
    };
    const vote = (d: Decision, optionId: string, token: string, extra: object = {}) =>
      call(`/decisions/${d.id}/vote`, { method: 'POST', token, body: { optionId, ...extra } });

    it('is decided when both adults vote for the same option', async () => {
      let d = await create({
        question: 'Which preschool for June next fall?',
        context: 'Tours are done.',
        dueOn: '2026-11-17',
        options: [{ label: 'Little Oaks' }, { label: 'Juniper House', detail: 'Closer to work' }],
      });
      expect(d).toMatchObject({ status: 'open', version: 1, waitingOn: [h.owner.id, h.adult.id] });
      const [oaks, juniper] = d.options;
      d = (await json<{ decision: Decision }>(await vote(d, oaks?.id ?? '', owner))).decision;
      expect(d).toMatchObject({
        status: 'open',
        myVoteOptionId: oaks?.id,
        waitingOn: [h.adult.id],
      });
      d = (await json<{ decision: Decision }>(await vote(d, juniper?.id ?? '', adult))).decision;
      expect(d.status).toBe('open');
      // Changing a vote to match decides it.
      d = (await json<{ decision: Decision }>(await vote(d, oaks?.id ?? '', adult))).decision;
      expect(d).toMatchObject({
        status: 'decided',
        decidedOptionId: oaks?.id,
        decidedVia: 'agreement',
        waitingOn: [],
      });
      expect(d.votes).toHaveLength(2);
      const closed = await vote(d, juniper?.id ?? '', owner);
      expect(closed.status).toBe(422);
      expect(await closed.json()).toEqual({ error: 'decision_closed' });
      // Reopen and the votes stay.
      const reopened = await call(`/decisions/${d.id}/reopen`, {
        method: 'POST',
        body: { expectedVersion: d.version },
      });
      expect((await json<{ decision: Decision }>(reopened)).decision).toMatchObject({
        status: 'open',
        decidedOptionId: null,
      });
    });

    it('lets an adult make the call, checks versions and options', async () => {
      const d = await create({
        question: 'Holiday at whose parents?',
        options: [{ label: 'Mine' }],
      });
      const decide = (body: Record<string, unknown>) =>
        call(`/decisions/${d.id}/decide`, { method: 'POST', token: adult, body });
      expect((await decide({ expectedVersion: 2, optionId: d.options[0]?.id })).status).toBe(409);
      expect(await json(await decide({ expectedVersion: 1, optionId: h.owner.id }))).toEqual({
        error: 'invalid_option',
      });
      const ok = await decide({ expectedVersion: 1, optionId: d.options[0]?.id });
      expect((await json<{ decision: Decision }>(ok)).decision).toMatchObject({
        status: 'decided',
        decidedVia: 'call',
      });
    });

    it('edits options and the question while open, and drops or deletes', async () => {
      let d = await create({ question: 'New car?' });
      const added = await call(`/decisions/${d.id}/options`, {
        method: 'POST',
        body: { expectedVersion: 1, label: 'Wait a year' },
      });
      expect(added.status).toBe(201);
      d = (await json<{ decision: Decision }>(added)).decision;
      expect(d.options.map((o) => o.label)).toEqual(['Wait a year']);
      const option = d.options[0]?.id ?? '';
      const renamed = await call(`/decisions/${d.id}/options/${option}`, {
        method: 'PATCH',
        body: { expectedVersion: d.version, label: 'Wait until spring' },
      });
      d = (await json<{ decision: Decision }>(renamed)).decision;
      expect(d.options[0]?.label).toBe('Wait until spring');
      expect((await vote(d, option, owner)).status).toBe(200);
      d = (await json<{ decision: Decision }>(await call(`/decisions/${d.id}`))).decision;
      const removed = await call(
        `/decisions/${d.id}/options/${option}?expectedVersion=${d.version}`,
        {
          method: 'DELETE',
        },
      );
      d = (await json<{ decision: Decision }>(removed)).decision;
      expect(d.votes).toEqual([]);
      const patched = await call(`/decisions/${d.id}`, {
        method: 'PATCH',
        body: { expectedVersion: d.version, question: 'New car this year?' },
      });
      d = (await json<{ decision: Decision }>(patched)).decision;
      const dropped = await call(`/decisions/${d.id}/drop`, {
        method: 'POST',
        body: { expectedVersion: d.version },
      });
      d = (await json<{ decision: Decision }>(dropped)).decision;
      expect(d.status).toBe('dropped');
      const listed = await json<{ decisions: Decision[] }>(await call('/decisions?status=dropped'));
      expect(listed.decisions.map((x) => x.id)).toContain(d.id);
      expect(
        (await call(`/decisions/${d.id}?expectedVersion=${d.version}`, { method: 'DELETE' }))
          .status,
      ).toBe(204);
      expect((await call(`/decisions/${d.id}`)).status).toBe(404);
    });

    it('feeds decisions due by tomorrow into the rhythm heads-ups, for adults only', async () => {
      const rhythm = await json<{ headsUps: { type: string; text: string }[] }>(
        await call('/rhythm'),
      );
      expect(rhythm.headsUps.filter((x) => x.type === 'decision_due').map((x) => x.text)).toEqual([
        'Decide by tomorrow: “Which preschool for June next fall?”.',
      ]);
      const sitter = await json<{ headsUps: { type: string }[] }>(
        await call('/rhythm', { token: caregiver }),
      );
      expect(sitter.headsUps.some((x) => x.type === 'decision_due')).toBe(false);
    });
  });

  describe('meals and groceries', () => {
    it('plans one meal per day and slot, shows tonight’s dinner in the rhythm', async () => {
      const planned = await call('/meals', {
        method: 'POST',
        body: { onDate: '2026-11-16', title: 'Sheet-pan salmon', cookMemberId: h.adult.id },
      });
      expect(planned.status).toBe(201);
      const { meal } = await json<{ meal: { id: string; slot: string; version: number } }>(planned);
      expect(meal.slot).toBe('dinner');
      const again = await call('/meals', {
        method: 'POST',
        body: { onDate: '2026-11-16', title: 'Tacos' },
      });
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ error: 'meal_exists' });
      expect(
        (
          await call('/meals', {
            method: 'POST',
            body: { onDate: '2026-11-17', title: 'Tacos', cookMemberId: h.child.id },
          })
        ).status,
      ).toBe(422);
      await call('/meals', {
        method: 'POST',
        body: { onDate: '2026-11-17', slot: 'lunch', title: 'Leftovers' },
      });
      const lunch = await call('/meals', {
        method: 'POST',
        body: { onDate: '2026-11-17', title: 'Tacos' },
      });
      const tacos = (await json<{ meal: { id: string } }>(lunch)).meal;
      // Moving onto a taken day and slot is a conflict too.
      const clash = await call(`/meals/${tacos.id}`, {
        method: 'PATCH',
        body: { expectedVersion: 1, onDate: '2026-11-16' },
      });
      expect(clash.status).toBe(409);

      const rhythm = await json<{ dinner: { title: string; cookMemberId: string } | null }>(
        await call('/rhythm', { token: caregiver }),
      );
      expect(rhythm.dinner).toMatchObject({ title: 'Sheet-pan salmon', cookMemberId: h.adult.id });
      const listed = await json<{ meals: { title: string; slot: string }[] }>(
        await call('/meals?from=2026-11-16&to=2026-11-22', { token: caregiver }),
      );
      expect(listed.meals.map((m) => `${m.slot}:${m.title}`)).toEqual([
        'dinner:Sheet-pan salmon',
        'lunch:Leftovers',
        'dinner:Tacos',
      ]);
      expect((await call('/meals?from=2026-11-16&to=2027-03-01')).status).toBe(422);
      expect(
        (await call(`/meals/${meal.id}?expectedVersion=${meal.version}`, { method: 'DELETE' }))
          .status,
      ).toBe(204);
    });

    it('keeps a shared grocery list by aisle, checks idempotently and clears what was bought', async () => {
      const add = async (body: Record<string, unknown>) =>
        (
          await json<{ item: { id: string; version: number } }>(
            await call('/groceries', { method: 'POST', body }),
          )
        ).item;
      const milk = await add({ name: 'Milk', detail: '1 gal', aisle: 'dairy_eggs' });
      const apples = await add({ name: 'Apples', aisle: 'produce' });
      await add({ name: 'Diapers', detail: 'size 5', aisle: 'baby' });
      await add({ name: 'Eggs', aisle: 'dairy_eggs' });

      const check = (id: string, action: 'check' | 'uncheck', token = adult) =>
        call(`/groceries/${id}/${action}`, { method: 'POST', token });
      const checked = await json<{
        item: { checkedAt: string; checkedByMemberId: string; version: number };
      }>(await check(milk.id, 'check'));
      expect(checked.item).toMatchObject({ checkedByMemberId: h.adult.id, version: 2 });
      // Checking again changes nothing.
      expect(
        (await json<{ item: { version: number } }>(await check(milk.id, 'check'))).item.version,
      ).toBe(2);
      expect((await check(milk.id, 'check', caregiver)).status).toBe(403);

      const list = await json<{ items: { name: string; checkedAt: string | null }[] }>(
        await call('/groceries', { token: caregiver }),
      );
      expect(list.items.map((i) => i.name)).toEqual(['Apples', 'Eggs', 'Diapers', 'Milk']);

      const stale = await call(`/groceries/${apples.id}`, {
        method: 'PATCH',
        body: { expectedVersion: 2, detail: 'Honeycrisp' },
      });
      expect(stale.status).toBe(409);
      const cleared = await json<{ removed: number; items: { name: string }[] }>(
        await call('/groceries/clear-checked', { method: 'POST' }),
      );
      expect(cleared.removed).toBe(1);
      expect(cleared.items.map((i) => i.name)).toEqual(['Apples', 'Eggs', 'Diapers']);
    });
  });

  describe('contacts', () => {
    it('keeps contacts by category, linked to members and tasks', async () => {
      const add = async (body: Record<string, unknown>) => {
        const res = await call('/contacts', { method: 'POST', body });
        expect(res.status).toBe(201);
        return (await json<{ contact: { id: string; version: number; email: string | null } }>(res))
          .contact;
      };
      const vet = await add({
        name: 'Dr. Ana Ruiz',
        category: 'pets',
        role: 'Vet',
        organization: 'Sellwood Vet',
        phone: '(503) 555-0142',
        forMemberId: h.pet.id,
      });
      const pediatrician = await add({
        name: 'Dr. Sam Lee',
        category: 'health',
        role: 'Pediatrician',
        email: 'Front.Desk@Example.test',
        forMemberId: h.child.id,
      });
      expect(pediatrician.email).toBe('front.desk@example.test');
      const plumber = await add({ name: 'Riverside Plumbing', category: 'home', role: 'Plumber' });
      expect(
        (await call('/contacts', { method: 'POST', body: { name: 'x', phone: 'call me' } })).status,
      ).toBe(422);
      expect(
        (await call('/contacts', { method: 'POST', body: { name: 'x', email: 'not-an-email' } }))
          .status,
      ).toBe(422);

      const listed = await json<{ contacts: { name: string; category: string }[] }>(
        await call('/contacts', { token: caregiver }),
      );
      expect(listed.contacts.map((c) => c.category)).toEqual(['health', 'pets', 'home']);
      const forPet = await json<{ contacts: { id: string }[] }>(
        await call(`/contacts?forMemberId=${h.pet.id}`),
      );
      expect(forPet.contacts.map((c) => c.id)).toEqual([vet.id]);

      // A project names its plumber; the contact shows the work it's on.
      const project = await json<{
        item: { id: string; version: number; contact: { name: string; role: string } | null };
      }>(
        await call('/work-items', {
          method: 'POST',
          body: { title: 'Hall bathroom', type: 'project', inbox: false, contactId: plumber.id },
        }),
      );
      expect(project.item.contact).toMatchObject({ name: 'Riverside Plumbing', role: 'Plumber' });
      const detail = await json<{ items: { id: string }[] }>(await call(`/contacts/${plumber.id}`));
      expect(detail.items.map((i) => i.id)).toEqual([project.item.id]);
      const list = await json<{ items: { id: string; contact: { name: string } | null }[] }>(
        await call(`/work-items?contactId=${plumber.id}`),
      );
      expect(list.items.map((i) => i.contact?.name)).toEqual(['Riverside Plumbing']);

      const patched = await call(`/contacts/${plumber.id}`, {
        method: 'PATCH',
        body: { expectedVersion: 1, phone: '503-555-0199', notes: 'Ask for Dee' },
      });
      expect(patched.status).toBe(200);
      expect(
        (
          await call(`/contacts/${plumber.id}`, {
            method: 'PATCH',
            body: { expectedVersion: 1, notes: 'x' },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call(`/contacts/${plumber.id}`, {
            method: 'PATCH',
            token: caregiver,
            body: { expectedVersion: 2, notes: 'x' },
          })
        ).status,
      ).toBe(403);
      // Removing the contact unlinks the project.
      expect(
        (await call(`/contacts/${plumber.id}?expectedVersion=2`, { method: 'DELETE' })).status,
      ).toBe(204);
      const after = await json<{ item: { contactId: string | null } }>(
        await call(`/work-items/${project.item.id}`),
      );
      expect(after.item.contactId).toBeNull();
    });

    it('audits contact changes without names or numbers', async () => {
      const audit = await requireDb()
        .selectFrom('app.audit_event')
        .select(['action', 'payload'])
        .where('household_id', '=', h.id)
        .where('entity_type', 'in', ['contact', 'decision', 'meal', 'grocery_item'])
        .execute();
      expect(audit.length).toBeGreaterThan(10);
      const text = JSON.stringify(audit);
      for (const secret of [
        'Riverside',
        '555',
        'Ask for Dee',
        'Milk',
        'Tacos',
        'preschool',
        'Little Oaks',
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });
});
