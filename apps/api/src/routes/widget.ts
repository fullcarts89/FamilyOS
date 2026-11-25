import {
  WIDGET_HANDOFF_LIMIT,
  addDays,
  buildRhythm,
  can,
  localDateOf,
  startOfLocalDay,
  widgetItems,
  workItemMachine,
  type RhythmTask,
} from '@familyos/domain';
import { Hono } from 'hono';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { loadSeries, memberRoles, routedOccurrences } from './events';
import { ITEM_COLUMNS, decorateItems } from './work-items';

const OPEN_EXCLUDED = ['new', 'cancelled', 'verified_complete', 'done_unverified'] as const;
const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

/**
 * GET /households/:id/widget — what the iPhone widget shows (docs/operations/iphone.md), for the
 * caller only: their open items due today or late (one turn per routine), today's handoffs still
 * to come, and the members' names and colors. Read under the caller's row-level security, so
 * private items appear only to whoever may see them and caregivers never see imported events.
 * `canComplete` is false whenever the caller couldn't complete it (caregivers can't change
 * tasks). Completing stays the existing PATCH. Never cached.
 */
export function widgetRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get('/widget', async (c) => {
    authorize(c, 'work_item.read');
    authorize(c, 'event.read');
    const trx = c.get('trx');
    const me = c.get('member');
    const now = deps.now?.() ?? new Date();
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', me.householdId)
      .executeTakeFirstOrThrow();
    const today = localDateOf(now, timezone);
    const tomorrowStart = new Date(startOfLocalDay(addDays(today, 1), timezone).epochMilliseconds);

    const rows = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', me.householdId)
      .where('owner_member_id', '=', me.id)
      .where('type', 'in', ['task', 'issue'])
      .where('status', 'not in', OPEN_EXCLUDED)
      .where((eb) => eb.or([eb('due_on', '<=', today), eb('due_at', '<', tomorrowStart)]))
      .limit(500)
      .execute();
    const tasks = (await decorateItems(trx, me.householdId, rows)).map((r) => ({
      ...r,
      dueAt: iso(r.dueAt),
    }));
    const { count, items } = widgetItems(tasks, { memberId: me.id, today, timeZone: timezone });
    const mayComplete = can(me.role, 'work_item.update');

    const members = await trx
      .selectFrom('app.member')
      .select(['id', 'display_name as displayName', 'role', 'color'])
      .where('household_id', '=', me.householdId)
      .where('status', '=', 'active')
      .orderBy('created_at')
      .execute();
    const series = await loadSeries(trx, me.householdId, {
      from: today,
      to: today,
      timeZone: timezone,
    });
    const roles = await memberRoles(trx, me.householdId);
    const occurrences = await routedOccurrences(
      trx,
      me.householdId,
      series,
      { from: today, to: today, timeZone: timezone },
      roles,
    );
    const rhythm = buildRhythm<RhythmTask>({
      date: today,
      today,
      now: now.toISOString(),
      timeZone: timezone,
      members,
      occurrences,
      tasks: [],
    });

    c.header('cache-control', 'no-store');
    return c.json({
      householdId: me.householdId,
      memberId: me.id,
      date: today,
      timezone,
      generatedAt: now.toISOString(),
      dueTodayCount: count,
      items: items.map((t) => ({
        id: t.id,
        title: t.title,
        version: t.version,
        dueAt: t.dueAt,
        dueOn: t.dueOn,
        ownerMemberId: t.ownerMemberId,
        canComplete: mayComplete && workItemMachine.canTransition(t.status, 'verified_complete'),
      })),
      handoffs: rhythm.handoffs
        .filter((h) => new Date(h.time).getTime() >= now.getTime())
        .slice(0, WIDGET_HANDOFF_LIMIT)
        .map((h) => ({
          time: h.time,
          action: h.action,
          careMemberId: h.careMemberId,
          byMemberIds: h.byMemberIds,
          place: h.place,
        })),
      members: members.map((m) => ({
        id: m.id,
        name: m.displayName.trim() || 'Someone',
        color: m.color,
      })),
    });
  });

  return app;
}
