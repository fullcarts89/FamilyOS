import type { Activity, Occurrence } from '../../lib/api';

// Two adults, two phones: the pure rules behind asking the other adult to cover a handoff, and
// saying what the other adult did. No React Native here, so the rules are unit-tested directly
// (test/mobile-coordination.test.ts).

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
