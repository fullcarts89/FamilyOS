import type { CalendarStatus, Database } from '@familyos/db';
import { addDays, localDateOf } from '@familyos/domain';
import { sql, type Kysely, type Transaction } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { decryptUrl, normalizeCalendarUrl } from './crypto';
import {
  CalendarFetchError,
  DEFAULT_FETCH_POLICY,
  fetchCalendarText,
  type FetchPolicy,
} from './fetch';
import { parseCalendar, type ImportedOccurrence } from './parse';

type Db = Kysely<Database> | Transaction<Database>;

/** Imported events cover two weeks back and about three months ahead. */
export const SYNC_DAYS_BACK = 14;
export const SYNC_DAYS_AHEAD = 90;
const CHUNK = 200;

/** The local-date window, as instants in the household's timezone. */
export function syncWindow(now: Date, timeZone: string) {
  const today = localDateOf(now, timeZone);
  const at = (date: string) =>
    Temporal.PlainDate.from(date).toZonedDateTime({ timeZone }).toInstant();
  return {
    from: at(addDays(today, -SYNC_DAYS_BACK)),
    to: at(addDays(today, SYNC_DAYS_AHEAD + 1)),
    timeZone,
  };
}

/** Fetches and parses a calendar address. Throws CalendarFetchError with a fixed code. */
export async function fetchOccurrences(
  address: string,
  options: { timeZone: string; now: Date; policy?: FetchPolicy },
): Promise<ImportedOccurrence[]> {
  const url = normalizeCalendarUrl(address, { allowHttp: options.policy?.allowHttp === true });
  if (typeof url === 'string') throw new CalendarFetchError(url);
  const text = await fetchCalendarText(url, options.policy ?? DEFAULT_FETCH_POLICY);
  return parseCalendar(text, syncWindow(options.now, options.timeZone));
}

export interface SourceRef {
  id: string;
  householdId: string;
  memberId: string;
  createdByMemberId: string;
}

/**
 * Makes the source's imported events match `occurrences`: upserts by (UID, RECURRENCE-ID),
 * bumping a row's version only when it changed, removes the ones that vanished, and keeps each
 * event attended by the calendar's member. Every query names the household and the source.
 */
export async function storeOccurrences(
  db: Db,
  source: SourceRef,
  occurrences: readonly ImportedOccurrence[],
  options: { timeZone: string; now: Date },
): Promise<{ imported: number; removed: number }> {
  for (let i = 0; i < occurrences.length; i += CHUNK) {
    const chunk = occurrences.slice(i, i + CHUNK);
    await db
      .insertInto('app.event')
      .values(
        chunk.map((o) => ({
          household_id: source.householdId,
          title: o.title,
          starts_at: o.startsAt,
          ends_at: o.endsAt,
          all_day: o.allDay,
          location: o.location,
          kind: 'other' as const,
          timezone: options.timeZone,
          source_calendar_id: source.id,
          external_uid: o.uid,
          external_recurrence_id: o.recurrenceId,
          created_by_member_id: source.createdByMemberId,
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(['source_calendar_id', 'external_uid', 'external_recurrence_id'])
          .where('source_calendar_id', 'is not', null)
          .doUpdateSet({
            title: (eb) => eb.ref('excluded.title'),
            starts_at: (eb) => eb.ref('excluded.starts_at'),
            ends_at: (eb) => eb.ref('excluded.ends_at'),
            all_day: (eb) => eb.ref('excluded.all_day'),
            location: (eb) => eb.ref('excluded.location'),
            version: sql`app.event.version + 1`,
            updated_at: options.now,
          })
          .where(
            sql<boolean>`(app.event.title, app.event.starts_at, app.event.ends_at, app.event.all_day, app.event.location)
              is distinct from (excluded.title, excluded.starts_at, excluded.ends_at, excluded.all_day, excluded.location)`,
          ),
      )
      .execute();
  }

  const uids = occurrences.map((o) => o.uid);
  const rids = occurrences.map((o) => o.recurrenceId);
  const removed = await db
    .deleteFrom('app.event')
    .where('household_id', '=', source.householdId)
    .where('source_calendar_id', '=', source.id)
    .where(
      sql<boolean>`(external_uid, external_recurrence_id) not in (
        select * from unnest(${uids}::text[], ${rids}::text[])
      )`,
    )
    .executeTakeFirst();

  await assignImportedEvents(db, source);

  return { imported: occurrences.length, removed: Number(removed.numDeletedRows) };
}

/** Each imported event is attended by whoever the calendar belongs to, and nobody else. */
export async function assignImportedEvents(db: Db, source: SourceRef): Promise<void> {
  const imported = db
    .selectFrom('app.event')
    .select('id')
    .where('household_id', '=', source.householdId)
    .where('source_calendar_id', '=', source.id);
  await db
    .deleteFrom('app.event_member')
    .where('household_id', '=', source.householdId)
    .where('event_id', 'in', imported)
    .where('member_id', '!=', source.memberId)
    .execute();
  await db
    .insertInto('app.event_member')
    .columns(['household_id', 'event_id', 'member_id'])
    .expression(
      db
        .selectFrom('app.event')
        .select(['household_id', 'id', sql<string>`${source.memberId}::uuid`.as('member_id')])
        .where('household_id', '=', source.householdId)
        .where('source_calendar_id', '=', source.id),
    )
    .onConflict((oc) => oc.columns(['event_id', 'member_id']).doNothing())
    .execute();
}

export interface SyncResult {
  status: Extract<CalendarStatus, 'ok' | 'error'>;
  errorCode: string | null;
  imported: number;
  removed: number;
}

/** Records the outcome on the source (not a member edit: its version stays) and audits it. */
export async function recordSync(
  db: Db,
  source: SourceRef,
  result: SyncResult,
  options: { now: Date; actorMemberId: string | null; requestId: string },
): Promise<void> {
  await db
    .updateTable('app.calendar_source')
    .set({
      status: result.status,
      last_error_code: result.errorCode,
      ...(result.status === 'ok' && { last_synced_at: options.now }),
      updated_at: options.now,
    })
    .where('id', '=', source.id)
    .where('household_id', '=', source.householdId)
    .execute();
  await db
    .insertInto('app.audit_event')
    .values({
      household_id: source.householdId,
      actor_member_id: options.actorMemberId,
      entity_type: 'calendar',
      entity_id: source.id,
      action: 'calendar.synced',
      payload: {
        status: result.status,
        imported: result.imported,
        removed: result.removed,
        ...(result.errorCode && { errorCode: result.errorCode }),
      },
      request_id: options.requestId,
    })
    .execute();
}

/**
 * Syncs one source. `run` opens a transaction for its database steps (the API passes its request
 * transaction; the worker a scheduler transaction per step, so no connection is held while the
 * remote server answers). A failed fetch keeps the events already imported.
 */
export async function syncSource(
  run: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  options: {
    householdId: string;
    sourceId: string;
    key: Buffer;
    now: Date;
    requestId: string;
    actorMemberId: string | null;
    policy?: FetchPolicy;
  },
): Promise<SyncResult | null> {
  const loaded = await run(async (db) => {
    const row = await db
      .selectFrom('app.calendar_source')
      .select([
        'id',
        'household_id',
        'member_id',
        'created_by_member_id',
        'url_ciphertext',
        'url_nonce',
      ])
      .where('id', '=', options.sourceId)
      .where('household_id', '=', options.householdId)
      .executeTakeFirst();
    const household = await db
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', options.householdId)
      .executeTakeFirst();
    return row && household ? { row, timeZone: household.timezone } : null;
  });
  if (!loaded) return null;
  const { row, timeZone } = loaded;
  const source: SourceRef = {
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    createdByMemberId: row.created_by_member_id,
  };

  let occurrences: ImportedOccurrence[] | null = null;
  let errorCode: string | null = null;
  try {
    const address = decryptUrl(
      options.key,
      { ciphertext: row.url_ciphertext, nonce: row.url_nonce },
      { householdId: source.householdId, sourceId: source.id },
    );
    occurrences = await fetchOccurrences(address, {
      timeZone,
      now: options.now,
      ...(options.policy && { policy: options.policy }),
    });
  } catch (error) {
    errorCode = error instanceof CalendarFetchError ? error.code : 'undecryptable';
  }

  return run(async (db) => {
    // Removed while we were fetching: nothing to store.
    const still = await db
      .selectFrom('app.calendar_source')
      .select('id')
      .where('id', '=', source.id)
      .where('household_id', '=', source.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!still) return null;
    const stored = occurrences
      ? await storeOccurrences(db, source, occurrences, { timeZone, now: options.now })
      : { imported: 0, removed: 0 };
    const result: SyncResult = {
      status: occurrences ? 'ok' : 'error',
      errorCode,
      ...stored,
    };
    await recordSync(db, source, result, options);
    return result;
  });
}
