import { addDays, buildRhythm, expandEvents, localDateOf, startOfLocalDay } from '@familyos/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { authorize } from '../http/authorize';
import type { AppEnv, Deps } from '../http/env';
import { ApiError } from '../http/errors';
import { caredForIn, loadSeries, memberRoles, occurrenceView } from './events';
import { ITEM_COLUMNS } from './work-items';

const LocalDate = z.iso.date();
const CLOSED = ['new', 'cancelled', 'verified_complete', 'done_unverified'] as const;

const toIso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

/**
 * The family's rhythm for one local day: lanes, where children and pets are, handoffs, tasks and
 * heads-ups (packages/domain/src/rhythm.ts). Read-only; computed in the household's timezone.
 */
export function rhythmRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get('/rhythm', async (c) => {
    authorize(c, 'event.read');
    authorize(c, 'work_item.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const now = deps.now?.() ?? new Date();
    const { timezone } = await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const today = localDateOf(now, timezone);
    const requested = c.req.query('date');
    const parsed = LocalDate.safeParse(requested ?? today);
    if (!parsed.success) throw new ApiError(422, 'invalid_date');
    const date = parsed.data;

    const members = await trx
      .selectFrom('app.member')
      .select(['id', 'display_name as displayName', 'role', 'color', 'species', 'note'])
      .where('household_id', '=', householdId)
      .where('status', '=', 'active')
      .orderBy('created_at')
      .execute();

    const series = await loadSeries(trx, householdId, { from: date, to: date, timeZone: timezone });
    const byId = new Map(series.map((s) => [s.id, s]));
    const roles = await memberRoles(trx, householdId);
    const occurrences = expandEvents(
      series,
      { from: date, to: date, timeZone: timezone },
      caredForIn(roles),
    ).flatMap((o) => {
      const s = byId.get(o.eventId);
      return s ? [occurrenceView(o, s)] : [];
    });

    // Tasks due that day, and routine occurrences still open from before today.
    const dayStart = new Date(startOfLocalDay(date, timezone).epochMilliseconds);
    const dayEnd = new Date(startOfLocalDay(addDays(date, 1), timezone).epochMilliseconds);
    const todayStart = new Date(startOfLocalDay(today, timezone).epochMilliseconds);
    const rows = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', householdId)
      .where('type', 'in', ['task', 'issue'])
      .where('status', 'not in', ['new', 'cancelled'])
      .where((eb) =>
        eb.or([
          eb('due_on', '=', date),
          eb.and([eb('due_at', '>=', dayStart), eb('due_at', '<', dayEnd)]),
          eb.and([
            eb('recurrence_rule_id', 'is not', null),
            eb('status', 'not in', CLOSED),
            eb.or([eb('due_on', '<', today), eb('due_at', '<', todayStart)]),
          ]),
        ]),
      )
      .limit(1000)
      .execute();
    const tasks = rows.map((r) => ({
      ...r,
      dueAt: toIso(r.dueAt),
      completedAt: toIso(r.completedAt),
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }));

    const view = buildRhythm({
      date,
      today,
      timeZone: timezone,
      members,
      occurrences,
      tasks,
      // Decisions arrive with the Weekly Reset milestone; the heads-up rule is ready for them.
      decisions: [],
    });
    return c.json({ ...view, today, members });
  });

  return app;
}
