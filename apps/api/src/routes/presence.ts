import {
  backOn,
  canCover,
  checkRange,
  defaultCover,
  givesBack,
  handoverSuggestions,
  isCaredFor,
  localDateOf,
  localDueDate,
  periodsOverlap,
  presenceBetween,
  startOfLocalDay,
  type AwayPeriod,
  type MemberRole,
  type Visitor,
  type WorkItemStatus,
} from '@familyos/domain';
import { loadAwayPeriods, placePayback, type Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';
import { ITEM_COLUMNS } from './work-items';

/**
 * Who's in town (docs/plan/whos-in-town.md): away periods, visitors, and handing an away
 * member's work to the adult covering for them. Owners and adults change them; caregivers read
 * them. Hand-overs are suggested and move only when an adult confirms (owner decision
 * 2026-11-24); routine turns created later go to the cover on their own (the scheduler), and
 * care handoffs are the cover's on read. Only household-visible items ever move. Every change is
 * audited with IDs and dates only, never names or notes.
 */

const Uuid = z.uuid();
const LocalDate = z.iso.date();
const Version = z.number().int().min(1);

const CreateAway = z
  .object({
    memberId: Uuid,
    startsOn: LocalDate,
    endsOn: LocalDate.nullable(),
    /** Omitted: the only other adult. Null: nobody covers. */
    coverMemberId: Uuid.nullable().optional(),
  })
  .strict();

const UpdateAway = z
  .object({
    expectedVersion: Version,
    startsOn: LocalDate.optional(),
    endsOn: LocalDate.nullable().optional(),
    coverMemberId: Uuid.nullable().optional(),
  })
  .strict();

const Handover = z
  .object({
    move: z
      .array(z.object({ id: Uuid, expectedVersion: Version }).strict())
      .max(200)
      .default([]),
    keep: z.array(Uuid).max(200).default([]),
  })
  .strict();

const text = (max: number) => z.string().trim().min(1).max(max);
const CreateVisitor = z
  .object({
    name: text(80),
    arrivesOn: LocalDate,
    leavesOn: LocalDate,
    notes: text(500).nullish(),
  })
  .strict();
const UpdateVisitor = z
  .object({
    expectedVersion: Version,
    name: text(80).optional(),
    arrivesOn: LocalDate.optional(),
    leavesOn: LocalDate.optional(),
    notes: text(500).nullable().optional(),
  })
  .strict();

const AWAY_COLUMNS = [
  'id',
  'member_id as memberId',
  'starts_on as startsOn',
  'ends_on as endsOn',
  'cover_member_id as coverMemberId',
  'created_by_member_id as createdByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const VISITOR_COLUMNS = [
  'id',
  'name',
  'arrives_on as arrivesOn',
  'leaves_on as leavesOn',
  'notes',
  'created_by_member_id as createdByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const CLOSED: readonly WorkItemStatus[] = [
  'new',
  'cancelled',
  'verified_complete',
  'done_unverified',
];

const iso = (v: Date | string) => new Date(v).toISOString();
const str = (v: Date | string) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10));

type AwayRow = {
  id: string;
  memberId: string;
  startsOn: string;
  endsOn: string | null;
  coverMemberId: string | null;
  createdByMemberId: string;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const awayView = (r: AwayRow) => ({
  ...r,
  startsOn: str(r.startsOn),
  endsOn: r.endsOn === null ? null : str(r.endsOn),
  backOn: backOn({ endsOn: r.endsOn === null ? null : str(r.endsOn) }),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
export type AwayPeriodView = ReturnType<typeof awayView>;

type VisitorRow = {
  id: string;
  name: string;
  arrivesOn: string;
  leavesOn: string;
  notes: string | null;
  createdByMemberId: string;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const visitorView = (r: VisitorRow) => ({
  ...r,
  arrivesOn: str(r.arrivesOn),
  leavesOn: str(r.leavesOn),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
export type VisitorView = ReturnType<typeof visitorView>;

const asPeriod = (v: AwayPeriodView): AwayPeriod => ({
  id: v.id,
  memberId: v.memberId,
  startsOn: v.startsOn,
  endsOn: v.endsOn,
  coverMemberId: v.coverMemberId,
});

const householdTimezone = async (trx: Transaction<Database>, householdId: string) =>
  (
    await trx
      .selectFrom('app.household')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow()
  ).timezone;

async function activeMembers(trx: Transaction<Database>, householdId: string) {
  return trx
    .selectFrom('app.member')
    .select(['id', 'role'])
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .execute();
}

/** Visitors still here on or after `from`, first arrival first. */
export async function loadVisitors(
  trx: Transaction<Database>,
  householdId: string,
  from: string,
): Promise<VisitorView[]> {
  const rows = await trx
    .selectFrom('app.visitor')
    .select(VISITOR_COLUMNS)
    .where('household_id', '=', householdId)
    .where('leaves_on', '>=', from)
    .orderBy('arrives_on')
    .orderBy('created_at')
    .limit(200)
    .execute();
  return rows.map(visitorView);
}

async function loadAwayViews(trx: Transaction<Database>, householdId: string, from: string) {
  const rows = await trx
    .selectFrom('app.away_period')
    .select(AWAY_COLUMNS)
    .where('household_id', '=', householdId)
    .where((eb) => eb.or([eb('ends_on', 'is', null), eb('ends_on', '>=', from)]))
    .orderBy('starts_on')
    .orderBy('created_at')
    .limit(200)
    .execute();
  return rows.map(awayView);
}

const asVisitor = (v: VisitorView): Visitor => ({
  id: v.id,
  name: v.name,
  arrivesOn: v.arrivesOn,
  leavesOn: v.leavesOn,
  notes: v.notes,
});

/** Who's away, here or arriving soon over `from`..`to`, for Today and the Weekly Reset. */
export async function presenceFor(
  trx: Transaction<Database>,
  householdId: string,
  from: string,
  to: string,
) {
  const away = await loadAwayViews(trx, householdId, from);
  const visitors = await loadVisitors(trx, householdId, from);
  const view = presenceBetween(from, to, away.map(asPeriod), visitors.map(asVisitor));
  const awayIds = new Set(view.away.map((p) => p.id));
  const leavingIds = new Set(view.leaving.map((p) => p.id));
  const visitorById = new Map(visitors.map((v) => [v.id, v]));
  return {
    away: away.filter((p) => awayIds.has(p.id)),
    leaving: away.filter((p) => leavingIds.has(p.id)),
    visiting: view.visiting.flatMap((v) => visitorById.get(v.id) ?? []),
    arriving: view.arriving.flatMap((v) => visitorById.get(v.id) ?? []),
  };
}

/** Open items with a due date from today on, owned by these members (as the caller sees them). */
async function dueItems(
  trx: Transaction<Database>,
  householdId: string,
  memberIds: readonly string[],
  today: string,
  timeZone: string,
) {
  if (memberIds.length === 0) return [];
  const todayStart = new Date(startOfLocalDay(today, timeZone).epochMilliseconds);
  const rows = await trx
    .selectFrom('app.work_item')
    .select(ITEM_COLUMNS)
    .where('household_id', '=', householdId)
    .where('type', 'in', ['task', 'issue'])
    .where('visibility', '=', 'household')
    .where('status', 'not in', CLOSED)
    .where('owner_member_id', 'in', [...memberIds])
    .where((eb) => eb.or([eb('due_on', '>=', today), eb('due_at', '>=', todayStart)]))
    .limit(1000)
    .execute();
  return rows.map((r) => ({
    ...r,
    dueAt: r.dueAt === null ? null : iso(r.dueAt),
    completedAt: r.completedAt === null ? null : iso(r.completedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}
type DueItem = Awaited<ReturnType<typeof dueItems>>[number];

/** Items each period already moved or kept: they aren't suggested again. */
async function decidedItems(trx: Transaction<Database>, householdId: string, periodIds: string[]) {
  if (periodIds.length === 0) return new Map<string, Set<string>>();
  const rows = await trx
    .selectFrom('app.away_handover')
    .select(['away_period_id', 'work_item_id'])
    .where('household_id', '=', householdId)
    .where('away_period_id', 'in', periodIds)
    .where('outcome', 'in', ['moved', 'kept'])
    .execute();
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.away_period_id) ?? new Set<string>();
    set.add(r.work_item_id);
    out.set(r.away_period_id, set);
  }
  return out;
}

/**
 * What each away period (that hasn't ended) suggests handing over, from today on. The Today
 * line and the screen show how many; the review sheet lists them.
 */
export async function pendingHandovers(
  trx: Transaction<Database>,
  householdId: string,
  today: string,
  timeZone: string,
  only?: AwayPeriod,
) {
  const periods = await loadAwayPeriods(trx, householdId, today);
  const targets = only ? periods.filter((p) => p.id === only.id) : periods;
  const routed = targets.filter((p) => p.coverMemberId !== null);
  const items = await dueItems(
    trx,
    householdId,
    [...new Set(routed.map((p) => p.memberId))],
    today,
    timeZone,
  );
  const decided = await decidedItems(
    trx,
    householdId,
    routed.map((p) => p.id),
  );
  return routed.map((period) => ({
    period,
    suggestions: handoverSuggestions<DueItem>({
      period,
      periods,
      items,
      decided: decided.get(period.id) ?? new Set(),
      today,
      timeZone,
    }),
  }));
}

/**
 * Gives back what an away period moved that is still open, still with the cover, and due from
 * today on, on a day `after` no longer covers (or with a different cover). Paybacks for the
 * turns given back are withdrawn. Returns how many items went back.
 */
async function giveBack(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  before: AwayPeriod,
  after: AwayPeriod | null,
  today: string,
  timeZone: string,
  clock: () => Date,
): Promise<number> {
  const rows = await trx
    .selectFrom('app.away_handover as h')
    .innerJoin('app.work_item as w', (join) =>
      join.onRef('w.id', '=', 'h.work_item_id').onRef('w.household_id', '=', 'h.household_id'),
    )
    .select([
      'h.id as handoverId',
      'h.from_member_id as fromMemberId',
      'h.to_member_id as toMemberId',
      'h.recurrence_rule_id as ruleId',
      'h.payback_index as paybackIndex',
      'w.id',
      'w.status',
      'w.version',
      'w.owner_member_id as ownerMemberId',
      'w.due_on as dueOn',
      'w.due_at as dueAt',
    ])
    .where('h.household_id', '=', member.householdId)
    .where('h.away_period_id', '=', before.id)
    .where('h.outcome', '=', 'moved')
    .forUpdate()
    .execute();
  let returned = 0;
  for (const r of rows) {
    const date = localDueDate(
      {
        dueOn: r.dueOn === null ? null : str(r.dueOn),
        dueAt: r.dueAt === null ? null : iso(r.dueAt),
      },
      timeZone,
    )?.toString();
    if (!date || !givesBack(date, before, after, today)) continue;
    const open = !CLOSED.includes(r.status);
    if (open && r.ownerMemberId === r.toMemberId) {
      await moveItem(trx, member, requestId, r, r.fromMemberId, clock, {
        awayPeriodId: before.id,
        returned: true,
      });
      returned++;
    }
    await trx
      .updateTable('app.away_handover')
      .set({ outcome: 'returned', updated_at: clock() })
      .where('id', '=', r.handoverId)
      .execute();
    if (r.ruleId !== null && r.paybackIndex !== null) {
      await withdrawPayback(trx, member, requestId, {
        ruleId: r.ruleId,
        index: r.paybackIndex,
        awayMemberId: r.fromMemberId,
        coverMemberId: r.toMemberId,
        clock,
      });
    }
  }
  return returned;
}

async function withdrawPayback(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  p: {
    ruleId: string;
    index: number;
    awayMemberId: string;
    coverMemberId: string;
    clock: () => Date;
  },
) {
  await trx
    .deleteFrom('app.occurrence_exception')
    .where('household_id', '=', member.householdId)
    .where('recurrence_rule_id', '=', p.ruleId)
    .where('occurrence_index', '=', p.index)
    .where('kind', '=', 'owner')
    .where('owner_member_id', '=', p.awayMemberId)
    .execute();
  const row = await trx
    .selectFrom('app.work_item')
    .select(['id', 'status', 'version', 'owner_member_id as ownerMemberId'])
    .where('household_id', '=', member.householdId)
    .where('recurrence_rule_id', '=', p.ruleId)
    .where('occurrence_index', '=', p.index)
    .forUpdate()
    .executeTakeFirst();
  if (row && !CLOSED.includes(row.status) && row.ownerMemberId === p.awayMemberId) {
    await moveItem(trx, member, requestId, row, p.coverMemberId, p.clock, { payback: 'withdrawn' });
  }
}

/** One owner change, versioned and audited like a reassignment, marked as an away hand-over. */
async function moveItem(
  trx: Transaction<Database>,
  member: CurrentMember,
  requestId: string,
  row: { id: string; version: number; ownerMemberId: string | null },
  to: string,
  clock: () => Date,
  extra: Record<string, unknown>,
) {
  const updated = await trx
    .updateTable('app.work_item')
    .set({ owner_member_id: to, version: row.version + 1, updated_at: clock() })
    .where('id', '=', row.id)
    .where('household_id', '=', member.householdId)
    .where('version', '=', row.version)
    .returning('version')
    .executeTakeFirst();
  if (!updated) throw conflict();
  await recordAudit(trx, {
    householdId: member.householdId,
    actorMemberId: member.id,
    entityType: 'work_item',
    entityId: row.id,
    // Not 'work_item.updated': a hand-over isn't someone taking it off your plate.
    action: 'work_item.handed_over',
    payload: {
      fields: ['owner_member_id'],
      ownerMemberId: to,
      fromOwnerMemberId: row.ownerMemberId,
      version: updated.version,
      ...extra,
    },
    requestId,
  });
}

export function presenceRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const today = async (trx: Transaction<Database>, householdId: string) => {
    const timeZone = await householdTimezone(trx, householdId);
    return { timeZone, today: localDateOf(now(), timeZone) };
  };

  const loadAway = async (trx: Transaction<Database>, member: CurrentMember, id: string) => {
    const row = await trx
      .selectFrom('app.away_period')
      .select(AWAY_COLUMNS)
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    return awayView(row);
  };

  const checkPeriod = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    period: Omit<AwayPeriod, 'id'> & { id: string | null },
  ) => {
    const problem = checkRange(period.startsOn, period.endsOn);
    if (problem) throw new ApiError(422, problem);
    const members = await activeMembers(trx, member.householdId);
    const away = members.find((m) => m.id === period.memberId);
    if (!away) throw new ApiError(422, 'invalid_member');
    if (period.coverMemberId !== null) {
      if (isCaredFor(away.role as MemberRole)) throw new ApiError(422, 'invalid_cover');
      const cover = members.find((m) => m.id === period.coverMemberId);
      if (!cover || !canCover(cover.role) || cover.id === period.memberId)
        throw new ApiError(422, 'invalid_cover');
    }
    const others = await trx
      .selectFrom('app.away_period')
      .select(['id', 'starts_on as startsOn', 'ends_on as endsOn'])
      .where('household_id', '=', member.householdId)
      .where('member_id', '=', period.memberId)
      .execute();
    const clash = others.some(
      (o) =>
        o.id !== period.id &&
        periodsOverlap(
          { startsOn: str(o.startsOn), endsOn: o.endsOn === null ? null : str(o.endsOn) },
          period,
        ),
    );
    if (clash) throw conflict('away_overlaps');
  };

  const suggestionsOf = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    period: AwayPeriod,
  ) => {
    const { timeZone, today: date } = await today(trx, member.householdId);
    const [pending] = await pendingHandovers(trx, member.householdId, date, timeZone, period);
    return (pending?.suggestions ?? []).map((s) => ({
      item: s.item,
      date: s.date,
      coverMemberId: s.coverMemberId,
    }));
  };

  // Who's in town from today on (or `from`), and what each away period suggests handing over.
  app.get('/presence', async (c) => {
    authorize(c, 'presence.read');
    const trx = c.get('trx');
    const { householdId } = c.get('member');
    const { timeZone, today: date } = await today(trx, householdId);
    const from = c.req.query('from');
    const parsed = LocalDate.safeParse(from ?? date);
    if (!parsed.success) throw new ApiError(422, 'invalid_date');
    const awayPeriods = await loadAwayViews(trx, householdId, parsed.data);
    const visitors = await loadVisitors(trx, householdId, parsed.data);
    const pending = await pendingHandovers(trx, householdId, date, timeZone);
    return c.json({
      today: date,
      awayPeriods,
      visitors,
      handovers: pending
        .filter((p) => p.suggestions.length > 0)
        .map((p) => ({ awayPeriodId: p.period.id, count: p.suggestions.length })),
    });
  });

  app.post('/away-periods', async (c) => {
    authorize(c, 'presence.manage');
    const body = await parseBody(c.req.raw, CreateAway);
    const trx = c.get('trx');
    const member = c.get('member');
    const members = await activeMembers(trx, member.householdId);
    const subject = members.find((m) => m.id === body.memberId);
    const coverMemberId =
      body.coverMemberId !== undefined
        ? body.coverMemberId
        : subject && !isCaredFor(subject.role as MemberRole)
          ? defaultCover(members, body.memberId)
          : null;
    const period = {
      id: null,
      memberId: body.memberId,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      coverMemberId,
    };
    await checkPeriod(trx, member, period);
    const row = await trx
      .insertInto('app.away_period')
      .values({
        household_id: member.householdId,
        member_id: body.memberId,
        starts_on: body.startsOn,
        ends_on: body.endsOn,
        cover_member_id: coverMemberId,
        created_by_member_id: member.id,
      })
      .returning(AWAY_COLUMNS)
      .executeTakeFirstOrThrow();
    const awayPeriod = awayView(row);
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'away_period',
      entityId: awayPeriod.id,
      action: 'away_period.created',
      payload: {
        memberId: awayPeriod.memberId,
        startsOn: awayPeriod.startsOn,
        endsOn: awayPeriod.endsOn,
        coverMemberId: awayPeriod.coverMemberId,
      },
      requestId: c.get('requestId'),
    });
    const suggestions = await suggestionsOf(trx, member, asPeriod(awayPeriod));
    return c.json({ awayPeriod, suggestions }, 201);
  });

  app.get('/away-periods/:awayId/handover', async (c) => {
    authorize(c, 'presence.read');
    const id = uuidParam(c.req.param('awayId'));
    const trx = c.get('trx');
    const member = c.get('member');
    const awayPeriod = await loadAway(trx, member, id);
    const suggestions = await suggestionsOf(trx, member, asPeriod(awayPeriod));
    const moved = await trx
      .selectFrom('app.away_handover as h')
      .innerJoin('app.work_item as w', (join) =>
        join.onRef('w.id', '=', 'h.work_item_id').onRef('w.household_id', '=', 'h.household_id'),
      )
      .select(['w.id', 'w.title', 'w.status', 'w.due_on as dueOn', 'w.due_at as dueAt'])
      .select(['h.to_member_id as toMemberId', 'h.payback_index as paybackIndex'])
      .where('h.household_id', '=', member.householdId)
      .where('h.away_period_id', '=', id)
      .where('h.outcome', '=', 'moved')
      .orderBy('w.due_on')
      .orderBy('w.due_at')
      .limit(500)
      .execute();
    return c.json({
      awayPeriod,
      suggestions,
      moved: moved.map((m) => ({
        ...m,
        dueOn: m.dueOn === null ? null : str(m.dueOn),
        dueAt: m.dueAt === null ? null : iso(m.dueAt),
      })),
    });
  });

  // Confirm the review: move these to the cover (with paybacks for routine turns), keep those.
  app.post('/away-periods/:awayId/handover', async (c) => {
    authorize(c, 'presence.manage');
    const id = uuidParam(c.req.param('awayId'));
    const body = await parseBody(c.req.raw, Handover);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const awayPeriod = await loadAway(trx, member, id);
    const period = asPeriod(awayPeriod);
    const suggestions = await suggestionsOf(trx, member, period);
    const byId = new Map(suggestions.map((s) => [s.item.id, s]));
    const all = await loadAwayPeriods(trx, member.householdId, awayPeriod.startsOn);
    const moveIds = new Set(body.move.map((m) => m.id));
    if (body.keep.some((k) => moveIds.has(k))) throw new ApiError(422, 'invalid_body');

    let moved = 0;
    let paybacks = 0;
    for (const m of body.move) {
      const s = byId.get(m.id);
      // No longer suggested (already moved, done, reassigned, or the dates changed).
      if (!s) throw conflict('handover_changed');
      if (s.item.version !== m.expectedVersion) throw conflict();
      await moveItem(trx, member, requestId, s.item, s.coverMemberId, now, {
        awayPeriodId: id,
      });
      let paybackIndex: number | null = null;
      if (s.item.recurrenceRuleId !== null && s.item.occurrenceIndex !== null) {
        paybackIndex = await placePayback(trx, {
          householdId: member.householdId,
          ruleId: s.item.recurrenceRuleId,
          takenIndex: s.item.occurrenceIndex,
          period,
          periods: all,
          actorMemberId: member.id,
          updateRow: async (row) => {
            await moveItem(trx, member, requestId, row, period.memberId, now, {
              awayPeriodId: id,
              paybackFor: s.item.id,
            });
            return true;
          },
        });
        if (paybackIndex !== null) paybacks++;
      }
      await trx
        .insertInto('app.away_handover')
        .values({
          household_id: member.householdId,
          away_period_id: id,
          work_item_id: s.item.id,
          from_member_id: period.memberId,
          to_member_id: s.coverMemberId,
          outcome: 'moved',
          recurrence_rule_id: s.item.recurrenceRuleId,
          payback_index: paybackIndex,
          created_by_member_id: member.id,
        })
        .onConflict((oc) =>
          oc.columns(['away_period_id', 'work_item_id']).doUpdateSet({
            outcome: 'moved',
            to_member_id: s.coverMemberId,
            payback_index: paybackIndex,
            created_by_member_id: member.id,
            updated_at: now(),
          }),
        )
        .execute();
      moved++;
    }
    let kept = 0;
    for (const itemId of body.keep) {
      const s = byId.get(itemId);
      if (!s) continue;
      await trx
        .insertInto('app.away_handover')
        .values({
          household_id: member.householdId,
          away_period_id: id,
          work_item_id: itemId,
          from_member_id: period.memberId,
          to_member_id: s.coverMemberId,
          outcome: 'kept',
          created_by_member_id: member.id,
        })
        .onConflict((oc) =>
          oc.columns(['away_period_id', 'work_item_id']).doUpdateSet({
            outcome: 'kept',
            payback_index: null,
            created_by_member_id: member.id,
            updated_at: now(),
          }),
        )
        .execute();
      kept++;
    }
    if (moved + kept > 0) {
      await recordAudit(trx, {
        householdId: member.householdId,
        actorMemberId: member.id,
        entityType: 'away_period',
        entityId: id,
        action: 'away_period.handed_over',
        payload: { moved, kept, paybacks },
        requestId,
      });
    }
    return c.json({
      moved,
      kept,
      paybacks,
      suggestions: await suggestionsOf(trx, member, period),
    });
  });

  app.patch('/away-periods/:awayId', async (c) => {
    authorize(c, 'presence.manage');
    const id = uuidParam(c.req.param('awayId'));
    const body = await parseBody(c.req.raw, UpdateAway);
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const current = await loadAway(trx, member, id);
    if (current.version !== body.expectedVersion) throw conflict();
    const next: AwayPeriod = {
      id,
      memberId: current.memberId,
      startsOn: body.startsOn ?? current.startsOn,
      endsOn: body.endsOn !== undefined ? body.endsOn : current.endsOn,
      coverMemberId: body.coverMemberId !== undefined ? body.coverMemberId : current.coverMemberId,
    };
    const fields = (['startsOn', 'endsOn', 'coverMemberId'] as const).filter(
      (f) => next[f] !== current[f],
    );
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    await checkPeriod(trx, member, next);
    const { timeZone, today: date } = await today(trx, member.householdId);
    const returned = await giveBack(
      trx,
      member,
      requestId,
      asPeriod(current),
      next,
      date,
      timeZone,
      now,
    );
    const row = await trx
      .updateTable('app.away_period')
      .set({
        starts_on: next.startsOn,
        ends_on: next.endsOn,
        cover_member_id: next.coverMemberId,
        version: current.version + 1,
        updated_at: now(),
      })
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .where('version', '=', body.expectedVersion)
      .returning(AWAY_COLUMNS)
      .executeTakeFirstOrThrow();
    const awayPeriod = awayView(row);

    // An end (or a new one): turns the cover took while there was nothing to pay back with get
    // their payback now.
    let paybacks = 0;
    if (next.endsOn !== null && next.coverMemberId !== null) {
      const unpaid = await trx
        .selectFrom('app.away_handover as h')
        .innerJoin('app.work_item as w', (join) =>
          join.onRef('w.id', '=', 'h.work_item_id').onRef('w.household_id', '=', 'h.household_id'),
        )
        .select(['h.id', 'h.recurrence_rule_id as ruleId', 'w.occurrence_index as index'])
        .where('h.household_id', '=', member.householdId)
        .where('h.away_period_id', '=', id)
        .where('h.outcome', '=', 'moved')
        .where('h.to_member_id', '=', next.coverMemberId)
        .where('h.recurrence_rule_id', 'is not', null)
        .where('h.payback_index', 'is', null)
        .execute();
      const all = await loadAwayPeriods(trx, member.householdId, next.startsOn);
      for (const u of unpaid) {
        if (u.ruleId === null || u.index === null) continue;
        const index = await placePayback(trx, {
          householdId: member.householdId,
          ruleId: u.ruleId,
          takenIndex: u.index,
          period: next,
          periods: all,
          actorMemberId: member.id,
          updateRow: async (r) => {
            await moveItem(trx, member, requestId, r, next.memberId, now, { awayPeriodId: id });
            return true;
          },
        });
        if (index === null) continue;
        paybacks++;
        await trx
          .updateTable('app.away_handover')
          .set({ payback_index: index, updated_at: now() })
          .where('id', '=', u.id)
          .execute();
      }
    }

    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'away_period',
      entityId: id,
      action: 'away_period.updated',
      payload: {
        fields,
        memberId: awayPeriod.memberId,
        startsOn: awayPeriod.startsOn,
        endsOn: awayPeriod.endsOn,
        coverMemberId: awayPeriod.coverMemberId,
        returned,
        paybacks,
        version: awayPeriod.version,
      },
      requestId,
    });
    const suggestions = await suggestionsOf(trx, member, asPeriod(awayPeriod));
    return c.json({ awayPeriod, returned, suggestions });
  });

  app.delete('/away-periods/:awayId', async (c) => {
    authorize(c, 'presence.manage');
    const id = uuidParam(c.req.param('awayId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const requestId = c.get('requestId');
    const current = await loadAway(trx, member, id);
    if (current.version !== expected.data) throw conflict();
    const { timeZone, today: date } = await today(trx, member.householdId);
    const returned = await giveBack(
      trx,
      member,
      requestId,
      asPeriod(current),
      null,
      date,
      timeZone,
      now,
    );
    await trx
      .deleteFrom('app.away_period')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'away_period',
      entityId: id,
      action: 'away_period.removed',
      payload: { memberId: current.memberId, returned },
      requestId,
    });
    return c.json({ returned });
  });

  // -------------------------------------------------------------------------------------------
  // Visitors
  // -------------------------------------------------------------------------------------------

  const visitorAudit = (
    trx: Transaction<Database>,
    member: CurrentMember,
    requestId: string,
    id: string,
    action: string,
    payload: Record<string, unknown>,
  ) =>
    recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'visitor',
      entityId: id,
      action,
      payload,
      requestId,
    });

  const checkVisit = (arrivesOn: string, leavesOn: string) => {
    const problem = checkRange(arrivesOn, leavesOn);
    if (problem) throw new ApiError(422, problem);
  };

  app.post('/visitors', async (c) => {
    authorize(c, 'presence.manage');
    const body = await parseBody(c.req.raw, CreateVisitor);
    checkVisit(body.arrivesOn, body.leavesOn);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .insertInto('app.visitor')
      .values({
        household_id: member.householdId,
        name: body.name,
        arrives_on: body.arrivesOn,
        leaves_on: body.leavesOn,
        notes: body.notes ?? null,
        created_by_member_id: member.id,
      })
      .returning(VISITOR_COLUMNS)
      .executeTakeFirstOrThrow();
    const visitor = visitorView(row);
    await visitorAudit(trx, member, c.get('requestId'), visitor.id, 'visitor.created', {
      arrivesOn: visitor.arrivesOn,
      leavesOn: visitor.leavesOn,
    });
    return c.json({ visitor }, 201);
  });

  app.patch('/visitors/:visitorId', async (c) => {
    authorize(c, 'presence.manage');
    const id = uuidParam(c.req.param('visitorId'));
    const body = await parseBody(c.req.raw, UpdateVisitor);
    const trx = c.get('trx');
    const member = c.get('member');
    const current = await trx
      .selectFrom('app.visitor')
      .select(VISITOR_COLUMNS)
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw notFound();
    if (current.version !== body.expectedVersion) throw conflict();
    const was = visitorView(current);
    const arrivesOn = body.arrivesOn ?? was.arrivesOn;
    const leavesOn = body.leavesOn ?? was.leavesOn;
    checkVisit(arrivesOn, leavesOn);
    const changes = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.arrivesOn !== undefined && { arrives_on: body.arrivesOn }),
      ...(body.leavesOn !== undefined && { leaves_on: body.leavesOn }),
      ...(body.notes !== undefined && { notes: body.notes }),
    };
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    const row = await trx
      .updateTable('app.visitor')
      .set({ ...changes, version: current.version + 1, updated_at: now() })
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .where('version', '=', body.expectedVersion)
      .returning(VISITOR_COLUMNS)
      .executeTakeFirstOrThrow();
    const visitor = visitorView(row);
    await visitorAudit(trx, member, c.get('requestId'), id, 'visitor.updated', {
      fields,
      arrivesOn: visitor.arrivesOn,
      leavesOn: visitor.leavesOn,
      version: visitor.version,
    });
    return c.json({ visitor });
  });

  app.delete('/visitors/:visitorId', async (c) => {
    authorize(c, 'presence.manage');
    const id = uuidParam(c.req.param('visitorId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .selectFrom('app.visitor')
      .select(['id', 'version'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (row.version !== expected.data) throw conflict();
    await trx
      .deleteFrom('app.visitor')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await visitorAudit(trx, member, c.get('requestId'), id, 'visitor.removed', {});
    return c.json({ ok: true });
  });

  return app;
}
