import { createHash, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { CalendarRule, CareAction, EventKind, RecurrenceRule } from '@familyos/domain';
import type { Database, MemberRole } from '../schema';

/**
 * Synthetic households for tests. Never real data (brief rule 8). Inserts run on the
 * privileged connection, outside row-level security, the way an operator bootstrap would.
 */
export interface SeededMember {
  id: string;
  userId: string | null;
  role: MemberRole;
  displayName: string;
}

export interface SeededHousehold {
  id: string;
  name: string;
  owner: SeededMember;
  adult: SeededMember;
  caregiver: SeededMember;
  child: SeededMember;
  pet: SeededMember;
  sharedItemId: string;
  privateItemId: string;
}

export async function seedHousehold(db: Kysely<Database>, name: string): Promise<SeededHousehold> {
  const household = await db
    .insertInto('app.household')
    .values({ name })
    .returning(['id', 'name'])
    .executeTakeFirstOrThrow();

  const addMember = async (role: MemberRole, displayName: string): Promise<SeededMember> => {
    const userId = role === 'child' || role === 'pet' ? null : randomUUID();
    const row = await db
      .insertInto('app.member')
      .values({ household_id: household.id, user_id: userId, display_name: displayName, role })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id, userId, role, displayName };
  };

  const owner = await addMember('owner', `${name} Owner`);
  const adult = await addMember('adult', `${name} Adult`);
  const caregiver = await addMember('caregiver', `${name} Caregiver`);
  const child = await addMember('child', `${name} Child`);
  const pet = await addMember('pet', `${name} Pet`);

  const shared = await db
    .insertInto('app.work_item')
    .values({
      household_id: household.id,
      title: `${name} shared item`,
      created_by_member_id: owner.id,
      owner_member_id: adult.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const privateItem = await db
    .insertInto('app.work_item')
    .values({
      household_id: household.id,
      title: `${name} private item`,
      created_by_member_id: owner.id,
      visibility: 'private',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return {
    id: household.id,
    name: household.name,
    owner,
    adult,
    caregiver,
    child,
    pet,
    sharedItemId: shared.id,
    privateItemId: privateItem.id,
  };
}

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

export async function seedInvite(
  db: Kysely<Database>,
  household: SeededHousehold,
  options: { email: string; token: string; expiresAt?: Date; role?: 'adult' | 'caregiver' },
): Promise<string> {
  const row = await db
    .insertInto('app.invite')
    .values({
      household_id: household.id,
      email: options.email,
      role: options.role ?? 'adult',
      token_hash: hashToken(options.token),
      invited_by_member_id: household.owner.id,
      expires_at: options.expiresAt ?? new Date(Date.now() + 48 * 3600 * 1000),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Removes test households, including their append-only audit rows. */
export async function purgeHouseholds(db: Kysely<Database>, ids: string[]): Promise<void> {
  for (const id of ids) {
    await sql`select app.purge_household(${id}::uuid)`.execute(db);
  }
}

/** A routine with its rule, inserted directly (the API path is tested separately). */
export async function seedRoutine(
  db: Kysely<Database>,
  household: SeededHousehold,
  options: {
    title?: string;
    rule: RecurrenceRule;
    startOn: string;
    generateFrom?: string;
    time?: string | null;
    timezone?: string;
    ownerMemberId?: string | null;
    rotation?: string[];
    visibility?: 'household' | 'private';
  },
): Promise<{ routineId: string; ruleId: string }> {
  const routine = await db
    .insertInto('app.work_item')
    .values({
      household_id: household.id,
      type: 'routine',
      title: options.title ?? `${household.name} routine`,
      status: 'ready',
      owner_member_id: options.ownerMemberId ?? null,
      visibility: options.visibility ?? 'household',
      created_by_member_id: household.owner.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const rule = await db
    .insertInto('app.recurrence_rule')
    .values({
      household_id: household.id,
      routine_id: routine.id,
      rule: options.rule,
      timezone: options.timezone ?? 'America/Los_Angeles',
      start_on: options.startOn,
      local_time: options.time ?? null,
      rotation: options.rotation ?? [],
      generate_from: options.generateFrom ?? options.startOn,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { routineId: routine.id, ruleId: rule.id };
}

/** An event with its members, inserted directly (the API path is tested separately). */
export async function seedEvent(
  db: Kysely<Database>,
  household: SeededHousehold,
  options: {
    title?: string;
    startsAt: string;
    endsAt: string;
    kind?: EventKind;
    allDay?: boolean;
    recurrence?: CalendarRule | null;
    timezone?: string;
    memberIds?: string[];
    careMemberId?: string | null;
    careAction?: CareAction | null;
    carePlace?: string | null;
  },
): Promise<string> {
  const event = await db
    .insertInto('app.event')
    .values({
      household_id: household.id,
      title: options.title ?? `${household.name} event`,
      starts_at: options.startsAt,
      ends_at: options.endsAt,
      kind: options.kind ?? 'other',
      all_day: options.allDay ?? false,
      recurrence: options.recurrence ?? null,
      timezone: options.timezone ?? 'America/Los_Angeles',
      care_member_id: options.careMemberId ?? null,
      care_action: options.careAction ?? null,
      care_place: options.carePlace ?? null,
      created_by_member_id: household.owner.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  for (const memberId of options.memberIds ?? []) {
    await db
      .insertInto('app.event_member')
      .values({ household_id: household.id, event_id: event.id, member_id: memberId })
      .execute();
  }
  return event.id;
}
