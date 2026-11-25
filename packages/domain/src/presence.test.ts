import { describe, expect, it } from 'vitest';
import { expandEvents, type EventSeries } from './events';
import {
  awayOn,
  backOn,
  checkRange,
  defaultCover,
  givesBack,
  handoverSuggestions,
  periodsOverlap,
  planPayback,
  presenceBetween,
  routeAwayOccurrences,
  routeOn,
  type AwayPeriod,
  type HandoverItem,
  type Visitor,
} from './presence';
import { buildRhythm } from './rhythm';
import { buildWeekRhythm } from './reset';

const TZ = 'America/Los_Angeles';
const SAM = 'sam';
const THEO = 'theo';
const JUNE = 'june';
const caredFor = (id: string) => id === JUNE;

const period = (overrides: Partial<AwayPeriod> = {}): AwayPeriod => ({
  id: 'p1',
  memberId: SAM,
  startsOn: '2026-12-01',
  endsOn: '2026-12-04',
  coverMemberId: THEO,
  ...overrides,
});

let seq = 0;
const item = (overrides: Partial<HandoverItem> = {}): HandoverItem => ({
  id: `i${(seq += 1)}`,
  type: 'task',
  status: 'ready',
  ownerMemberId: SAM,
  visibility: 'household',
  dueOn: '2026-12-02',
  dueAt: null,
  ...overrides,
});

describe('away periods', () => {
  it('checks dates: a last day before the first, or longer than a year, is refused', () => {
    expect(checkRange('2026-12-01', '2026-12-04')).toBeNull();
    expect(checkRange('2026-12-01', null)).toBeNull();
    expect(checkRange('2026-12-01', '2026-12-01')).toBeNull();
    expect(checkRange('2026-12-04', '2026-12-01')).toBe('ends_before_start');
    expect(checkRange('2026-12-01', '2027-12-02')).toBe('too_long');
    expect(checkRange('2026-02-30', null)).toBe('invalid_date');
    expect(checkRange('Dec 1', null)).toBe('invalid_date');
  });

  it('counts the first and last days as away, and the day after as back', () => {
    const p = period();
    expect(awayOn([p], SAM, '2026-11-30')).toBeNull();
    expect(awayOn([p], SAM, '2026-12-01')).toBe(p);
    expect(awayOn([p], SAM, '2026-12-04')).toBe(p);
    expect(awayOn([p], SAM, '2026-12-05')).toBeNull();
    expect(backOn(p)).toBe('2026-12-05');
    expect(backOn(period({ endsOn: null }))).toBeNull();
    expect(awayOn([period({ endsOn: null })], SAM, '2027-06-01')).not.toBeNull();
    expect(awayOn([p], THEO, '2026-12-02')).toBeNull();
  });

  it('tells overlapping periods apart from ones that only touch', () => {
    const a = { startsOn: '2026-12-01', endsOn: '2026-12-04' };
    expect(periodsOverlap(a, { startsOn: '2026-12-04', endsOn: '2026-12-06' })).toBe(true);
    expect(periodsOverlap(a, { startsOn: '2026-12-05', endsOn: '2026-12-06' })).toBe(false);
    expect(periodsOverlap(a, { startsOn: '2026-11-20', endsOn: null })).toBe(true);
    expect(periodsOverlap({ startsOn: '2026-12-10', endsOn: null }, a)).toBe(false);
  });

  it('routes to the cover only while they are home, and never chains covers', () => {
    const sam = period();
    expect(routeOn([sam], SAM, '2026-12-02')).toEqual({
      kind: 'covered',
      periodId: 'p1',
      coverMemberId: THEO,
    });
    expect(routeOn([sam], SAM, '2026-12-05')).toEqual({ kind: 'home' });
    const theo = period({
      id: 'p2',
      memberId: THEO,
      startsOn: '2026-12-03',
      endsOn: null,
      coverMemberId: SAM,
    });
    expect(routeOn([sam, theo], SAM, '2026-12-03')).toEqual({ kind: 'uncovered', periodId: 'p1' });
    expect(routeOn([sam, theo], THEO, '2026-12-03')).toEqual({
      kind: 'uncovered',
      periodId: 'p2',
    });
    expect(routeOn([period({ coverMemberId: null })], SAM, '2026-12-02').kind).toBe('uncovered');
  });

  it('defaults the cover to the only other adult', () => {
    const members = [
      { id: SAM, role: 'owner' },
      { id: THEO, role: 'adult' },
      { id: 'sitter', role: 'caregiver' },
      { id: JUNE, role: 'child' },
    ];
    expect(defaultCover(members, SAM)).toBe(THEO);
    expect(defaultCover(members, 'sitter')).toBeNull();
    expect(defaultCover(members, JUNE)).toBeNull();
    expect(defaultCover([...members, { id: 'ana', role: 'adult' }], SAM)).toBeNull();
  });
});

describe('hand-over suggestions', () => {
  const suggest = (
    items: HandoverItem[],
    extra: Partial<Parameters<typeof handoverSuggestions>[0]> = {},
  ) =>
    handoverSuggestions({
      period: period(),
      periods: [period()],
      items,
      decided: new Set(),
      today: '2026-11-28',
      timeZone: TZ,
      ...extra,
    }).map((s) => s.item.id);

  it('suggests open, shared tasks and issues of theirs due on a day away', () => {
    const due = item({ dueOn: '2026-12-01' });
    const issue = item({ type: 'issue', dueOn: '2026-12-04' });
    const timed = item({ dueOn: null, dueAt: '2026-12-03T17:00:00Z' });
    expect(suggest([due, issue, timed])).toEqual([due.id, timed.id, issue.id]);
  });

  it('leaves the day they are back, undated, private, done and other people’s items alone', () => {
    const items = [
      item({ dueOn: '2026-12-05' }),
      item({ dueOn: '2026-11-30' }),
      item({ dueOn: null }),
      item({ visibility: 'private' }),
      item({ status: 'done_unverified' }),
      item({ status: 'cancelled' }),
      item({ status: 'new' }),
      item({ ownerMemberId: THEO }),
      item({ ownerMemberId: null }),
      item({ type: 'project' }),
      // 01:00 UTC on Dec 5 is still Dec 4 in Los Angeles: a day away.
      item({ id: 'late-evening', dueOn: null, dueAt: '2026-12-05T01:00:00Z' }),
    ];
    expect(suggest(items)).toEqual(['late-evening']);
  });

  it('suggests nothing already moved or kept, nothing late, and nothing on a day the cover is away', () => {
    const kept = item();
    const late = item({ dueOn: '2026-12-01' });
    const coverAway = item({ dueOn: '2026-12-03' });
    const theo = period({ id: 'p2', memberId: THEO, startsOn: '2026-12-03', endsOn: '2026-12-03' });
    expect(
      suggest([kept, late, coverAway], {
        decided: new Set([kept.id]),
        today: '2026-12-02',
        periods: [period(), theo],
      }),
    ).toEqual([]);
  });

  it('suggests everything dated from the first day on while open-ended', () => {
    const far = item({ dueOn: '2027-03-01' });
    expect(
      suggest([far], { period: period({ endsOn: null }), periods: [period({ endsOn: null })] }),
    ).toEqual([far.id]);
  });
});

describe('giving back', () => {
  const before = { startsOn: '2026-12-01', endsOn: '2026-12-06', coverMemberId: THEO };
  it('gives back days no longer away, from today on, when shortened or removed', () => {
    const shorter = { ...before, endsOn: '2026-12-03' };
    expect(givesBack('2026-12-04', before, shorter, '2026-12-02')).toBe(true);
    expect(givesBack('2026-12-03', before, shorter, '2026-12-02')).toBe(false);
    expect(givesBack('2026-12-02', before, null, '2026-12-02')).toBe(true);
    // Already late: it stays with whoever has it.
    expect(givesBack('2026-12-01', before, null, '2026-12-02')).toBe(false);
  });

  it('gives back everything ahead when the cover changes', () => {
    expect(givesBack('2026-12-04', before, { ...before, coverMemberId: 'ana' }, '2026-12-02')).toBe(
      true,
    );
    expect(givesBack('2026-12-04', before, { ...before }, '2026-12-02')).toBe(false);
  });
});

describe('paying a turn back', () => {
  // Bins every day, Sam and Theo taking turns from Monday Nov 30 (index 0 = Sam).
  const rule = { freq: 'daily', interval: 1 } as const;
  const base = {
    rule,
    startOn: '2026-11-30',
    assignment: { rotation: [SAM, THEO], ownerMemberId: null },
    exceptions: [],
    awayMemberId: SAM,
    coverMemberId: THEO,
    periods: [period()],
    backOn: '2026-12-05',
  };

  it('gives the away member the cover’s first turn after they are back', () => {
    // Sam's turn on Dec 2 (index 2) goes to Theo; Theo's first turn from Dec 5 is Dec 5 (index 5).
    expect(planPayback({ ...base, takenIndex: 2 })).toEqual({
      index: 5,
      date: '2026-12-05',
      ownerMemberId: SAM,
    });
  });

  it('pays two taken turns with two turns, and skips skipped ones', () => {
    const first = planPayback({ ...base, takenIndex: 2 });
    const exceptions = [
      { index: first?.index ?? -1, kind: 'owner' as const, ownerMemberId: SAM },
      { index: 7, kind: 'skip' as const },
    ];
    expect(planPayback({ ...base, exceptions, takenIndex: 4 })?.index).toBe(9);
  });

  it('has nothing to pay back while open-ended, or when they don’t take turns together', () => {
    expect(planPayback({ ...base, takenIndex: 2, backOn: null })).toBeNull();
    expect(
      planPayback({
        ...base,
        takenIndex: 2,
        assignment: { rotation: [], ownerMemberId: SAM },
      }),
    ).toBeNull();
  });
});

describe('care handoffs while someone is away', () => {
  const series = (overrides: Partial<EventSeries> = {}): EventSeries => ({
    id: 'drop',
    title: 'Drop-off',
    kind: 'childcare',
    startsAt: '2026-11-30T16:15:00Z',
    endsAt: '2026-11-30T16:15:00Z',
    allDay: false,
    timezone: TZ,
    recurrence: { freq: 'daily', interval: 1 },
    recursUntil: null,
    memberIds: [SAM, JUNE],
    careMemberId: JUNE,
    careAction: 'drop_off',
    carePlace: 'School',
    exceptions: [],
    ...overrides,
  });
  const expand = (s: EventSeries, periods: AwayPeriod[]) =>
    routeAwayOccurrences(
      expandEvents([s], { from: '2026-11-30', to: '2026-12-06', timeZone: TZ }, caredFor),
      periods,
      caredFor,
    );

  it('puts the cover down for it on days away, and leaves the other days alone', () => {
    const days = expand(series(), [period()]);
    const byDate = new Map(days.map((o) => [o.date, o]));
    expect(byDate.get('2026-11-30')?.memberIds).toEqual([SAM, JUNE]);
    expect(byDate.get('2026-11-30')?.away).toBeNull();
    expect(byDate.get('2026-12-02')?.memberIds).toEqual([THEO, JUNE]);
    expect(byDate.get('2026-12-02')?.away).toEqual({ awayMemberIds: [SAM], coverMemberId: THEO });
    expect(byDate.get('2026-12-05')?.memberIds).toEqual([SAM, JUNE]);
  });

  it('keeps it with another adult already on it, and with nobody when both are away', () => {
    const both = expand(series({ memberIds: [SAM, THEO, JUNE] }), [period()]);
    expect(both.find((o) => o.date === '2026-12-02')?.memberIds).toEqual([THEO, JUNE]);
    expect(both.find((o) => o.date === '2026-12-02')?.away?.coverMemberId).toBeNull();

    const theoAway = period({ id: 'p2', memberId: THEO, coverMemberId: SAM });
    const nobody = expand(series(), [period(), theoAway]).find((o) => o.date === '2026-12-02');
    expect(nobody?.memberIds).toEqual([JUNE]);
    const rhythm = buildRhythm({
      date: '2026-12-02',
      today: '2026-12-02',
      timeZone: TZ,
      members: [
        { id: SAM, role: 'owner', displayName: 'Sam' },
        { id: THEO, role: 'adult', displayName: 'Theo' },
        { id: JUNE, role: 'child', displayName: 'June' },
      ],
      occurrences: nobody ? [nobody] : [],
      tasks: [],
    });
    expect(rhythm.headsUps.map((h) => h.type)).toEqual(['care_unassigned']);
  });

  it('lets a cover or skip someone set win', () => {
    const covered = expand(
      series({ exceptions: [{ date: '2026-12-02', kind: 'cover', coverMemberId: 'ana' }] }),
      [period()],
    ).find((o) => o.date === '2026-12-02');
    expect(covered?.memberIds).toEqual(['ana', JUNE]);
    expect(covered?.away).toBeNull();
  });
});

describe('a child or pet away', () => {
  const members = [
    { id: SAM, role: 'owner' as const, displayName: 'Sam' },
    { id: THEO, role: 'adult' as const, displayName: 'Theo' },
    { id: JUNE, role: 'child' as const, displayName: 'June' },
  ];
  const juneAway = period({ id: 'pj', memberId: JUNE, coverMemberId: null });
  const drop = expandEvents(
    [
      {
        id: 'drop',
        title: 'Drop-off',
        kind: 'childcare',
        startsAt: '2026-12-02T16:15:00Z',
        endsAt: '2026-12-02T16:15:00Z',
        allDay: false,
        timezone: TZ,
        recurrence: null,
        recursUntil: null,
        memberIds: [JUNE],
        careMemberId: JUNE,
        careAction: 'drop_off',
        carePlace: 'School',
        exceptions: [],
      },
    ],
    { from: '2026-12-02', to: '2026-12-02', timeZone: TZ },
    caredFor,
  );

  it('nudges about a handoff still on, instead of saying nobody is down for it', () => {
    const rhythm = buildRhythm({
      date: '2026-12-02',
      today: '2026-12-02',
      timeZone: TZ,
      members,
      occurrences: drop,
      tasks: [],
      away: [juneAway],
    });
    expect(rhythm.headsUps).toEqual([
      expect.objectContaining({
        type: 'care_while_away',
        careMemberId: JUNE,
        date: '2026-12-02',
        text: 'June is away, but the drop-off at 8:15 AM is still on.',
      }),
    ]);
    expect(rhythm.lanes.find((l) => l.memberId === JUNE)?.away?.id).toBe('pj');
    expect(rhythm.lanes.find((l) => l.memberId === SAM)?.away).toBeNull();
  });

  it('collects the nudges across the Weekly Reset week', () => {
    const week = buildWeekRhythm({
      weekStart: '2026-11-30',
      timeZone: TZ,
      members,
      occurrences: drop,
      away: [juneAway],
    });
    expect(week.whileAway.map((h) => h.occurrenceKey)).toEqual(['drop:2026-12-02']);
    expect(week.needsOwner).toEqual([]);
  });
});

describe('who’s in town', () => {
  const visitor = (overrides: Partial<Visitor>): Visitor => ({
    id: 'v',
    name: 'Grandma',
    arrivesOn: '2026-12-10',
    leavesOn: '2026-12-14',
    notes: null,
    ...overrides,
  });

  it('shows who is away and here, and visitors arriving within a week', () => {
    const view = presenceBetween(
      '2026-12-03',
      '2026-12-03',
      [period(), period({ id: 'p2', memberId: THEO, startsOn: '2026-12-08', endsOn: null })],
      [
        visitor({ id: 'here', arrivesOn: '2026-12-01', leavesOn: '2026-12-03' }),
        visitor({ id: 'soon', arrivesOn: '2026-12-10' }),
        visitor({ id: 'later', arrivesOn: '2026-12-11' }),
        visitor({ id: 'gone', arrivesOn: '2026-11-20', leavesOn: '2026-12-02' }),
      ],
    );
    expect(view.away.map((p) => p.id)).toEqual(['p1']);
    // Theo leaves on the 8th, within a week.
    expect(view.leaving.map((p) => p.id)).toEqual(['p2']);
    expect(view.visiting.map((v) => v.id)).toEqual(['here']);
    expect(view.arriving.map((v) => v.id)).toEqual(['soon']);
  });

  it('covers a whole week for the Weekly Reset', () => {
    const view = presenceBetween(
      '2026-11-30',
      '2026-12-06',
      [period({ startsOn: '2026-12-06', endsOn: null })],
      [visitor({ id: 'next-week', arrivesOn: '2026-12-13' })],
    );
    expect(view.away).toHaveLength(1);
    expect(view.arriving.map((v) => v.id)).toEqual(['next-week']);
  });
});
