import {
  MAX_EVENT_DAYS,
  MAX_EVENT_RANGE_DAYS,
  CARE_ACTIONS,
  EVENT_KINDS,
  addDays,
  describeSchedule,
  expandEvents,
  isCaredFor,
  isOccurrenceDate,
  isValidEventRule,
  localDateOf,
  occurrenceOf,
  rangeDays,
  startOfLocalDay,
  type CalendarRule,
  type EventOccurrence,
  type EventSeries,
  type MemberRole,
} from '@familyos/domain';
import type { Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';

const Uuid = z.uuid();
const LocalDate = z.iso.date();
const Instant = z.iso.datetime({ offset: true });
const Rule = z.custom<CalendarRule>((value) => isValidEventRule(value));
const Title = z.string().trim().min(1).max(200);
const Location = z.string().trim().min(1).max(200);
const Notes = z.string().trim().min(1).max(2000);
const Place = z.string().trim().min(1).max(120);
const MemberIds = z
  .array(Uuid)
  .max(12)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'no repeats' });

const CreateEvent = z
  .object({
    title: Title,
    kind: z.enum(EVENT_KINDS).default('other'),
    allDay: z.boolean().default(false),
    /** Timed events: instants with an offset. */
    startsAt: Instant.optional(),
    endsAt: Instant.optional(),
    /** All-day events: local dates, inclusive. */
    startsOn: LocalDate.optional(),
    endsOn: LocalDate.optional(),
    location: Location.nullish(),
    notes: Notes.nullish(),
    recurrence: Rule.nullish(),
    recursUntil: LocalDate.nullish(),
    memberIds: MemberIds.default([]),
    careMemberId: Uuid.nullish(),
    careAction: z.enum(CARE_ACTIONS).nullish(),
    carePlace: Place.nullish(),
  })
  .strict();

const UpdateEvent = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: Title.optional(),
    kind: z.enum(EVENT_KINDS).optional(),
    allDay: z.boolean().optional(),
    startsAt: Instant.optional(),
    endsAt: Instant.optional(),
    startsOn: LocalDate.optional(),
    endsOn: LocalDate.optional(),
    location: Location.nullable().optional(),
    notes: Notes.nullable().optional(),
    recurrence: Rule.nullable().optional(),
    recursUntil: LocalDate.nullable().optional(),
    memberIds: MemberIds.optional(),
    careMemberId: Uuid.nullable().optional(),
    careAction: z.enum(CARE_ACTIONS).nullable().optional(),
    carePlace: Place.nullable().optional(),
  })
  .strict();

const OccurrenceAction = z
  .object({ action: z.enum(['skip', 'cover']), memberId: Uuid.optional() })
  .strict()
  .refine((b) => (b.action === 'cover') === (b.memberId !== undefined), {
    message: 'a cover names the adult; a skip names nobody',
  });

const EVENT_COLUMNS = [
  'id',
  'title',
  'kind',
  'starts_at',
  'ends_at',
  'all_day',
  'location',
  'notes',
  'recurrence',
  'recurs_until',
  'timezone',
  'care_member_id',
  'care_action',
  'care_place',
  'created_by_member_id',
  'version',
  'created_at',
  'updated_at',
] as const;

const iso = (value: Date | string) => new Date(value).toISOString();

export interface StoredSeries extends EventSeries {
  location: string | null;
  notes: string | null;
  createdByMemberId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Loads series with their members and exceptions: one event, or every event that may have an
 * occurrence overlapping a local date range.
 */
export async function loadSeries(
  trx: Transaction<Database>,
  householdId: string,
  filter: { eventId: string } | { from: string; to: string; timeZone: string },
): Promise<StoredSeries[]> {
  let query = trx
    .selectFrom('app.event')
    .select(EVENT_COLUMNS)
    .where('household_id', '=', householdId);
  if ('eventId' in filter) {
    query = query.where('id', '=', filter.eventId);
  } else {
    const rangeStart = new Date(startOfLocalDay(filter.from, filter.timeZone).epochMilliseconds);
    const rangeEnd = new Date(
      startOfLocalDay(addDays(filter.to, 1), filter.timeZone).epochMilliseconds,
    );
    // Generous bounds; the domain expansion decides exactly what overlaps.
    const seriesFloor = addDays(filter.from, -(MAX_EVENT_DAYS + 2));
    query = query
      .where('starts_at', '<', rangeEnd)
      .where((eb) =>
        eb.or([
          eb.and([eb('recurrence', 'is', null), eb('ends_at', '>=', rangeStart)]),
          eb.and([
            eb('recurrence', 'is not', null),
            eb.or([eb('recurs_until', 'is', null), eb('recurs_until', '>=', seriesFloor)]),
          ]),
        ]),
      );
  }
  const rows = await query.orderBy('starts_at').limit(2000).execute();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const members = await trx
    .selectFrom('app.event_member')
    .select(['event_id', 'member_id'])
    .where('household_id', '=', householdId)
    .where('event_id', 'in', ids)
    .execute();
  const exceptions = await trx
    .selectFrom('app.event_exception')
    .select(['event_id', 'occurrence_date', 'kind', 'cover_member_id'])
    .where('household_id', '=', householdId)
    .where('event_id', 'in', ids)
    .orderBy('occurrence_date')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    allDay: r.all_day,
    timezone: r.timezone,
    recurrence: r.recurrence,
    recursUntil: r.recurs_until,
    memberIds: members.filter((m) => m.event_id === r.id).map((m) => m.member_id),
    careMemberId: r.care_member_id,
    careAction: r.care_action,
    carePlace: r.care_place,
    exceptions: exceptions
      .filter((e) => e.event_id === r.id)
      .map((e) => ({ date: e.occurrence_date, kind: e.kind, coverMemberId: e.cover_member_id })),
    location: r.location,
    notes: r.notes,
    createdByMemberId: r.created_by_member_id,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }));
}

/** Active members by ID, for cover rules and validation. */
export async function memberRoles(
  trx: Transaction<Database>,
  householdId: string,
): Promise<Map<string, MemberRole>> {
  const rows = await trx
    .selectFrom('app.member')
    .select(['id', 'role'])
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .execute();
  return new Map(rows.map((r) => [r.id, r.role]));
}

export const caredForIn = (roles: Map<string, MemberRole>) => (id: string) => {
  const role = roles.get(id);
  return role !== undefined && isCaredFor(role);
};

/** An occurrence as the API returns it: the domain occurrence plus the series' details. */
export function occurrenceView(occurrence: EventOccurrence, series: StoredSeries) {
  return {
    ...occurrence,
    location: series.location,
    notes: series.notes,
    timezone: series.timezone,
    version: series.version,
  };
}

function seriesView(s: StoredSeries) {
  const startsOn = localDateOf(new Date(s.startsAt), s.timezone);
  const lastInstant = s.allDay ? new Date(new Date(s.endsAt).getTime() - 1) : new Date(s.endsAt);
  const endsOn = localDateOf(
    lastInstant < new Date(s.startsAt) ? new Date(s.startsAt) : lastInstant,
    s.timezone,
  );
  return {
    id: s.id,
    title: s.title,
    kind: s.kind,
    allDay: s.allDay,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    startsOn,
    endsOn,
    location: s.location,
    notes: s.notes,
    recurrence: s.recurrence,
    recursUntil: s.recursUntil,
    summary: s.recurrence ? describeSchedule(s.recurrence) : null,
    timezone: s.timezone,
    memberIds: s.memberIds,
    careMemberId: s.careMemberId,
    careAction: s.careAction,
    carePlace: s.carePlace,
    exceptions: s.exceptions,
    createdByMemberId: s.createdByMemberId,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

const invalidTimes = () => new ApiError(422, 'invalid_times');

/** The stored instants for a timed or all-day event, checked. */
function resolveTimes(
  input: {
    allDay: boolean;
    startsAt?: string | undefined;
    endsAt?: string | undefined;
    startsOn?: string | undefined;
    endsOn?: string | undefined;
  },
  timeZone: string,
): { startsAt: Date; endsAt: Date; startsOn: string } {
  if (input.allDay) {
    if (!input.startsOn || input.startsAt || input.endsAt) throw invalidTimes();
    const endsOn = input.endsOn ?? input.startsOn;
    if (endsOn < input.startsOn || rangeDays(input.startsOn, endsOn) > MAX_EVENT_DAYS) {
      throw invalidTimes();
    }
    return {
      startsAt: new Date(startOfLocalDay(input.startsOn, timeZone).epochMilliseconds),
      endsAt: new Date(startOfLocalDay(addDays(endsOn, 1), timeZone).epochMilliseconds),
      startsOn: input.startsOn,
    };
  }
  if (!input.startsAt || !input.endsAt || input.startsOn || input.endsOn) throw invalidTimes();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const length = endsAt.getTime() - startsAt.getTime();
  if (length < 0 || length > MAX_EVENT_DAYS * 24 * 3600 * 1000) throw invalidTimes();
  return { startsAt, endsAt, startsOn: localDateOf(startsAt, timeZone) };
}

async function assertMembers(
  roles: Map<string, MemberRole>,
  care: { memberIds: readonly string[]; careMemberId: string | null },
) {
  if (care.memberIds.some((id) => !roles.has(id))) throw new ApiError(422, 'invalid_member');
  if (care.careMemberId !== null) {
    const role = roles.get(care.careMemberId);
    if (role === undefined || !isCaredFor(role)) throw new ApiError(422, 'invalid_care_member');
  }
}

/** Occurrence dates in paths; anything malformed is a 404 like an unknown ID. */
function dateParam(value: string | undefined): string {
  const parsed = LocalDate.safeParse(value);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

async function replaceMembers(
  trx: Transaction<Database>,
  householdId: string,
  eventId: string,
  memberIds: readonly string[],
) {
  await trx
    .deleteFrom('app.event_member')
    .where('household_id', '=', householdId)
    .where('event_id', '=', eventId)
    .execute();
  if (memberIds.length === 0) return;
  await trx
    .insertInto('app.event_member')
    .values(
      memberIds.map((id) => ({ household_id: householdId, event_id: eventId, member_id: id })),
    )
    .execute();
}

export function eventRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const householdTimezone = async (trx: Transaction<Database>, householdId: string) =>
    (
      await trx
        .selectFrom('app.household')
        .select('timezone')
        .where('id', '=', householdId)
        .executeTakeFirstOrThrow()
    ).timezone;

  const loadOne = async (trx: Transaction<Database>, member: CurrentMember, eventId: string) => {
    const [series] = await loadSeries(trx, member.householdId, { eventId });
    if (!series) throw notFound();
    return series;
  };

  /** Locks the event row and checks the caller's version. */
  const lockForChange = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    eventId: string,
    expectedVersion: number,
  ) => {
    const row = await trx
      .selectFrom('app.event')
      .select(['id', 'version'])
      .where('id', '=', eventId)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (row.version !== expectedVersion) throw conflict();
    return row;
  };

  app.get('/', async (c) => {
    authorize(c, 'event.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const from = LocalDate.safeParse(c.req.query('from'));
    const to = LocalDate.safeParse(c.req.query('to'));
    if (!from.success || !to.success || to.data < from.data) {
      throw new ApiError(422, 'invalid_range');
    }
    if (rangeDays(from.data, to.data) > MAX_EVENT_RANGE_DAYS) {
      throw new ApiError(422, 'range_too_long');
    }
    const timeZone = await householdTimezone(trx, householdId);
    const series = await loadSeries(trx, householdId, {
      from: from.data,
      to: to.data,
      timeZone,
    });
    const roles = await memberRoles(trx, householdId);
    const byId = new Map(series.map((s) => [s.id, s]));
    const occurrences = expandEvents(
      series,
      { from: from.data, to: to.data, timeZone },
      caredForIn(roles),
    ).flatMap((o) => {
      const s = byId.get(o.eventId);
      return s ? [occurrenceView(o, s)] : [];
    });
    return c.json({ from: from.data, to: to.data, timezone: timeZone, occurrences });
  });

  app.post('/', async (c) => {
    authorize(c, 'event.manage');
    const body = await parseBody(c.req.raw, CreateEvent);
    const trx = c.get('trx');
    const member = c.get('member');
    const timeZone = await householdTimezone(trx, member.householdId);
    const times = resolveTimes(body, timeZone);
    const recurrence = body.recurrence ?? null;
    const recursUntil = recurrence ? (body.recursUntil ?? null) : null;
    if (body.recursUntil && !recurrence) throw new ApiError(422, 'invalid_body');
    if (recursUntil && recursUntil < times.startsOn) throw invalidTimes();
    const careMemberId = body.careMemberId ?? null;
    if (!careMemberId && (body.careAction || body.carePlace)) {
      throw new ApiError(422, 'invalid_care_member');
    }
    await assertMembers(await memberRoles(trx, member.householdId), {
      memberIds: body.memberIds,
      careMemberId,
    });

    const event = await trx
      .insertInto('app.event')
      .values({
        household_id: member.householdId,
        title: body.title,
        kind: body.kind,
        starts_at: times.startsAt,
        ends_at: times.endsAt,
        all_day: body.allDay,
        location: body.location ?? null,
        notes: body.notes ?? null,
        recurrence,
        recurs_until: recursUntil,
        timezone: timeZone,
        care_member_id: careMemberId,
        care_action: body.careAction ?? null,
        care_place: body.carePlace ?? null,
        created_by_member_id: member.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await replaceMembers(trx, member.householdId, event.id, body.memberIds);
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'event',
      entityId: event.id,
      action: 'event.created',
      payload: {
        kind: body.kind,
        allDay: body.allDay,
        recurring: recurrence !== null,
        memberCount: body.memberIds.length,
        ...(careMemberId && { careMemberId, careAction: body.careAction ?? null }),
      },
      requestId: c.get('requestId'),
    });
    return c.json({ event: seriesView(await loadOne(trx, member, event.id)) }, 201);
  });

  app.get('/:eventId', async (c) => {
    authorize(c, 'event.read');
    const eventId = uuidParam(c.req.param('eventId'));
    return c.json({ event: seriesView(await loadOne(c.get('trx'), c.get('member'), eventId)) });
  });

  app.patch('/:eventId', async (c) => {
    authorize(c, 'event.manage');
    const eventId = uuidParam(c.req.param('eventId'));
    const body = await parseBody(c.req.raw, UpdateEvent);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockForChange(trx, member, eventId, body.expectedVersion);
    const current = await loadOne(trx, member, eventId);
    const view = seriesView(current);

    const allDay = body.allDay ?? current.allDay;
    const timesTouched = [body.allDay, body.startsAt, body.endsAt, body.startsOn, body.endsOn].some(
      (v) => v !== undefined,
    );
    const sameMode = allDay === current.allDay;
    const times = timesTouched
      ? resolveTimes(
          allDay
            ? {
                allDay,
                startsOn: body.startsOn ?? (sameMode ? view.startsOn : undefined),
                endsOn: body.endsOn ?? (sameMode && !body.startsOn ? view.endsOn : body.startsOn),
              }
            : {
                allDay,
                startsAt: body.startsAt ?? (sameMode ? current.startsAt : undefined),
                endsAt: body.endsAt ?? (sameMode ? current.endsAt : undefined),
              },
          current.timezone,
        )
      : null;
    const startsOn = times?.startsOn ?? view.startsOn;

    const recurrence = body.recurrence !== undefined ? body.recurrence : current.recurrence;
    const recursUntil = !recurrence
      ? null
      : body.recursUntil !== undefined
        ? body.recursUntil
        : current.recursUntil;
    if (body.recursUntil && !recurrence) throw new ApiError(422, 'invalid_body');
    if (recursUntil && recursUntil < startsOn) throw invalidTimes();

    const careMemberId = body.careMemberId !== undefined ? body.careMemberId : current.careMemberId;
    // Clearing the member clears what the event did for them.
    const careAction = !careMemberId
      ? null
      : body.careAction !== undefined
        ? body.careAction
        : current.careAction;
    const carePlace = !careMemberId
      ? null
      : body.carePlace !== undefined
        ? body.carePlace
        : current.carePlace;
    if (!careMemberId && (body.careAction || body.carePlace)) {
      throw new ApiError(422, 'invalid_care_member');
    }
    const memberIds = body.memberIds ?? current.memberIds;
    await assertMembers(await memberRoles(trx, member.householdId), { memberIds, careMemberId });

    const changes = {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.kind !== undefined && { kind: body.kind }),
      ...(times && { starts_at: times.startsAt, ends_at: times.endsAt, all_day: allDay }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...((body.recurrence !== undefined || body.recursUntil !== undefined) && {
        recurrence,
        recurs_until: recursUntil,
      }),
      ...((body.careMemberId !== undefined ||
        body.careAction !== undefined ||
        body.carePlace !== undefined) && {
        care_member_id: careMemberId,
        care_action: careAction,
        care_place: carePlace,
      }),
    };
    const fields = [
      ...Object.keys(changes),
      ...(body.memberIds !== undefined ? ['members'] : []),
    ].sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');

    const updated = await trx
      .updateTable('app.event')
      .set({ ...changes, version: row.version + 1, updated_at: now() })
      .where('id', '=', eventId)
      .where('household_id', '=', member.householdId)
      .where('version', '=', body.expectedVersion)
      .returning('version')
      .executeTakeFirst();
    if (!updated) throw conflict();
    if (body.memberIds !== undefined) {
      await replaceMembers(trx, member.householdId, eventId, body.memberIds);
    }
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'event',
      entityId: eventId,
      action: 'event.updated',
      payload: { fields, version: updated.version },
      requestId: c.get('requestId'),
    });
    return c.json({ event: seriesView(await loadOne(trx, member, eventId)) });
  });

  // Versioned delete: DELETE /events/:id?expectedVersion=N.
  app.delete('/:eventId', async (c) => {
    authorize(c, 'event.manage');
    const eventId = uuidParam(c.req.param('eventId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lockForChange(trx, member, eventId, expected.data);
    await trx
      .deleteFrom('app.event')
      .where('id', '=', eventId)
      .where('household_id', '=', member.householdId)
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'event',
      entityId: eventId,
      action: 'event.deleted',
      payload: { version: row.version },
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  /** The series and its occurrence on `date`, or 404 when it has none that day. */
  const locate = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    eventId: string,
    date: string,
  ) => {
    const series = await loadOne(trx, member, eventId);
    if (!isOccurrenceDate(series, date)) throw notFound();
    return series;
  };

  const occurrenceResponse = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    eventId: string,
    date: string,
  ) => {
    const series = await loadOne(trx, member, eventId);
    const roles = await memberRoles(trx, member.householdId);
    const occurrence = occurrenceOf(series, date, caredForIn(roles));
    if (!occurrence) throw notFound();
    return { occurrence: occurrenceView(occurrence, series) };
  };

  // One occurrence: skip it, or have a different adult cover it. Replaces any earlier change.
  app.post('/:eventId/occurrences/:date', async (c) => {
    authorize(c, 'event.manage');
    const eventId = uuidParam(c.req.param('eventId'));
    const date = dateParam(c.req.param('date'));
    const body = await parseBody(c.req.raw, OccurrenceAction);
    const trx = c.get('trx');
    const member = c.get('member');
    await locate(trx, member, eventId, date);
    if (body.memberId) {
      const role = (await memberRoles(trx, member.householdId)).get(body.memberId);
      if (role === undefined || isCaredFor(role)) throw new ApiError(422, 'invalid_cover');
    }
    await trx
      .insertInto('app.event_exception')
      .values({
        household_id: member.householdId,
        event_id: eventId,
        occurrence_date: date,
        kind: body.action,
        cover_member_id: body.memberId ?? null,
        created_by_member_id: member.id,
      })
      .onConflict((oc) =>
        oc.columns(['event_id', 'occurrence_date']).doUpdateSet({
          kind: body.action,
          cover_member_id: body.memberId ?? null,
          created_by_member_id: member.id,
        }),
      )
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'event',
      entityId: eventId,
      action: body.action === 'skip' ? 'event.occurrence_skipped' : 'event.occurrence_covered',
      payload: { date, ...(body.memberId && { coverMemberId: body.memberId }) },
      requestId: c.get('requestId'),
    });
    return c.json(await occurrenceResponse(trx, member, eventId, date));
  });

  // Undo a skip or cover.
  app.delete('/:eventId/occurrences/:date', async (c) => {
    authorize(c, 'event.manage');
    const eventId = uuidParam(c.req.param('eventId'));
    const date = dateParam(c.req.param('date'));
    const trx = c.get('trx');
    const member = c.get('member');
    await locate(trx, member, eventId, date);
    const removed = await trx
      .deleteFrom('app.event_exception')
      .where('household_id', '=', member.householdId)
      .where('event_id', '=', eventId)
      .where('occurrence_date', '=', date)
      .returning('kind')
      .executeTakeFirst();
    if (!removed) throw notFound();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'event',
      entityId: eventId,
      action: 'event.occurrence_restored',
      payload: { date, was: removed.kind },
      requestId: c.get('requestId'),
    });
    return c.json(await occurrenceResponse(trx, member, eventId, date));
  });

  return app;
}
