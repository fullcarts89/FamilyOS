import type { Database } from '@familyos/db';
import type { TaskList } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { heartbeat } from './heartbeat';
import { materializeRoutines } from './materialize-routines';

export function createTaskList(db: Kysely<Database>): TaskList {
  return {
    heartbeat,
    materialize_routines: materializeRoutines(db),
  };
}

/** Hourly, so each household's midnight is picked up within the hour whatever its timezone. */
export const CRONTAB = '7 * * * * materialize_routines';
