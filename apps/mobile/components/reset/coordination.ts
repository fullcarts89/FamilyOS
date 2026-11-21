import type { Activity, Occurrence, ResetResponse, WeeklyPlan } from '../../lib/api';

// Two adults, two phones: the pure rules behind asking the other adult to cover a handoff, the
// Weekly Reset's shared notes, and keeping a refresh from undoing a newer change. No React
// Native here, so the rules are unit-tested directly (test/mobile-coordination.test.ts).

// -----------------------------------------------------------------------------------------------
// Cover requests (owner decision 2026-11-21: only the asked adult's "yes" hands a handoff over)

/** One adult asked another to cover one occurrence. */
export interface CoverRequest {
  id: string;
  eventId: string;
  date: string;
  askedMemberId: string;
  askedByMemberId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  respondedAt: string | null;
  version: number;
}

/** GET /cover-requests (and GET /events' `coverRequests`): what's waiting, from today on. */
export interface CoverRequestLists {
  askedOfMe: CoverRequest[];
  askedByMe: CoverRequest[];
}

/** Every occurrence the API sends carries its pending request (or null). */
export type WithRequest<O = Occurrence> = O & { coverRequest?: CoverRequest | null };

/** The request still waiting on this occurrence, if any. */
export function pendingRequest(o: { coverRequest?: CoverRequest | null }): CoverRequest | null {
  return o.coverRequest && o.coverRequest.status === 'pending' ? o.coverRequest : null;
}

export type RequestView =
  | { kind: 'none' }
  /** I asked someone: it's still mine (or nobody's) until they say yes. */
  | { kind: 'mine'; request: CoverRequest }
  /** Someone asked me: I answer. */
  | { kind: 'forMe'; request: CoverRequest }
  /** Between other people. */
  | { kind: 'others'; request: CoverRequest };

export function requestView(
  o: { coverRequest?: CoverRequest | null },
  meId: string | null | undefined,
): RequestView {
  const request = pendingRequest(o);
  if (!request) return { kind: 'none' };
  if (meId && request.askedMemberId === meId) return { kind: 'forMe', request };
  if (meId && request.askedByMemberId === meId) return { kind: 'mine', request };
  return { kind: 'others', request };
}

/** "Asked Theo · waiting": wherever an occurrence would say it needs someone. */
export const waitingWords = (name: string) => `Asked ${name} · waiting`;

/** Puts (or clears) the pending request on one occurrence of the Reset's week. */
export function withRequest(
  r: ResetResponse,
  key: string,
  request: CoverRequest | null,
): ResetResponse {
  return {
    ...r,
    events: {
      ...r.events,
      days: r.events.days.map((d) => ({
        ...d,
        occurrences: d.occurrences.map((o) =>
          o.key === key ? ({ ...o, coverRequest: request } as WithRequest) : o,
        ),
      })),
    },
  };
}

/**
 * Puts one occurrence back the way it was before an optimistic change (its people, cover and
 * request, and whether it needed someone or clashed), leaving everything else as it is now.
 */
export function restoreOccurrence(
  now: ResetResponse,
  before: ResetResponse,
  key: string,
): ResetResponse {
  const was = new Map(
    before.events.days.flatMap((d) =>
      d.occurrences.filter((o) => o.key === key).map((o) => [`${d.date}|${o.key}`, o] as const),
    ),
  );
  const keyed = <T extends { occurrenceKey: string }>(list: T[]) =>
    list.filter((h) => h.occurrenceKey === key);
  const unkeyed = <T extends { occurrenceKey: string }>(list: T[]) =>
    list.filter((h) => h.occurrenceKey !== key);
  const touches = (u: ResetResponse['unresolved'][number]) =>
    'occurrenceKey' in u && u.occurrenceKey === key;
  return {
    ...now,
    events: {
      ...now.events,
      days: now.events.days.map((d) => ({
        ...d,
        occurrences: d.occurrences.map((o) => was.get(`${d.date}|${o.key}`) ?? o),
      })),
      needsOwner: [...unkeyed(now.events.needsOwner), ...keyed(before.events.needsOwner)],
      conflicts: [...unkeyed(now.events.conflicts), ...keyed(before.events.conflicts)],
    },
    unresolved: [
      ...now.unresolved.filter((u) => !touches(u)),
      ...before.unresolved.filter(touches),
    ],
  };
}

/**
 * A refused ask or answer in plain words (409s and 422s mean the occurrence changed under you:
 * the screen refreshes, so there's nothing to retry). Null: no special words, use the generic.
 */
export function coverRefusal(
  code: string,
  names: { asked?: string | null; asker?: string | null } = {},
): string | null {
  switch (code) {
    case 'already_covered':
      return 'Someone already covered this.';
    case 'request_pending':
      return 'Someone already asked about this one. It’s waiting for an answer.';
    case 'occurrence_skipped':
      return 'This one was skipped, so there’s nothing to cover.';
    case 'occurrence_gone':
    case 'not_found':
      return 'That event changed or was removed.';
    case 'request_closed':
      return names.asked
        ? `${names.asked} already answered.`
        : names.asker
          ? `${names.asker} already took that request back.`
          : 'That request was already answered.';
    case 'cannot_ask_self':
      return 'That’s you: choose “I’ll cover it” instead.';
    case 'use_request':
      return 'Ask them instead: it’s theirs once they say yes.';
    case 'invalid_cover':
      return 'Only an adult can cover that.';
    case 'read_only':
      return 'This comes from a connected calendar. Change it there and it updates here.';
    case 'forbidden':
      return 'Only the person who was asked can answer this.';
    default:
      return null;
  }
}

/** The codes that mean "it changed under you": refresh, don't offer a retry. */
export const STALE_CODES = new Set([
  'already_covered',
  'request_pending',
  'occurrence_skipped',
  'occurrence_gone',
  'not_found',
  'request_closed',
  'cannot_ask_self',
  'use_request',
  'invalid_cover',
  'read_only',
  'forbidden',
]);

// -----------------------------------------------------------------------------------------------
// What the other adult did (GET /activity), as one plain line

/** The activity actions this app knows, including the cover requests and decisions. */
export type ActivityAction =
  | Activity['action']
  | 'event.cover_requested'
  | 'event.cover_accepted'
  | 'event.cover_declined'
  | 'decision.voted'
  | 'decision.decided';

export type ActivityEntry = Omit<Activity, 'action'> & { action: ActivityAction | (string & {}) };

interface Who {
  id: string;
  name: string;
  isMe: boolean;
}

/** One plain sentence for what someone did; null for anything this version can't say. */
export function activityWords(
  a: ActivityEntry,
  byId: (id: string | null) => Who | null,
): { who: string; rest: string } | null {
  const actor = byId(a.actorMemberId);
  const who = actor ? (actor.isMe ? 'You' : actor.name) : 'Someone';
  const target = byId(a.memberId);
  const toWhom = target ? (target.isMe ? 'you' : target.name) : 'someone';
  switch (a.action) {
    case 'task.completed':
      return { who, rest: `handled ${a.title}` };
    case 'routine.done':
      return { who, rest: `did ${a.title}` };
    case 'project.completed':
      return { who, rest: `finished ${a.title}` };
    case 'task.taken':
      return { who, rest: `took on ${a.title}` };
    case 'task.assigned':
      return target?.isMe
        ? { who, rest: `handed you ${a.title}` }
        : { who, rest: `gave ${a.title} to ${toWhom}` };
    case 'routine.swapped':
      return { who, rest: `swapped turns on ${a.title}` };
    case 'event.covered':
      return target?.id === actor?.id
        ? { who, rest: `is covering ${a.title}` }
        : { who, rest: `put ${toWhom} on ${a.title}` };
    case 'event.cover_requested':
      return { who, rest: `asked ${toWhom} to cover ${a.title}` };
    case 'event.cover_accepted':
      return { who, rest: `said yes: covering ${a.title}` };
    case 'event.cover_declined':
      return { who, rest: `can’t make it: ${a.title}` };
    case 'decision.voted':
      return { who, rest: `voted on “${a.title}”` };
    case 'decision.decided':
      return { who, rest: `settled “${a.title}”` };
    case 'member.added':
      return { who, rest: `added ${a.title} to the household` };
    default:
      return null;
  }
}

/** Where an activity line leads: the item, the decisions, or nowhere. */
export function activityLink(
  a: ActivityEntry,
): { pathname: '/item/[id]'; params: { id: string } } | '/decisions' | null {
  if (a.entityType === 'work_item') return { pathname: '/item/[id]', params: { id: a.entityId } };
  if (a.entityType === 'decision') return '/decisions';
  return null;
}

/** The decline the activity feed records for a request, if there is one. */
export function declineIn(activity: ActivityEntry[], request: CoverRequest): ActivityEntry | null {
  return (
    activity.find(
      (a) =>
        a.action === 'event.cover_declined' &&
        a.entityId === request.eventId &&
        a.actorMemberId === request.askedMemberId &&
        a.at >= request.createdAt,
    ) ?? null
  );
}

// -----------------------------------------------------------------------------------------------
// Refreshes and writes: a refresh that started before a change never lands on top of it

export interface ReadTicket {
  read: number;
  writes: number;
}

/**
 * Orders refreshes against writes, by when they started. A refresh is applied only if no write
 * began or ended since it started, none is still on its way, and no newer refresh was applied
 * already (an old one that answers late is dropped).
 */
export function createFreshness() {
  let reads = 0;
  let writes = 0;
  let inFlight = 0;
  let applied = 0;
  return {
    beginRead(): ReadTicket {
      reads += 1;
      return { read: reads, writes };
    },
    beginWrite() {
      writes += 1;
      inFlight += 1;
    },
    endWrite() {
      writes += 1;
      inFlight = Math.max(0, inFlight - 1);
    },
    /** True if this refresh's answer may replace what's shown (and records it as the latest). */
    accept(t: ReadTicket): boolean {
      if (inFlight > 0 || t.writes !== writes || t.read < applied) return false;
      applied = t.read;
      return true;
    },
    get writing() {
      return inFlight > 0;
    },
  };
}

// -----------------------------------------------------------------------------------------------
// The Weekly Reset's notes: autosaved with the version the edit started from

/** The plan as the API sends it now (lib/api.ts predates the notes version). */
export type PlanWithNotes = WeeklyPlan & { notesVersion?: number };

export interface NotesState {
  /** What's in the field. */
  text: string;
  /** The plan's notesVersion this edit started from (0 before any notes). */
  base: number;
  /** Typed here and not saved yet. */
  dirty: boolean;
  /** The other adult saved different notes first: both versions, until one is chosen. */
  conflict: { theirs: string; theirsVersion: number; by: string | null } | null;
}

export const notesOf = (plan: PlanWithNotes | null | undefined) => ({
  text: plan?.notes ?? '',
  version: plan?.notesVersion ?? 0,
});

/** Starting state: a draft kept from before (it wins until saved), else the plan's notes. */
export function initialNotes(
  plan: PlanWithNotes | null | undefined,
  kept: { text: string; base: number } | null,
): NotesState {
  const saved = notesOf(plan);
  if (kept && kept.text !== saved.text) {
    return { text: kept.text, base: kept.base, dirty: true, conflict: null };
  }
  return { text: saved.text, base: saved.version, dirty: false, conflict: null };
}

/**
 * A refresh brought the plan: follow the other adult's newer save, unless there's typing (or a
 * choice) waiting here. The same version is what this phone saved: the field keeps its text as
 * typed (the server trims it), so a refresh never moves the cursor.
 */
export function notesFromServer(s: NotesState, plan: PlanWithNotes | null | undefined): NotesState {
  if (s.dirty || s.conflict) return s;
  const saved = notesOf(plan);
  if (saved.version === s.base) return s;
  return { ...s, text: saved.text, base: saved.version };
}

export function notesTyped(s: NotesState, text: string): NotesState {
  return { ...s, text, dirty: true };
}

/** The save of `sent` succeeded: the plan now has it. Typing since then stays a draft. */
export function notesSaved(s: NotesState, plan: PlanWithNotes | null, sent: string): NotesState {
  const saved = notesOf(plan);
  return { ...s, base: saved.version, dirty: s.text !== sent };
}

/** The save was refused: the other adult's version is newer. Show both. */
export function notesConflict(
  s: NotesState,
  plan: PlanWithNotes | null | undefined,
  by: string | null,
): NotesState {
  const theirs = notesOf(plan);
  if (theirs.text.trim() === s.text.trim()) {
    // Same words: nothing to choose between.
    return { ...s, base: theirs.version, dirty: false, conflict: null };
  }
  return { ...s, conflict: { theirs: theirs.text, theirsVersion: theirs.version, by } };
}

/** "Keep mine": save my text over theirs (knowingly: from their version). */
export function keepMine(s: NotesState): NotesState {
  if (!s.conflict) return s;
  return { ...s, base: s.conflict.theirsVersion, dirty: true, conflict: null };
}

/** "Use theirs": drop my text for theirs. */
export function takeTheirs(s: NotesState): NotesState {
  if (!s.conflict) return s;
  return { text: s.conflict.theirs, base: s.conflict.theirsVersion, dirty: false, conflict: null };
}
