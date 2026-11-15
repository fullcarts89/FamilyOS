import type { WorkItemStatus } from '@familyos/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError } from '../http/errors';

const MAX_DAYS = 7;
const MAX_ITEMS = 100;
const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];

/** Audit actions that can become an activity line. */
const SOURCE_ACTIONS = [
  'work_item.updated',
  'work_item.accepted',
  'routine.turns_swapped',
  'event.occurrence_covered',
  'member.child_added',
  'member.pet_added',
  'member.joined',
] as const;

export type ActivityAction =
  | 'task.completed'
  | 'task.assigned'
  | 'task.taken'
  | 'routine.done'
  | 'routine.swapped'
  | 'project.completed'
  | 'event.covered'
  | 'member.added';

const Since = z.iso.datetime({ offset: true });

const str = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * What the household did recently (GET /activity?since=ISO): completions, assignments, turns
 * swapped, covers and new members, newest first, from the audit trail. Titles come from the
 * items as they are now, read under the caller's row-level security, so a private item's
 * activity never shows to anyone who can't see the item. Nothing is taken from audit payloads
 * except IDs and statuses. The caller's own actions are left out unless `includeMine=true`.
 */
export function activityRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get('/activity', async (c) => {
    authorize(c, 'work_item.read');
    const trx = c.get('trx');
    const me = c.get('member');
    const now = deps.now?.() ?? new Date();
    const floor = new Date(now.getTime() - MAX_DAYS * 24 * 3600 * 1000);
    const sinceParam = c.req.query('since');
    let since = new Date(now.getTime() - 24 * 3600 * 1000);
    if (sinceParam !== undefined) {
      const parsed = Since.safeParse(sinceParam);
      if (!parsed.success) throw new ApiError(422, 'invalid_since');
      since = new Date(parsed.data);
    }
    // A second of slack for clocks; anything older than a week is refused, not truncated.
    if (since.getTime() < floor.getTime() - 1000) throw new ApiError(422, 'since_too_old');
    const includeMine = c.req.query('includeMine') === 'true';

    let query = trx
      .selectFrom('app.audit_event')
      .select([
        'id',
        'created_at',
        'actor_member_id',
        'action',
        'entity_type',
        'entity_id',
        'payload',
      ])
      .where('household_id', '=', me.householdId)
      .where('created_at', '>=', since)
      .where('action', 'in', SOURCE_ACTIONS);
    if (!includeMine) {
      query = query.where((eb) =>
        eb.or([eb('actor_member_id', 'is', null), eb('actor_member_id', '!=', me.id)]),
      );
    }
    const rows = await query
      .orderBy('id', 'desc')
      .limit(MAX_ITEMS * 4)
      .execute();

    const ids = (type: string) => [
      ...new Set(rows.filter((r) => r.entity_type === type).map((r) => r.entity_id)),
    ];
    const itemIds = ids('work_item');
    const eventIds = ids('event');
    const memberIds = ids('member');
    // Read under row-level security: private items the caller can't see are simply absent.
    const items = itemIds.length
      ? await trx
          .selectFrom('app.work_item')
          .select(['id', 'title', 'type', 'recurrence_rule_id'])
          .where('household_id', '=', me.householdId)
          .where('id', 'in', itemIds)
          .execute()
      : [];
    const events = eventIds.length
      ? await trx
          .selectFrom('app.event')
          .select(['id', 'title'])
          .where('household_id', '=', me.householdId)
          .where('id', 'in', eventIds)
          .execute()
      : [];
    const members = memberIds.length
      ? await trx
          .selectFrom('app.member')
          .select(['id', 'display_name'])
          .where('household_id', '=', me.householdId)
          .where('id', 'in', memberIds)
          .execute()
      : [];

    const activity = [];
    for (const row of rows) {
      if (activity.length >= MAX_ITEMS) break;
      const payload = row.payload;
      let action: ActivityAction | null = null;
      let title: string | null = null;
      let memberId: string | null = null;

      if (row.entity_type === 'work_item') {
        const item = items.find((i) => i.id === row.entity_id);
        if (!item) continue;
        title = item.title;
        const toStatus = str(payload.toStatus);
        const owner = str(payload.ownerMemberId);
        if (row.action === 'routine.turns_swapped') {
          action = 'routine.swapped';
        } else if (toStatus && DONE.includes(toStatus as WorkItemStatus)) {
          action =
            item.type === 'project'
              ? 'project.completed'
              : item.recurrence_rule_id
                ? 'routine.done'
                : 'task.completed';
        } else if (owner) {
          action = owner === row.actor_member_id ? 'task.taken' : 'task.assigned';
          memberId = owner;
        }
      } else if (row.entity_type === 'event' && row.action === 'event.occurrence_covered') {
        const event = events.find((e) => e.id === row.entity_id);
        if (!event) continue;
        action = 'event.covered';
        title = event.title;
        memberId = str(payload.coverMemberId);
      } else if (row.entity_type === 'member') {
        const member = members.find((m) => m.id === row.entity_id);
        if (!member) continue;
        action = 'member.added';
        title = member.display_name;
        memberId = member.id;
      }
      if (!action || title === null) continue;
      activity.push({
        id: String(row.id),
        at: new Date(row.created_at).toISOString(),
        actorMemberId: row.actor_member_id,
        action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        title,
        memberId,
      });
    }
    return c.json({ since: since.toISOString(), activity });
  });

  return app;
}
