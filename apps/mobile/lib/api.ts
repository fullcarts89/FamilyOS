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
import { supabase } from './supabase';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

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
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiRequestError(res.status, payload.error ?? 'request_failed');
  return { status: res.status, body: payload as T };
}

/** Calls the FamilyOS API with the current session token. The app never queries the database directly. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'unauthenticated');
  return send<T>(path, init, token);
}

/** Like `api`, with the response status (e.g. 201 for "created just now" vs 200 "already there"). */
export async function apiWithStatus<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'unauthenticated');
  return sendWithStatus<T>(path, init, token);
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
  /** Set when this is one occurrence of a routine. */
  recurrenceRuleId: string | null;
  occurrenceIndex: number | null;
  occurrenceOn: string | null;
  completedByMemberId: string | null;
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

/** User-facing message for an API error code. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiRequestError ? error.code : '';
  if (code.startsWith('http_')) {
    return 'The calendar refused the request. Copy the address again: it may have been reset.';
  }
  switch (code) {
    case 'version_conflict':
      return 'Someone else just changed this. Reload to see their update.';
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
