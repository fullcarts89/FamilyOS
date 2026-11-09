import type { Database } from '@familyos/db';
import type { TaskList } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { heartbeat } from './heartbeat';
import { materializeRoutines } from './materialize-routines';

export function createTaskList(db: Kysely<Database>): TaskList {
  return {
    heartbeat: heartbeat(db),
    materialize_routines: materializeRoutines(db),
  };
}

/**
 * Heartbeat every 10 minutes, so readiness notices a stopped worker within half an hour.
 * Routines hourly, so each household's midnight is picked up within the hour whatever its
 * timezone.
 */
export const CRONTAB = ['*/10 * * * * heartbeat', '7 * * * * materialize_routines'].join('\n');
