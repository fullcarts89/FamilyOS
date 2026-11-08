import { sql, type Kysely } from 'kysely';
import type { Database } from './schema';

/**
 * When the worker last recorded a heartbeat, or null if it never has. Runs as `familyos_api`, the
 * same role requests use, so a readiness check proves that path works as well as the connection.
 */
export async function workerLastSeen(db: Kysely<Database>): Promise<Date | null> {
  return db.transaction().execute(async (trx) => {
    await sql`set local role familyos_api`.execute(trx);
    const { rows } = await sql<{
      seen: Date | null;
    }>`select app.worker_last_seen() as seen`.execute(trx);
    return rows[0]?.seen ?? null;
  });
}
