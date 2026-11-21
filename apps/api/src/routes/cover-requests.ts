import { isCaredFor, isOccurrenceDate, localDateOf } from '@familyos/domain';
import type { CoverRequestStatus, Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, forbidden, notFound } from '../http/errors';
import { uuidParam } from '../http/validation';
import { loadSeries, memberRoles } from './events';

/**
 * Asking another adult to cover one occurrence (owner decision 2026-11-21): the request changes
 * nothing about who is responsible until the asked adult accepts, which creates the cover. Only
 * the asked adult accepts or declines; only the asker cancels. Covering it yourself stays
 * immediate (POST /events/:id/occurrences/:date). Every change is audited with IDs only.
 */

export const COVER_REQUEST_COLUMNS = [
  'id',
  'event_id as eventId',
  'occurrence_date as date',
  'asked_member_id as askedMemberId',
  'asked_by_member_id as askedByMemberId',
  'status',
  'created_at as createdAt',
  'responded_at as respondedAt',
  'version',
] as const;

type Row = {
  id: string;
  eventId: string;
  date: string;
  askedMemberId: string;
  askedByMemberId: string;
  status: CoverRequestStatus;
  createdAt: Date | string | number;
  respondedAt: Date | string | null;
  version: number;
};

export type CoverRequestView = Omit<Row, 'createdAt' | 'respondedAt'> & {
  createdAt: string;
  respondedAt: string | null;
};

export const coverRequestView = (r: Row): CoverRequestView => ({
  ...r,
  createdAt: new Date(r.createdAt).toISOString(),
  respondedAt: r.respondedAt === null ? null : new Date(r.respondedAt).toISOString(),
});

/** Pending requests on these events, for occurrence views. */
export async function pendingCoverRequests(
  trx: Transaction<Database>,
  householdId: string,
  eventIds: readonly string[],
): Promise<CoverRequestView[]> {
  if (eventIds.length === 0) return [];
  const rows = await trx
    .selectFrom('app.cover_request')
    .select(COVER_REQUEST_COLUMNS)
    .where('household_id', '=', householdId)
    .where('event_id', 'in', [...eventIds])
    .where('status', '=', 'pending')
    .execute();
  return rows.map(coverRequestView);
}

/** The caller's pending requests from today on: asked of them, and the ones they made. */
export async function myCoverRequests(
  trx: Transaction<Database>,
  member: CurrentMember,
  today: string,
): Promise<{ askedOfMe: CoverRequestView[]; askedByMe: CoverRequestView[] }> {
  const rows = await trx
    .selectFrom('app.cover_request')
    .select(COVER_REQUEST_COLUMNS)
    .where('household_id', '=', member.householdId)
    .where('status', '=', 'pending')
    .where('occurrence_date', '>=', today)
    .where((eb) =>
      eb.or([eb('asked_member_id', '=', member.id), eb('asked_by_member_id', '=', member.id)]),
    )
    .orderBy('occurrence_date')
    .orderBy('created_at')
    .limit(200)
    .execute();
  const views = rows.map(coverRequestView);
  return {
    askedOfMe: views.filter((r) => r.askedMemberId === member.id),
    askedByMe: views.filter((r) => r.askedByMemberId === member.id),
  };
}

const audit = (
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  row: { id: string; eventId: string; date: string; askedMemberId: string },
  action: string,
) =>
  recordAudit(trx, {
    householdId: member.householdId,
    actorMemberId: member.id,
    entityType: 'event',
    entityId: row.eventId,
    action,
    payload: { requestId: row.id, date: row.date, askedMemberId: row.askedMemberId },
    requestId,
  });

/**
 * Creates a request, or returns the same pending one again (a retry). Called by the events
 * route, which has already found the occurrence and checked the event can change.
 */
export async function requestCover(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  input: { eventId: string; date: string; askedMemberId: string },
): Promise<{ coverRequest: CoverRequestView; created: boolean }> {
  if (input.askedMemberId === member.id) throw new ApiError(422, 'cannot_ask_self');
  const role = (await memberRoles(trx, member.householdId)).get(input.askedMemberId);
  if (role === undefined || isCaredFor(role)) throw new ApiError(422, 'invalid_cover');
  const exception = await trx
    .selectFrom('app.event_exception')
    .select(['kind', 'cover_member_id'])
    .where('household_id', '=', member.householdId)
    .where('event_id', '=', input.eventId)
    .where('occurrence_date', '=', input.date)
    .executeTakeFirst();
  if (exception?.kind === 'skip') throw conflict('occurrence_skipped');
  if (exception?.kind === 'cover') throw conflict('already_covered');

  const inserted = await trx
    .insertInto('app.cover_request')
    .values({
      household_id: member.householdId,
      event_id: input.eventId,
      occurrence_date: input.date,
      asked_member_id: input.askedMemberId,
      asked_by_member_id: member.id,
    })
    .onConflict((oc) =>
      oc.columns(['event_id', 'occurrence_date']).where('status', '=', 'pending').doNothing(),
    )
    .returning(COVER_REQUEST_COLUMNS)
    .executeTakeFirst();
  if (inserted) {
    const view = coverRequestView(inserted);
    await audit(trx, member, requestId, view, 'event.cover_requested');
    return { coverRequest: view, created: true };
  }
  // One is already waiting on this occurrence: the same request again is a retry.
  const pending = await trx
    .selectFrom('app.cover_request')
    .select(COVER_REQUEST_COLUMNS)
    .where('household_id', '=', member.householdId)
    .where('event_id', '=', input.eventId)
    .where('occurrence_date', '=', input.date)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  if (
    pending &&
    pending.askedMemberId === input.askedMemberId &&
    pending.askedByMemberId === member.id
  ) {
    return { coverRequest: coverRequestView(pending), created: false };
  }
  throw conflict('request_pending');
}

/**
 * A cover or skip was written directly: a request still waiting on that occurrence is answered
 * by it (accepted when the asked adult covered it themselves, cancelled otherwise).
 */
export async function settlePendingRequest(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  input: { eventId: string; date: string; coverMemberId: string | null; now: Date },
): Promise<void> {
  const pending = await trx
    .selectFrom('app.cover_request')
    .select(COVER_REQUEST_COLUMNS)
    .where('household_id', '=', member.householdId)
    .where('event_id', '=', input.eventId)
    .where('occurrence_date', '=', input.date)
    .where('status', '=', 'pending')
    .forUpdate()
    .executeTakeFirst();
  if (!pending) return;
  const accepted = input.coverMemberId !== null && input.coverMemberId === pending.askedMemberId;
  await trx
    .updateTable('app.cover_request')
    .set({
      status: accepted ? 'accepted' : 'cancelled',
      responded_at: input.now,
      version: pending.version + 1,
    })
    .where('id', '=', pending.id)
    .where('household_id', '=', member.householdId)
    .execute();
  await audit(
    trx,
    member,
    requestId,
    coverRequestView(pending),
    accepted ? 'event.cover_accepted' : 'event.cover_cancelled',
  );
}

/** Cancels a removed member's pending requests, asked of them or made by them. */
export async function cancelRequestsOf(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  removedMemberId: string,
  now: Date,
): Promise<void> {
  const rows = await trx
    .updateTable('app.cover_request')
    .set((eb) => ({ status: 'cancelled', responded_at: now, version: eb('version', '+', 1) }))
    .where('household_id', '=', member.householdId)
    .where('status', '=', 'pending')
    .where((eb) =>
      eb.or([
        eb('asked_member_id', '=', removedMemberId),
        eb('asked_by_member_id', '=', removedMemberId),
      ]),
    )
    .returning(COVER_REQUEST_COLUMNS)
    .execute();
  for (const row of rows) {
    await audit(trx, member, requestId, coverRequestView(row), 'event.cover_cancelled');
  }
}

export function coverRequestRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const today = async (trx: Transaction<Database>, householdId: string) =>
    localDateOf(
      now(),
      (
        await trx
          .selectFrom('app.household')
          .select('timezone')
          .where('id', '=', householdId)
          .executeTakeFirstOrThrow()
      ).timezone,
    );

  /** The request, locked; 404 when it doesn't exist or its event isn't visible to the caller. */
  const lock = async (trx: Transaction<Database>, member: CurrentMember, id: string) => {
    const row = await trx
      .selectFrom('app.cover_request')
      .select(COVER_REQUEST_COLUMNS)
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  };

  const close = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    row: Row,
    status: 'accepted' | 'declined' | 'cancelled',
  ) =>
    coverRequestView(
      await trx
        .updateTable('app.cover_request')
        .set({ status, responded_at: now(), version: row.version + 1 })
        .where('id', '=', row.id)
        .where('household_id', '=', member.householdId)
        .returning(COVER_REQUEST_COLUMNS)
        .executeTakeFirstOrThrow(),
    );

  app.get('/', async (c) => {
    authorize(c, 'event.read');
    const trx = c.get('trx');
    const member = c.get('member');
    return c.json(await myCoverRequests(trx, member, await today(trx, member.householdId)));
  });

  // Accept: the cover is created and the request closed together. Accepting again is a no-op;
  // an occurrence someone else has covered (or skipped) since is a 409 and nothing changes.
  app.post('/:requestId/accept', async (c) => {
    authorize(c, 'event.read');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, uuidParam(c.req.param('requestId')));
    if (row.askedMemberId !== member.id) throw forbidden();
    if (row.status === 'accepted') return c.json({ coverRequest: coverRequestView(row) });
    if (row.status !== 'pending') throw conflict('request_closed');

    const [series] = await loadSeries(trx, member.householdId, { eventId: row.eventId });
    if (!series || series.source !== null || !isOccurrenceDate(series, row.date)) {
      throw conflict('occurrence_gone');
    }
    const exception = await trx
      .selectFrom('app.event_exception')
      .select(['kind', 'cover_member_id'])
      .where('household_id', '=', member.householdId)
      .where('event_id', '=', row.eventId)
      .where('occurrence_date', '=', row.date)
      .forUpdate()
      .executeTakeFirst();
    if (exception?.kind === 'skip') throw conflict('occurrence_skipped');
    if (exception && exception.cover_member_id !== member.id) throw conflict('already_covered');
    if (!exception) {
      const created = await trx
        .insertInto('app.event_exception')
        .values({
          household_id: member.householdId,
          event_id: row.eventId,
          occurrence_date: row.date,
          kind: 'cover',
          cover_member_id: member.id,
          created_by_member_id: member.id,
          created_at: now(),
        })
        .onConflict((oc) => oc.columns(['event_id', 'occurrence_date']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!created) throw conflict('already_covered');
    }
    const coverRequest = await close(trx, member, row, 'accepted');
    await audit(trx, member, c.get('requestId'), coverRequest, 'event.cover_accepted');
    return c.json({ coverRequest });
  });

  app.post('/:requestId/decline', async (c) => {
    authorize(c, 'event.read');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, uuidParam(c.req.param('requestId')));
    if (row.askedMemberId !== member.id) throw forbidden();
    if (row.status === 'declined') return c.json({ coverRequest: coverRequestView(row) });
    if (row.status !== 'pending') throw conflict('request_closed');
    const coverRequest = await close(trx, member, row, 'declined');
    await audit(trx, member, c.get('requestId'), coverRequest, 'event.cover_declined');
    return c.json({ coverRequest });
  });

  app.post('/:requestId/cancel', async (c) => {
    authorize(c, 'event.manage');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, uuidParam(c.req.param('requestId')));
    if (row.askedByMemberId !== member.id) throw forbidden();
    if (row.status === 'cancelled') return c.json({ coverRequest: coverRequestView(row) });
    if (row.status !== 'pending') throw conflict('request_closed');
    const coverRequest = await close(trx, member, row, 'cancelled');
    await audit(trx, member, c.get('requestId'), coverRequest, 'event.cover_cancelled');
    return c.json({ coverRequest });
  });

  return app;
}
