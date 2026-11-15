import { Hono } from 'hono';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv } from '../http/env';

/**
 * Household export (JSON plus a file manifest). Row-level security applies, so the export holds
 * exactly what the requesting member can see: other members' private items are left out.
 */
export function exportRoutes() {
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => {
    authorize(c, 'household.export');
    const trx = c.get('trx');
    const member = c.get('member');
    const householdId = member.householdId;

    await recordAudit(trx, {
      householdId,
      actorMemberId: member.id,
      entityType: 'household',
      entityId: householdId,
      action: 'household.exported',
      requestId: c.get('requestId'),
    });

    const household = await trx
      .selectFrom('app.household')
      .select(['id', 'name', 'timezone', 'created_at as createdAt'])
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const members = await trx
      .selectFrom('app.member')
      .select([
        'id',
        'display_name as displayName',
        'role',
        'status',
        'color',
        'species',
        'note',
        'created_at as createdAt',
        'removed_at as removedAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const invites = await trx
      .selectFrom('app.invite')
      .select([
        'id',
        'email',
        'role',
        'expires_at as expiresAt',
        'accepted_at as acceptedAt',
        'revoked_at as revokedAt',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const sources = await trx
      .selectFrom('app.source')
      .select(['id', 'kind', 'storage_ref as storageRef', 'created_at as createdAt'])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const workItems = await trx
      .selectFrom('app.work_item')
      .select([
        'id',
        'type',
        'title',
        'description',
        'status',
        'owner_member_id as ownerMemberId',
        'parent_id as parentId',
        'due_on as dueOn',
        'due_at as dueAt',
        'priority',
        'visibility',
        'created_by_member_id as createdByMemberId',
        'recurrence_rule_id as recurrenceRuleId',
        'occurrence_index as occurrenceIndex',
        'occurrence_on as occurrenceOn',
        'completed_at as completedAt',
        'completed_by_member_id as completedByMemberId',
        'subject_member_id as subjectMemberId',
        'version',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const recurrenceRules = await trx
      .selectFrom('app.recurrence_rule')
      .select([
        'id',
        'routine_id as routineId',
        'rule',
        'timezone',
        'start_on as startOn',
        'local_time as localTime',
        'rotation',
        'paused_at as pausedAt',
        'generate_from as generateFrom',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const occurrenceExceptions = await trx
      .selectFrom('app.occurrence_exception')
      .select([
        'id',
        'recurrence_rule_id as recurrenceRuleId',
        'occurrence_index as occurrenceIndex',
        'kind',
        'reason',
        'owner_member_id as ownerMemberId',
        'created_by_member_id as createdByMemberId',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const comments = await trx
      .selectFrom('app.comment')
      .select([
        'id',
        'work_item_id as workItemId',
        'author_member_id as authorMemberId',
        'body',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const events = await trx
      .selectFrom('app.event')
      .select([
        'id',
        'title',
        'kind',
        'starts_at as startsAt',
        'ends_at as endsAt',
        'all_day as allDay',
        'location',
        'notes',
        'recurrence',
        'recurs_until as recursUntil',
        'timezone',
        'care_member_id as careMemberId',
        'care_action as careAction',
        'care_place as carePlace',
        'source_calendar_id as sourceCalendarId',
        'created_by_member_id as createdByMemberId',
        'version',
        'created_at as createdAt',
        'updated_at as updatedAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    // Calendar subscriptions without their addresses: those stay encrypted and are never exported.
    const calendars = await trx
      .selectFrom('app.calendar_source')
      .select([
        'id',
        'label',
        'member_id as memberId',
        'url_hint as urlHint',
        'color',
        'status',
        'last_synced_at as lastSyncedAt',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const eventMembers = await trx
      .selectFrom('app.event_member')
      .select(['event_id as eventId', 'member_id as memberId'])
      .where('household_id', '=', householdId)
      .execute();
    const eventExceptions = await trx
      .selectFrom('app.event_exception')
      .select([
        'id',
        'event_id as eventId',
        'occurrence_date as occurrenceDate',
        'kind',
        'cover_member_id as coverMemberId',
        'created_by_member_id as createdByMemberId',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('created_at')
      .execute();
    const auditEvents = await trx
      .selectFrom('app.audit_event')
      .select([
        'id',
        'actor_member_id as actorMemberId',
        'entity_type as entityType',
        'entity_id as entityId',
        'action',
        'payload',
        'created_at as createdAt',
      ])
      .where('household_id', '=', householdId)
      .orderBy('id')
      .execute();

    const body = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      scope: 'visible_to_member',
      household,
      members,
      invites,
      sources,
      workItems,
      recurrenceRules,
      occurrenceExceptions,
      comments,
      calendars,
      events,
      eventMembers,
      eventExceptions,
      auditEvents: auditEvents.map((e) => ({ ...e, id: String(e.id) })),
      files: sources.flatMap((s) =>
        s.storageRef ? [{ sourceId: s.id, storageRef: s.storageRef }] : [],
      ),
    };

    c.header('content-disposition', `attachment; filename="familyos-export-${householdId}.json"`);
    c.header('cache-control', 'no-store');
    return c.json(body);
  });

  return app;
}
