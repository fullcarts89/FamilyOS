import type { Database } from '@familyos/db';
import type { TaskList } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { heartbeat } from './heartbeat';
import { materializeRoutines } from './materialize-routines';
import { syncCalendars } from './sync-calendars';

export function createTaskList(
  db: Kysely<Database>,
  options: { calendarKey?: Buffer } = {},
): TaskList {
  return {
    heartbeat: heartbeat(db),
    materialize_routines: materializeRoutines(db),
    sync_calendars: syncCalendars(db, options.calendarKey ? { key: options.calendarKey } : {}),
  };
}

/**
 * Heartbeat every 10 minutes, so readiness notices a stopped worker within half an hour.
 * Routines hourly, so each household's midnight is picked up within the hour whatever its
 * timezone. Calendar subscriptions every 15 minutes; each is refreshed about every 30.
 */
export const CRONTAB = [
  '*/10 * * * * heartbeat',
  '7 * * * * materialize_routines',
  '*/15 * * * * sync_calendars',
].join('\n');
