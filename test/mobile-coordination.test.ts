import { describe, expect, it } from 'vitest';
import {
  activityLink,
  activityWords,
  coverRefusal,
  declineIn,
  requestView,
  STALE_CODES,
  waitingWords,
  type ActivityEntry,
  type CoverRequest,
} from '../apps/mobile/components/reset/coordination';

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

  it('says what changed in plain words, and never offers a retry that cannot work', () => {
    expect(coverRefusal('already_covered')).toBe('Someone already covered this.');
    expect(coverRefusal('occurrence_skipped')).toMatch(/skipped/);
    expect(coverRefusal('request_closed', { asked: 'Theo' })).toBe('Theo already answered.');
    expect(coverRefusal('request_closed', { asker: 'Maya' })).toBe(
      'Maya already took that request back.',
    );
    expect(coverRefusal('use_request')).toMatch(/Ask them/);
    expect(coverRefusal('network_error')).toBeNull();
    for (const code of ['already_covered', 'request_pending', 'request_closed', 'use_request']) {
      expect(STALE_CODES.has(code)).toBe(true);
    }
    expect(STALE_CODES.has('request_failed')).toBe(false);
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
