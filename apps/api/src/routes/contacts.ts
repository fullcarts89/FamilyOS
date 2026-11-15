import { CONTACT_CATEGORIES, orderIn } from '@familyos/domain';
import type { Database } from '@familyos/db';
import { Hono } from 'hono';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { recordAudit } from '../audit';
import { authorize } from '../http/authorize';
import type { AppEnv, CurrentMember, Deps } from '../http/env';
import { ApiError, conflict, notFound } from '../http/errors';
import { parseBody, uuidParam } from '../http/validation';
import { ITEM_COLUMNS, decorateItems } from './work-items';

const Uuid = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const Phone = text(40).regex(/^[0-9+().\-\s/#*a-zA-Z]*[0-9][0-9+().\-\s/#*a-zA-Z]*$/);
const Email = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());

const Fields = {
  name: text(120),
  category: z.enum(CONTACT_CATEGORIES),
  role: text(80),
  organization: text(120),
  phone: Phone,
  email: Email,
  address: text(300),
  notes: text(2000),
  forMemberId: Uuid,
};

const CreateContact = z
  .object({
    name: Fields.name,
    category: Fields.category.default('other'),
    role: Fields.role.nullish(),
    organization: Fields.organization.nullish(),
    phone: Fields.phone.nullish(),
    email: Fields.email.nullish(),
    address: Fields.address.nullish(),
    notes: Fields.notes.nullish(),
    forMemberId: Fields.forMemberId.nullish(),
  })
  .strict();

const UpdateContact = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: Fields.name.optional(),
    category: Fields.category.optional(),
    role: Fields.role.nullable().optional(),
    organization: Fields.organization.nullable().optional(),
    phone: Fields.phone.nullable().optional(),
    email: Fields.email.nullable().optional(),
    address: Fields.address.nullable().optional(),
    notes: Fields.notes.nullable().optional(),
    forMemberId: Fields.forMemberId.nullable().optional(),
  })
  .strict();

export const CONTACT_COLUMNS = [
  'id',
  'name',
  'category',
  'role',
  'organization',
  'phone',
  'email',
  'address',
  'notes',
  'for_member_id as forMemberId',
  'created_by_member_id as createdByMemberId',
  'version',
  'created_at as createdAt',
  'updated_at as updatedAt',
] as const;

/** Column names for the audit trail: which fields changed, never their values. */
const COLUMN_OF: Record<string, string> = {
  name: 'name',
  category: 'category',
  role: 'role',
  organization: 'organization',
  phone: 'phone',
  email: 'email',
  address: 'address',
  notes: 'notes',
  forMemberId: 'for_member_id',
};

async function assertForMember(trx: Transaction<Database>, householdId: string, memberId: string) {
  const member = await trx
    .selectFrom('app.member')
    .select('id')
    .where('id', '=', memberId)
    .where('household_id', '=', householdId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!member) throw new ApiError(422, 'invalid_member');
}

/**
 * Key contacts: the pediatrician, the vet, the plumber. Listed in category order (health first),
 * then by name, so the app can group them without sorting. Caregivers can read them (a sitter
 * needs the pediatrician's number); owners and adults change them.
 */
export function contactRoutes(deps: Deps) {
  const app = new Hono<AppEnv>();
  const now = () => deps.now?.() ?? new Date();

  const load = async (trx: Transaction<Database>, member: CurrentMember, id: string) => {
    const contact = await trx
      .selectFrom('app.contact')
      .select(CONTACT_COLUMNS)
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .executeTakeFirst();
    if (!contact) throw notFound();
    return contact;
  };

  app.get('/', async (c) => {
    authorize(c, 'contact.read');
    let query = c
      .get('trx')
      .selectFrom('app.contact')
      .select(CONTACT_COLUMNS)
      .where('household_id', '=', c.get('member').householdId);
    const category = c.req.query('category');
    if (category !== undefined) {
      const parsed = Fields.category.safeParse(category);
      if (!parsed.success) throw new ApiError(422, 'invalid_category');
      query = query.where('category', '=', parsed.data);
    }
    const forMemberId = c.req.query('forMemberId');
    if (forMemberId !== undefined)
      query = query.where('for_member_id', '=', uuidParam(forMemberId));
    const rows = await query.limit(500).execute();
    const contacts = rows.sort(
      (a, b) =>
        orderIn(CONTACT_CATEGORIES, a.category) - orderIn(CONTACT_CATEGORIES, b.category) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
    return c.json({ categories: CONTACT_CATEGORIES, contacts });
  });

  app.post('/', async (c) => {
    authorize(c, 'contact.manage');
    const body = await parseBody(c.req.raw, CreateContact);
    const trx = c.get('trx');
    const member = c.get('member');
    if (body.forMemberId) await assertForMember(trx, member.householdId, body.forMemberId);
    const contact = await trx
      .insertInto('app.contact')
      .values({
        household_id: member.householdId,
        name: body.name,
        category: body.category,
        role: body.role ?? null,
        organization: body.organization ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
        for_member_id: body.forMemberId ?? null,
        created_by_member_id: member.id,
      })
      .returning(CONTACT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'contact',
      entityId: contact.id,
      action: 'contact.created',
      payload: {
        category: contact.category,
        ...(contact.forMemberId && { forMemberId: contact.forMemberId }),
      },
      requestId: c.get('requestId'),
    });
    return c.json({ contact }, 201);
  });

  // The contact, with the tasks and projects that involve it (as the caller can see them).
  app.get('/:contactId', async (c) => {
    authorize(c, 'contact.read');
    const id = uuidParam(c.req.param('contactId'));
    const trx = c.get('trx');
    const member = c.get('member');
    const contact = await load(trx, member, id);
    const items = await trx
      .selectFrom('app.work_item')
      .select(ITEM_COLUMNS)
      .where('household_id', '=', member.householdId)
      .where('contact_id', '=', id)
      .where('status', '!=', 'cancelled')
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
    return c.json({ contact, items: await decorateItems(trx, member.householdId, items) });
  });

  app.patch('/:contactId', async (c) => {
    authorize(c, 'contact.manage');
    const id = uuidParam(c.req.param('contactId'));
    const body = await parseBody(c.req.raw, UpdateContact);
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .selectFrom('app.contact')
      .select(['id', 'version'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (row.version !== body.expectedVersion) throw conflict();
    if (body.forMemberId) await assertForMember(trx, member.householdId, body.forMemberId);
    const changes = Object.fromEntries(
      Object.entries(body).flatMap(([key, value]) => {
        const column = COLUMN_OF[key];
        return column && value !== undefined ? [[column, value]] : [];
      }),
    );
    const fields = Object.keys(changes).sort();
    if (fields.length === 0) throw new ApiError(422, 'no_changes');
    const contact = await trx
      .updateTable('app.contact')
      .set({ ...changes, version: row.version + 1, updated_at: now() })
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .where('version', '=', body.expectedVersion)
      .returning(CONTACT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'contact',
      entityId: id,
      action: 'contact.updated',
      payload: { fields, version: contact.version },
      requestId: c.get('requestId'),
    });
    return c.json({ contact });
  });

  // Versioned delete: DELETE /contacts/:id?expectedVersion=N. Linked tasks keep going, unlinked.
  app.delete('/:contactId', async (c) => {
    authorize(c, 'contact.manage');
    const id = uuidParam(c.req.param('contactId'));
    const expected = z.coerce.number().int().min(1).safeParse(c.req.query('expectedVersion'));
    if (!expected.success) throw new ApiError(422, 'version_required');
    const trx = c.get('trx');
    const member = c.get('member');
    const row = await trx
      .selectFrom('app.contact')
      .select(['id', 'version'])
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    if (row.version !== expected.data) throw conflict();
    await trx
      .deleteFrom('app.contact')
      .where('id', '=', id)
      .where('household_id', '=', member.householdId)
      .execute();
    await recordAudit(trx, {
      householdId: member.householdId,
      actorMemberId: member.id,
      entityType: 'contact',
      entityId: id,
      action: 'contact.deleted',
      payload: { version: row.version },
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  return app;
}
