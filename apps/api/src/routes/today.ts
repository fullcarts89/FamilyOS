import { buildToday } from '@familyos/domain';
import { Hono } from 'hono';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ITEM_COLUMNS } from './work-items';

const toIso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

/** Today and Inbox: read-only views over canonical work items, computed in the household's timezone. */
export function todayRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get('/today', async (c) => {
    authorize(c, 'work_item.read');
    const trx = c.get('trx');
    const member = c.get('member');
    const now = deps.now?.() ?? new Date();
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', member.householdId)
      .executeTakeFirstOrThrow();

    // Open items, plus anything finished in the last 8 days (the view keeps the last 7 local days).
    const since = new Date(now.getTime() - 8 * 24 * 3600 * 1000);
    const rows = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', member.householdId)
      .where('type', '!=', 'project')
      .where((eb) =>
        eb.or([
          eb('status', 'not in', ['new', 'cancelled', 'verified_complete', 'done_unverified']),
          eb.and([
            eb('status', 'in', ['verified_complete', 'done_unverified']),
            eb('updated_at', '>=', since),
          ]),
        ]),
      )
      .limit(1000)
      .execute();

    const items = rows.map((r) => ({
      ...r,
      dueAt: toIso(r.dueAt),
      updatedAt: toIso(r.updatedAt) ?? '',
      createdAt: toIso(r.createdAt) ?? '',
    }));
    const inbox = await trx
      .selectFrom('app.work_item')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('household_id', '=', member.householdId)
      .where('status', '=', 'new')
      .executeTakeFirstOrThrow();

    const view = buildToday({ items, memberId: member.id, now, timeZone: timezone });
    return c.json({ ...view, timezone, inboxCount: Number(inbox.n) });
  });

  app.get('/inbox', async (c) => {
    authorize(c, 'work_item.read');
    const items = await c
      .get('trx')
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', c.get('member').householdId)
      .where('status', '=', 'new')
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute();
    return c.json({ items });
  });

  return app;
}
