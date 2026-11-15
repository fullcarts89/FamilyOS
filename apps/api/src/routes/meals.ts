import {
  GROCERY_AISLES,
  MAX_EVENT_RANGE_DAYS,
  MEAL_SLOTS,
  orderIn,
  rangeDays,
} from '@familyos/domain';
import type { Database } from '@familyos/db';
import { Hono, type Context } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, parseOptionalBody, uuidParam } from '../http/validation';
import { assertAssignable } from './work-items';

const Uuid = z.uuid();
const LocalDate = z.iso.date();
const Version = z.number().int().min(1);
const Title = z.string().trim().min(1).max(120);
const MealNotes = z.string().trim().min(1).max(500);
const Name = z.string().trim().min(1).max(80);
const Detail = z.string().trim().min(1).max(80);

const CreateMeal = z
  .object({
    onDate: LocalDate,
    slot: z.enum(MEAL_SLOTS).default('dinner'),
    title: Title,
    cookMemberId: Uuid.nullish(),
    notes: MealNotes.nullish(),
  })
  .strict();
const UpdateMeal = z
  .object({
    expectedVersion: Version,
    onDate: LocalDate.optional(),
    slot: z.enum(MEAL_SLOTS).optional(),
    title: Title.optional(),
    cookMemberId: Uuid.nullable().optional(),
    notes: MealNotes.nullable().optional(),
  })
  .strict();
const AddGrocery = z
  .object({ name: Name, detail: Detail.nullish(), aisle: z.enum(GROCERY_AISLES).default('other') })
  .strict();
const UpdateGrocery = z
  .object({
    expectedVersion: Version,
    name: Name.optional(),
    detail: Detail.nullable().optional(),
    aisle: z.enum(GROCERY_AISLES).optional(),
    position: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();
const CheckGrocery = z.object({ expectedVersion: Version.optional() }).strict();

export const MEAL_COLUMNS = [
  'id',
  'on_date as onDate',
  'slot',
  'title',
  'cook_member_id as cookMemberId',
  'notes',
  'created_by_member_id as createdByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const GROCERY_COLUMNS = [
  'id',
  'name',
  'detail',
  'aisle',
  'position',
  'checked_at as checkedAt',
  'checked_by_member_id as checkedByMemberId',
  'added_by_member_id as addedByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** Meals between two local dates (inclusive), by date and slot (breakfast first). */
export async function mealsBetween(
  trx: Transaction<Database>,
  householdId: string,
  from: string,
  to: string,
) {
  const rows = await trx
    .selectFrom('app.meal')
    .select(MEAL_COLUMNS)
    .where('household_id', '=', householdId)
    .where('on_date', '>=', from)
    .where('on_date', '<=', to)
    .orderBy('on_date')
    .execute();
  return rows.sort(
    (a, b) =>
      a.onDate.localeCompare(b.onDate) || orderIn(MEAL_SLOTS, a.slot) - orderIn(MEAL_SLOTS, b.slot),
  );
}

/** The grocery list: still to buy first, by aisle and position; checked items after. */
export async function groceryList(trx: Transaction<Database>, householdId: string) {
  const rows = await trx
    .selectFrom('app.grocery_item')
    .select(GROCERY_COLUMNS)
    .where('household_id', '=', householdId)
    .limit(1000)
    .execute();
  return rows.sort(
    (a, b) =>
      Number(a.checkedAt !== null) - Number(b.checkedAt !== null) ||
      orderIn(GROCERY_AISLES, a.aisle) - orderIn(GROCERY_AISLES, b.aisle) ||
      a.position - b.position ||
      a.name.localeCompare(b.name),
  );
}

function audit(
  c: Context<AppEnv>,
  entityType: 'meal' | 'grocery_item',
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  return recordAudit(c.get('trx'), {
    householdId: c.get('member').householdId,
    actorMemberId: c.get('member').id,
    entityType,
    entityId: id,
    action,
    payload,
    requestId: c.get('requestId'),
  });
}

/**
 * Meals: one per day and slot (dinner by default), with who's cooking. Caregivers read; owners
 * and adults plan.
 */
export function mealRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const lock = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    id: string,
    expectedVersion: number,
  ) => {
    const row = await trx
      .selectFrom('app.meal')
      .select(['id', 'version'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (row.version !== expectedVersion) throw conflict();
    return row;
  };

  app.get('/', async (c) => {
    authorize(c, 'meal.read');
    const from = LocalDate.safeParse(c.req.query('from'));
    const to = LocalDate.safeParse(c.req.query('to'));
    if (!from.success || !to.success || to.data < from.data) {
      throw new ApiError(422, 'invalid_range');
    }
    if (rangeDays(from.data, to.data) > MAX_EVENT_RANGE_DAYS) {
      throw new ApiError(422, 'range_too_long');
    }
    const meals = await mealsBetween(c.get('trx'), c.get('member').householdId, from.data, to.data);
    return c.json({ from: from.data, to: to.data, meals });
  });

  app.post('/', async (c) => {
    authorize(c, 'meal.manage');
    const body = await parseBody(c.req.raw, CreateMeal);
    const trx = c.get('trx');
    const member = c.get('member');
    if (body.cookMemberId) await assertAssignable(trx, member.householdId, body.cookMemberId);
    const taken = await trx
      .selectFrom('app.meal')
      .select('id')
      .where('household_id', '=', member.householdId)
      .where('on_date', '=', body.onDate)
      .where('slot', '=', body.slot)
      .executeTakeFirst();
    if (taken) throw conflict('meal_exists');
    const meal = await trx
      .insertInto('app.meal')
      .values({
        household_id: member.householdId,
        on_date: body.onDate,
        slot: body.slot,
        title: body.title,
        cook_member_id: body.cookMemberId ?? null,
        notes: body.notes ?? null,
        created_by_member_id: member.id,
      })
      .returning(MEAL_COLUMNS)
      .executeTakeFirstOrThrow();
    await audit(c, 'meal', meal.id, 'meal.planned', {
      onDate: meal.onDate,
      slot: meal.slot,
      ...(meal.cookMemberId && { cookMemberId: meal.cookMemberId }),
    });
    return c.json({ meal }, 201);
  });

  app.patch('/:mealId', async (c) => {
    authorize(c, 'meal.manage');
    const id = uuidParam(c.req.param('mealId'));
    const body = await parseBody(c.req.raw, UpdateMeal);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, body.expectedVersion);
    if (body.cookMemberId) await assertAssignable(trx, member.householdId, body.cookMemberId);
    const changes = {
      ...(body.onDate !== undefined && { on_date: body.onDate }),
      ...(body.slot !== undefined && { slot: body.slot }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.cookMemberId !== undefined && { cook_member_id: body.cookMemberId }),
      ...(body.notes !== undefined && { notes: body.notes }),
    };
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    let meal;
    try {
      meal = await trx
        .updateTable('app.meal')
        .set({ ...changes, version: row.version + 1, updated_at: now() })
        .where('id', '=', id)
        .where('household_id', '=', member.householdId)
        .returning(MEAL_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      // Moved onto a day and slot that already has a meal.
      if (isUniqueViolation(error)) throw conflict('meal_exists');
      throw error;
    }
    await audit(c, 'meal', id, 'meal.updated', {
      fields,
      ...(changes.cook_member_id !== undefined && { cookMemberId: changes.cook_member_id }),
      version: meal.version,
    });
    return c.json({ meal });
  });

  app.delete('/:mealId', async (c) => {
    authorize(c, 'meal.manage');
    const id = uuidParam(c.req.param('mealId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, expected.data);
    await trx
      .deleteFrom('app.meal')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audit(c, 'meal', id, 'meal.removed', { version: row.version });
    return c.body(null, 204);
  });

  return app;
}

/**
 * The shared grocery list, grouped by aisle. Checking an item off is idempotent and needs no
 * version (two people in the store at once shouldn't trip over each other); edits are versioned.
 */
export function groceryRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const lock = async (
    trx: Transaction<Database>,
    member: CurrentMember,
    id: string,
    expectedVersion: number | undefined,
  ) => {
    const row = await trx
      .selectFrom('app.grocery_item')
      .select(['id', 'version', 'checked_at'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw conflict();
    return row;
  };

  const view = (trx: Transaction<Database>, householdId: string, id: string) =>
    trx
      .selectFrom('app.grocery_item')
      .select(GROCERY_COLUMNS)
      .where('id', '=', id)
      .where('household_id', '=', householdId)
      .executeTakeFirstOrThrow();

  app.get('/', async (c) => {
    authorize(c, 'meal.read');
    return c.json({
      aisles: GROCERY_AISLES,
      items: await groceryList(c.get('trx'), c.get('member').householdId),
    });
  });

  app.post('/', async (c) => {
    authorize(c, 'meal.manage');
    const body = await parseBody(c.req.raw, AddGrocery);
    const trx = c.get('trx');
    const member = c.get('member');
    const last = await trx
      .selectFrom('app.grocery_item')
      .select((eb) => eb.fn.max('position').as('position'))
      .where('household_id', '=', member.householdId)
      .where('aisle', '=', body.aisle)
      .executeTakeFirst();
    const item = await trx
      .insertInto('app.grocery_item')
      .values({
        household_id: member.householdId,
        name: body.name,
        detail: body.detail ?? null,
        aisle: body.aisle,
        position:
          last?.position === null || last?.position === undefined ? 0 : Number(last.position) + 1,
        added_by_member_id: member.id,
      })
      .returning(GROCERY_COLUMNS)
      .executeTakeFirstOrThrow();
    await audit(c, 'grocery_item', item.id, 'grocery.added', { aisle: item.aisle });
    return c.json({ item }, 201);
  });

  // Clear everything already bought.
  app.post('/clear-checked', async (c) => {
    authorize(c, 'meal.manage');
    const trx = c.get('trx');
    const member = c.get('member');
    const removed = await trx
      .deleteFrom('app.grocery_item')
      .where('household_id', '=', member.householdId)
      .where('checked_at', 'is not', null)
      .returning('id')
      .execute();
    for (const { id } of removed) await audit(c, 'grocery_item', id, 'grocery.cleared');
    return c.json({ removed: removed.length, items: await groceryList(trx, member.householdId) });
  });

  app.patch('/:itemId', async (c) => {
    authorize(c, 'meal.manage');
    const id = uuidParam(c.req.param('itemId'));
    const body = await parseBody(c.req.raw, UpdateGrocery);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, body.expectedVersion);
    const changes = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.detail !== undefined && { detail: body.detail }),
      ...(body.aisle !== undefined && { aisle: body.aisle }),
      ...(body.position !== undefined && { position: body.position }),
    };
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    await trx
      .updateTable('app.grocery_item')
      .set({ ...changes, version: row.version + 1, updated_at: now() })
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audit(c, 'grocery_item', id, 'grocery.updated', { fields, version: row.version + 1 });
    return c.json({ item: await view(trx, member.householdId, id) });
  });

  for (const action of ['check', 'uncheck'] as const) {
    app.post(`/:itemId/${action}`, async (c) => {
      authorize(c, 'meal.manage');
      const id = uuidParam(c.req.param('itemId'));
      const body = await parseOptionalBody(c.req.raw, CheckGrocery);
      const trx = c.get('trx');
      const member = c.get('member');
      const row = await lock(trx, member, id, body.expectedVersion);
      const checked = row.checked_at !== null;
      // Already in that state: nothing to change.
      if (checked !== (action === 'check')) {
        await trx
          .updateTable('app.grocery_item')
          .set({
            checked_at: action === 'check' ? now() : null,
            checked_by_member_id: action === 'check' ? member.id : null,
            version: row.version + 1,
            updated_at: now(),
          })
          .where('id', '=', id)
          .where('household_id', '=', member.householdId)
          .execute();
        await audit(c, 'grocery_item', id, `grocery.${action}ed`, { version: row.version + 1 });
      }
      return c.json({ item: await view(trx, member.householdId, id) });
    });
  }

  app.delete('/:itemId', async (c) => {
    authorize(c, 'meal.manage');
    const id = uuidParam(c.req.param('itemId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await lock(trx, member, id, expected.data);
    await trx
      .deleteFrom('app.grocery_item')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await audit(c, 'grocery_item', id, 'grocery.removed', { version: row.version });
    return c.body(null, 204);
  });

  return app;
}
