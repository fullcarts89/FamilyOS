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
 *
 * Besides today's rhythm it seeds what the Weekly Reset needs: decisions (one due tomorrow),
 * meals for this week and the next, a grocery list, key contacts, this month's budget snapshot,
 * and a history for the week the Reset looks back on (things that mattered, a project finished,
 * a decision made together, a pickup covered).
 */
import { createDb, materializeHousehold, type Database } from '@familyos/db';
import {
  addDays,
  defaultResetWeek,
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
  // The Reset plans `resetWeek` and looks back on the seven days before it.
  const resetWeek = defaultResetWeek(today);
  const lookFrom = addDays(resetWeek, -7);
  /** An instant on day `k` of the looked-back week, never later than now. */
  const doneAt = (k: number, time: string): Date => {
    const date = addDays(lookFrom, k) > today ? today : addDays(lookFrom, k);
    const instant = new Date(at(date, time));
    return instant > now ? new Date(now.getTime() - 30 * 60 * 1000) : instant;
  };

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

    const events = await seedEvents(trx, { hid, today, monday, maya, theo, june, biscuit });
    await seedRoutines(trx, { hid, today, maya, theo, june, biscuit });
    const tasks = await seedTasks(trx, { hid, today, now, doneAt, maya, theo, june });
    await seedPlanning(trx, {
      hid,
      today,
      now,
      monday,
      resetWeek,
      lookFrom,
      doneAt,
      maya,
      theo,
      june,
      biscuit,
      ...events,
      ...tasks,
    });
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
  const pickup = await event({
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
  return { pickup };
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

async function seedTasks(
  trx: Transaction<Database>,
  p: Omit<People, 'biscuit'> & { now: Date; doneAt: (k: number, time: string) => Date },
) {
  const { hid, today, now, doneAt, maya, theo, june } = p;
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
    doneAt?: Date;
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
          ...(t.done && {
            completed_at: t.doneAt ?? now,
            completed_by_member_id: t.done,
            completed_from_status: 'ready' as const,
          }),
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
  await task({
    title: 'Book June’s 2-year checkup',
    owner: theo,
    done: theo,
    doneAt: doneAt(1, '12:30'),
    subject: june,
  });
  // Last week, things that mattered.
  await task({
    title: 'Sort out the dentist bill with the insurer',
    owner: theo,
    priority: 1,
    done: theo,
    doneAt: doneAt(2, '10:15'),
  });
  await task({
    title: 'Send Little Oaks the vaccination record',
    owner: maya,
    subject: june,
    done: maya,
    doneAt: doneAt(3, '08:40'),
  });
  const toddlerBed = await task({
    title: 'Switch June to a toddler bed',
    type: 'project',
    subject: june,
    done: maya,
    doneAt: doneAt(5, '19:45'),
  });
  await task({
    title: 'Order the toddler bed',
    owner: theo,
    parent: toddlerBed,
    done: theo,
    doneAt: doneAt(0, '21:00'),
  });
  await task({
    title: 'Assemble the bed and move the crib out',
    owner: maya,
    parent: toddlerBed,
    done: maya,
    doneAt: doneAt(5, '19:30'),
  });

  const reno = await task({
    title: 'Hall bathroom renovation',
    type: 'project',
    dueOn: addDays(today, 30),
    description: 'Gut and redo the hall bath before the holidays.',
  });
  await task({
    title: 'Get three contractor quotes',
    owner: maya,
    parent: reno,
    done: maya,
    doneAt: doneAt(1, '16:00'),
  });
  const plumberVisit = await task({
    title: 'Be home for plumber rough-in (1–3pm)',
    owner: maya,
    parent: reno,
    dueAt: at(today, '13:00'),
  });
  await task({ title: 'Choose floor tile', parent: reno, dueOn: addDays(today, 3) });
  await task({ title: 'Order vanity', owner: theo, parent: reno, dueOn: addDays(today, 4) });
  await task({ title: 'Pick paint color', owner: maya, parent: reno });
  await task({
    title: 'Move bath things to the main bathroom',
    parent: reno,
    done: theo,
    doneAt: doneAt(4, '20:30'),
  });
  return { reno, plumberVisit };
}

/**
 * The Weekly Reset's material: contacts, decisions, meals for this week and the next, the
 * grocery list, this month's budget snapshot, last week's committed plan and a covered pickup.
 */
async function seedPlanning(
  trx: Transaction<Database>,
  p: People & {
    now: Date;
    monday: string;
    resetWeek: string;
    lookFrom: string;
    doneAt: (k: number, time: string) => Date;
    pickup: string;
    reno: string;
    plumberVisit: string;
  },
) {
  const { hid, today, maya, theo, june, biscuit, doneAt } = p;

  // Contacts.
  const contact = async (c: {
    name: string;
    category: 'health' | 'childcare' | 'home' | 'services' | 'pets';
    role: string;
    organization?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    forMemberId?: string;
  }) =>
    (
      await trx
        .insertInto('app.contact')
        .values({
          household_id: hid,
          name: c.name,
          category: c.category,
          role: c.role,
          organization: c.organization ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          address: c.address ?? null,
          notes: c.notes ?? null,
          for_member_id: c.forMemberId ?? null,
          created_by_member_id: maya,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  await contact({
    name: 'Dr. Priya Raman',
    category: 'health',
    role: 'Pediatrician',
    organization: 'Hawthorne Pediatrics',
    phone: '(503) 555-0114',
    address: '1820 SE Hawthorne Blvd',
    notes: 'Nurse line is open until 9pm.',
    forMemberId: june,
  });
  await contact({
    name: 'Dr. Lena Ortiz',
    category: 'pets',
    role: 'Vet',
    organization: 'Sellwood Vet',
    phone: '(503) 555-0187',
    notes: 'Biscuit’s records are under “Rivera”.',
    forMemberId: biscuit,
  });
  const plumber = await contact({
    name: 'Dee Okafor',
    category: 'home',
    role: 'Plumber',
    organization: 'Riverside Plumbing',
    phone: '(503) 555-0152',
    email: 'office@riverside-plumbing.example',
  });
  await contact({
    name: 'Rosa Medina',
    category: 'services',
    role: 'House cleaner',
    phone: '(503) 555-0163',
    notes: 'Every other Friday. Key is in the lockbox.',
  });
  await contact({
    name: 'Little Oaks',
    category: 'childcare',
    role: 'Daycare',
    organization: 'Little Oaks Early Learning',
    phone: '(503) 555-0120',
    email: 'frontdesk@littleoaks.example',
    address: '4410 SE Division St',
    notes: 'Sunflower room. Pickup by 6pm.',
    forMemberId: june,
  });
  await trx
    .updateTable('app.work_item')
    .set({ contact_id: plumber })
    .where('household_id', '=', hid)
    .where('id', 'in', [p.reno, p.plumberVisit])
    .execute();

  // Decisions: one due tomorrow (a heads-up), one later, one open-ended, one settled last week.
  const decision = async (d: {
    question: string;
    context?: string;
    dueOn?: string;
    options: string[];
    votes?: [string, number][];
    decided?: { option: number; at: Date };
  }) => {
    const row = await trx
      .insertInto('app.decision')
      .values({
        household_id: hid,
        question: d.question,
        context: d.context ?? null,
        due_on: d.dueOn ?? null,
        created_by_member_id: maya,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const options = await trx
      .insertInto('app.decision_option')
      .values(
        d.options.map((label, position) => ({
          household_id: hid,
          decision_id: row.id,
          label,
          position,
        })),
      )
      .returning('id')
      .execute();
    for (const [member, option] of d.votes ?? []) {
      await trx
        .insertInto('app.decision_vote')
        .values({
          household_id: hid,
          decision_id: row.id,
          member_id: member,
          option_id: options[option]?.id ?? '',
          voted_at: d.decided?.at ?? p.now,
        })
        .execute();
    }
    if (d.decided) {
      await trx
        .updateTable('app.decision')
        .set({
          status: 'decided',
          decided_option_id: options[d.decided.option]?.id ?? null,
          decided_at: d.decided.at,
          decided_via: 'agreement',
          decided_by_member_id: theo,
          version: 2,
        })
        .where('id', '=', row.id)
        .execute();
    }
  };
  await decision({
    question: 'Which preschool for June next fall?',
    context: 'Applications close Friday. Both toured.',
    dueOn: addDays(today, 1),
    options: ['Little Oaks Pre-K', 'Juniper House'],
    votes: [[maya, 0]],
  });
  await decision({
    question: 'Thanksgiving: host here or go to Theo’s parents?',
    dueOn: addDays(today, 5),
    options: ['Host here', 'Drive to Sacramento'],
  });
  await decision({
    question: 'Replace the car this year?',
    options: ['This spring', 'Wait a year'],
  });
  await decision({
    question: 'Hall bath tile: matte or glossy?',
    options: ['Matte', 'Glossy'],
    votes: [
      [maya, 0],
      [theo, 0],
    ],
    decided: { option: 0, at: doneAt(2, '21:10') },
  });

  // Meals: this week and the next, with a couple of nights left open in the Reset's week.
  const dinners = [
    'Chicken tacos',
    'Lentil soup and bread',
    'Pasta with pesto',
    'Leftovers',
    'Pizza night',
    'Roast chicken and potatoes',
    'Fried rice',
  ];
  const first = p.monday < p.resetWeek ? p.monday : p.resetWeek;
  for (let i = 0; i < 14; i++) {
    const date = addDays(first, i);
    if (date >= p.resetWeek && (i % 7 === 3 || i % 7 === 5)) continue;
    await trx
      .insertInto('app.meal')
      .values({
        household_id: hid,
        on_date: date,
        title: date === today ? 'Sheet-pan salmon' : (dinners[i % 7] ?? 'Leftovers'),
        cook_member_id: date === today ? theo : i % 2 === 0 ? maya : theo,
        notes: date === today ? 'Lemon and dill; rice for June.' : null,
        created_by_member_id: maya,
      })
      .execute();
  }
  await trx
    .insertInto('app.meal')
    .values({
      household_id: hid,
      on_date: addDays(today, 1),
      slot: 'lunch',
      title: 'Leftover salmon bowls',
      created_by_member_id: maya,
    })
    .execute();

  // Groceries, a couple already in the cart.
  const groceries: [string, string | null, string, boolean][] = [
    ['Bananas', null, 'produce', false],
    ['Spinach', '1 bag', 'produce', false],
    ['Lemons', '3', 'produce', true],
    ['Sourdough', null, 'bakery', false],
    ['Whole milk', '1 gal', 'dairy_eggs', false],
    ['Eggs', 'dozen', 'dairy_eggs', true],
    ['Salmon fillets', '1.5 lb', 'meat_fish', false],
    ['Rice', null, 'pantry', false],
    ['Diapers', 'size 5', 'baby', false],
    ['Dog food', 'small bag', 'pet', false],
    ['Dish soap', null, 'household', false],
  ];
  for (const [i, [name, detail, aisle, checked]] of groceries.entries()) {
    await trx
      .insertInto('app.grocery_item')
      .values({
        household_id: hid,
        name,
        detail,
        aisle: aisle as 'produce',
        position: i,
        added_by_member_id: i % 2 === 0 ? maya : theo,
        ...(checked && { checked_at: p.now, checked_by_member_id: theo }),
      })
      .execute();
  }

  // This month's Monarch budget, as if imported from a CSV.
  const month = `${today.slice(0, 7)}-01`;
  const budget: [string, string, number, number][] = [
    ['Food & Dining', 'Groceries', 1100, 842.17],
    ['Food & Dining', 'Restaurants', 250, 186.4],
    ['Childcare', 'Daycare', 1850, 1850],
    ['Home', 'Home Improvement', 600, 412.0],
    ['Home', 'Utilities', 320, 241.55],
    ['Transportation', 'Gas', 180, 96.5],
    ['Pets', 'Pet Care', 120, 64.99],
    ['Shopping', 'Kids Clothing', 100, 128.3],
  ];
  await trx
    .insertInto('app.budget_snapshot')
    .values(
      budget.map(([group, category, budgeted, actual]) => ({
        household_id: hid,
        month,
        category,
        category_group: group,
        budgeted,
        actual,
        imported_at: p.now,
        imported_by_member_id: maya,
      })),
    )
    .execute();

  // Last week's plan was committed; Theo covered one of Maya's pickups.
  await trx
    .insertInto('app.weekly_plan')
    .values({
      household_id: hid,
      week_start: p.lookFrom,
      notes: 'Theo takes Wednesday pickup. Tile decision by midweek.',
      committed_at: new Date(at(addDays(p.lookFrom, -1), '20:10')),
      committed_by_member_id: maya,
    })
    .execute();
  const coverDate = addDays(p.lookFrom, 2);
  if (coverDate <= today) {
    await trx
      .insertInto('app.event_exception')
      .values({
        household_id: hid,
        event_id: p.pickup,
        occurrence_date: coverDate,
        kind: 'cover',
        cover_member_id: theo,
        created_by_member_id: maya,
      })
      .execute();
  }
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
