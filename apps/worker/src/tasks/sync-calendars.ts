import { syncSource, type FetchPolicy } from '@familyos/calendar';
import { withSchedulerContext, type Database } from '@familyos/db';
import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';

/** A source is due when it hasn't synced for this long (the task runs every 15 minutes). */
export const SYNC_EVERY_MS = 28 * 60 * 1000;

/**
 * Every 15 minutes: refreshes each household's read-only calendar subscriptions that are due,
 * so each one syncs about every 30 minutes. As `familyos_scheduler`, one household per
 * transaction, seeing only calendar sources and imported events (never members' own events),
 * with no transaction held while a remote server answers. Logs counts only, never addresses,
 * labels or titles. Without CALENDAR_ENCRYPTION_KEY it does nothing.
 */
export function syncCalendars(
  db: Kysely<Database>,
  options: { key?: Buffer; now?: () => Date; policy?: FetchPolicy } = {},
): Task {
  const now = options.now ?? (() => new Date());
  return async (_payload, helpers) => {
    if (!options.key) {
      helpers.logger.info('calendar sync off: no CALENDAR_ENCRYPTION_KEY');
      return;
    }
    const households = await withSchedulerContext(db, null, (trx) =>
      trx.selectFrom('app.household').select('id').execute(),
    );
    let synced = 0;
    let failed = 0;
    for (const { id: householdId } of households) {
      const dueBefore = new Date(now().getTime() - SYNC_EVERY_MS);
      const due = await withSchedulerContext(db, householdId, (trx) =>
        trx
          .selectFrom('app.calendar_source')
          .select('id')
          .where('household_id', '=', householdId)
          .where((eb) =>
            eb.or([eb('last_synced_at', 'is', null), eb('last_synced_at', '<', dueBefore)]),
          )
          .execute(),
      );
      for (const { id } of due) {
        try {
          const result = await syncSource((fn) => withSchedulerContext(db, householdId, fn), {
            householdId,
            sourceId: id,
            key: options.key,
            now: now(),
            requestId: `scheduler:${helpers.job.id}`,
            actorMemberId: null,
            ...(options.policy && { policy: options.policy }),
          });
          if (result?.status === 'ok') synced++;
          else if (result) failed++;
        } catch (error) {
          failed++;
          helpers.logger.error('calendar sync failed', {
            householdId,
            errorName: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
    }
    helpers.logger.info('calendars synced', { households: households.length, synced, failed });
  };
}
