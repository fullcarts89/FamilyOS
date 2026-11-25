import {
  addDays,
  buildLookBack,
  buildWeekRhythm,
  defaultResetWeek,
  dueThrough,
  routeOn,
  isAssignableRole,
  isCalendarRule,
  isWeekStart,
  localDateOf,
  startOfLocalDay,
  unresolvedForWeek,
  upcomingOccurrences,
  type WorkItemStatus,
} from '@familyos/domain';
import { loadAwayPeriods, loadExceptions, type Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict } from '../http/errors';
import { parseBody } from '../http/validation';
import { loadDecisions } from './decisions';
import { loadSeries, memberRoles, occurrenceView, routedOccurrences } from './events';
import { groceryList, mealsBetween } from './meals';
import { presenceFor } from './presence';
import { ITEM_COLUMNS, decorateItems } from './work-items';

const LocalDate = z.iso.date();
const Commit = z
  .object({
    week: LocalDate,
    notes: z.string().trim().min(1).max(2000).nullish(),
    /** Optional: the notes version the client last saw; checked only if the notes change. */
    expectedNotesVersion: z.number().int().min(0).optional(),
  })
  .strict();
/** Notes saved as they're typed. Empty text clears them. */
const SaveNotes = z
  .object({
    week: LocalDate,
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    /** The plan's notesVersion the edit started from: 0 before any notes were saved. */
    expectedVersion: z.number().int().min(0),
  })
  .strict();

const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const NOT_OPEN: readonly WorkItemStatus[] = [...DONE, 'cancelled', 'new'];
/** How many upcoming turns to look at per routine (a daily one has seven in a week). */
const TURNS_SCAN = 21;

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();
const instantOf = (date: string, timeZone: string) =>
  new Date(startOfLocalDay(date, timeZone).epochMilliseconds);

const PLAN_COLUMNS = [
  'id',
  'week_start as weekStart',
  'notes',
  'notes_version as notesVersion',
  'committed_at as committedAt',
  'committed_by_member_id as committedByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

async function planView(trx: Transaction<Database>, householdId: string, week: string) {
  const plan = await trx
    .selectFrom('app.weekly_plan')
    .select(PLAN_COLUMNS)
    .where('household_id', '=', householdId)
    .where('week_start', '=', week)
    .executeTakeFirst();
  return plan
    ? {
        ...plan,
        committedAt: iso(plan.committedAt),
        createdAt: iso(plan.createdAt),
        updatedAt: iso(plan.updatedAt),
      }
    : null;
}

function weekParam(value: string | undefined, today: string): string {
  if (value === undefined) return defaultResetWeek(today);
  const parsed = LocalDate.safeParse(value);
  if (!parsed.success || !isWeekStart(parsed.data)) throw new ApiError(422, 'invalid_week');
  return parsed.data;
}

/**
 * Everything one Weekly Reset session needs, in one read: the week that's ending looked back on
 * (what mattered, by who did it, as items), loose ends, the coming week's events with handoffs
 * that need an owner and conflicts (Today's rules over seven days), open decisions, meals and
 * groceries, routines' turns, and what is still unresolved, so the plan never claims everything
 * is handled while something important is open.
 */
async function assembleReset(
  trx: Transaction<Database>,
  member: CurrentMember,
  week: string,
  today: string,
) {
  const { householdId } = member;
  const { timezone } = await trx
    .selectFrom('app.household')
    .select('timezone')
    .where('id', '=', householdId)
    .executeTakeFirstOrThrow();
  const weekEnd = addDays(week, 6);
  const lookFrom = addDays(week, -7);
  const lookTo = addDays(week, -1);
  const weekStartAt = instantOf(week, timezone);
  const weekEndAt = instantOf(addDays(week, 7), timezone);
  const lookFromAt = instantOf(lookFrom, timezone);

  const members = await trx
    .selectFrom('app.member')
    .select(['id', 'display_name as displayName', 'role', 'color', 'species', 'note'])
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .orderBy('created_at')
    .execute();
  const roles = await memberRoles(trx, householdId);

  const plan = await planView(trx, householdId, week);

  // ------------------------------------------------------------------------------------------
  // Looking back at the week that's ending
  // ------------------------------------------------------------------------------------------
  const finished = await trx
    .selectFrom('app.work_item')
    .select([
      'id',
      'title',
      'type',
      'status',
      'priority',
      'parent_id',
      'subject_member_id',
      'recurrence_rule_id',
      'completed_at',
      'completed_by_member_id',
    ])
    .where('household_id', '=', householdId)
    .where('type', '!=', 'routine')
    .where('status', 'in', DONE)
    .where('completed_at', '>=', lookFromAt)
    .where('completed_at', '<', weekStartAt)
    .limit(2000)
    .execute();
  const ruleIds = [
    ...new Set(finished.flatMap((f) => (f.recurrence_rule_id ? [f.recurrence_rule_id] : []))),
  ];
  const routinesDone = ruleIds.length
    ? await trx
        .selectFrom('app.recurrence_rule as r')
        .innerJoin('app.work_item as w', (join) =>
          join.onRef('w.id', '=', 'r.routine_id').onRef('w.household_id', '=', 'r.household_id'),
        )
        .select(['r.id as ruleId', 'w.id as routineId', 'w.title', 'w.subject_member_id'])
        .where('r.household_id', '=', householdId)
        .where('r.id', 'in', ruleIds)
        .execute()
    : [];
  const projectIds = [
    ...new Set(
      finished.flatMap((f) => (f.type === 'project' ? [f.id] : f.parent_id ? [f.parent_id] : [])),
    ),
  ];
  const projects = projectIds.length
    ? await trx
        .selectFrom('app.work_item')
        .select(['id', 'title', 'status', 'completed_at'])
        .where('household_id', '=', householdId)
        .where('id', 'in', projectIds)
        .execute()
    : [];
  const subtasks = projectIds.length
    ? await trx
        .selectFrom('app.work_item')
        .select(['parent_id', 'status'])
        .where('household_id', '=', householdId)
        .where('parent_id', 'in', projectIds)
        .where('status', '!=', 'cancelled')
        .execute()
    : [];
  const byWho = buildLookBack({
    from: lookFrom,
    to: lookTo,
    timeZone: timezone,
    memberIds: members.map((m) => m.id),
    items: finished.map((f) => ({
      id: f.id,
      title: f.title,
      type: f.type as 'task' | 'project' | 'issue',
      status: f.status,
      priority: f.priority,
      parentId: f.parent_id,
      subjectMemberId: f.subject_member_id,
      recurrenceRuleId: f.recurrence_rule_id,
      completedAt: iso(f.completed_at),
      completedByMemberId: f.completed_by_member_id,
    })),
    routines: routinesDone.map((r) => ({
      ruleId: r.ruleId,
      routineId: r.routineId,
      title: r.title,
      subjectMemberId: r.subject_member_id,
    })),
    parents: projects.map((p) => ({ id: p.id, title: p.title })),
  });

  const resolved = (await loadDecisions(trx, member, { status: 'decided' })).filter(
    (d) =>
      d.decidedAt !== null &&
      d.decidedAt >= lookFromAt.toISOString() &&
      d.decidedAt < weekStartAt.toISOString(),
  );

  // Coverage: every care event last week, and whether an adult was down for it.
  const pastSeries = await loadSeries(trx, householdId, {
    from: lookFrom,
    to: lookTo,
    timeZone: timezone,
  });
  const careBefore = (
    await routedOccurrences(
      trx,
      householdId,
      pastSeries,
      { from: lookFrom, to: lookTo, timeZone: timezone },
      roles,
    )
  ).filter((o) => o.careMemberId !== null && !o.skipped);
  // Someone with an account (owner, adult or caregiver): an allow-list, so a role this code
  // doesn't know never counts as having it covered.
  const isAdult = (id: string) => {
    const role = roles.get(id);
    return role !== undefined && isAssignableRole(role);
  };
  const careMembers = [...new Set(careBefore.map((o) => o.careMemberId ?? ''))];

  const lookBack = {
    from: lookFrom,
    to: lookTo,
    byMember: byWho,
    projects: projects
      .map((p) => {
        const mine = subtasks.filter((s) => s.parent_id === p.id);
        return {
          id: p.id,
          title: p.title,
          completed: DONE.includes(p.status),
          completedAt: iso(p.completed_at),
          // A project's own progress (its steps done of its steps), not anyone's tally.
          progress: {
            done: mine.filter((s) => DONE.includes(s.status)).length,
            total: mine.length,
          },
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title)),
    decisions: resolved.map((d) => ({
      id: d.id,
      question: d.question,
      decidedOptionId: d.decidedOptionId,
      decidedOption: d.options.find((o) => o.id === d.decidedOptionId)?.label ?? null,
      decidedVia: d.decidedVia,
      decidedAt: d.decidedAt,
    })),
    coverage: {
      byCareMember: careMembers.map((memberId) => {
        const theirs = careBefore.filter((o) => o.careMemberId === memberId);
        return {
          memberId,
          allCovered: theirs.every((o) => o.memberIds.some(isAdult)),
        };
      }),
      covers: careBefore
        .filter((o) => o.cover !== null)
        .map((o) => ({
          occurrenceKey: o.key,
          eventId: o.eventId,
          date: o.date,
          title: o.title,
          careMemberId: o.careMemberId,
          memberId: o.cover?.memberId ?? null,
        })),
    },
  };

  // ------------------------------------------------------------------------------------------
  // Loose ends and the week's own items
  // ------------------------------------------------------------------------------------------
  const open = await trx
    .selectFrom('app.work_item')
    .select(ITEM_COLUMNS)
    .where('household_id', '=', householdId)
    .where('type', '!=', 'routine')
    .where('status', 'not in', NOT_OPEN)
    .where((eb) => eb.or([eb('due_on', '<=', weekEnd), eb('due_at', '<', weekEndAt)]))
    .orderBy('due_on')
    .orderBy('due_at')
    .limit(500)
    .execute();
  const decorated = (await decorateItems(trx, householdId, open)).map((i) => ({
    ...i,
    dueAt: iso(i.dueAt),
    completedAt: iso(i.completedAt),
    createdAt: iso(i.createdAt),
    updatedAt: iso(i.updatedAt),
  }));
  const dueBeforeWeek = (i: { dueOn: string | null; dueAt: string | null }) =>
    i.dueOn !== null ? i.dueOn < week : i.dueAt !== null && i.dueAt < weekStartAt.toISOString();
  // Loose ends: due before the week starts and still open; one turn per routine (the current).
  const unfinished = decorated.filter(
    (i) => dueBeforeWeek(i) && (i.recurrenceRuleId === null || i.isCurrentTurn === true),
  );
  const dueThisWeek = decorated.filter((i) => !dueBeforeWeek(i) && i.recurrenceRuleId === null);

  // ------------------------------------------------------------------------------------------
  // The week ahead
  // ------------------------------------------------------------------------------------------
  const series = await loadSeries(trx, householdId, {
    from: week,
    to: weekEnd,
    timeZone: timezone,
  });
  const byId = new Map(series.map((s) => [s.id, s]));
  const occurrences = (
    await routedOccurrences(
      trx,
      householdId,
      series,
      { from: week, to: weekEnd, timeZone: timezone },
      roles,
    )
  ).flatMap((o) => {
    const s = byId.get(o.eventId);
    return s ? [occurrenceView(o, s)] : [];
  });
  // Who's away and visiting that week (and visitors arriving the week after), so the plan
  // accounts for them.
  const away = await loadAwayPeriods(trx, householdId, week);
  const presence = await presenceFor(trx, householdId, week, weekEnd);
  const weekRhythm = buildWeekRhythm({
    weekStart: week,
    timeZone: timezone,
    members,
    occurrences,
    away,
  });

  const openDecisions = await loadDecisions(trx, member, { status: 'open' });
  const meals = await mealsBetween(trx, householdId, week, weekEnd);
  const groceries = (await groceryList(trx, householdId)).filter((g) => g.checkedAt === null);

  // Routines' turns in the week, from the rule, joined with rows already created.
  const routineRows = await trx
    .selectFrom('app.work_item as w')
    .innerJoin('app.recurrence_rule as r', (join) =>
      join.onRef('r.routine_id', '=', 'w.id').onRef('r.household_id', '=', 'w.household_id'),
    )
    .select([
      'w.id',
      'w.title',
      'w.version',
      'w.owner_member_id',
      'w.subject_member_id',
      'w.visibility',
      'r.id as ruleId',
      'r.rule',
      'r.start_on',
      'r.rotation',
    ])
    .where('w.household_id', '=', householdId)
    .where('w.type', '=', 'routine')
    .where('w.status', '!=', 'cancelled')
    .where('r.paused_at', 'is', null)
    .orderBy('w.created_at')
    .execute();
  const routines = [];
  for (const r of routineRows) {
    const rows = await trx
      .selectFrom('app.work_item')
      .select(['id', 'occurrence_index', 'occurrence_on', 'owner_member_id', 'status', 'version'])
      .where('household_id', '=', householdId)
      .where('recurrence_rule_id', '=', r.ruleId)
      .where('occurrence_on', '>=', week)
      .where('occurrence_on', '<=', weekEnd)
      .execute();
    let turns;
    if (isCalendarRule(r.rule)) {
      const exceptions = await loadExceptions(trx, householdId, r.ruleId);
      turns = upcomingOccurrences(
        { rule: r.rule, startOn: r.start_on },
        { rotation: r.rotation, ownerMemberId: r.owner_member_id },
        exceptions,
        week,
        TURNS_SCAN,
      )
        .filter((p) => p.date <= weekEnd)
        .map((p) => {
          const row = rows.find((x) => x.occurrence_index === p.index);
          // A turn not created yet goes to the cover when its owner is away that day (the
          // scheduler does the same when it creates it); a private routine's never moves.
          const route =
            !row && p.ownerMemberId !== null && r.visibility === 'household'
              ? routeOn(away, p.ownerMemberId, p.date)
              : null;
          const routed = route?.kind === 'covered' ? route.coverMemberId : null;
          return {
            index: p.index,
            date: p.date,
            ownerMemberId: row ? row.owner_member_id : (routed ?? p.ownerMemberId),
            coveringFor: routed ? p.ownerMemberId : null,
            skipped: p.skipped,
            itemId: row?.id ?? null,
            status: row?.status ?? null,
            version: row?.version ?? null,
          };
        });
    } else {
      turns = rows.map((row) => ({
        index: row.occurrence_index ?? 0,
        date: row.occurrence_on ?? '',
        ownerMemberId: row.owner_member_id,
        coveringFor: null,
        skipped: false,
        itemId: row.id,
        status: row.status,
        version: row.version,
      }));
    }
    if (turns.length === 0) continue;
    routines.push({
      id: r.id,
      title: r.title,
      version: r.version,
      subjectMemberId: r.subject_member_id,
      rotation: r.rotation,
      turns,
    });
  }

  const unresolved = unresolvedForWeek({
    week: weekRhythm,
    openDecisions: openDecisions.map((d) => ({ id: d.id, dueOn: d.dueOn })),
    // Only what is actually late counts as unresolved; something due today isn't yet (nor a
    // time block still under way past midnight).
    overdue: unfinished.filter((i) => {
      const through = dueThrough(i, timezone)?.toString();
      return through !== undefined && through < today;
    }),
    timeZone: timezone,
  });

  return {
    week: { start: week, end: weekEnd, timezone },
    plan,
    members,
    lookBack,
    unfinished,
    dueThisWeek,
    events: weekRhythm,
    presence,
    decisions: openDecisions,
    meals,
    groceries,
    routines,
    unresolved,
    /** True only when nothing important is open. */
    allClear: unresolved.length === 0,
  };
}

export function resetRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const today = async (trx: Transaction<Database>, householdId: string) =>
    localDateOf(
      now(),
      (
        await trx
          .selectFrom('app.household')
          .select('timezone')
          .where('id', '=', householdId)
          .executeTakeFirstOrThrow()
      ).timezone,
    );

  app.get('/', async (c) => {
    authorize(c, 'reset.run');
    const trx = c.get('trx');
    const member = c.get('member');
    const local = await today(trx, member.householdId);
    const week = weekParam(c.req.query('week'), local);
    return c.json({ today: local, ...(await assembleReset(trx, member, week, local)) });
  });

  // Save the week's notes (autosave while typing), without committing the plan. The client
  // names the notesVersion its edit started from; if the other adult saved different notes
  // since, nothing is written and the answer is 409 with the plan as it now is, so the client
  // can show both. Saving the notes the plan already has is a no-op 200, so a retry is safe.
  app.patch('/notes', async (c) => {
    authorize(c, 'reset.run');
    const body = await parseBody(c.req.raw, SaveNotes);
    if (!isWeekStart(body.week)) throw new ApiError(422, 'invalid_week');
    const trx = c.get('trx');
    const member = c.get('member');
    const lockPlan = () =>
      trx
        .selectFrom('app.weekly_plan')
        .select(['id', 'notes', 'notes_version', 'version'])
        .where('household_id', '=', member.householdId)
        .where('week_start', '=', body.week)
        .forUpdate()
        .executeTakeFirst();
    const audited = (id: string, notesVersion: number) =>
      recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'weekly_plan',
        entityId: id,
        action: 'weekly_plan.updated',
        payload: { week: body.week, fields: ['notes'], notesVersion },
        requestId: c.get('requestId'),
      });
    const stale = async () =>
      c.json(
        { error: 'version_conflict', plan: await planView(trx, member.householdId, body.week) },
        409,
      );

    let existing = await lockPlan();
    if (!existing) {
      if (body.notes === null) {
        return c.json({ plan: null });
      }
      if (body.expectedVersion !== 0) return stale();
      const row = await trx
        .insertInto('app.weekly_plan')
        .values({
          household_id: member.householdId,
          week_start: body.week,
          notes: body.notes,
          notes_version: 1,
        })
        .onConflict((oc) => oc.columns(['household_id', 'week_start']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (row) {
        await audited(row.id, 1);
        return c.json({ plan: await planView(trx, member.householdId, body.week) });
      }
      // The other adult's first save landed first.
      existing = await lockPlan();
      if (!existing) throw conflict();
    }
    if (body.notes === existing.notes) {
      return c.json({ plan: await planView(trx, member.householdId, body.week) });
    }
    if (body.expectedVersion !== existing.notes_version) return stale();
    await trx
      .updateTable('app.weekly_plan')
      .set({
        notes: body.notes,
        notes_version: existing.notes_version + 1,
        version: existing.version + 1,
        updated_at: now(),
      })
      .where('id', '=', existing.id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audited(existing.id, existing.notes_version + 1);
    return c.json({ plan: await planView(trx, member.householdId, body.week) });
  });

  // Commit the week's plan. Idempotent: committing again keeps the first commit's time and
  // author, and only saves notes that changed.
  app.post('/commit', async (c) => {
    authorize(c, 'reset.run');
    const body = await parseBody(c.req.raw, Commit);
    if (!isWeekStart(body.week)) throw new ApiError(422, 'invalid_week');
    const trx = c.get('trx');
    const member = c.get('member');
    const lockPlan = () =>
      trx
        .selectFrom('app.weekly_plan')
        .select(['id', 'notes', 'notes_version', 'committed_at', 'version'])
        .where('household_id', '=', member.householdId)
        .where('week_start', '=', body.week)
        .forUpdate()
        .executeTakeFirst();
    const audit = (id: string, action: string, payload: Record<string, unknown>) =>
      recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'weekly_plan',
        entityId: id,
        action,
        payload,
        requestId: c.get('requestId'),
      });
    let existing = await lockPlan();
    if (!existing) {
      // Both adults can commit at the same moment: the second insert waits for the first and
      // then does nothing, and that request carries on with the row the first one made.
      const row = await trx
        .insertInto('app.weekly_plan')
        .values({
          household_id: member.householdId,
          week_start: body.week,
          notes: body.notes ?? null,
          notes_version: body.notes ? 1 : 0,
          committed_at: now(),
          committed_by_member_id: member.id,
        })
        .onConflict((oc) => oc.columns(['household_id', 'week_start']).doNothing())
        .returning(['id', 'version'])
        .executeTakeFirst();
      if (row) {
        await audit(row.id, 'weekly_plan.committed', { week: body.week, version: row.version });
      } else {
        existing = await lockPlan();
        if (!existing) throw conflict();
      }
    }
    const notesChanged =
      existing !== undefined && body.notes !== undefined && body.notes !== existing.notes;
    if (
      existing &&
      notesChanged &&
      body.expectedNotesVersion !== undefined &&
      body.expectedNotesVersion !== existing.notes_version
    ) {
      return c.json(
        { error: 'version_conflict', plan: await planView(trx, member.householdId, body.week) },
        409,
      );
    }
    if (existing && (existing.committed_at === null || notesChanged)) {
      const committing = existing.committed_at === null;
      await trx
        .updateTable('app.weekly_plan')
        .set({
          ...(notesChanged && {
            notes: body.notes ?? null,
            notes_version: existing.notes_version + 1,
          }),
          ...(committing && { committed_at: now(), committed_by_member_id: member.id }),
          version: existing.version + 1,
          updated_at: now(),
        })
        .where('id', '=', existing.id)
        .where('household_id', '=', member.householdId)
        .execute();
      await audit(existing.id, committing ? 'weekly_plan.committed' : 'weekly_plan.updated', {
        week: body.week,
        ...(notesChanged && { fields: ['notes'] }),
        version: existing.version + 1,
      });
    }
    const reset = await assembleReset(trx, member, body.week, await today(trx, member.householdId));
    return c.json({
      plan: reset.plan,
      summary: {
        week: reset.week,
        decisions: reset.decisions,
        needsOwner: reset.events.needsOwner,
        conflicts: reset.events.conflicts,
        meals: reset.meals,
        groceries: reset.groceries,
        unfinished: reset.unfinished,
        dueThisWeek: reset.dueThisWeek,
        routines: reset.routines,
        unresolved: reset.unresolved,
        allClear: reset.allClear,
      },
    });
  });

  return app;
}
