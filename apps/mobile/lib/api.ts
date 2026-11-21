import type {
  CalendarRule,
  CareAction,
  EventKind,
  EventOccurrence,
  HeadsUp,
  RecurrenceRule,
  RhythmSummary,
  WorkItemStatus,
} from '@familyos/domain';
import { config } from './config';
import { createWriteTracker } from './refresh';
import { supabase } from './supabase';

/** What kind of failure a request had, for plain, distinct wording and for what to do next. */
export type FailureKind = 'offline' | 'timeout' | 'server' | 'auth' | 'conflict' | 'request';

export class ApiRequestError extends Error {
  constructor(
    /** HTTP status; 0 when no answer came back (offline or timed out). */
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }

  get kind(): FailureKind {
    if (this.status === 0) return this.code === TIMEOUT_CODE ? 'timeout' : 'offline';
    if (this.status === 401) return 'auth';
    if (this.code === 'version_conflict') return 'conflict';
    if (this.status >= 500) return 'server';
    return 'request';
  }
}

/** The kind of any thrown value (a non-API error counts as a request problem). */
export const failureKind = (error: unknown): FailureKind =>
  error instanceof ApiRequestError ? error.kind : 'request';

/** A request with no answer after this long is given up on (the server's own limit is shorter). */
export const REQUEST_TIMEOUT_MS = 10_000;
const TIMEOUT_CODE = 'request_timeout';
const OFFLINE_CODE = 'offline';

// ---------------------------------------------------------------------------------------------
// Connection state, learned from requests (and the browser's online/offline events on the web):
// screens keep what they last loaded while offline, show a quiet notice, and reload on recovery.

type Connection = 'online' | 'offline';
let connection: Connection =
  typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online';
const connectionListeners = new Set<(state: Connection) => void>();

function setConnection(next: Connection): void {
  if (next === connection) return;
  connection = next;
  connectionListeners.forEach((l) => l(next));
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => setConnection('online'));
  window.addEventListener('offline', () => setConnection('offline'));
}

export const currentConnection = (): Connection => connection;

/** The most recent failed request's kind (for wording a screen that only knows it failed). */
let lastFailure: FailureKind | null = null;
export const lastFailureKind = (): FailureKind | null => lastFailure;

/** Called with 'online' or 'offline' whenever that changes. */
export function onConnectionChange(listener: (state: Connection) => void): () => void {
  connectionListeners.add(listener);
  return () => void connectionListeners.delete(listener);
}

/** The session is no longer accepted (expired, revoked or corrupted): sign out locally. */
let unauthorized: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorized = handler;
}

/**
 * Writes in flight (anything but a GET, except this person's own bookkeeping under /me): screens
 * check it so a reload never overwrites a change that is still being saved.
 */
export const writes = createWriteTracker();
const isWrite = (method: string | undefined, path: string) =>
  !!method && method !== 'GET' && !/\/me(\/|$)/.test(path.split('?')[0] ?? '');

async function send<T>(
  path: string,
  init: { method?: string; body?: unknown },
  token: string | null,
): Promise<T> {
  return (await sendWithStatus<T>(path, init, token)).body;
}

async function sendWithStatus<T>(
  path: string,
  init: { method?: string; body?: unknown },
  token: string | null,
): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const writeDone = isWrite(init.method, path) ? writes.start() : null;
  let res: Response;
  let payload: { error?: string };
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    });
    payload = (await res.json().catch((caught: unknown) => {
      // A body cut off by the timeout is a timeout, never an empty success.
      if (controller.signal.aborted) throw caught;
      return {};
    })) as { error?: string };
  } catch {
    // No answer: the request timed out, or there is no connection.
    const timedOut = controller.signal.aborted;
    if (!timedOut) setConnection('offline');
    const failure = new ApiRequestError(0, timedOut ? TIMEOUT_CODE : OFFLINE_CODE);
    lastFailure = failure.kind;
    throw failure;
  } finally {
    clearTimeout(timer);
    writeDone?.();
  }
  setConnection('online');
  if (!res.ok) {
    if (res.status === 401 && token) unauthorized?.();
    const failure = new ApiRequestError(res.status, payload.error ?? 'request_failed');
    lastFailure = failure.kind;
    throw failure;
  }
  return { status: res.status, body: payload as T };
}

/** The session's access token; a session that can't be read counts as signed out. */
async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const token = data.session?.access_token;
  if (!token) {
    unauthorized?.();
    throw new ApiRequestError(401, 'unauthenticated');
  }
  return token;
}

/** Calls the FamilyOS API with the current session token. The app never queries the database directly. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  return send<T>(path, init, await accessToken());
}

/** Like `api`, with the response status (e.g. 201 for "created just now" vs 200 "already there"). */
export async function apiWithStatus<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  return sendWithStatus<T>(path, init, await accessToken());
}

/** The one call made before sign-in: creates the invitee's account from the link and joins. */
export const claimInvite = (body: {
  token: string;
  email: string;
  password: string;
  displayName: string;
}) =>
  send<{ householdId: string; memberId: string }>('/invites/claim', { method: 'POST', body }, null);

export interface MyHousehold {
  id: string;
  name: string;
  memberId: string;
  role: 'owner' | 'adult' | 'caregiver';
}

export interface Member {
  id: string;
  displayName: string;
  /** Children and pets have no account; they're the household's "cared for" members. */
  role: 'owner' | 'adult' | 'caregiver' | 'child' | 'pet';
  /** The member's own color (#RRGGBB); a palette color is used when none is stored. */
  color?: string | null;
  /** Pets: "Dog", "Cat"… */
  species?: string | null;
  /** A short line: "Age 2 · Sunflower room at Little Oaks". */
  note?: string | null;
  version?: number;
}

export interface HouseholdDetail {
  household: { id: string; name: string; timezone: string; version: number };
  members: Member[];
}

export interface Invite {
  id: string;
  email: string;
  role: 'adult' | 'caregiver';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface WorkItem {
  id: string;
  type: 'task' | 'project' | 'routine' | 'issue';
  title: string;
  description: string | null;
  status: WorkItemStatus;
  ownerMemberId: string | null;
  parentId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  /** 1 is the most important. */
  priority?: number | null;
  visibility: 'household' | 'private';
  createdByMemberId: string;
  completedAt?: string | null;
  /** The child or pet it's about. */
  subjectMemberId?: string | null;
  /** Routine occurrences: whether this is the routine's current turn (the API decides). */
  isCurrentTurn?: boolean | null;
  /** Set when this is one occurrence of a routine. */
  recurrenceRuleId: string | null;
  occurrenceIndex: number | null;
  occurrenceOn: string | null;
  completedByMemberId: string | null;
  /** The key contact it involves (the plumber for the renovation). */
  contactId?: string | null;
  /** That contact's essentials, sent with the item (null when none, or not sent). */
  contact?: Pick<
    Contact,
    'id' | 'name' | 'category' | 'role' | 'organization' | 'phone' | 'email'
  > | null;
  version: number;
  updatedAt: string;
}

export interface TodayResponse {
  date: string;
  timezone: string;
  inboxCount: number;
  needsYou: WorkItem[];
  inProgress: WorkItem[];
  thisWeek: WorkItem[];
  handled: WorkItem[];
}

export interface ItemDetail {
  item: WorkItem;
  subtasks: WorkItem[];
  progress: { done: number; total: number } | null;
  timeline: {
    id: string;
    action: string;
    actorMemberId: string | null;
    payload: { toStatus?: WorkItemStatus; fields?: string[] };
    createdAt: string;
  }[];
  routine: {
    id: string;
    title: string;
    ended: boolean;
    rotation: string[];
    version: number;
  } | null;
}

export interface Routine {
  id: string;
  title: string;
  description: string | null;
  visibility: 'household' | 'private';
  ended: boolean;
  paused: boolean;
  ownerMemberId: string | null;
  rotation: string[];
  /** The child or pet it's about ("Biscuit's flea meds"). */
  subjectMemberId?: string | null;
  rule: RecurrenceRule;
  startOn: string;
  time: string | null;
  summary: string;
  version: number;
}

export interface RoutineListEntry extends Routine {
  next: { id: string; date: string; ownerMemberId: string | null; status: WorkItemStatus } | null;
}

export interface UpcomingOccurrence {
  index: number;
  date: string;
  ownerMemberId: string | null;
  skipped: boolean;
  itemId: string | null;
  status: WorkItemStatus | null;
}

export interface RoutineDetail {
  routine: Routine;
  today: string;
  upcoming: UpcomingOccurrence[];
  history: WorkItem[];
  fairness: { days: number; counts: { memberId: string | null; completed: number }[] };
}

export interface Comment {
  id: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Events, the day's rhythm, calendars and personal state (Family Rhythm milestone 2).

export interface CalendarSourceRef {
  calendarId: string;
  label: string;
  color: string | null;
}

/** One occurrence of an event, as GET /events and /rhythm return it. */
export interface Occurrence extends EventOccurrence {
  location: string | null;
  notes: string | null;
  timezone: string;
  version: number;
  /** Imported from a calendar subscription: change it in that calendar, not here. */
  readOnly: boolean;
  source: CalendarSourceRef | null;
}

export interface EventsResponse {
  from: string;
  to: string;
  timezone: string;
  occurrences: Occurrence[];
}

/** A whole event series (GET/POST/PATCH /events/:id). */
export interface EventDetail {
  id: string;
  title: string;
  kind: EventKind;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  startsOn: string;
  endsOn: string;
  location: string | null;
  notes: string | null;
  recurrence: CalendarRule | null;
  recursUntil: string | null;
  summary: string | null;
  timezone: string;
  memberIds: string[];
  careMemberId: string | null;
  careAction: CareAction | null;
  carePlace: string | null;
  exceptions: { date: string; kind: 'skip' | 'cover'; coverMemberId: string | null }[];
  readOnly: boolean;
  source: CalendarSourceRef | null;
  version: number;
}

export interface RhythmTaskView extends WorkItem {
  subjectMemberId: string | null;
}

export interface RhythmLaneView {
  memberId: string;
  role: Member['role'];
  caredFor: boolean;
  occurrences: Occurrence[];
  segments: {
    startsAt: string;
    endsAt: string;
    location: { kind: 'home' } | { kind: 'away'; place: string | null };
    withMemberIds: string[];
  }[];
  tasks: { timed: RhythmTaskView[]; dueToday: RhythmTaskView[] };
}

export interface HandoffView {
  time: string;
  occurrenceKey: string;
  eventId: string;
  careMemberId: string;
  action: CareAction;
  place: string | null;
  byMemberIds: string[];
}

export interface RhythmResponse {
  date: string;
  today: string;
  timezone: string;
  lanes: RhythmLaneView[];
  handoffs: HandoffView[];
  unassignedTasks: RhythmTaskView[];
  headsUps: HeadsUp[];
  summary: RhythmSummary;
  members: Member[];
}

export type CalendarStatus = 'ok' | 'error' | 'pending';

export interface CalendarSource {
  id: string;
  label: string;
  memberId: string;
  color: string | null;
  status: CalendarStatus;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  /** A masked hint of the address ("calendar.google.com/…"); the address itself never returns. */
  urlHint: string | null;
  version: number;
}

export interface MemberState {
  lastSeenAt: string | null;
  notifications: {
    morningCheckin: boolean;
    handoffReminders: boolean;
    partnerChanges: boolean;
    weeklyResetReminder: boolean;
  };
  quietHours: { start: string; end: string } | null;
  haptics: boolean;
  sound: boolean;
  version: number;
}

export type ActivityAction =
  | 'task.completed'
  | 'task.assigned'
  | 'task.taken'
  | 'routine.done'
  | 'routine.swapped'
  | 'project.completed'
  | 'event.covered'
  | 'member.added';

export interface Activity {
  id: string;
  at: string;
  actorMemberId: string | null;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  title: string;
  memberId: string | null;
}

// ---------------------------------------------------------------------------------------------
// Weekly Reset, decisions, meals and groceries, contacts and budgets.

export interface DecisionOption {
  id: string;
  label: string;
  detail: string | null;
  position: number;
}

export interface Decision {
  id: string;
  question: string;
  context: string | null;
  dueOn: string | null;
  status: 'open' | 'decided' | 'dropped';
  decidedOptionId: string | null;
  decidedAt: string | null;
  decidedVia: 'agreement' | 'call' | null;
  decidedByMemberId: string | null;
  options: DecisionOption[];
  votes: { memberId: string; optionId: string; votedAt: string | null }[];
  myVoteOptionId: string | null;
  /** Adults who haven't voted yet (open decisions only). */
  waitingOn: string[];
  createdByMemberId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface Meal {
  id: string;
  onDate: string;
  slot: MealSlot;
  title: string;
  cookMemberId: string | null;
  notes: string | null;
  createdByMemberId: string;
  version: number;
}

export type GroceryAisle =
  | 'produce'
  | 'bakery'
  | 'dairy_eggs'
  | 'meat_fish'
  | 'pantry'
  | 'frozen'
  | 'baby'
  | 'pet'
  | 'household'
  | 'other';

export interface GroceryItem {
  id: string;
  name: string;
  detail: string | null;
  aisle: GroceryAisle;
  position: number;
  checkedAt: string | null;
  checkedByMemberId: string | null;
  addedByMemberId: string | null;
  version: number;
}

export type ContactCategory =
  'health' | 'childcare' | 'school' | 'pets' | 'home' | 'services' | 'family' | 'other';

export interface Contact {
  id: string;
  name: string;
  category: ContactCategory;
  role: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  forMemberId: string | null;
  version: number;
}

export interface BudgetMonth {
  month: string;
  importedAt: string | null;
  categories: {
    category: string;
    group: string | null;
    budgeted: number | null;
    actual: number | null;
    remaining: number | null;
  }[];
  groups: { group: string | null; budgeted: number; actual: number }[];
  totals: { budgeted: number; actual: number };
  availableMonths: string[];
}

export type LookBackEntry =
  | {
      kind: 'item';
      id: string;
      title: string;
      type: 'task' | 'project' | 'issue';
      reason: 'project' | 'subtask' | 'priority' | 'care';
      completedOn: string;
      parentId: string | null;
      parentTitle: string | null;
      subjectMemberId: string | null;
    }
  | {
      kind: 'routine';
      routineId: string;
      title: string;
      reason: 'care';
      subjectMemberId: string | null;
      dates: string[];
      itemIds: string[];
    };

export type Unresolved =
  | { type: 'decision_open'; decisionId: string; dueOn: string | null }
  | { type: 'care_unassigned'; occurrenceKey: string; eventId: string; time: string }
  | { type: 'handoff_conflict'; occurrenceKey: string; memberId: string; time: string }
  | { type: 'overdue'; workItemId: string; dueOn: string };

export interface WeeklyPlan {
  id: string;
  weekStart: string;
  notes: string | null;
  committedAt: string | null;
  committedByMemberId: string | null;
  version: number;
}

export interface RoutineTurns {
  id: string;
  title: string;
  version: number;
  subjectMemberId: string | null;
  rotation: string[];
  turns: {
    index: number;
    date: string;
    ownerMemberId: string | null;
    skipped: boolean;
    itemId: string | null;
    status: WorkItemStatus | null;
    version: number | null;
  }[];
}

/** GET /reset: everything one Weekly Reset session needs, in one read. */
export interface ResetResponse {
  today: string;
  week: { start: string; end: string; timezone: string };
  plan: WeeklyPlan | null;
  members: Member[];
  lookBack: {
    from: string;
    to: string;
    byMember: { memberId: string | null; entries: LookBackEntry[] }[];
    projects: {
      id: string;
      title: string;
      completed: boolean;
      completedAt: string | null;
      progress: { done: number; total: number };
    }[];
    decisions: {
      id: string;
      question: string;
      decidedOptionId: string | null;
      decidedOption: string | null;
      decidedVia: 'agreement' | 'call' | null;
      decidedAt: string | null;
    }[];
    coverage: {
      byCareMember: { memberId: string; allCovered: boolean }[];
      covers: {
        occurrenceKey: string;
        eventId: string;
        date: string;
        title: string;
        careMemberId: string | null;
        memberId: string | null;
      }[];
    };
  };
  unfinished: WorkItem[];
  dueThisWeek: WorkItem[];
  events: {
    weekStart: string;
    days: { date: string; occurrences: Occurrence[]; handoffs: HandoffView[] }[];
    needsOwner: Extract<HeadsUp, { type: 'care_unassigned' }>[];
    conflicts: Extract<HeadsUp, { type: 'handoff_conflict' }>[];
  };
  decisions: Decision[];
  meals: Meal[];
  groceries: GroceryItem[];
  routines: RoutineTurns[];
  unresolved: Unresolved[];
  allClear: boolean;
}

/** Plain, distinct words for a failure that has nothing to do with what was asked. */
export const FAILURE_WORDS: Record<Exclude<FailureKind, 'request'>, string> = {
  offline: 'You’re offline. Check your Wi‑Fi or mobile data, then try again.',
  timeout: 'FamilyOS is taking too long to answer. Try again in a moment.',
  server: 'Something went wrong on our side, not your connection. Try again in a moment.',
  auth: 'Please sign in again.',
  conflict: 'Someone else just changed this. Here’s their version.',
};

/** User-facing message for an API error code. */
export function errorMessage(error: unknown): string {
  const kind = failureKind(error);
  if (kind !== 'request') return FAILURE_WORDS[kind];
  const code = error instanceof ApiRequestError ? error.code : '';
  if (code.startsWith('http_')) {
    return 'The calendar refused the request. Copy the address again: it may have been reset.';
  }
  switch (code) {
    case 'illegal_transition':
      return 'That status change isn’t possible from here.';
    case 'evidence_required':
      return 'Confirm the work is done, or mark it done without verification.';
    case 'open_subtasks':
      return 'Finish or cancel the subtasks first.';
    case 'invalid_owner':
      return 'That person can’t own tasks.';
    case 'forbidden':
      return 'Your role can’t do that.';
    case 'not_in_inbox':
      return 'This was already sorted.';
    case 'routine_ended':
      return 'This routine has ended.';
    case 'not_skippable':
      return 'That one can’t be skipped any more.';
    case 'already_skipped':
      return 'That one is already skipped.';
    case 'not_skipped':
      return 'That one isn’t skipped.';
    case 'not_swappable':
    case 'same_owner':
      return 'That turn can’t be swapped.';
    case 'no_turn_found':
      return 'They have no upcoming turn to swap with.';
    case 'use_routine':
      return 'Change this from its routine.';
    case 'read_only':
      return 'This comes from a connected calendar. Change it there and it updates here.';
    case 'invalid_times':
      return 'Check the times: it needs to end after it starts.';
    case 'invalid_cover':
      return 'Only an adult can cover that.';
    case 'invalid_care_member':
      return 'Choose who the drop-off or pickup is for.';
    case 'invalid_member':
      return 'Choose someone from the household.';
    case 'decision_closed':
      return 'That decision was already settled. Reload to see how.';
    case 'invalid_option':
      return 'That option was removed. Reload to see the current ones.';
    case 'too_many_options':
      return 'A decision can have up to eight options.';
    case 'meal_exists':
      return 'There’s already a dinner planned that day. Reload to see it.';
    case 'invalid_week':
      return 'That isn’t the start of a week.';
    case 'unrecognized_csv':
      return 'That file doesn’t look like a Monarch budget export. Export the budget (not transactions) and try again.';
    case 'transactions_csv':
      return 'That’s a transactions export. FamilyOS only keeps budgets: export the budget instead.';
    case 'empty_csv':
      return 'That file is empty.';
    case 'invalid_csv':
    case 'invalid_amount':
    case 'invalid_month':
      return 'Some rows in that file couldn’t be read. Export the budget again and upload the new file.';
    case 'month_missing':
      return 'The file doesn’t say which month it’s for. Choose the month and upload it again.';
    case 'too_many_rows':
    case 'too_many_months':
    case 'body_too_large':
      return 'That file is too big. Export one month (or a few) at a time.';
    case 'file_required':
      return 'Choose the budget file to upload.';
    case 'invalid_body':
      return 'Some of that couldn’t be saved. Check the details and try again.';
    case 'calendars_unavailable':
      return 'Calendar connections aren’t switched on for this household yet.';
    case 'insecure_url':
      return 'That address needs to start with https://.';
    case 'invalid_url':
    case 'not_calendar':
      return 'That address doesn’t look like a calendar feed. Copy the address that ends in .ics.';
    case 'blocked_address':
      return 'That address can’t be reached from FamilyOS. Use the public or secret iCal address.';
    case 'dns_failed':
    case 'network_error':
    case 'tls_error':
      return 'Couldn’t reach that calendar. Check the address and try again.';
    case 'too_large':
    case 'too_many_events':
      return 'That calendar is too big to import. Try a calendar with fewer events.';
    case 'timeout':
    case 'too_many_redirects':
      return 'That calendar took too long to answer. Try again in a minute.';
    default:
      return 'Something went wrong. Try again.';
  }
}
