import { materializeHousehold, type Database } from '@familyos/db';
import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';

/**
 * Hourly: creates routine occurrences that have come due, in every household (ADR-001 §5,
 * scheduler). Each household runs in its own transaction, so one failure can't block the rest.
 * Logs counts only, never titles.
 */
export function materializeRoutines(
  db: Kysely<Database>,
  options: { now?: () => Date; households?: () => Promise<{ id: string }[]> } = {},
): Task {
  const now = options.now ?? (() => new Date());
  const listHouseholds =
    options.households ?? (() => db.selectFrom('app.household').select('id').execute());
  return async (_payload, helpers) => {
    const households = await listHouseholds();
    let created = 0;
    let failed = 0;
    for (const { id } of households) {
      try {
        created += await db.transaction().execute((trx) =>
          materializeHousehold(trx, {
            householdId: id,
            now: now(),
            requestId: `scheduler:${helpers.job.id}`,
          }),
        );
      } catch (error) {
        failed++;
        helpers.logger.error('routine materialization failed', {
          householdId: id,
          errorName: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    helpers.logger.info('routines materialized', {
      households: households.length,
      created,
      failed,
    });
    // A failure makes the job retry; households that succeeded create nothing twice.
    if (failed > 0) throw new Error(`routine materialization failed for ${failed} households`);
  };
}
