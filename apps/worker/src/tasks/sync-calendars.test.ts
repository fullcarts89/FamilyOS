import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { encryptUrl } from '@familyos/calendar';
import { createDb, type Database } from '@familyos/db';
import {
  purgeHouseholds,
  seedEvent,
  seedHousehold,
  type SeededHousehold,
} from '@familyos/db/testing';
import type { JobHelpers } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { syncCalendars } from './sync-calendars';

const url = process.env.DATABASE_URL;
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:weekly@example.test',
  'DTSTART;TZID=America/Los_Angeles:20261102T090000',
  'DTEND;TZID=America/Los_Angeles:20261102T100000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO',
  'SUMMARY:Weekly sync',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe.skipIf(!url)('calendar sync task', () => {
  let db: Kysely<Database>;
  let server: Server;
  let h: SeededHousehold;
  let ownEventId: string;
  let sourceId: string;
  const key = randomBytes(32);
  let clock = new Date('2026-11-16T15:00:00Z');
  const policy = {
    maxBytes: 1024 * 1024,
    timeoutMs: 2000,
    maxRedirects: 0,
    allowHttp: true,
    allowAddress: (ip: string) => ip === '127.0.0.1',
  };
  const helpers = (info = vi.fn(), error = vi.fn()) =>
    ({ logger: { info, error }, job: { id: '7' } }) as unknown as JobHelpers;
  const importedTitles = async () =>
    (
      await db
        .selectFrom('app.event')
        .select(['title', 'version'])
        .where('source_calendar_id', '=', sourceId)
        .execute()
    ).length;

  beforeAll(async () => {
    db = createDb({ connectionString: url ?? '', maxConnections: 4 });
    server = createServer((_req, res) => res.end(ICS));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/secret-feed.ics`;
    h = await seedHousehold(db, 'Worker Calendars');
    ownEventId = await seedEvent(db, h, {
      title: 'Own event',
      startsAt: '2026-11-16T17:00:00Z',
      endsAt: '2026-11-16T18:00:00Z',
      memberIds: [h.owner.id],
    });
    sourceId = '6b1f2a3c-0000-4000-8000-00000000c41e';
    const sealed = encryptUrl(key, address, { householdId: h.id, sourceId });
    await db
      .insertInto('app.calendar_source')
      .values({
        id: sourceId,
        household_id: h.id,
        member_id: h.adult.id,
        label: 'Work',
        url_ciphertext: sealed.ciphertext,
        url_nonce: sealed.nonce,
        url_hint: '127.0.0.1/…',
        created_by_member_id: h.adult.id,
      })
      .execute();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await purgeHouseholds(db, [h.id]);
    await db.destroy();
  });

  it('does nothing without a key', async () => {
    const info = vi.fn();
    await syncCalendars(db, { now: () => clock, policy })({}, helpers(info));
    expect(info).toHaveBeenCalledWith('calendar sync off: no CALENDAR_ENCRYPTION_KEY');
    expect(await importedTitles()).toBe(0);
  });

  it('imports due calendars as the scheduler, idempotently, and leaves members’ events alone', async () => {
    const task = syncCalendars(db, { key, now: () => clock, policy });
    const info = vi.fn();
    await task({}, helpers(info));
    // Two weeks back to 90 days ahead of Nov 16 (through Feb 14): Mondays Nov 2 … Feb 8.
    const first = await importedTitles();
    expect(first).toBe(15);
    expect(info).toHaveBeenCalledWith('calendars synced', expect.objectContaining({ failed: 0 }));
    const source = await db
      .selectFrom('app.calendar_source')
      .select(['status', 'last_synced_at', 'version'])
      .where('id', '=', sourceId)
      .executeTakeFirstOrThrow();
    expect(source).toMatchObject({ status: 'ok', last_synced_at: clock, version: 1 });

    // Not due again yet; then due, and nothing changes.
    clock = new Date(clock.getTime() + 10 * 60 * 1000);
    await task({}, helpers());
    clock = new Date(clock.getTime() + 30 * 60 * 1000);
    await task({}, helpers());
    expect(await importedTitles()).toBe(first);
    const versions = await db
      .selectFrom('app.event')
      .select('version')
      .where('source_calendar_id', '=', sourceId)
      .execute();
    expect(versions.every((v) => v.version === 1)).toBe(true);
    const own = await db
      .selectFrom('app.event')
      .select(['title', 'version'])
      .where('id', '=', ownEventId)
      .executeTakeFirstOrThrow();
    expect(own).toEqual({ title: 'Own event', version: 1 });
    const audits = await db
      .selectFrom('app.audit_event')
      .select(['action', 'actor_member_id', 'payload'])
      .where('household_id', '=', h.id)
      .where('entity_type', '=', 'calendar')
      .execute();
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ action: 'calendar.synced', actor_member_id: null });
    expect(JSON.stringify(audits)).not.toContain('secret-feed');
  });
});
