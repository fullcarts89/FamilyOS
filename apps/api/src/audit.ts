import type { AuditEntityType, Database } from '@familyos/db';
import type { Transaction } from 'kysely';

/** Appends one audit row. Payloads carry IDs, statuses and field names, never free text. */
export async function recordAudit(
  trx: Transaction<Database>,
  event: {
    householdId: string;
    actorMemberId: string | null;
    entityType: AuditEntityType;
    entityId: string;
    action: string;
    payload?: Record<string, unknown>;
    requestId: string;
  },
): Promise<void> {
  await trx
    .insertInto('app.audit_event')
    .values({
      household_id: event.householdId,
      actor_member_id: event.actorMemberId,
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action,
      payload: event.payload ?? {},
      request_id: event.requestId,
    })
    .execute();
}
