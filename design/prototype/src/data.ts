// Synthetic household for the FamilyOS design prototype. Every name, place and detail here is
// invented. The same data feeds all three design directions so they can be compared fairly.
//
// "Now" is Tuesday 17 November 2026, 7:42 in the morning. The viewer is Maya; Theo is her partner;
// June is their two-year-old. Priya is the sitter. Thanksgiving is the following Thursday.

export type PersonId = 'maya' | 'theo' | 'june' | 'priya';

export interface Person {
  id: PersonId;
  name: string;
  role: 'adult' | 'child' | 'caregiver';
  initials: string;
  /** Each person's own color, used consistently for avatars, lanes and ownership. */
  color: string;
  /** A lighter tint of the same color for backgrounds. */
  tint: string;
  note?: string;
}

export const ME: PersonId = 'maya';
export const PARTNER: PersonId = 'theo';

export const people: Record<PersonId, Person> = {
  maya: { id: 'maya', name: 'Maya', role: 'adult', initials: 'M', color: '#D2553F', tint: '#FBE7E2' },
  theo: { id: 'theo', name: 'Theo', role: 'adult', initials: 'T', color: '#2F6FB3', tint: '#E1ECF8' },
  june: { id: 'june', name: 'June', role: 'child', initials: 'J', color: '#D99A1C', tint: '#FBF0D6', note: 'Age 2 · Sunflower room at Little Oaks' },
  priya: { id: 'priya', name: 'Priya', role: 'caregiver', initials: 'P', color: '#6B8E5A', tint: '#E8F0E2', note: 'Sitter · Fridays and some evenings' },
};

export const household = {
  name: 'The Rivera household',
  shortName: 'Riveras',
  city: 'Portland, OR',
  members: ['maya', 'theo', 'june', 'priya'] as PersonId[],
};

/** The prototype's fixed clock. */
export const NOW = { date: '2026-11-17', time: '07:42', weekday: 'Tuesday', label: 'Tuesday, November 17' };

export type EventKind = 'childcare' | 'work' | 'appointment' | 'meal' | 'family' | 'home' | 'routine';

export interface FamilyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM, 24h
  end: string;
  who: PersonId[];
  kind: EventKind;
  location?: string;
  note?: string;
  /** Childcare handoffs: who takes June from whom. */
  handoff?: { from: PersonId | 'daycare'; to: PersonId | 'daycare' };
}

const T = NOW.date;

export const events: FamilyEvent[] = [
  // Today, Tuesday 17
  { id: 'e1', title: 'Breakfast', date: T, start: '07:15', end: '07:45', who: ['maya', 'theo', 'june'], kind: 'meal' },
  { id: 'e2', title: 'Daycare drop-off', date: T, start: '08:15', end: '08:35', who: ['theo', 'june'], kind: 'childcare', location: 'Little Oaks', handoff: { from: 'theo', to: 'daycare' }, note: 'Bring spare clothes and the signed photo form.' },
  { id: 'e3', title: 'Design review', date: T, start: '09:30', end: '10:30', who: ['maya'], kind: 'work' },
  { id: 'e4', title: 'Dentist', date: T, start: '11:00', end: '11:45', who: ['theo'], kind: 'appointment', location: 'Hawthorne Dental' },
  { id: 'e5', title: 'Plumber: bathroom rough-in', date: T, start: '13:00', end: '15:00', who: ['maya'], kind: 'home', location: 'Home', note: 'Arrival window 1–3pm. Someone needs to be home.' },
  { id: 'e6', title: 'Client call', date: T, start: '15:30', end: '16:15', who: ['theo'], kind: 'work' },
  { id: 'e7', title: 'Daycare pickup', date: T, start: '17:30', end: '17:50', who: ['maya', 'june'], kind: 'childcare', location: 'Little Oaks', handoff: { from: 'daycare', to: 'maya' } },
  { id: 'e8', title: 'Dinner: sheet-pan salmon', date: T, start: '18:15', end: '19:00', who: ['maya', 'theo', 'june'], kind: 'meal', note: 'Theo cooking' },
  { id: 'e9', title: 'Bath and bedtime', date: T, start: '19:15', end: '19:45', who: ['theo', 'june'], kind: 'routine', note: "Theo's night" },

  // Rest of this week
  { id: 'e10', title: 'Trash and recycling out', date: '2026-11-18', start: '20:00', end: '20:15', who: ['theo'], kind: 'routine' },
  { id: 'e11', title: 'Daycare drop-off', date: '2026-11-18', start: '08:15', end: '08:35', who: ['maya', 'june'], kind: 'childcare', handoff: { from: 'maya', to: 'daycare' } },
  { id: 'e12', title: 'Daycare pickup', date: '2026-11-18', start: '17:30', end: '17:50', who: ['theo', 'june'], kind: 'childcare', handoff: { from: 'daycare', to: 'theo' } },
  { id: 'e13', title: 'Quarterly planning (runs late)', date: '2026-11-19', start: '14:00', end: '18:00', who: ['maya'], kind: 'work', note: 'Overlaps pickup' },
  { id: 'e14', title: 'Daycare pickup', date: '2026-11-19', start: '17:30', end: '17:50', who: ['maya', 'june'], kind: 'childcare', handoff: { from: 'daycare', to: 'maya' }, note: 'Conflict: Maya is in planning until 6' },
  { id: 'e15', title: 'Date night', date: '2026-11-20', start: '19:00', end: '22:00', who: ['maya', 'theo'], kind: 'family', location: 'Ava Gene’s', note: 'Needs a sitter' },
  { id: 'e16', title: 'Grocery run', date: '2026-11-21', start: '09:00', end: '10:00', who: ['maya'], kind: 'routine' },
  { id: 'e17', title: "Nora's 3rd birthday party", date: '2026-11-21', start: '10:30', end: '12:30', who: ['maya', 'theo', 'june'], kind: 'family', location: 'Laurelhurst Park shelter' },
  { id: 'e18', title: 'Weekly Reset', date: '2026-11-22', start: '19:30', end: '20:15', who: ['maya', 'theo'], kind: 'family', note: 'Plan the week of Nov 23 together' },

  // Next week (Thanksgiving)
  { id: 'e19', title: 'June: 2-year checkup', date: '2026-11-24', start: '09:00', end: '09:40', who: ['theo', 'june'], kind: 'appointment', location: 'Rose City Pediatrics' },
  { id: 'e20', title: 'Daycare closed (Thanksgiving)', date: '2026-11-26', start: '08:00', end: '18:00', who: ['june'], kind: 'childcare' },
  { id: 'e21', title: 'Daycare closed', date: '2026-11-27', start: '08:00', end: '18:00', who: ['june'], kind: 'childcare' },
  { id: 'e22', title: 'Thanksgiving dinner', date: '2026-11-26', start: '15:00', end: '19:00', who: ['maya', 'theo', 'june'], kind: 'family', note: 'Hosting or travelling: not decided' },
  { id: 'e23', title: 'Maya flies to Denver', date: '2026-11-23', start: '06:40', end: '09:55', who: ['maya'], kind: 'work', note: 'Back Tuesday night' },
  { id: 'e24', title: 'Tile delivery', date: '2026-11-25', start: '10:00', end: '12:00', who: ['theo'], kind: 'home' },
];

export type Area = 'Home' | 'June' | 'Admin' | 'Errands' | 'Renovation' | 'Maintenance' | 'Meals';

export interface Task {
  id: string;
  title: string;
  /** null means shared: either adult can take it. */
  owner: PersonId | null;
  area: Area;
  due?: string; // YYYY-MM-DD
  dueTime?: string;
  done: boolean;
  doneBy?: PersonId;
  priority?: 'high';
  projectId?: string;
  routineId?: string;
  notes?: string;
  /** Waiting on someone outside the household. */
  waitingOn?: string;
  createdBy?: PersonId;
}

const taskSeed: (Omit<Task, 'done'> & { done?: boolean })[] = [
  { id: 't1', title: 'Pay Little Oaks invoice for December', owner: 'maya', area: 'June', due: T, priority: 'high', notes: '$1,480 · due today' },
  { id: 't2', title: 'Renew car registration', owner: 'theo', area: 'Admin', due: '2026-11-14', priority: 'high', notes: 'Expired Saturday. Online renewal needs the emissions certificate.' },
  { id: 't3', title: 'Replace furnace filter', owner: 'theo', area: 'Maintenance', due: '2026-11-10', notes: '16×25×1, MERV 11. Spare is in the garage.' },
  { id: 't4', title: "RSVP to Nora's party", owner: 'maya', area: 'June', due: '2026-11-18', notes: 'Reply to Hannah. Gift: wooden puzzle?' },
  { id: 't5', title: 'Sign and pack daycare photo form', owner: 'theo', area: 'June', due: T, dueTime: '08:15' },
  { id: 't6', title: "Book June's 2-year checkup", owner: 'theo', area: 'June', due: '2026-11-17', done: true, doneBy: 'theo' },
  { id: 't7', title: 'Return library books', owner: null, area: 'Errands', due: '2026-11-19' },
  { id: 't8', title: 'Find a sitter for Friday', owner: null, area: 'June', due: '2026-11-18', priority: 'high', notes: 'Priya is away this Friday.' },
  { id: 't9', title: 'Order more diapers (size 5)', owner: 'maya', area: 'Errands', due: '2026-11-19' },
  { id: 't10', title: 'Call insurance about the water claim', owner: 'maya', area: 'Admin', waitingOn: 'Adjuster callback', done: false },
  { id: 't11', title: 'Swap winter tires', owner: 'theo', area: 'Errands', due: '2026-11-28' },
  { id: 't12', title: 'Fix sticking back door', owner: null, area: 'Home' },
  { id: 't13', title: 'Plan Thanksgiving menu', owner: null, area: 'Meals', due: '2026-11-22' },
  { id: 't14', title: 'Test smoke alarms', owner: 'maya', area: 'Maintenance', due: '2026-11-30' },
  // Renovation project
  { id: 'p1-1', title: 'Get three contractor quotes', owner: 'maya', area: 'Renovation', projectId: 'p1', done: true, doneBy: 'maya' },
  { id: 'p1-2', title: 'Be home for plumber rough-in (1–3pm)', owner: 'maya', area: 'Renovation', projectId: 'p1', due: T, dueTime: '13:00' },
  { id: 'p1-3', title: 'Choose floor tile', owner: null, area: 'Renovation', projectId: 'p1', due: '2026-11-20', notes: 'Decision for both of us' },
  { id: 'p1-4', title: 'Order vanity (Semihandmade quote)', owner: 'theo', area: 'Renovation', projectId: 'p1', due: '2026-11-21' },
  { id: 'p1-5', title: 'Pick paint color', owner: 'maya', area: 'Renovation', projectId: 'p1' },
  { id: 'p1-6', title: 'Move bath things to the main bathroom', owner: null, area: 'Renovation', projectId: 'p1', done: true, doneBy: 'theo' },
  // Garage project
  { id: 'p2-1', title: 'Sort donation pile', owner: 'theo', area: 'Home', projectId: 'p2', done: true, doneBy: 'theo' },
  { id: 'p2-2', title: 'Book bulky-item pickup', owner: 'theo', area: 'Home', projectId: 'p2', due: '2026-11-24' },
  { id: 'p2-3', title: 'Install wall rail for bikes', owner: null, area: 'Home', projectId: 'p2' },
  // Done this week (for the review)
  { id: 'd1', title: 'Schedule gutter cleaning', owner: 'maya', area: 'Maintenance', done: true, doneBy: 'maya' },
  { id: 'd2', title: "Buy June's winter boots", owner: 'theo', area: 'June', done: true, doneBy: 'theo' },
  { id: 'd3', title: 'Send rent receipts to accountant', owner: 'maya', area: 'Admin', done: true, doneBy: 'maya' },
];

export const tasks: Task[] = taskSeed.map((t) => ({ ...t, done: t.done ?? false }));

export interface Project {
  id: string;
  title: string;
  area: Area;
  owner: PersonId | null;
  target?: string;
  summary: string;
  budget?: string;
}

export const projects: Project[] = [
  { id: 'p1', title: 'Hall bathroom renovation', area: 'Renovation', owner: null, target: '2026-12-18', summary: 'Gut and redo the hall bath before the holidays. Contractor: Northbank Builders.', budget: '$18,500 of $21,000' },
  { id: 'p2', title: 'Garage clean-out', area: 'Home', owner: 'theo', target: '2026-11-30', summary: 'Make room for the car before it snows.' },
];

export interface Routine {
  id: string;
  title: string;
  area: Area;
  cadence: string;
  /** People taking turns, in order. */
  rotation: PersonId[];
  /** Index into rotation of whose turn is next. */
  turn: number;
  nextDue: string;
  nextLabel: string;
  /** Recent turns, newest first. */
  history: { date: string; who: PersonId; done: boolean }[];
}

export const routines: Routine[] = [
  { id: 'r1', title: 'Trash and recycling to the curb', area: 'Home', cadence: 'Wednesdays · alternates weekly', rotation: ['theo', 'maya'], turn: 0, nextDue: '2026-11-18', nextLabel: 'Wed night', history: [{ date: '2026-11-11', who: 'maya', done: true }, { date: '2026-11-04', who: 'theo', done: true }] },
  { id: 'r2', title: 'Bath and bedtime', area: 'June', cadence: 'Nightly · alternates', rotation: ['theo', 'maya'], turn: 0, nextDue: T, nextLabel: 'Tonight', history: [{ date: '2026-11-16', who: 'maya', done: true }, { date: '2026-11-15', who: 'theo', done: true }] },
  { id: 'r3', title: 'Laundry', area: 'Home', cadence: 'Mondays and Thursdays', rotation: ['maya'], turn: 0, nextDue: '2026-11-19', nextLabel: 'Thu', history: [{ date: '2026-11-16', who: 'maya', done: true }] },
  { id: 'r4', title: 'Clean bathrooms', area: 'Home', cadence: 'Every other Saturday · alternates', rotation: ['maya', 'theo'], turn: 1, nextDue: '2026-11-21', nextLabel: 'Sat', history: [{ date: '2026-11-07', who: 'maya', done: true }] },
  { id: 'r5', title: 'Grocery run', area: 'Errands', cadence: 'Saturdays · alternates', rotation: ['maya', 'theo'], turn: 0, nextDue: '2026-11-21', nextLabel: 'Sat 9am', history: [{ date: '2026-11-14', who: 'theo', done: true }] },
  { id: 'r6', title: 'Water the plants', area: 'Home', cadence: 'Sundays', rotation: ['theo'], turn: 0, nextDue: '2026-11-22', nextLabel: 'Sun', history: [{ date: '2026-11-15', who: 'theo', done: false }] },
];

export interface Decision {
  id: string;
  question: string;
  context: string;
  options: { id: string; label: string; detail: string }[];
  votes: Partial<Record<PersonId, string>>;
  due: string;
  dueLabel: string;
}

export const decisions: Decision[] = [
  { id: 'q1', question: 'Thanksgiving: host here or drive to Theo’s parents?', context: 'Daycare is closed Thu and Fri. Maya is back from Denver Tuesday night.', options: [{ id: 'host', label: 'Host here', detail: '8 people · bathroom still torn up' }, { id: 'travel', label: 'Drive to Salem', detail: '1h15 each way · June naps in the car' }], votes: { theo: 'travel' }, due: '2026-11-22', dueLabel: 'Decide by Sunday' },
  { id: 'q2', question: 'Which floor tile for the hall bath?', context: 'Contractor needs the order by Friday to keep the schedule.', options: [{ id: 'zellige', label: 'Green zellige', detail: '$14/sq ft · 3 weeks' }, { id: 'terrazzo', label: 'Warm terrazzo', detail: '$11/sq ft · in stock' }], votes: { maya: 'terrazzo' }, due: '2026-11-20', dueLabel: 'Decide by Friday' },
  { id: 'q3', question: 'Friday date night: who watches June?', context: 'Priya is away. Grandma Rosa offered, but it’s a 40-minute drive for her.', options: [{ id: 'rosa', label: 'Ask Grandma Rosa', detail: 'She offered' }, { id: 'care', label: 'Book a sitter on Bambino', detail: '~$22/hr' }, { id: 'move', label: 'Move date night', detail: 'Try next Saturday' }], votes: {}, due: '2026-11-18', dueLabel: 'Decide by tomorrow' },
];

export interface Meal {
  date: string;
  day: string;
  title: string;
  cook: PersonId | null;
  note?: string;
}

export const mealsThisWeek: Meal[] = [
  { date: '2026-11-16', day: 'Mon', title: 'Black bean tacos', cook: 'maya' },
  { date: '2026-11-17', day: 'Tue', title: 'Sheet-pan salmon and potatoes', cook: 'theo' },
  { date: '2026-11-18', day: 'Wed', title: 'Leftovers', cook: null },
  { date: '2026-11-19', day: 'Thu', title: 'Chicken soup (freezer)', cook: 'theo', note: 'Maya late' },
  { date: '2026-11-20', day: 'Fri', title: 'Date night · June: mac and peas', cook: null },
  { date: '2026-11-21', day: 'Sat', title: 'Homemade pizza', cook: 'maya' },
  { date: '2026-11-22', day: 'Sun', title: 'Slow-cooker chili', cook: 'theo' },
];

/** Ideas offered in the Weekly Reset meal step. */
export const mealIdeas = [
  'Lemon chicken orzo',
  'Veggie stir-fry',
  'Turkey meatballs',
  'Breakfast for dinner',
  'Lentil soup',
  'Takeout night',
  'Pasta with pesto',
  'Fish tacos',
];

export const nextWeekDays = [
  { date: '2026-11-23', day: 'Mon', label: 'Nov 23', note: 'Maya in Denver' },
  { date: '2026-11-24', day: 'Tue', label: 'Nov 24', note: 'Maya flies home late' },
  { date: '2026-11-25', day: 'Wed', label: 'Nov 25' },
  { date: '2026-11-26', day: 'Thu', label: 'Nov 26', note: 'Thanksgiving' },
  { date: '2026-11-27', day: 'Fri', label: 'Nov 27', note: 'Daycare closed' },
  { date: '2026-11-28', day: 'Sat', label: 'Nov 28' },
  { date: '2026-11-29', day: 'Sun', label: 'Nov 29' },
];

export interface GroceryItem {
  id: string;
  name: string;
  detail?: string;
  aisle: 'Produce' | 'Dairy & eggs' | 'Meat & fish' | 'Pantry' | 'Frozen' | 'Household' | 'Baby';
  checked: boolean;
  addedBy: PersonId;
}

export const groceries: GroceryItem[] = [
  { id: 'g1', name: 'Bananas', aisle: 'Produce', checked: false, addedBy: 'maya' },
  { id: 'g2', name: 'Spinach', detail: 'big tub', aisle: 'Produce', checked: false, addedBy: 'theo' },
  { id: 'g3', name: 'Lemons', detail: '4', aisle: 'Produce', checked: false, addedBy: 'maya' },
  { id: 'g4', name: 'Whole milk', detail: '1 gal', aisle: 'Dairy & eggs', checked: false, addedBy: 'theo' },
  { id: 'g5', name: 'Greek yogurt', aisle: 'Dairy & eggs', checked: true, addedBy: 'maya' },
  { id: 'g6', name: 'Chicken thighs', detail: '2 lb', aisle: 'Meat & fish', checked: false, addedBy: 'theo' },
  { id: 'g7', name: 'Orzo', aisle: 'Pantry', checked: false, addedBy: 'maya' },
  { id: 'g8', name: 'Peanut butter', aisle: 'Pantry', checked: false, addedBy: 'theo' },
  { id: 'g9', name: 'Frozen peas', aisle: 'Frozen', checked: false, addedBy: 'maya' },
  { id: 'g10', name: 'Diapers, size 5', aisle: 'Baby', checked: false, addedBy: 'maya' },
  { id: 'g11', name: 'Dish soap', aisle: 'Household', checked: false, addedBy: 'theo' },
];

export interface Suggestion {
  id: string;
  /** Where it appears. */
  place: 'home' | 'reset' | 'tasks';
  title: string;
  detail: string;
  action: string;
  /** What happens when accepted, in the prototype. */
  effect?: { type: 'assign'; taskId: string; to: PersonId } | { type: 'note' };
}

/** Simulated future assistant suggestions. Nothing here is a live capability. */
export const suggestions: Suggestion[] = [
  { id: 's1', place: 'home', title: 'Thursday pickup clashes with your planning meeting', detail: 'Planning runs until 6 and pickup is at 5:30. Theo has nothing after 4 on Thursday.', action: 'Ask Theo to swap Thursday pickup' },
  { id: 's2', place: 'tasks', title: 'Car registration is 3 days overdue', detail: 'I can fill in the Oregon DMV renewal with the details on file, ready for Theo to review and pay.', action: 'Prepare the renewal for Theo' },
  { id: 's3', place: 'reset', title: 'Order groceries for Saturday', detail: 'Turn next week’s meals into a list and hold a Saturday 8–9am delivery slot. You approve before anything is paid.', action: 'Prepare the order' },
  { id: 's4', place: 'reset', title: 'Text Grandma Rosa about Friday', detail: 'Draft: “Hi Mom, could you watch June Friday 6:30–10? We’d love to have you for dinner first.” Sent only if you approve.', action: 'Draft the message' },
  { id: 's5', place: 'reset', title: 'Confirm tile order with Northbank', detail: 'Once you pick a tile, email the contractor the choice and ask for the order date.', action: 'Draft the email' },
];

/** Last week, for the Weekly Reset review. */
export const lastWeek = {
  range: 'Nov 16–22',
  done: { maya: 14, theo: 12 } as Record<'maya' | 'theo', number>,
  routinesKept: 17,
  routinesTotal: 19,
  highlights: [
    'Gutter cleaning booked for Dec 2',
    "June's winter boots bought",
    'Two of three contractor quotes in, plus the third on Monday',
    'Every daycare drop-off and pickup covered',
  ],
  slipped: ['Furnace filter (Theo, a week late)', 'Car registration (Theo, expired Saturday)', 'Plants missed on Sunday'],
};

export const areaOrder: Area[] = ['June', 'Home', 'Renovation', 'Maintenance', 'Admin', 'Errands', 'Meals'];
