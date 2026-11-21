import { describe, expect, it } from 'vitest';
import {
  activityLink,
  activityWords,
  coverRefusal,
  createFreshness,
  declineIn,
  initialNotes,
  keepMine,
  notesConflict,
  notesFromServer,
  notesSaved,
  notesTyped,
  planFacts,
  requestsKey,
  requestView,
  restoreOccurrence,
  STALE_CODES,
  takeTheirs,
  waitingWords,
  weekLabel,
  weekToOpen,
  withRequest,
  type ActivityEntry,
  type CoverRequest,
  type PlanWithNotes,
} from '../apps/mobile/components/reset/coordination';
import type { Occurrence, ResetResponse } from '../apps/mobile/lib/api';

// Synthetic household: Maya and Theo (adults), June (toddler).
const MAYA = '00000000-0000-4000-8000-000000000001';
const THEO = '00000000-0000-4000-8000-000000000002';
const JUNE = '00000000-0000-4000-8000-000000000003';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const people: Record<string, { id: string; name: string }> = {
  [MAYA]: { id: MAYA, name: 'Maya' },
  [THEO]: { id: THEO, name: 'Theo' },
  [JUNE]: { id: JUNE, name: 'June' },
};
const as = (me: string) => (id: string | null) =>
  id && people[id] ? { ...people[id], isMe: id === me } : null;

const request = (over: Partial<CoverRequest> = {}): CoverRequest => ({
  id: 'r1',
  eventId: EVENT,
  date: '2026-11-26',
  askedMemberId: THEO,
  askedByMemberId: MAYA,
  status: 'pending',
  createdAt: '2026-11-21T18:00:00.000Z',
  respondedAt: null,
  version: 1,
  ...over,
});

const pickup = (over: Partial<Occurrence> = {}): Occurrence =>
  ({
    key: `${EVENT}:2026-11-26`,
    eventId: EVENT,
    date: '2026-11-26',
    startsAt: '2026-11-27T01:30:00.000Z',
    endsAt: '2026-11-27T01:50:00.000Z',
    allDay: false,
    title: 'Daycare pickup',
    memberIds: [MAYA, JUNE],
    careMemberId: JUNE,
    careAction: 'pick_up',
    carePlace: 'Little Oaks',
    recurring: true,
    skipped: false,
    cover: null,
    location: null,
    notes: null,
    timezone: 'America/Los_Angeles',
    version: 1,
    readOnly: false,
    source: null,
    ...over,
  }) as Occurrence;

const resetWith = (o: Occurrence, extra: Partial<ResetResponse['events']> = {}): ResetResponse =>
  ({
    today: '2026-11-21',
    week: { start: '2026-11-23', end: '2026-11-29', timezone: 'America/Los_Angeles' },
    plan: null,
    events: {
      weekStart: '2026-11-23',
      days: [{ date: '2026-11-26', occurrences: [o], handoffs: [] }],
      needsOwner: [],
      conflicts: [
        {
          id: `handoff_conflict:${o.key}`,
          type: 'handoff_conflict',
          memberId: MAYA,
          occurrenceKey: o.key,
          eventId: EVENT,
          conflictingOccurrenceKey: 'meeting:2026-11-26',
          conflictingEventId: 'meeting',
          time: o.startsAt,
          text: 'Clash',
        },
      ],
      ...extra,
    },
    unresolved: [
      { type: 'handoff_conflict', occurrenceKey: o.key, memberId: MAYA, time: o.startsAt },
    ],
    decisions: [],
  }) as unknown as ResetResponse;

describe('cover requests (only the asked adult’s yes hands a handoff over)', () => {
  it('tells the asker, the asked and anyone else apart', () => {
    const o = { coverRequest: request() };
    expect(requestView(o, MAYA)).toMatchObject({ kind: 'mine' });
    expect(requestView(o, THEO)).toMatchObject({ kind: 'forMe' });
    expect(requestView(o, JUNE)).toMatchObject({ kind: 'others' });
    expect(requestView({ coverRequest: null }, MAYA)).toEqual({ kind: 'none' });
    expect(requestView({}, MAYA)).toEqual({ kind: 'none' });
    // Only a pending one counts as waiting.
    expect(requestView({ coverRequest: request({ status: 'declined' }) }, MAYA)).toEqual({
      kind: 'none',
    });
    expect(waitingWords('Theo')).toBe('Asked Theo · waiting');
  });

  it('marks an occurrence as asked without changing who has it, and puts it back exactly', () => {
    const o = pickup();
    const before = resetWith(o);
    const asked = withRequest(before, o.key, request());
    const after = asked.events.days[0]?.occurrences[0] as Occurrence & {
      coverRequest?: CoverRequest;
    };
    expect(after.coverRequest?.askedMemberId).toBe(THEO);
    expect(after.memberIds).toEqual([MAYA, JUNE]);
    expect(asked.events.conflicts).toHaveLength(1);

    // An optimistic cover that the server refused: the occurrence, its clash and its
    // unresolved entry come back; other changes made meanwhile stay.
    const optimistic: ResetResponse = {
      ...asked,
      meals: [{ id: 'm1' } as ResetResponse['meals'][number]],
      events: {
        ...asked.events,
        days: [
          {
            date: '2026-11-26',
            occurrences: [pickup({ memberIds: [THEO, JUNE] })],
            handoffs: [],
          },
        ],
        conflicts: [],
      },
      unresolved: [],
    };
    const restored = restoreOccurrence(optimistic, before, o.key);
    expect(restored.events.days[0]?.occurrences[0]?.memberIds).toEqual([MAYA, JUNE]);
    expect(restored.events.conflicts.map((c) => c.occurrenceKey)).toEqual([o.key]);
    expect(restored.unresolved).toHaveLength(1);
    expect(restored.meals).toHaveLength(1);
  });

  it('says what changed in plain words, and never offers a retry that cannot work', () => {
    expect(coverRefusal('already_covered')).toBe('Someone already covered this.');
    expect(coverRefusal('occurrence_skipped')).toMatch(/skipped/);
    expect(coverRefusal('request_closed', { asked: 'Theo' })).toBe('Theo already answered.');
    expect(coverRefusal('request_closed', { asker: 'Maya' })).toBe(
      'Maya already took that request back.',
    );
    expect(coverRefusal('use_request')).toMatch(/Ask them/);
    expect(coverRefusal('hand_back')).toMatch(/only they can take it back/);
    expect(coverRefusal('network_error')).toBeNull();
    for (const code of [
      'already_covered',
      'request_pending',
      'request_closed',
      'use_request',
      'hand_back',
    ]) {
      expect(STALE_CODES.has(code)).toBe(true);
    }
    expect(STALE_CODES.has('request_failed')).toBe(false);
  });

  it('notices when what’s waiting changes (asked, or answered)', () => {
    const empty = { askedOfMe: [], askedByMe: [] };
    const one = { askedOfMe: [], askedByMe: [request()] };
    expect(requestsKey(empty)).toBe('');
    expect(requestsKey(one)).not.toBe(requestsKey(empty));
    // The same requests in another order are the same.
    const two = { askedOfMe: [request({ id: 'r2' })], askedByMe: [request()] };
    const swapped = { askedOfMe: [request()], askedByMe: [request({ id: 'r2' })] };
    expect(requestsKey(two)).toBe(requestsKey(swapped));
  });

  it('finds the asked adult’s decline in the activity feed', () => {
    const r = request();
    const declined: ActivityEntry = {
      id: '9',
      at: '2026-11-21T18:05:00.000Z',
      actorMemberId: THEO,
      action: 'event.cover_declined',
      entityType: 'event',
      entityId: EVENT,
      title: 'Daycare pickup',
      memberId: THEO,
    };
    expect(declineIn([declined], r)).toBe(declined);
    // Accepted, someone else's, older than the request, or another event: not a decline.
    expect(declineIn([{ ...declined, action: 'event.cover_accepted' }], r)).toBeNull();
    expect(declineIn([{ ...declined, actorMemberId: MAYA }], r)).toBeNull();
    expect(declineIn([{ ...declined, at: '2026-11-21T17:00:00.000Z' }], r)).toBeNull();
    expect(declineIn([{ ...declined, entityId: 'other' }], r)).toBeNull();
  });
});

describe('what the other adult did, in words', () => {
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: '1',
    at: '2026-11-21T18:00:00.000Z',
    actorMemberId: MAYA,
    action: 'task.completed',
    entityType: 'event',
    entityId: EVENT,
    title: 'Daycare pickup',
    memberId: null,
    ...over,
  });

  it('says asked, accepted and declined, and decisions voted on and settled', () => {
    const theo = as(THEO);
    expect(activityWords(entry({ action: 'event.cover_requested', memberId: THEO }), theo)).toEqual(
      { who: 'Maya', rest: 'asked you to cover Daycare pickup' },
    );
    expect(
      activityWords(
        entry({ action: 'event.cover_accepted', actorMemberId: THEO, memberId: THEO }),
        as(MAYA),
      ),
    ).toEqual({ who: 'Theo', rest: 'said yes: covering Daycare pickup' });
    expect(
      activityWords(
        entry({ action: 'event.cover_declined', actorMemberId: THEO, memberId: THEO }),
        as(MAYA),
      ),
    ).toEqual({ who: 'Theo', rest: 'can’t make it: Daycare pickup' });
    const vote = entry({
      action: 'decision.voted',
      entityType: 'decision',
      title: 'Which preschool for June next fall?',
    });
    expect(activityWords(vote, theo)?.rest).toBe('voted on “Which preschool for June next fall?”');
    expect(activityWords({ ...vote, action: 'decision.decided' }, theo)?.rest).toBe(
      'settled “Which preschool for June next fall?”',
    );
    expect(activityLink(vote)).toBe('/decisions');
    expect(activityLink(entry({ entityType: 'work_item', entityId: 'w1' }))).toEqual({
      pathname: '/item/[id]',
      params: { id: 'w1' },
    });
    expect(activityLink(entry({}))).toBeNull();
  });

  it('leaves out what it can’t say, instead of breaking the list', () => {
    expect(activityWords(entry({ action: 'something.new' }), as(THEO))).toBeNull();
  });
});

describe('refreshes never land on top of a newer change', () => {
  it('drops a refresh that started before a write, even if it answers after the write', () => {
    const f = createFreshness();
    const stale = f.beginRead();
    f.beginWrite();
    f.endWrite();
    expect(f.accept(stale)).toBe(false);
    const after = f.beginRead();
    expect(f.accept(after)).toBe(true);
  });

  it('drops a refresh that answers while a write is still on its way', () => {
    const f = createFreshness();
    f.beginWrite();
    const during = f.beginRead();
    expect(f.writing).toBe(true);
    expect(f.accept(during)).toBe(false);
    f.endWrite();
    expect(f.writing).toBe(false);
    expect(f.accept(during)).toBe(false);
  });

  it('drops an older refresh that answers after a newer one', () => {
    const f = createFreshness();
    const first = f.beginRead();
    const second = f.beginRead();
    expect(f.accept(second)).toBe(true);
    expect(f.accept(first)).toBe(false);
  });
});

describe('the Weekly Reset’s notes', () => {
  const plan = (notes: string | null, notesVersion: number): PlanWithNotes =>
    ({
      id: 'p1',
      weekStart: '2026-11-23',
      notes,
      notesVersion,
      committedAt: null,
      committedByMemberId: null,
      version: 1,
    }) as PlanWithNotes;

  it('starts from a kept draft (it survives leaving), else from the plan', () => {
    expect(initialNotes(plan('Swap Wednesday', 2), null)).toEqual({
      text: 'Swap Wednesday',
      base: 2,
      dirty: false,
      conflict: null,
    });
    expect(initialNotes(null, { text: 'Half typed', base: 0 })).toMatchObject({
      text: 'Half typed',
      base: 0,
      dirty: true,
    });
    // A kept draft that was saved meanwhile is just the plan's notes.
    expect(initialNotes(plan('Done', 1), { text: 'Done', base: 0 })).toMatchObject({
      dirty: false,
      base: 1,
    });
  });

  it('follows the other adult’s save, but never while typing here', () => {
    const s = initialNotes(plan('A', 1), null);
    expect(notesFromServer(s, plan('B', 2))).toMatchObject({ text: 'B', base: 2 });
    const typing = notesTyped(s, 'A and more');
    expect(notesFromServer(typing, plan('B', 2))).toBe(typing);
    // The same version is what this phone saved: the field keeps its text as typed.
    const trailing = { ...s, text: 'A ' };
    expect(notesFromServer(trailing, plan('A', 1))).toBe(trailing);
  });

  it('saves with the version the edit started from; typing since stays a draft', () => {
    const s = notesTyped(initialNotes(plan(null, 0), null), 'Theo has Wednesday');
    const saved = notesSaved(s, plan('Theo has Wednesday', 1), 'Theo has Wednesday');
    expect(saved).toMatchObject({ base: 1, dirty: false });
    const more = notesTyped(s, 'Theo has Wednesday, Maya Friday');
    expect(notesSaved(more, plan('Theo has Wednesday', 1), 'Theo has Wednesday')).toMatchObject({
      base: 1,
      dirty: true,
    });
  });

  it('shows both versions on a conflict: keep mine saves over theirs; use theirs drops mine', () => {
    const mine = notesTyped(initialNotes(plan(null, 0), null), 'Maya: dentist Tuesday');
    const conflict = notesConflict(mine, plan('Theo: swim Saturday', 1), 'Theo');
    expect(conflict.conflict).toEqual({
      theirs: 'Theo: swim Saturday',
      theirsVersion: 1,
      by: 'Theo',
    });
    expect(keepMine(conflict)).toMatchObject({
      text: 'Maya: dentist Tuesday',
      base: 1,
      dirty: true,
      conflict: null,
    });
    expect(takeTheirs(conflict)).toEqual({
      text: 'Theo: swim Saturday',
      base: 1,
      dirty: false,
      conflict: null,
    });
    // The same words on both phones: nothing to choose.
    expect(notesConflict(mine, plan('Maya: dentist Tuesday ', 3), 'Theo')).toMatchObject({
      conflict: null,
      base: 3,
      dirty: false,
    });
  });
});

describe('the week on Today and in the Week', () => {
  it('opens the coming week on a Sunday, and the asked week otherwise', () => {
    expect(weekToOpen('2026-11-22')).toBe('2026-11-23'); // Sunday → next Monday
    expect(weekToOpen('2026-11-21')).toBe('2026-11-16'); // Saturday → this week
    expect(weekToOpen('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekToOpen('2026-11-22', '2026-11-19')).toBe('2026-11-16'); // a date asked for
    expect(weekToOpen('2026-11-22', 'nonsense')).toBe('2026-11-23');
    expect(weekLabel('2026-11-23', '2026-11-22')).toBe('Next week');
    expect(weekLabel('2026-11-16', '2026-11-22')).toBe('This week');
    expect(weekLabel('2026-11-30', '2026-11-22')).toBeNull();
  });

  it('puts the plan’s notes, open decisions and what needs someone on Today', () => {
    const o = pickup();
    const week = {
      ...resetWith(o),
      plan: { notes: ' Theo takes Wednesday ', committedAt: '2026-11-15T20:00:00Z' },
      decisions: [{ id: 'd1' }, { id: 'd2' }],
    } as unknown as ResetResponse;
    const now = new Date('2026-11-21T18:00:00Z').getTime();
    expect(planFacts(week, null, now)).toEqual({
      notes: 'Theo takes Wednesday',
      notesFor: 'this',
      decisionsOpen: 2,
      care: { count: 1, first: '2026-11-26' },
    });
    // On the weekend, once next week has a plan, its notes and its open handoffs show.
    const next = {
      ...resetWith(
        pickup({
          key: `${EVENT}:2026-11-30`,
          date: '2026-11-30',
          startsAt: '2026-12-01T01:30:00Z',
        }),
      ),
      plan: { notes: 'Grandma visits', committedAt: '2026-11-21T19:00:00Z' },
      decisions: [{ id: 'd1' }, { id: 'd2' }],
    } as unknown as ResetResponse;
    expect(planFacts(week, next, now)).toMatchObject({
      notes: 'Grandma visits',
      notesFor: 'next',
      care: { count: 2, first: '2026-11-26' },
    });
    // What's already past isn't open any more.
    expect(planFacts(week, null, new Date('2026-11-28T00:00:00Z').getTime())?.care).toEqual({
      count: 0,
      first: null,
    });
    expect(planFacts(null, null, now)).toBeNull();
  });
});
