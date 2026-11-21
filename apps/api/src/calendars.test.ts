import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDb, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './testing/harness';

// Read-only calendar subscriptions through the HTTP API, against a local ICS server.
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
const SECRET = 'private-0123456789abcdef'; // gitleaks:allow
const google = readFileSync(
  new URL('../../../packages/calendar/src/fixtures/google.ics', import.meta.url),
  'utf8',
);

interface Calendar {
  id: string;
  label: string;
  memberId: string;
  status: string;
  lastErrorCode: string | null;
  urlHint: string;
  version: number;
}
interface Occurrence {
  key: string;
  eventId: string;
  title: string;
  memberIds: string[];
  readOnly: boolean;
  source: { calendarId: string; label: string } | null;
}

describe.skipIf(!db)('calendar subscriptions', () => {
  let server: Server;
  let feed = google;
  let status = 200;
  let address = '';
  /** Runs while the server is answering a calendar request, before it responds. */
  let duringFetch: (() => Promise<void>) | null = null;
  const policy = {
    maxBytes: 1024 * 1024,
    timeoutMs: 4000,
    maxRedirects: 3,
    allowHttp: true,
    allowAddress: (ip: string) => ip === '127.0.0.1',
  };
  const { request, tokenFor, logs, calendarKey } = db
    ? createTestApp({ db, now: () => NOW, calendarFetchPolicy: policy })
    : createTestApp();
  let h: SeededHousehold;
  let owner: string;
  let calendar: Calendar;

  const tokenOf = (member: SeededHousehold['owner']) =>
    tokenFor({ userId: member.userId ?? '', email: `${member.id}@example.test` });
  const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
    request(`/households/${h.id}${path}`, { ...init, token: init.token ?? owner });
  const json = async <T>(res: Response) => (await res.json()) as T;
  const imported = () =>
    requireDb()
      .selectFrom('app.event')
      .select(['id', 'title', 'version', 'external_uid', 'external_recurrence_id'])
      .where('source_calendar_id', '=', calendar.id)
      .orderBy('starts_at')
      .execute();

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === `/calendar/ical/${SECRET}/basic.ics`) {
        const respond = () => {
          res.statusCode = status;
          res.end(status === 200 ? feed : '');
        };
        if (duringFetch) return void duringFetch().then(respond, respond);
        return void respond();
      }
      if (req.url === '/not-a-calendar') return void res.end('<html>Sign in</html>');
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar/ical/${SECRET}/basic.ics`;
    h = await seedHousehold(requireDb(), 'Calendars');
    owner = await tokenOf(h.owner);
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await purgeHouseholds(requireDb(), [h.id]);
    await db?.destroy();
  });

  it('checks the address before saving anything', async () => {
    const add = (body: Record<string, unknown>, token = owner) =>
      call('/calendars', { method: 'POST', token, body });
    const cases: [Record<string, unknown>, number, string][] = [
      [{ label: 'x', url: 'ftp://example.com/a.ics', memberId: h.owner.id }, 422, 'invalid_url'],
      [{ label: 'x', url: address.replace(SECRET, 'nope'), memberId: h.owner.id }, 422, 'http_404'],
      [
        {
          label: 'x',
          url: address.replace(/\/calendar.*/, '/not-a-calendar'),
          memberId: h.owner.id,
        },
        422,
        'not_calendar',
      ],
      [{ label: 'x', url: address, memberId: h.child.id }, 422, 'invalid_member'],
      [{ label: 'x', url: address, memberId: h.pet.id }, 422, 'invalid_member'],
      [{ label: '', url: address, memberId: h.owner.id }, 422, 'invalid_body'],
    ];
    for (const [body, code, error] of cases) {
      const res = await add(body);
      expect({
        body,
        status: res.status,
        error: (await json<{ error: string }>(res)).error,
      }).toEqual({
        body,
        status: code,
        error,
      });
    }
    expect(
      (await add({ label: 'x', url: address, memberId: h.owner.id }, await tokenOf(h.caregiver)))
        .status,
    ).toBe(403);
    expect(
      await requireDb()
        .selectFrom('app.calendar_source')
        .select('id')
        .where('household_id', '=', h.id)
        .execute(),
    ).toEqual([]);
  });

  it('adds a calendar, stores the address only encrypted, and imports its events', async () => {
    const res = await call('/calendars', {
      method: 'POST',
      body: { label: 'Maya work', url: address, memberId: h.owner.id, color: '#2f6fb3' },
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    const body = JSON.parse(text) as { calendar: Calendar; imported: number };
    calendar = body.calendar;
    expect(calendar).toMatchObject({
      label: 'Maya work',
      memberId: h.owner.id,
      status: 'ok',
      urlHint: '127.0.0.1/…',
      version: 1,
    });
    expect(body.imported).toBeGreaterThan(5);
    const stored = await requireDb()
      .selectFrom('app.calendar_source')
      .select(['url_ciphertext', 'url_nonce', 'url_hint'])
      .where('id', '=', calendar.id)
      .executeTakeFirstOrThrow();
    expect(stored.url_ciphertext.includes(Buffer.from(SECRET))).toBe(false);
    expect(JSON.stringify(await json(await call('/calendars')))).not.toContain(SECRET);
  });

  it('shows imported occurrences in events and the rhythm, read-only, with the calendar', async () => {
    const list = await json<{ occurrences: Occurrence[] }>(
      await call('/events?from=2026-11-16&to=2026-11-22'),
    );
    const planning = list.occurrences.find((o) => o.title === 'Quarterly planning');
    expect(planning).toMatchObject({
      readOnly: true,
      memberIds: [h.owner.id],
      source: { calendarId: calendar.id, label: 'Maya work' },
    });
    if (!planning) throw new Error('missing');

    // The imported meeting overlaps a pickup Maya is down for: a heads-up.
    await seedEvent(requireDb(), h, {
      title: 'Daycare pickup',
      startsAt: '2026-11-20T01:30:00Z', // 17:30 PST on the 19th
      endsAt: '2026-11-20T01:50:00Z',
      memberIds: [h.owner.id, h.child.id],
      careMemberId: h.child.id,
      careAction: 'pick_up',
      carePlace: 'Little Oaks',
    });
    const rhythm = await json<{ headsUps: { type: string; text: string }[] }>(
      await call('/rhythm?date=2026-11-19'),
    );
    expect(rhythm.headsUps.map((x) => x.text)).toContain(
      `Calendars Owner has “Quarterly planning” during Calendars Child’s pickup at 5:30 PM.`,
    );

    // FamilyOS never edits an imported event.
    const id = planning.eventId;
    const attempts: [string, string, unknown][] = [
      ['PATCH', `/events/${id}`, { expectedVersion: 1, title: 'Edited' }],
      ['DELETE', `/events/${id}?expectedVersion=1`, undefined],
      ['POST', `/events/${id}/occurrences/2026-11-19`, { action: 'skip' }],
      ['POST', `/events/${id}/occurrences/2026-11-19`, { action: 'cover', memberId: h.adult.id }],
      ['DELETE', `/events/${id}/occurrences/2026-11-19`, undefined],
    ];
    for (const [method, path, body] of attempts) {
      const res = await call(path, { method, body });
      expect({ path, method, status: res.status, body: await res.json() }).toEqual({
        path,
        method,
        status: 409,
        body: { error: 'read_only' },
      });
    }

    // A caregiver sees the household's own events, never the adults' imported calendars.
    const sitter = await tokenOf(h.caregiver);
    const theirs = await json<{ occurrences: Occurrence[] }>(
      await call('/events?from=2026-11-16&to=2026-11-22', { token: sitter }),
    );
    expect(theirs.occurrences.map((o) => o.title)).toEqual(['Daycare pickup']);
    const theirRhythm = await json<{ lanes: { occurrences: Occurrence[] }[]; headsUps: unknown[] }>(
      await call('/rhythm?date=2026-11-19', { token: sitter }),
    );
    expect(theirRhythm.lanes.flatMap((l) => l.occurrences).some((o) => o.readOnly)).toBe(false);
    expect(JSON.stringify(theirRhythm)).not.toContain('Quarterly planning');
    expect((await call(`/events/${id}`, { token: sitter })).status).toBe(404);
  });

  it('re-syncs idempotently, updating what changed and removing what vanished', async () => {
    const before = await imported();
    const sync = async () => {
      const res = await call(`/calendars/${calendar.id}/sync`, { method: 'POST' });
      expect(res.status).toBe(200);
      return json<{
        calendar: Calendar;
        result: { status: string; imported: number; removed: number };
      }>(res);
    };
    const same = await sync();
    expect(same.result).toMatchObject({ status: 'ok', removed: 0, imported: before.length });
    expect(await imported()).toEqual(before);

    feed = google
      .replace('SUMMARY:Quarterly planning', 'SUMMARY:Quarterly planning (moved room)')
      .replace(/BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261126[\s\S]*?END:VEVENT\r\n/, '');
    const changed = await sync();
    expect(changed.result.removed).toBe(1);
    const after = await imported();
    expect(after.length).toBe(before.length - 1);
    expect(after.find((e) => e.external_uid === 'planning-1@google.com')).toMatchObject({
      title: 'Quarterly planning (moved room)',
      version: 2,
    });
    // Rows that didn't change keep their version.
    expect(after.filter((e) => e.version !== 1).map((e) => e.external_uid)).toEqual([
      'planning-1@google.com',
    ]);
  });

  it('records a failed fetch on the calendar and keeps its events', async () => {
    const count = (await imported()).length;
    status = 500;
    const res = await call(`/calendars/${calendar.id}/sync`, { method: 'POST' });
    status = 200;
    expect(res.status).toBe(200);
    const body = await json<{ calendar: Calendar; result: { status: string; errorCode: string } }>(
      res,
    );
    expect(body.result).toMatchObject({ status: 'error', errorCode: 'http_500' });
    expect(body.calendar).toMatchObject({ status: 'error', lastErrorCode: 'http_500' });
    expect((await imported()).length).toBe(count);
  });

  it('holds no database connection while the calendar answers: add, new address, sync now', async () => {
    // An app with a single connection: if a request kept its transaction open during the fetch,
    // this query (made while the server is still answering) would wait for it.
    const single = createDb({ connectionString: url ?? '', maxConnections: 1 });
    const solo = createTestApp({
      db: single,
      now: () => NOW,
      calendarFetchPolicy: policy,
      calendarKey,
    });
    // Its own household, so the other tests' calendars and audit rows stay as they expect.
    const other = await seedHousehold(requireDb(), 'Calendars Solo');
    let probes: string[] = [];
    duringFetch = async () => {
      probes.push(
        await Promise.race([
          single
            .selectFrom('app.household')
            .select('id')
            .limit(1)
            .execute()
            .then(() => 'free'),
          new Promise<string>((resolve) => setTimeout(() => resolve('held'), 1500)),
        ]),
      );
    };
    try {
      const token = await solo.tokenFor({
        userId: other.owner.userId ?? '',
        email: 'x@example.test',
      });
      const send = (path: string, method: string, body?: unknown) =>
        solo.request(`/households/${other.id}/calendars${path}`, { method, token, body });

      const added = await send('', 'POST', {
        label: 'Solo',
        url: address,
        memberId: other.owner.id,
      });
      expect(added.status).toBe(201);
      expect(probes).toEqual(['free']);
      const { calendar: soloCalendar } = await json<{ calendar: Calendar }>(added);

      probes = [];
      const moved = await send(`/${soloCalendar.id}`, 'PATCH', {
        expectedVersion: 1,
        url: address,
      });
      expect(moved.status).toBe(200);
      expect(probes).toEqual(['free']);
      expect((await json<{ calendar: Calendar }>(moved)).calendar).toMatchObject({ version: 2 });

      probes = [];
      expect((await send(`/${soloCalendar.id}/sync`, 'POST')).status).toBe(200);
      expect(probes).toEqual(['free']);

      // A change made while the new address was being fetched wins: the slow request gets 409.
      duringFetch = async () => {
        await requireDb()
          .updateTable('app.calendar_source')
          .set({ version: 3 })
          .where('id', '=', soloCalendar.id)
          .execute();
      };
      const stale = await send(`/${soloCalendar.id}`, 'PATCH', {
        expectedVersion: 2,
        url: address,
        label: 'Too late',
      });
      expect(stale.status).toBe(409);
      const row = await requireDb()
        .selectFrom('app.calendar_source')
        .select(['label', 'version'])
        .where('id', '=', soloCalendar.id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ label: 'Solo', version: 3 });
    } finally {
      duringFetch = null;
      await single.destroy();
      await purgeHouseholds(requireDb(), [other.id]);
    }
  });

  it('edits a calendar, moving its events to the new owner, and removes it with them', async () => {
    const patch = (body: Record<string, unknown>) =>
      call(`/calendars/${calendar.id}`, { method: 'PATCH', body });
    expect((await patch({ expectedVersion: 2, label: 'x' })).status).toBe(409);
    expect((await patch({ expectedVersion: 1 })).status).toBe(422);
    expect((await patch({ expectedVersion: 1, memberId: h.pet.id })).status).toBe(422);
    const moved = await patch({ expectedVersion: 1, memberId: h.adult.id, label: 'Theo work' });
    expect(moved.status).toBe(200);
    expect((await json<{ calendar: Calendar }>(moved)).calendar).toMatchObject({
      memberId: h.adult.id,
      label: 'Theo work',
      version: 2,
    });
    const attendees = await requireDb()
      .selectFrom('app.event_member as m')
      .innerJoin('app.event as e', 'e.id', 'm.event_id')
      .select('m.member_id')
      .where('e.source_calendar_id', '=', calendar.id)
      .distinct()
      .execute();
    expect(attendees).toEqual([{ member_id: h.adult.id }]);
    expect(
      (await call(`/calendars/${calendar.id}?expectedVersion=1`, { method: 'DELETE' })).status,
    ).toBe(409);
    expect(
      (await call(`/calendars/${calendar.id}?expectedVersion=2`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect(await imported()).toEqual([]);
  });

  it('audits every change without addresses or labels', async () => {
    const audit = await requireDb()
      .selectFrom('app.audit_event')
      .select(['action', 'payload'])
      .where('household_id', '=', h.id)
      .where('entity_type', '=', 'calendar')
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual([
      'calendar.added',
      'calendar.synced',
      'calendar.synced',
      'calendar.synced',
      'calendar.updated',
      'calendar.removed',
    ]);
    const text = JSON.stringify(audit);
    for (const secret of [SECRET, 'Maya work', 'Theo work', '127.0.0.1'])
      expect(text).not.toContain(secret);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('answers 503 when no encryption key is configured', async () => {
    const off = createTestApp({ db: requireDb(), withoutCalendars: true });
    const token = await off.tokenFor({ userId: h.owner.userId ?? '', email: 'x@example.test' });
    const res = await off.request(`/households/${h.id}/calendars`, {
      method: 'POST',
      token,
      body: { label: 'x', url: address, memberId: h.owner.id },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'calendars_unavailable' });
  });
});
