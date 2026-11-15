import {
  occurrenceDue,
  type CalendarRule,
  type CareAction,
  type EventKind,
} from '@familyos/domain';
import { useCallback } from 'react';
import { useCelebrate, useHaptics } from '../design/motion';
import { useToast } from '../design/Toast';
import { api, errorMessage, type EventDetail, type Occurrence } from './api';
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

/**
 * One-occurrence changes: someone covers it, or it's skipped. Server-confirmed feedback only: the
 * toast (with undo) and any milestone follow the API's answer; a failure says so plainly.
 */
export function useOccurrenceActions(onChanged: () => void) {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const haptics = useHaptics();
  const { celebrate } = useCelebrate();
  const base = household ? `/households/${household.id}/events` : '';

  const restore = useCallback(
    async (eventId: string, date: string) => {
      try {
        await api(`${base}/${eventId}/occurrences/${date}`, { method: 'DELETE' });
        onChanged();
      } catch (caught) {
        toast.show('Couldn’t undo that.', { error: true, detail: errorMessage(caught) });
      }
    },
    [base, onChanged, toast],
  );

  /** `memberId` covers this one occurrence. Resolves true once the server has it. */
  const cover = useCallback(
    async (
      o: Pick<
        Occurrence,
        'eventId' | 'date' | 'title' | 'careAction' | 'careMemberId' | 'startsAt'
      >,
      memberId: string,
      options: { today: string } = { today: '' },
    ): Promise<boolean> => {
      const who = people.byId(memberId);
      try {
        await api(`${base}/${o.eventId}/occurrences/${o.date}`, {
          method: 'POST',
          body: { action: 'cover', memberId },
        });
      } catch (caught) {
        toast.show(`Couldn’t change who has “${o.title}”.`, {
          error: true,
          detail: errorMessage(caught),
          action: { label: 'Try again', run: () => void cover(o, memberId, options) },
        });
        return false;
      }
      haptics.light();
      const child = people.byId(o.careMemberId);
      const what =
        child && o.careAction ? `${child.name}’s ${CARE_VERB[o.careAction]}` : `“${o.title}”`;
      const day = options.today ? relativeDay(o.date, options.today) : '';
      const when = `${day ? `${day.toLowerCase() === 'today' ? 'today' : day} ` : ''}at ${timeOf(o.startsAt, timeZone)}`;
      toast.show(who?.isMe ? `You have ${what} now` : `${who?.name ?? 'They'} has ${what} now`, {
        detail: who?.isMe ? `${when}. Taken off the list.` : `${when}. It’s on their Today.`,
        undo: () => restore(o.eventId, o.date),
      });
      onChanged();
      celebrate({
        key: `cover:${o.eventId}:${o.date}`,
        title:
          o.careAction === 'pick_up'
            ? 'Pickup covered'
            : o.careAction
              ? 'Drop-off covered'
              : 'Covered',
        line: `${who?.isMe ? 'You have' : `${who?.name ?? 'They'} has`} ${what} ${when}.`,
        colors: [who?.color, child?.color].filter((c): c is string => !!c),
      });
      return true;
    },
    [base, people, toast, haptics, timeZone, restore, onChanged, celebrate],
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
      return true;
    },
    [base, toast, restore, onChanged],
  );

  return { cover, skip, restore };
}

/** Loads one event series. */
export async function loadEvent(householdId: string, eventId: string): Promise<EventDetail> {
  return (await api<{ event: EventDetail }>(`/households/${householdId}/events/${eventId}`)).event;
}
