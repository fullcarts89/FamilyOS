import {
  occurrenceDue,
  type CalendarRule,
  type CareAction,
  type EventKind,
} from '@familyos/domain';
import * as Haptics from 'expo-haptics';
import { useCallback, useSyncExternalStore } from 'react';
import {
  coverRefusal,
  declineIn,
  pendingRequest,
  STALE_CODES,
  type ActivityEntry,
  type CoverRequest,
  type WithRequest,
} from '../components/reset/coordination';
import { useHaptics } from '../design/motion';
import { hapticsAvailable } from '../design/motion/haptics';
import { requestWidgetRefresh } from '../native/WidgetSync';
import { useToast } from '../design/Toast';
import { api, ApiRequestError, errorMessage, type EventDetail, type Occurrence } from './api';
import { relativeDay } from './dates';
import { useHousehold } from './household';
import { usePeople } from './people';
import { CARE_VERB, timeOf } from './rhythm';

/** An instant from a household-local date and "HH:MM". */
export function instantAt(date: string, time: string, timeZone: string): string {
  return occurrenceDue(date, time, timeZone).dueAt ?? `${date}T00:00:00Z`;
}

/** What the event sheet edits. */
export interface EventDraft {
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  memberIds: string[];
  recurrence: CalendarRule | null;
  care: { memberId: string; action: CareAction; place: string } | null;
  location: string;
  notes: string;
}

/** The request body for POST /events (and the fields PATCH takes). */
export function eventBody(draft: EventDraft, timeZone: string) {
  const kind: EventKind = draft.care ? 'childcare' : 'other';
  const times = draft.allDay
    ? { allDay: true, startsOn: draft.date, endsOn: draft.date }
    : {
        allDay: false,
        startsAt: instantAt(draft.date, draft.start, timeZone),
        endsAt: instantAt(draft.date, draft.end < draft.start ? draft.start : draft.end, timeZone),
      };
  const memberIds = [
    ...new Set([...draft.memberIds, ...(draft.care ? [draft.care.memberId] : [])]),
  ];
  return {
    title: draft.title.trim(),
    kind,
    ...times,
    memberIds,
    recurrence: draft.recurrence,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
    careMemberId: draft.care?.memberId ?? null,
    careAction: draft.care?.action ?? null,
    carePlace: draft.care?.place.trim() || null,
  };
}

// -----------------------------------------------------------------------------------------------
// "Theo can't make it": requests this device saw you make. When one is no longer waiting and
// the activity feed has the asked adult's decline, the occurrence says so until it's sorted.

const asked = new Map<string, CoverRequest>();
const declined = new Map<string, string>();
let declinesVersion = 0;
const listeners = new Set<() => void>();
const notify = () => {
  declinesVersion += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const slot = (meId: string, key: string) => `${meId}|${key}`;
const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Follows the pending requests on these occurrences (call it with every fresh load). A request
 * of yours that is gone, with the occurrence not covered, is checked against the activity feed:
 * a decline marks the occurrence ("Theo can't make it").
 */
export function trackRequests(
  householdId: string | null | undefined,
  meId: string | null | undefined,
  occurrences: WithRequest[],
): void {
  if (!householdId || !meId) return;
  let changed = false;
  for (const o of occurrences) {
    const key = slot(meId, o.key);
    const request = pendingRequest(o);
    if (request) {
      if (request.askedByMemberId === meId) asked.set(key, request);
      if (declined.delete(key)) changed = true;
      continue;
    }
    if (o.cover && declined.delete(key)) changed = true;
    const was = asked.get(key);
    if (!was) continue;
    asked.delete(key);
    if (o.cover?.memberId === was.askedMemberId) continue;
    const since = new Date(
      Math.max(new Date(was.createdAt).getTime(), Date.now() - WEEK_MS + 60_000),
    );
    api<{ activity: ActivityEntry[] }>(
      `/households/${householdId}/activity?since=${encodeURIComponent(since.toISOString())}`,
    )
      .then(({ activity }) => {
        if (declineIn(activity, was)) {
          declined.set(key, was.askedMemberId);
          notify();
        }
      })
      .catch(() => undefined);
  }
  if (changed) notify();
}

/** Forget a request you took back yourself (so it never reads as declined). */
function forgetRequest(meId: string, key: string) {
  asked.delete(slot(meId, key));
}

/** Who said they can't make this occurrence (after your request), or null. */
export function useDeclined(): (o: Pick<Occurrence, 'key'>) => string | null {
  useSyncExternalStore(
    subscribe,
    () => declinesVersion,
    () => declinesVersion,
  );
  const { household } = useHousehold();
  const meId = household?.memberId ?? '';
  return (o) => declined.get(slot(meId, o.key)) ?? null;
}

/** A light tick under the finger (selection), before the server has answered. */
export function usePressTick() {
  const haptics = useHaptics();
  return useCallback(() => {
    if (hapticsAvailable && haptics.enabled) Haptics.selectionAsync().catch(() => undefined);
  }, [haptics.enabled]);
}

type OccurrenceLike = Pick<
  Occurrence,
  'key' | 'eventId' | 'date' | 'title' | 'careAction' | 'careMemberId' | 'startsAt'
>;

/**
 * One-occurrence changes: cover it yourself (immediate), ask the other adult to cover it (a
 * request: nothing changes until they accept on their own phone), answer or take back a
 * request, or skip it. Server-confirmed feedback only: the toast and the haptic follow the API's
 * answer; a refusal says what changed in plain words and the screen refreshes, so there's
 * never a retry that can't work.
 */
export function useOccurrenceActions(onChanged: () => void) {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const haptics = useHaptics();
  const tick = usePressTick();
  const root = household ? `/households/${household.id}` : '';
  const base = `${root}/events`;

  const whatOf = useCallback(
    (o: OccurrenceLike) => {
      const child = people.byId(o.careMemberId);
      return child && o.careAction ? `${child.name}’s ${CARE_VERB[o.careAction]}` : `“${o.title}”`;
    },
    [people],
  );
  const whenOf = useCallback(
    (o: OccurrenceLike, today?: string) => {
      const day = today ? relativeDay(o.date, today) : '';
      return `${day ? `${day.toLowerCase() === 'today' ? 'today' : day} ` : ''}at ${timeOf(o.startsAt, timeZone)}`;
    },
    [timeZone],
  );

  /** A refused write: plain words, a refresh when it changed under you, a retry otherwise. */
  const refused = useCallback(
    (
      message: string,
      caught: unknown,
      retry: (() => void) | null,
      names: { asked?: string | null; asker?: string | null } = {},
    ) => {
      const code = caught instanceof ApiRequestError ? caught.code : '';
      const stale = STALE_CODES.has(code);
      toast.show(message, {
        error: true,
        detail: coverRefusal(code, names) ?? errorMessage(caught),
        ...(!stale && retry && { action: { label: 'Try again', run: retry } }),
      });
      if (stale) onChanged();
    },
    [toast, onChanged],
  );

  const restore = useCallback(
    async (eventId: string, date: string) => {
      try {
        await api(`${base}/${eventId}/occurrences/${date}`, { method: 'DELETE' });
        onChanged();
        requestWidgetRefresh();
      } catch (caught) {
        toast.show('Couldn’t undo that.', { error: true, detail: errorMessage(caught) });
      }
    },
    [base, onChanged, toast],
  );

  /** Take back a request you made. */
  const cancelRequest = useCallback(
    async (request: CoverRequest, o: OccurrenceLike): Promise<boolean> => {
      const name = people.byId(request.askedMemberId)?.name ?? 'them';
      if (household?.memberId) forgetRequest(household.memberId, o.key);
      tick();
      try {
        await api(`${root}/cover-requests/${request.id}/cancel`, { method: 'POST' });
      } catch (caught) {
        refused('Couldn’t take the request back.', caught, () => void cancelRequest(request, o), {
          asked: name,
        });
        return false;
      }
      haptics.light();
      toast.show(`Took back your request to ${name}`, { detail: `${whatOf(o)}, ${whenOf(o)}.` });
      onChanged();
      return true;
    },
    [people, household, tick, root, refused, haptics, toast, whatOf, whenOf, onChanged],
  );

  /** Ask `memberId` to cover this one. It stays as it is until they accept. */
  const ask = useCallback(
    async (o: OccurrenceLike, memberId: string, options: { today?: string } = {}) => {
      const who = people.byId(memberId);
      const name = who?.name ?? 'them';
      tick();
      let request: CoverRequest;
      try {
        request = (
          await api<{ coverRequest: CoverRequest }>(
            `${base}/${o.eventId}/occurrences/${o.date}/cover-requests`,
            { method: 'POST', body: { memberId } },
          )
        ).coverRequest;
      } catch (caught) {
        refused(`Couldn’t ask ${name}.`, caught, () => void ask(o, memberId, options));
        return false;
      }
      haptics.light();
      if (household?.memberId) asked.set(slot(household.memberId, o.key), request);
      if (household?.memberId && declined.delete(slot(household.memberId, o.key))) notify();
      const what = whatOf(o);
      toast.show(`Asked ${name}. You’ll see here when they answer.`, {
        detail: `${what.charAt(0).toUpperCase()}${what.slice(1)}, ${whenOf(o, options.today)}. Nothing changes until ${name} says yes.`,
        undo: async () => void (await cancelRequest(request, o)),
      });
      onChanged();
      return true;
    },
    [
      base,
      people,
      tick,
      haptics,
      household,
      whatOf,
      whenOf,
      toast,
      onChanged,
      refused,
      cancelRequest,
    ],
  );

  /** `memberId` covers this one occurrence: yourself at once; anyone else is asked. */
  const cover = useCallback(
    async (
      o: OccurrenceLike,
      memberId: string,
      options: { today?: string } = {},
    ): Promise<boolean> => {
      if (memberId !== people.me?.id) return ask(o, memberId, options);
      tick();
      try {
        await api(`${base}/${o.eventId}/occurrences/${o.date}`, {
          method: 'POST',
          body: { action: 'cover', memberId },
        });
      } catch (caught) {
        refused(
          `Couldn’t change who has “${o.title}”.`,
          caught,
          () => void cover(o, memberId, options),
        );
        return false;
      }
      // One pickup covered is a confirmation, not a milestone (the week covered is one).
      haptics.light();
      toast.show(`You have ${whatOf(o)} now`, {
        detail: `${whenOf(o, options.today)}. Taken off the list.`.replace(/^./, (c) =>
          c.toUpperCase(),
        ),
        undo: () => restore(o.eventId, o.date),
      });
      onChanged();
      requestWidgetRefresh();
      return true;
    },
    [ask, people.me, tick, base, refused, haptics, toast, whatOf, whenOf, restore, onChanged],
  );

  /** Say yes: it's yours (the server creates the cover and closes the request together). */
  const accept = useCallback(
    async (request: CoverRequest, o: OccurrenceLike, options: { today?: string } = {}) => {
      const asker = people.byId(request.askedByMemberId)?.name ?? 'They';
      tick();
      try {
        await api(`${root}/cover-requests/${request.id}/accept`, { method: 'POST' });
      } catch (caught) {
        refused('Couldn’t take it on.', caught, () => void accept(request, o, options), { asker });
        return false;
      }
      haptics.light();
      toast.show(`You have ${whatOf(o)} now`, {
        detail: `${whenOf(o, options.today)}. ${asker} will see you said yes.`.replace(/^./, (c) =>
          c.toUpperCase(),
        ),
      });
      onChanged();
      requestWidgetRefresh();
      return true;
    },
    [people, tick, root, refused, haptics, toast, whatOf, whenOf, onChanged],
  );

  /** Say you can't: nothing changes, and the asker sees it. */
  const decline = useCallback(
    async (request: CoverRequest, o: OccurrenceLike, options: { today?: string } = {}) => {
      const asker = people.byId(request.askedByMemberId)?.name ?? 'They';
      tick();
      try {
        await api(`${root}/cover-requests/${request.id}/decline`, { method: 'POST' });
      } catch (caught) {
        refused('Couldn’t send your answer.', caught, () => void decline(request, o, options), {
          asker,
        });
        return false;
      }
      haptics.light();
      toast.show(`Told ${asker} you can’t make it`, {
        detail: `${whatOf(o)}, ${whenOf(o, options.today)}.`.replace(/^./, (c) => c.toUpperCase()),
      });
      onChanged();
      return true;
    },
    [people, tick, root, refused, haptics, toast, whatOf, whenOf, onChanged],
  );

  const skip = useCallback(
    async (o: Pick<Occurrence, 'eventId' | 'date' | 'title'>): Promise<boolean> => {
      try {
        await api(`${base}/${o.eventId}/occurrences/${o.date}`, {
          method: 'POST',
          body: { action: 'skip' },
        });
      } catch (caught) {
        toast.show(`Couldn’t skip “${o.title}”.`, { error: true, detail: errorMessage(caught) });
        return false;
      }
      toast.show(`Skipped this once: ${o.title}`, { undo: () => restore(o.eventId, o.date) });
      onChanged();
      requestWidgetRefresh();
      return true;
    },
    [base, toast, restore, onChanged],
  );

  return { cover, ask, cancelRequest, accept, decline, skip, restore };
}

export type OccurrenceActions = ReturnType<typeof useOccurrenceActions>;

/** Loads one event series. */
export async function loadEvent(householdId: string, eventId: string): Promise<EventDetail> {
  return (await api<{ event: EventDetail }>(`/households/${householdId}/events/${eventId}`)).event;
}
