import { createDb, type Database } from '@familyos/db';
import { purgeHouseholds, seedHousehold, type SeededHousehold } from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Gate G2, through the HTTP API against the local database. Skipped without DATABASE_URL.
const url = process.env.DATABASE_URL;
const db: Kysely<Database> | undefined = url
  ? createDb({ connectionString: url, maxConnections: 6 })
  : undefined;

function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not set');
  return db;
}

// Sunday 2026-11-08, 09:00 in Los Angeles (seeded households use America/Los_Angeles).
const NOW = new Date('2026-11-08T17:00:00Z');

interface Item {
  id: string;
  status: string;
  version: number;
  ownerMemberId: string | null;
  dueOn: string | null;
  parentId: string | null;
}

describe.skipIf(!db)('work items, inbox and Today (G2)', () => {
  const { request, tokenFor } = db ? createTestApp({ db, now: () => NOW }) : createTestApp();
  let h: SeededHousehold;
  let ownerToken: string;
  let adultToken: string;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const base = () => `/households/${h.id}`;
  const json = async <T>(res: Response) => (await res.json()) as T;

  const auditCount = async () =>
    (
      await requireDb()
        .selectFrom('app.audit_event')
        .select('id')
        .where('household_id', '=', h.id)
        .execute()
    ).length;

  /** Runs one write and checks it produced exactly one audit row (G2: audit on every write). */
  const audited = async (write: () => Promise<Response>, status: number) => {
    const before = await auditCount();
    const res = await write();
    expect(res.status).toBe(status);
    expect(await auditCount()).toBe(before + 1);
    return res;
  };

  const capture = async (title: string, extra: Record<string, unknown> = {}) => {
    const res = await audited(
      () =>
        request(`${base()}/work-items`, {
          method: 'POST',
          token: ownerToken,
          body: { title, ...extra },
        }),
      201,
    );
    return (await json<{ item: Item }>(res)).item;
  };

  beforeAll(async () => {
    h = await seedHousehold(requireDb(), 'Delta');
    ownerToken = await tokenOf(h.owner);
    adultToken = await tokenOf(h.adult);
  });

  afterAll(async () => {
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  describe('inbox', () => {
    it('captures into the inbox, then accepts with an owner and a date', async () => {
      const item = await capture('Call the plumber back');
      expect(item.status).toBe('new');

      const inbox = await json<{ items: Item[] }>(
        await request(`${base()}/inbox`, { token: ownerToken }),
      );
      expect(inbox.items.map((i) => i.id)).toContain(item.id);
      const list = await json<{ items: Item[] }>(
        await request(`${base()}/work-items`, { token: ownerToken }),
      );
      expect(list.items.map((i) => i.id)).not.toContain(item.id);

      const accepted = await audited(
        () =>
          request(`${base()}/work-items/${item.id}/accept`, {
            method: 'POST',
            token: ownerToken,
            body: { expectedVersion: 1, ownerMemberId: h.adult.id, dueOn: '2026-11-10' },
          }),
        200,
      );
      const after = (await json<{ item: Item }>(accepted)).item;
      expect(after).toMatchObject({
        status: 'ready',
        ownerMemberId: h.adult.id,
        dueOn: '2026-11-10',
        version: 2,
      });

      const again = await request(`${base()}/work-items/${item.id}/accept`, {
        method: 'POST',
        token: ownerToken,
        body: { expectedVersion: 2 },
      });
      expect(await json(again)).toEqual({ error: 'not_in_inbox' });
    });

    it('discards from the inbox without deleting the record', async () => {
      const item = await capture('Duplicate thought');
      await audited(
        () =>
          request(`${base()}/work-items/${item.id}/discard`, {
            method: 'POST',
            token: ownerToken,
            body: { expectedVersion: 1 },
          }),
        200,
      );
      const detail = await json<{ item: Item }>(
        await request(`${base()}/work-items/${item.id}`, { token: ownerToken }),
      );
      expect(detail.item.status).toBe('cancelled');
      const inbox = await json<{ items: Item[] }>(
        await request(`${base()}/inbox`, { token: ownerToken }),
      );
      expect(inbox.items.map((i) => i.id)).not.toContain(item.id);
    });
  });

  describe('status rules', () => {
    it('rejects illegal transitions and completion without confirmation', async () => {
      const item = await capture('Fix the gate latch', { inbox: false });
      const patch = (body: Record<string, unknown>) =>
        request(`${base()}/work-items/${item.id}`, { method: 'PATCH', token: ownerToken, body });

      expect(await json(await patch({ expectedVersion: 1, status: 'new' }))).toEqual({
        error: 'illegal_transition',
      });
      expect(
        await json(await patch({ expectedVersion: 1, status: 'awaiting_completion' })),
      ).toEqual({
        error: 'illegal_transition',
      });
      expect(await json(await patch({ expectedVersion: 1, status: 'verified_complete' }))).toEqual({
        error: 'evidence_required',
      });
      expect((await patch({ expectedVersion: 1, status: 'done_unverified' })).status).toBe(200);
    });

    it('surfaces conflicting edits by two adults instead of overwriting', async () => {
      const item = await capture('Book the dentist', { inbox: false });
      const edit = (token: string, title: string) =>
        request(`${base()}/work-items/${item.id}`, {
          method: 'PATCH',
          token,
          body: { expectedVersion: 1, title },
        });

      // Both adults edit version 1 at the same moment; exactly one wins.
      const results = await Promise.all([
        edit(ownerToken, 'Book dentist for Sam'),
        edit(adultToken, 'Book dentist for Alex'),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

      const detail = await json<{ item: Item }>(
        await request(`${base()}/work-items/${item.id}`, { token: ownerToken }),
      );
      expect(detail.item.version).toBe(2);
    });
  });

  describe('projects', () => {
    it('keeps subtasks one level deep under projects, and blocks completion while any is open', async () => {
      const project = await capture('Basement refresh', { type: 'project', inbox: false });
      const plain = await capture('Not a project', { inbox: false });

      const sub = (parentId: string, extra: Record<string, unknown> = {}) =>
        request(`${base()}/work-items`, {
          method: 'POST',
          token: ownerToken,
          body: { title: 'Subtask', parentId, inbox: false, ...extra },
        });

      expect(await json(await sub(plain.id))).toEqual({ error: 'invalid_parent' });
      expect(await json(await sub(project.id, { type: 'project' }))).toEqual({
        error: 'invalid_parent',
      });

      const first = (await json<{ item: Item }>(await sub(project.id))).item;
      const second = (await json<{ item: Item }>(await sub(project.id))).item;
      expect(first.parentId).toBe(project.id);

      const finishProject = () =>
        request(`${base()}/work-items/${project.id}`, {
          method: 'PATCH',
          token: ownerToken,
          body: { expectedVersion: 1, status: 'verified_complete', confirmed: true },
        });
      expect(await json(await finishProject())).toEqual({ error: 'open_subtasks' });

      for (const task of [first, second]) {
        const res = await request(`${base()}/work-items/${task.id}`, {
          method: 'PATCH',
          token: ownerToken,
          body: { expectedVersion: 1, status: 'verified_complete', confirmed: true },
        });
        expect(res.status).toBe(200);
      }
      const detail = await json<{ progress: { done: number; total: number }; subtasks: Item[] }>(
        await request(`${base()}/work-items/${project.id}`, { token: ownerToken }),
      );
      expect(detail.progress).toEqual({ done: 2, total: 2 });
      expect((await finishProject()).status).toBe(200);
    });
  });

  describe('comments', () => {
    it('lets adults comment, audits it, and hides comments on private items', async () => {
      const shared = await capture('Pick paint colours', { inbox: false });
      await audited(
        () =>
          request(`${base()}/work-items/${shared.id}/comments`, {
            method: 'POST',
            token: adultToken,
            body: { body: 'Leaning towards the grey' },
          }),
        201,
      );
      const { comments } = await json<{ comments: { body: string; authorMemberId: string }[] }>(
        await request(`${base()}/work-items/${shared.id}/comments`, { token: ownerToken }),
      );
      expect(comments).toEqual([
        expect.objectContaining({ body: 'Leaning towards the grey', authorMemberId: h.adult.id }),
      ]);

      const caregiver = await request(`${base()}/work-items/${shared.id}/comments`, {
        method: 'POST',
        token: await tokenOf(h.caregiver),
        body: { body: 'hi' },
      });
      expect(caregiver.status).toBe(403);

      // The owner's private item: invisible to the other adult, comments included.
      expect(
        (await request(`${base()}/work-items/${h.privateItemId}/comments`, { token: adultToken }))
          .status,
      ).toBe(404);
      const onPrivate = await request(`${base()}/work-items/${h.privateItemId}/comments`, {
        method: 'POST',
        token: adultToken,
        body: { body: 'peek' },
      });
      expect(onPrivate.status).toBe(404);
    });
  });

  describe('Today', () => {
    it('buckets items in the household timezone for each member', async () => {
      const mineOverdue = await capture('Renew car registration', {
        inbox: false,
        ownerMemberId: h.owner.id,
        dueOn: '2026-11-07',
      });
      const partnersThisWeek = await capture('Return library books', {
        inbox: false,
        ownerMemberId: h.adult.id,
        dueOn: '2026-11-11',
      });
      const inInbox = await capture('Untriaged idea', { dueOn: '2026-11-08' });

      const ownerView = await json<{
        date: string;
        needsYou: Item[];
        thisWeek: Item[];
        inboxCount: number;
        timezone: string;
      }>(await request(`${base()}/today`, { token: ownerToken }));
      expect(ownerView.date).toBe('2026-11-08');
      expect(ownerView.timezone).toBe('America/Los_Angeles');
      expect(ownerView.needsYou.map((i) => i.id)).toContain(mineOverdue.id);
      expect(ownerView.thisWeek.map((i) => i.id)).toContain(partnersThisWeek.id);
      expect([...ownerView.needsYou, ...ownerView.thisWeek].map((i) => i.id)).not.toContain(
        inInbox.id,
      );
      expect(ownerView.inboxCount).toBeGreaterThanOrEqual(1);

      // The same overdue item is not the other adult's action.
      const adultView = await json<{ needsYou: Item[] }>(
        await request(`${base()}/today`, { token: adultToken }),
      );
      expect(adultView.needsYou.map((i) => i.id)).not.toContain(mineOverdue.id);
    });

    it("never shows another member's private item", async () => {
      const view = await json<Record<string, Item[] | unknown>>(
        await request(`${base()}/today`, { token: adultToken }),
      );
      expect(JSON.stringify(view)).not.toContain(h.privateItemId);
    });
  });
});
