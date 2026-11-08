import { withSchedulerContext, type Database } from '@familyos/db';
import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';

/**
 * Proves the queue is alive end to end: records when the worker last ran, which the API's
 * readiness check reports (docs/operations/deploy.md). Touches no household data.
 */
export function heartbeat(db: Kysely<Database>, now: () => Date = () => new Date()): Task {
  return async (_payload, helpers) => {
    const seenAt = now();
    await withSchedulerContext(db, null, (trx) =>
      trx
        .insertInto('app.service_heartbeat')
        .values({ service: 'worker', seen_at: seenAt })
        .onConflict((oc) => oc.column('service').doUpdateSet({ seen_at: seenAt }))
        .execute(),
    );
    helpers.logger.info('heartbeat');
  };
}
