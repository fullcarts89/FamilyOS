import { describe, expect, it } from 'vitest';
import type { AwayPeriodView, VisitorView } from '../apps/mobile/lib/api';
import {
  awayLine,
  awayRange,
  coverLine,
  givenBack,
  handoverDone,
  handoverNudge,
  townWords,
  visitorLine,
  weekLines,
} from '../apps/mobile/lib/in-town';

// Who's in town in the app's words (apps/mobile/lib/in-town.ts). A synthetic household on
// Monday 2026-11-16: Maya, Theo, and June.
const TODAY = '2026-11-16';
const MAYA = '00000000-0000-4000-8000-000000000001';
const THEO = '00000000-0000-4000-8000-000000000002';
const JUNE = '00000000-0000-4000-8000-000000000003';
const NAMES: Record<string, string> = { [MAYA]: 'Maya', [THEO]: 'Theo', [JUNE]: 'June' };

type Who = Parameters<typeof awayLine>[1];
const peopleAs = (meId: string): Who => ({
  byId: (id) =>
    id && NAMES[id]
      ? ({ id, name: NAMES[id], isMe: id === meId } as ReturnType<Who['byId']>)
      : null,
});

const away = (overrides: Partial<AwayPeriodView> = {}): AwayPeriodView => ({
  id: 'a1',
  memberId: THEO,
  startsOn: '2026-11-16',
  endsOn: '2026-11-19',
  backOn: '2026-11-20',
  coverMemberId: MAYA,
  createdByMemberId: MAYA,
  version: 1,
  ...overrides,
});
const visitor = (overrides: Partial<VisitorView> = {}): VisitorView => ({
  id: 'v1',
  name: 'Grandma',
  arrivesOn: '2026-11-21',
  leavesOn: '2026-11-24',
  notes: null,
  createdByMemberId: MAYA,
  version: 1,
  ...overrides,
});

describe('who’s in town, in words', () => {
  const me = peopleAs(MAYA);

  it('says who is away and when they are back', () => {
    expect(awayLine(away(), me, TODAY)).toBe('Theo’s away, back Fri');
    expect(awayLine(away({ memberId: MAYA }), me, TODAY)).toBe('You’re away, back Fri');
    expect(awayLine(away({ endsOn: null, backOn: null }), me, TODAY)).toBe('Theo’s away');
    expect(awayLine(away({ startsOn: '2026-11-18', backOn: '2026-11-17' }), me, TODAY)).toBe(
      'Theo’s away from Wed, back tomorrow',
    );
    expect(awayLine(away({ memberId: JUNE, coverMemberId: null }), me, TODAY)).toBe(
      'June’s away, back Fri',
    );
  });

  it('says who is visiting, arriving or leaving', () => {
    expect(visitorLine(visitor(), TODAY)).toBe('Grandma arrives Sat');
    expect(visitorLine(visitor({ arrivesOn: TODAY }), TODAY)).toBe('Grandma is here until Nov 24');
    expect(visitorLine(visitor({ arrivesOn: '2026-11-14', leavesOn: TODAY }), TODAY)).toBe(
      'Grandma leaves today',
    );
  });

  it('joins everything on one line, or nothing when everyone is home', () => {
    expect(townWords({ away: [away()], visiting: [], arriving: [visitor()] }, me, TODAY)).toBe(
      'Theo’s away, back Fri · Grandma arrives Sat',
    );
    expect(
      townWords(
        {
          away: [],
          leaving: [away({ memberId: MAYA, startsOn: '2026-11-17', backOn: '2026-11-20' })],
          visiting: [],
          arriving: [],
        },
        me,
        TODAY,
      ),
    ).toBe('You’re away from tomorrow, back Fri');
    expect(townWords({ away: [], visiting: [], arriving: [] }, me, TODAY)).toBeNull();
    expect(townWords(undefined, me, TODAY)).toBeNull();
  });

  it('describes ranges and who covers', () => {
    expect(awayRange(away(), TODAY)).toBe('Mon, Nov 16 to Thu, Nov 19');
    expect(awayRange(away({ endsOn: '2026-11-16' }), TODAY)).toBe('Mon, Nov 16');
    expect(awayRange(away({ endsOn: null }), TODAY)).toBe('From Mon, Nov 16, no end yet');
    expect(coverLine(away(), me)).toBe('You cover');
    expect(coverLine(away(), peopleAs(THEO))).toBe('Maya covers');
    expect(coverLine(away({ coverMemberId: null }), me)).toBe('Nobody covers');
  });

  it('nudges about a hand-over and confirms it plainly', () => {
    const h = { memberId: THEO, coverMemberId: MAYA, count: 3 };
    expect(handoverNudge(h, me)).toBe(
      '3 of Theo’s things are due while Theo’s away. They can go to you.',
    );
    expect(handoverNudge({ ...h, count: 1 }, peopleAs(THEO))).toBe(
      '1 of your things is due while you’re away. It can go to Maya.',
    );
    expect(handoverNudge({ ...h, count: 0 }, me)).toBeNull();
    expect(handoverDone(2, away(), me)).toBe('2 things go to you while Theo’s away.');
    expect(handoverDone(1, away(), peopleAs(THEO))).toBe('1 thing goes to Maya while you’re away.');
    expect(givenBack(2, THEO, me)).toBe('2 things went back to Theo.');
    expect(givenBack(0, THEO, me)).toBeNull();
  });

  it('lists the week for the Weekly Reset', () => {
    expect(
      weekLines(
        {
          away: [away(), away({ id: 'a2', memberId: JUNE, startsOn: '2026-11-10', endsOn: null })],
          visiting: [visitor()],
          arriving: [visitor({ id: 'v2', name: 'Ana', arrivesOn: '2026-11-25' })],
        },
        me,
        TODAY,
      ),
    ).toEqual([
      'Theo away Mon–Thu; you cover',
      'June away all week; you cover',
      'Grandma visiting Sat–Sun',
      'Ana arrives Wed Nov 25',
    ]);
  });
});
