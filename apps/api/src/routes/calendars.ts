import { randomUUID } from 'node:crypto';
import {
  CalendarFetchError,
  assignImportedEvents,
  encryptUrl,
  fetchOccurrences,
  maskUrl,
  normalizeCalendarUrl,
  storeOccurrences,
  syncSource,
  type SourceRef,
} from '@familyos/calendar';
import type { Database } from '@familyos/db';
import { can, isCaredFor } from '@familyos/domain';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, forbidden, notFound } from '../http/errors';
import { inHousehold } from '../http/middleware';
import { parseBody, uuidParam } from '../http/validation';

const Uuid = z.uuid();
const Label = z.string().trim().min(1).max(80);
const Color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((c) => c.toUpperCase());
// The address is validated by normalizeCalendarUrl; this only bounds it.
const Address = z.string().min(1).max(2000);

const AddCalendar = z
  .object({ label: Label, url: Address, memberId: Uuid, color: Color.nullish() })
  .strict();
const UpdateCalendar = z
  .object({
    expectedVersion: z.number().int().min(1),
    label: Label.optional(),
    memberId: Uuid.optional(),
    color: Color.nullable().optional(),
    url: Address.optional(),
  })
  .strict();

export const CALENDAR_COLUMNS = [
  'id',
  'label',
  'member_id as memberId',
  'color',
  'status',
  'last_synced_at as lastSyncedAt',
  'last_error_code as lastErrorCode',
  'url_hint as urlHint',
  'version',
  'created_by_member_id as createdByMemberId',
  'created_at as createdAt',
] as const;

/** Calendar subscriptions per household: each is fetched and parsed about every 30 minutes. */
export const MAX_CALENDARS = 20;

/** Refuses a new calendar past the cap. `lock` serializes concurrent adds by the household row. */
async function assertRoom(trx: Transaction<Database>, householdId: string, lock: boolean) {
  if (lock) {
    await trx
      .selectFrom('app.household')
      .select('id')
      .where('id', '=', householdId)
      .forUpdate()
      .executeTakeFirst();
  }
  const { count } = await trx
    .selectFrom('app.calendar_source')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('household_id', '=', householdId)
    .executeTakeFirstOrThrow();
  if (Number(count) >= MAX_CALENDARS) throw new ApiError(422, 'too_many_calendars');
}

const timezoneOf = async (trx: Transaction<Database>, householdId: string) =>
  (
    await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow()
  ).timezone;

/** Whose calendar: an active adult (or caregiver) of this household. */
async function assertOwner(trx: Transaction<Database>, householdId: string, memberId: string) {
  const member = await trx
    .selectFrom('app.member')
    .select('role')
    .where('id', '=', memberId)
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!member || isCaredFor(member.role)) throw new ApiError(422, 'invalid_member');
}

/** Fetches and parses an address, or answers 422 with the fixed reason. Call with no transaction open. */
async function check(deps: Deps, address: string, timeZone: string) {
  const url = normalizeCalendarUrl(address, {
    allowHttp: deps.calendarFetchPolicy?.allowHttp === true,
  });
  if (typeof url === 'string') throw new ApiError(422, url);
  try {
    const occurrences = await fetchOccurrences(url.toString(), {
      timeZone,
      now: deps.now?.() ?? new Date(),
      ...(deps.calendarFetchPolicy && { policy: deps.calendarFetchPolicy }),
    });
    return { url, occurrences };
  } catch (error) {
    if (error instanceof CalendarFetchError) throw new ApiError(422, error.code);
    throw error;
  }
}

const view = (trx: Transaction<Database>, householdId: string, id: string) =>
  trx
    .selectFrom('app.calendar_source')
    .select(CALENDAR_COLUMNS)
    .where('id', '=', id)
    .where('household_id', '=', householdId)
    .executeTakeFirstOrThrow();

async function lock(
  trx: Transaction<Database>,
  member: CurrentMember,
  id: string,
  expectedVersion: number,
) {
  const row = await trx
    .selectFrom('app.calendar_source')
    .select(['id', 'version', 'member_id', 'created_by_member_id'])
    .where('id', '=', id)
    .where('household_id', '=', member.householdId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw notFound();
  if (row.version !== expectedVersion) throw conflict();
  return row;
}

const audit = (
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
) =>
  recordAudit(trx, {
    householdId: member.householdId,
    actorMemberId: member.id,
    entityType: 'calendar',
    entityId: id,
    action,
    payload,
    requestId,
  });

/**
 * Read-only calendar subscriptions (ICS). The address is checked by fetching and parsing it
 * before anything is saved, stored only encrypted, and never returned again: responses carry a
 * masked hint ("calendar.google.com/…"). Imported events can't be edited through FamilyOS.
 * Adding a calendar and changing its address fetch, so they live in calendarFetchRoutes.
 */
export function calendarRoutes() {
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => {
    authorize(c, 'calendar.manage');
    const calendars = await c
      .get('trx')
      .selectFrom('app.calendar_source')
      .select(CALENDAR_COLUMNS)
      .where('household_id', '=', c.get('member').householdId)
      .orderBy('created_at')
      .execute();
    return c.json({ calendars });
  });

  // Versioned delete: DELETE /calendars/:id?expectedVersion=N. Its imported events go with it.
  app.delete('/:calendarId', async (c) => {
    authorize(c, 'calendar.manage');
    const id = uuidParam(c.req.param('calendarId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, expected.data);
    await trx
      .deleteFrom('app.calendar_source')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audit(trx, member, c.get('requestId'), id, 'calendar.removed', { version: row.version });
    return c.body(null, 204);
  });

  return app;
}

/**
 * The calendar routes that fetch a remote calendar: add one, change one (a new address is
 * fetched), and sync now. Mounted outside the request transaction so no connection (or row
 * lock) is held while the remote calendar answers: one short transaction checks access and
 * validates, the fetch runs with none open, and a second short one writes (re-checking what
 * could have changed meanwhile: membership, the owner, the version).
 */
export function calendarFetchRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();
  const scopeOf = (c: Context<AppEnv>) => ({
    userId: c.get('user').userId,
    householdId: uuidParam(c.req.param('householdId')),
  });
  const requireKey = () => {
    if (!deps.calendarKey) throw new ApiError(503, 'calendars_unavailable');
    return deps.calendarKey;
  };
  /** Same order as every household route: membership (404), permission (403), then the rest. */
  const manager = (m: CurrentMember) => {
    if (!can(m.role, 'calendar.manage')) throw forbidden();
    return m;
  };

  app.post('/households/:householdId/calendars', async (c) => {
    const scope = scopeOf(c);
    const checked = await inHousehold(deps, scope, async (trx, m) => {
      manager(m);
      requireKey();
      const body = await parseBody(c.req.raw, AddCalendar);
      await assertOwner(trx, m.householdId, body.memberId);
      await assertRoom(trx, m.householdId, false);
      return { body, timeZone: await timezoneOf(trx, m.householdId) };
    });
    const { body, timeZone } = checked;
    const { url, occurrences } = await check(deps, body.url, timeZone);

    const id = randomUUID();
    const sealed = encryptUrl(requireKey(), url.toString(), {
      householdId: scope.householdId,
      sourceId: id,
    });
    const result = await inHousehold(deps, scope, async (trx, m) => {
      manager(m);
      await assertOwner(trx, m.householdId, body.memberId);
      await assertRoom(trx, m.householdId, true);
      await trx
        .insertInto('app.calendar_source')
        .values({
          id,
          household_id: m.householdId,
          member_id: body.memberId,
          label: body.label,
          url_ciphertext: sealed.ciphertext,
          url_nonce: sealed.nonce,
          url_hint: maskUrl(url),
          color: body.color ?? null,
          status: 'ok',
          last_synced_at: now(),
          created_by_member_id: m.id,
        })
        .execute();
      const source: SourceRef = {
        id,
        householdId: m.householdId,
        memberId: body.memberId,
        createdByMemberId: m.id,
      };
      const stored = await storeOccurrences(trx, source, occurrences, { timeZone, now: now() });
      await audit(trx, m, c.get('requestId'), id, 'calendar.added', {
        memberId: body.memberId,
        imported: stored.imported,
      });
      return { calendar: await view(trx, m.householdId, id), imported: stored.imported };
    });
    return c.json(result, 201);
  });

  app.patch('/households/:householdId/calendars/:calendarId', async (c) => {
    const scope = scopeOf(c);
    const id = uuidParam(c.req.param('calendarId'));
    const { body, timeZone } = await inHousehold(deps, scope, async (trx, m) => {
      manager(m);
      const body = await parseBody(c.req.raw, UpdateCalendar);
      const row = await trx
        .selectFrom('app.calendar_source')
        .select('version')
        .where('id', '=', id)
        .where('household_id', '=', m.householdId)
        .executeTakeFirst();
      if (!row) throw notFound();
      if (row.version !== body.expectedVersion) throw conflict();
      if (body.memberId) await assertOwner(trx, m.householdId, body.memberId);
      if (body.url !== undefined) requireKey();
      return { body, timeZone: await timezoneOf(trx, m.householdId) };
    });
    const replaced = body.url !== undefined ? await check(deps, body.url, timeZone) : null;
    const sealed = replaced
      ? encryptUrl(requireKey(), replaced.url.toString(), {
          householdId: scope.householdId,
          sourceId: id,
        })
      : null;

    const calendar = await inHousehold(deps, scope, async (trx, m) => {
      manager(m);
      // Changed or removed while the address was being fetched: 409 or 404, nothing written.
      const row = await lock(trx, m, id, body.expectedVersion);
      if (body.memberId) await assertOwner(trx, m.householdId, body.memberId);
      const changes = {
        ...(body.label !== undefined && { label: body.label }),
        ...(body.memberId !== undefined && { member_id: body.memberId }),
        ...(body.color !== undefined && { color: body.color }),
        ...(replaced &&
          sealed && {
            url_ciphertext: sealed.ciphertext,
            url_nonce: sealed.nonce,
            url_hint: maskUrl(replaced.url),
            status: 'ok' as const,
            last_synced_at: now(),
            last_error_code: null,
          }),
      };
      const fields = [
        ...(body.label !== undefined ? ['label'] : []),
        ...(body.memberId !== undefined ? ['member'] : []),
        ...(body.color !== undefined ? ['color'] : []),
        ...(replaced ? ['url'] : []),
      ];
      if (fields.length === 0) throw new ApiError(422, 'no_changes');
      await trx
        .updateTable('app.calendar_source')
        .set({ ...changes, version: row.version + 1, updated_at: now() })
        .where('id', '=', id)
        .where('household_id', '=', m.householdId)
        .execute();

      // A new address replaces the imported events; a new owner takes them over.
      const source: SourceRef = {
        id,
        householdId: m.householdId,
        memberId: body.memberId ?? row.member_id,
        createdByMemberId: row.created_by_member_id,
      };
      if (replaced) {
        await storeOccurrences(trx, source, replaced.occurrences, { timeZone, now: now() });
      } else if (body.memberId !== undefined && body.memberId !== row.member_id) {
        await assignImportedEvents(trx, source);
      }
      await audit(trx, m, c.get('requestId'), id, 'calendar.updated', {
        fields,
        version: row.version + 1,
      });
      return view(trx, m.householdId, id);
    });
    return c.json({ calendar });
  });

  // Sync now. Always 200 when the calendar exists: a failed fetch is recorded on the calendar.
  app.post('/households/:householdId/calendars/:calendarId/sync', async (c) => {
    const scope = scopeOf(c);
    const id = uuidParam(c.req.param('calendarId'));
    const member = await inHousehold(deps, scope, async (_trx, m) => manager(m));
    const key = requireKey();
    const result = await syncSource((fn) => inHousehold(deps, scope, (trx) => fn(trx)), {
      householdId: scope.householdId,
      sourceId: id,
      key,
      now: now(),
      requestId: c.get('requestId'),
      actorMemberId: member.id,
      ...(deps.calendarFetchPolicy && { policy: deps.calendarFetchPolicy }),
    });
    if (!result) throw notFound();
    const calendar = await inHousehold(deps, scope, (trx) => view(trx, scope.householdId, id));
    return c.json({ calendar, result });
  });

  return app;
}
