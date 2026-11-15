/**
 * Local development only: seeds "The Rivera household", a synthetic demo family, relative to
 * today's date in America/Los_Angeles. Every name, place and detail is invented
 * (design/prototype/src/data.ts). Running it again replaces the previous demo household.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
 *   SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_SECRET_KEY=... \
 *   pnpm --filter @familyos/api demo:seed
 *
 * Sign in as maya@familyos.test (owner) or theo@familyos.test (adult), password familyos-demo-1.
 * Refuses to run unless both the database and Supabase are on this machine.
 */
import { createDb, materializeHousehold, type Database } from '@familyos/db';
import {
  addDays,
  localDateOf,
  occurrenceDue,
  type CalendarRule,
  type CareAction,
  type EventKind,
} from '@familyos/domain';
import { sql, type Kysely, type Transaction } from 'kysely';
import { z } from 'zod';
import { createSupabaseAuthAdmin } from '../auth/admin';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const TZ = 'America/Los_Angeles';
const HOUSEHOLD = 'The Rivera household';
const PASSWORD = 'familyos-demo-1';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20),
  })
  .parse(process.env);

for (const [name, value] of [
  ['DATABASE_URL', env.DATABASE_URL],
  ['SUPABASE_URL', env.SUPABASE_URL],
] as const) {
  if (!LOCAL_HOSTS.has(new URL(value).hostname)) {
    console.error(`${name} is not on this machine; the demo seed only runs against a local stack.`);
    process.exit(1);
  }
}

/** ISO weekday (Mon = 1 ... Sun = 7) of a local date. */
const weekday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
/** The first date on or after `from` that falls on `isoWeekday`. */
const nextWeekday = (from: string, isoWeekday: number) =>
  addDays(from, (isoWeekday - weekday(from) + 7) % 7);
/** A local date and HH:MM in Los Angeles, as an instant. */
const at = (date: string, time: string) => {
  const due = occurrenceDue(date, time, TZ);
  if (!due.dueAt) throw new Error('unreachable');
  return due.dueAt;
};

async function accountFor(db: Kysely<Database>, email: string): Promise<string> {
  const admin = createSupabaseAuthAdmin({
    supabaseUrl: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  });
  const created = await admin.createUser(email, PASSWORD);
  if (created === 'weak_password') throw new Error('Supabase refused the demo password');
  if (created !== 'exists') return created.userId;
  const { rows } = await sql<{ id: string }>`
    select id from auth.users where email = ${email}
  `.execute(db);
  const userId = rows[0]?.id;
  if (!userId) throw new Error(`no account for ${email}`);
  // A local demo account always signs in with the demo password.
  await admin.setPassword(userId, PASSWORD);
  return userId;
}

async function seed(db: Kysely<Database>) {
  const mayaUser = await accountFor(db, 'maya@familyos.test');
  const theoUser = await accountFor(db, 'theo@familyos.test');

  // Replace the previous demo household, if any (found by name and Maya's account).
  const previous = await db
    .selectFrom('app.household as h')
    .innerJoin('app.member as m', 'm.household_id', 'h.id')
    .select('h.id')
    .where('h.name', '=', HOUSEHOLD)
    .where('m.user_id', 'in', [mayaUser, theoUser])
    .execute();
  for (const { id } of previous) {
    await sql`select app.purge_household(${id}::uuid)`.execute(db);
  }

  const now = new Date();
  const today = localDateOf(now, TZ);
  const monday = addDays(today, 1 - weekday(today));

  const householdId = await db.transaction().execute(async (trx) => {
    const household = await trx
      .insertInto('app.household')
      .values({ name: HOUSEHOLD, timezone: TZ })
      .returning('id')
      .executeTakeFirstOrThrow();
    const hid = household.id;

    const member = async (values: {
      display_name: string;
      role: 'owner' | 'adult' | 'child' | 'pet';
      user_id: string | null;
      color: string;
      species?: string;
      note?: string;
    }) =>
      (
        await trx
          .insertInto('app.member')
          .values({ household_id: hid, species: null, note: null, ...values })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
    const maya = await member({
      display_name: 'Maya',
      role: 'owner',
      user_id: mayaUser,
      color: '#D2553F',
    });
    const theo = await member({
      display_name: 'Theo',
      role: 'adult',
      user_id: theoUser,
      color: '#2F6FB3',
    });
    const june = await member({
      display_name: 'June',
      role: 'child',
      user_id: null,
      color: '#D99A1C',
      note: 'Age 2 · Sunflower room at Little Oaks',
    });
    const biscuit = await member({
      display_name: 'Biscuit',
      role: 'pet',
      user_id: null,
      color: '#8A6A4F',
      species: 'Dog',
      note: 'Flea meds on the 1st',
    });

    await trx
      .insertInto('app.audit_event')
      .values({
        household_id: hid,
        actor_member_id: null,
        entity_type: 'household',
        entity_id: hid,
        action: 'household.created',
        payload: { via: 'demo_seed' },
      })
      .execute();

    await seedEvents(trx, { hid, today, monday, maya, theo, june, biscuit });
    await seedRoutines(trx, { hid, today, maya, theo, june, biscuit });
    await seedTasks(trx, { hid, today, now, maya, theo, june });
    return hid;
  });

  // Create routine occurrences the way the worker would, then settle the past ones.
  await materializeHousehold(db, { householdId, now, requestId: 'demo-seed' });
  await settlePastOccurrences(db, householdId, today);
  return householdId;
}

interface People {
  hid: string;
  today: string;
  maya: string;
  theo: string;
  june: string;
  biscuit: string;
}

async function seedEvents(trx: Transaction<Database>, p: People & { monday: string }) {
  const { hid, today, monday, maya, theo, june, biscuit } = p;
  const event = async (e: {
    title: string;
    kind: EventKind;
    date: string;
    start: string;
    end: string;
    members: string[];
    location?: string;
    notes?: string;
    recurrence?: CalendarRule;
    care?: { member: string; action: CareAction | null; place?: string };
  }) => {
    const row = await trx
      .insertInto('app.event')
      .values({
        household_id: hid,
        title: e.title,
        kind: e.kind,
        starts_at: at(e.date, e.start),
        ends_at: at(e.date, e.end),
        location: e.location ?? null,
        notes: e.notes ?? null,
        recurrence: e.recurrence ?? null,
        timezone: TZ,
        care_member_id: e.care?.member ?? null,
        care_action: e.care?.action ?? null,
        care_place: e.care?.place ?? null,
        created_by_member_id: maya,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('app.event_member')
      .values(e.members.map((m) => ({ household_id: hid, event_id: row.id, member_id: m })))
      .execute();
    return row.id;
  };

  // Weekday daycare: Theo drops June off, Maya picks her up. Started a few weeks ago.
  const weekdays: CalendarRule = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
  const seriesStart = addDays(monday, -21);
  await event({
    title: 'Daycare drop-off',
    kind: 'childcare',
    date: seriesStart,
    start: '08:15',
    end: '08:35',
    members: [theo, june],
    location: 'Little Oaks',
    notes: 'Spare clothes live in the cubby.',
    recurrence: weekdays,
    care: { member: june, action: 'drop_off', place: 'Little Oaks' },
  });
  await event({
    title: 'Daycare pickup',
    kind: 'childcare',
    date: seriesStart,
    start: '17:30',
    end: '17:50',
    members: [maya, june],
    location: 'Little Oaks',
    recurrence: weekdays,
    care: { member: june, action: 'pick_up', place: 'Little Oaks' },
  });

  // Today.
  await event({
    title: 'Breakfast',
    kind: 'meal',
    date: today,
    start: '07:15',
    end: '07:45',
    members: [maya, theo, june],
  });
  await event({
    title: 'Design review',
    kind: 'work',
    date: today,
    start: '09:30',
    end: '10:30',
    members: [maya],
  });
  await event({
    title: 'Dentist',
    kind: 'appointment',
    date: today,
    start: '11:00',
    end: '11:45',
    members: [theo],
    location: 'Hawthorne Dental',
  });
  await event({
    title: 'Plumber: bathroom rough-in',
    kind: 'home',
    date: today,
    start: '13:00',
    end: '15:00',
    members: [maya],
    location: 'Home',
    notes: 'Arrival window 1–3pm. Someone needs to be home.',
  });
  await event({
    title: 'Client call',
    kind: 'work',
    date: today,
    start: '15:30',
    end: '16:15',
    members: [theo],
  });
  await event({
    title: 'Dinner: sheet-pan salmon',
    kind: 'meal',
    date: today,
    start: '18:15',
    end: '19:00',
    members: [maya, theo, june],
    notes: 'Theo cooking',
  });

  // This week: Thursday's planning runs into Maya's pickup (a heads-up).
  const thursday = nextWeekday(today, 4);
  await event({
    title: 'Quarterly planning (runs late)',
    kind: 'work',
    date: thursday,
    start: '14:00',
    end: '18:00',
    members: [maya],
  });
  await event({
    title: 'Date night',
    kind: 'family',
    date: nextWeekday(today, 5),
    start: '19:00',
    end: '22:00',
    members: [maya, theo],
    location: 'Ava Gene’s',
    notes: 'Needs a sitter',
  });
  await event({
    title: 'Vet: annual checkup',
    kind: 'appointment',
    date: nextWeekday(addDays(today, 1), 6),
    start: '10:00',
    end: '10:45',
    members: [theo, biscuit],
    location: 'Sellwood Vet',
    care: { member: biscuit, action: null },
  });
  await event({
    title: 'Weekly Reset',
    kind: 'family',
    date: nextWeekday(today, 7),
    start: '19:30',
    end: '20:15',
    members: [maya, theo],
  });
}

async function seedRoutines(trx: Transaction<Database>, p: People) {
  const { hid, today, maya, theo, june, biscuit } = p;
  const routine = async (r: {
    title: string;
    rule: CalendarRule;
    startOn: string;
    generateFrom: string;
    time: string | null;
    owner?: string;
    rotation?: string[];
    subject?: string;
  }) => {
    const row = await trx
      .insertInto('app.work_item')
      .values({
        household_id: hid,
        type: 'routine',
        title: r.title,
        status: 'ready',
        owner_member_id: r.owner ?? null,
        subject_member_id: r.subject ?? null,
        created_by_member_id: maya,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('app.recurrence_rule')
      .values({
        household_id: hid,
        routine_id: row.id,
        rule: r.rule,
        timezone: TZ,
        start_on: r.startOn,
        local_time: r.time,
        rotation: r.rotation ?? [],
        generate_from: r.generateFrom,
      })
      .execute();
  };
  const weekAgo = addDays(today, -7);
  await routine({
    title: 'Trash and recycling to the curb',
    rule: { freq: 'weekly', interval: 1, weekdays: [3] },
    startOn: addDays(today, -28),
    generateFrom: weekAgo,
    time: '20:00',
    rotation: [theo, maya],
  });
  await routine({
    title: 'Bath and bedtime',
    rule: { freq: 'daily', interval: 1 },
    startOn: addDays(today, -28),
    generateFrom: weekAgo,
    time: '19:15',
    rotation: [theo, maya],
    subject: june,
  });
  await routine({
    title: 'Laundry',
    rule: { freq: 'weekly', interval: 1, weekdays: [1, 4] },
    startOn: addDays(today, -28),
    generateFrom: today,
    time: null,
    owner: maya,
  });
  await routine({
    title: 'Biscuit’s flea meds',
    rule: { freq: 'monthly', interval: 1, dayOfMonth: 1 },
    startOn: `${today.slice(0, 8)}01`,
    generateFrom: today,
    time: null,
    owner: maya,
    subject: biscuit,
  });
}

async function seedTasks(trx: Transaction<Database>, p: Omit<People, 'biscuit'> & { now: Date }) {
  const { hid, today, now, maya, theo, june } = p;
  const task = async (t: {
    title: string;
    owner?: string | null;
    dueOn?: string;
    dueAt?: string;
    priority?: number;
    description?: string;
    subject?: string;
    parent?: string;
    type?: 'task' | 'project';
    done?: string;
  }) =>
    (
      await trx
        .insertInto('app.work_item')
        .values({
          household_id: hid,
          type: t.type ?? 'task',
          title: t.title,
          description: t.description ?? null,
          status: t.done ? 'done_unverified' : 'ready',
          owner_member_id: t.owner ?? null,
          due_on: t.dueOn ?? null,
          due_at: t.dueAt ?? null,
          priority: t.priority ?? null,
          subject_member_id: t.subject ?? null,
          parent_id: t.parent ?? null,
          created_by_member_id: maya,
          ...(t.done && { completed_at: now, completed_by_member_id: t.done }),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  await task({
    title: 'Pay Little Oaks invoice for next month',
    owner: maya,
    dueOn: today,
    priority: 1,
    subject: june,
  });
  // Two overdue.
  await task({
    title: 'Renew car registration',
    owner: theo,
    dueOn: addDays(today, -3),
    priority: 1,
    description: 'Online renewal needs the emissions certificate.',
  });
  await task({
    title: 'Replace furnace filter',
    owner: theo,
    dueOn: addDays(today, -6),
    description: '16×25×1, MERV 11. Spare is in the garage.',
  });
  await task({
    title: 'Sign and pack daycare photo form',
    owner: theo,
    dueAt: at(today, '08:00'),
    subject: june,
  });
  await task({ title: 'RSVP to Nora’s party', owner: maya, dueOn: addDays(today, 1) });
  await task({ title: 'Find a sitter for Friday', dueOn: addDays(today, 1), priority: 1 });
  await task({ title: 'Return library books', dueOn: addDays(today, 2) });
  await task({ title: 'Order more diapers (size 5)', owner: maya, dueOn: addDays(today, 2) });
  await task({ title: 'Fix sticking back door' });
  await task({ title: 'Book June’s 2-year checkup', owner: theo, done: theo, subject: june });

  const reno = await task({
    title: 'Hall bathroom renovation',
    type: 'project',
    dueOn: addDays(today, 30),
    description: 'Gut and redo the hall bath before the holidays.',
  });
  await task({ title: 'Get three contractor quotes', owner: maya, parent: reno, done: maya });
  await task({
    title: 'Be home for plumber rough-in (1–3pm)',
    owner: maya,
    parent: reno,
    dueAt: at(today, '13:00'),
  });
  await task({ title: 'Choose floor tile', parent: reno, dueOn: addDays(today, 3) });
  await task({ title: 'Order vanity', owner: theo, parent: reno, dueOn: addDays(today, 4) });
  await task({ title: 'Pick paint color', owner: maya, parent: reno });
  await task({ title: 'Move bath things to the main bathroom', parent: reno, done: theo });
}

/**
 * Past routine occurrences: bedtime turns were done by whoever had them; the latest trash turn
 * is left open, so Today shows an overdue routine.
 */
async function settlePastOccurrences(db: Kysely<Database>, householdId: string, today: string) {
  const past = await db
    .selectFrom('app.work_item as w')
    .innerJoin('app.recurrence_rule as r', 'r.id', 'w.recurrence_rule_id')
    .innerJoin('app.work_item as routine', 'routine.id', 'r.routine_id')
    .select(['w.id', 'w.owner_member_id', 'w.occurrence_on', 'routine.title'])
    .where('w.household_id', '=', householdId)
    .where('w.occurrence_on', '<', today)
    .orderBy('w.occurrence_on', 'desc')
    .execute();
  const lastTrash = past.find((o) => o.title.startsWith('Trash'));
  for (const o of past) {
    if (o.id === lastTrash?.id) continue;
    await db
      .updateTable('app.work_item')
      .set({
        status: 'done_unverified',
        completed_at: new Date(`${o.occurrence_on ?? today}T20:00:00-08:00`),
        completed_by_member_id: o.owner_member_id,
      })
      .where('id', '=', o.id)
      .execute();
  }
}

const db = createDb({ connectionString: env.DATABASE_URL, maxConnections: 2 });
try {
  const householdId = await seed(db);
  console.warn(
    [
      `Seeded ${HOUSEHOLD} (${householdId}) in ${TZ}.`,
      `Sign in as maya@familyos.test (owner) or theo@familyos.test (adult), password ${PASSWORD}.`,
    ].join('\n'),
  );
} finally {
  await db.destroy();
}
