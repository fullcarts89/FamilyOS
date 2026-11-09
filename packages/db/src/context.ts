import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from './schema';

export interface RequestContext {
  /** Supabase Auth user ID from a verified token. */
  userId: string;
  /** Household the request is about; omitted for account-level requests such as listing households. */
  householdId?: string;
  /** The caller's member ID in that household, once resolved. */
  memberId?: string;
}

/**
 * Runs `fn` in a transaction as role `familyos_api` with the request context set, so every
 * query inside is filtered by row-level security (ADR-001 §3.4). Settings are transaction-local
 * and vanish at commit or rollback, so pooled connections never leak one request's context.
 */
export async function withRequestContext<T>(
  db: Kysely<Database>,
  context: RequestContext,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`set local role familyos_api`.execute(trx);
    await setContext(trx, context);
    return fn(trx);
  });
}

/** Updates the context inside an open transaction (for example after resolving the member). */
export async function setContext(
  trx: Transaction<Database>,
  context: RequestContext,
): Promise<void> {
  await sql`
    select
      set_config('app.user_id', ${context.userId}, true),
      set_config('app.household_id', ${context.householdId ?? ''}, true),
      set_config('app.member_id', ${context.memberId ?? ''}, true)
  `.execute(trx);
}
