import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { expandEvents, type EventSeries } from './events';
import type { CalendarRule } from './recurrence';
import { buildRhythm, formatClock, formatDay, type RhythmMember, type RhythmTask } from './rhythm';

// Thursday 2026-11-19 in Los Angeles (PST, UTC−8).
const LA = 'America/Los_Angeles';
const DATE = '2026-11-19';
const members: RhythmMember[] = [
  { id: 'june', role: 'child', displayName: 'June' },
  { id: 'maya', role: 'owner', displayName: 'Maya' },
  { id: 'biscuit', role: 'pet', displayName: 'Biscuit' },
  { id: 'theo', role: 'adult', displayName: 'Theo' },
];
const caredFor = (id: string) => id === 'june' || id === 'biscuit';
const at = (time: string, date = DATE) =>
  Temporal.Instant.from(`${date}T${time}:00-08:00`).toString();

const event = (id: string, overrides: Partial<EventSeries>): EventSeries => ({
  id,
  title: id,
  kind: 'other',
  startsAt: at('09:00'),
  endsAt: at('10:00'),
  allDay: false,
  timezone: LA,
  recurrence: null,
  recursUntil: null,
  memberIds: [],
  careMemberId: null,
  careAction: null,
  carePlace: null,
  exceptions: [],
  ...overrides,
});
const weekdays: CalendarRule = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
// The series start on Monday; Thursday is a later occurrence.
const dropOff = event('dropoff', {
  title: 'Daycare drop-off',
  kind: 'childcare',
  startsAt: at('08:15', '2026-11-16'),
  endsAt: at('08:35', '2026-11-16'),
  recurrence: weekdays,
  memberIds: ['theo', 'june'],
  careMemberId: 'june',
  careAction: 'drop_off',
  carePlace: 'Little Oaks',
});
const pickUp = event('pickup', {
  title: 'Daycare pickup',
  kind: 'childcare',
  startsAt: at('17:30', '2026-11-16'),
  endsAt: at('17:50', '2026-11-16'),
  recurrence: weekdays,
  memberIds: ['maya', 'june'],
  careMemberId: 'june',
  careAction: 'pick_up',
  carePlace: 'Little Oaks',
});
const planning = event('planning', {
  title: 'Quarterly planning',
  kind: 'work',
  startsAt: at('14:00'),
  endsAt: at('18:00'),
  memberIds: ['maya'],
});

const task = (id: string, overrides: Partial<RhythmTask>): RhythmTask => ({
  id,
  title: id,
  status: 'ready',
  ownerMemberId: null,
  subjectMemberId: null,
  dueOn: null,
  dueAt: null,
  recurrenceRuleId: null,
  ...overrides,
});

function rhythm(
  series: EventSeries[],
  extra: {
    now?: string;
    tasks?: RhythmTask[];
    date?: string;
    today?: string;
    decisions?: { id: string; title: string; dueOn: string }[];
  } = {},
) {
  const date = extra.date ?? DATE;
  return buildRhythm({
    date,
    today: extra.today ?? date,
    timeZone: LA,
    members,
    occurrences: expandEvents(series, { from: date, to: date, timeZone: LA }, caredFor),
    tasks: extra.tasks ?? [],
    ...(extra.now && { now: extra.now }),
    ...(extra.decisions && { decisions: extra.decisions }),
  });
}

describe('rhythm lanes', () => {
  it('orders lanes adults, then children, then pets, and places occurrences in them', () => {
    const view = rhythm([dropOff, pickUp, planning]);
    expect(view.lanes.map((l) => [l.memberId, l.caredFor])).toEqual([
      ['maya', false],
      ['theo', false],
      ['june', true],
      ['biscuit', true],
    ]);
    const keys = (id: string) =>
      view.lanes.find((l) => l.memberId === id)?.occurrences.map((o) => o.key);
    expect(keys('maya')).toEqual(['planning:2026-11-19', 'pickup:2026-11-19']);
    expect(keys('theo')).toEqual(['dropoff:2026-11-19']);
    expect(keys('june')).toEqual(['dropoff:2026-11-19', 'pickup:2026-11-19']);
    expect(keys('biscuit')).toEqual([]);
  });

  it('puts a child or pet in the lane of an event about them even when not a member', () => {
    const vet = event('vet', { title: 'Vet', memberIds: ['theo'], careMemberId: 'biscuit' });
    const view = rhythm([vet]);
    expect(view.lanes.find((l) => l.memberId === 'biscuit')?.occurrences).toHaveLength(1);
  });
});

describe('location segments and handoffs', () => {
  it('is home until drop-off, at the place until pickup, and home after', () => {
    const view = rhythm([dropOff, pickUp]);
    const june = view.lanes.find((l) => l.memberId === 'june');
    expect(june?.segments).toEqual([
      {
        startsAt: at('00:00'),
        endsAt: at('08:15'),
        location: { kind: 'home' },
        withMemberIds: ['theo'],
      },
      {
        startsAt: at('08:15'),
        endsAt: at('17:30'),
        location: { kind: 'away', place: 'Little Oaks' },
        withMemberIds: [],
      },
      {
        startsAt: at('17:30'),
        endsAt: at('00:00', '2026-11-20'),
        location: { kind: 'home' },
        withMemberIds: ['maya'],
      },
    ]);
    expect(view.handoffs).toEqual([
      {
        time: at('08:15'),
        occurrenceKey: 'dropoff:2026-11-19',
        eventId: 'dropoff',
        careMemberId: 'june',
        action: 'drop_off',
        from: { kind: 'member', memberId: 'theo' },
        to: { kind: 'place', place: 'Little Oaks' },
        place: 'Little Oaks',
        byMemberIds: ['theo'],
      },
      {
        time: at('17:30'),
        occurrenceKey: 'pickup:2026-11-19',
        eventId: 'pickup',
        careMemberId: 'june',
        action: 'pick_up',
        from: { kind: 'place', place: 'Little Oaks' },
        to: { kind: 'member', memberId: 'maya' },
        place: 'Little Oaks',
        byMemberIds: ['maya'],
      },
    ]);
    // Biscuit has no handoffs: nothing is claimed about where he is.
    expect(view.lanes.find((l) => l.memberId === 'biscuit')?.segments).toEqual([]);
  });

  it('starts the day away when the first handoff is a pickup', () => {
    const fromGrandma = event('grandma', {
      startsAt: at('10:00'),
      endsAt: at('10:30'),
      memberIds: ['theo'],
      careMemberId: 'june',
      careAction: 'pick_up',
      carePlace: "Grandma's",
    });
    const june = rhythm([fromGrandma]).lanes.find((l) => l.memberId === 'june');
    expect(june?.segments.map((s) => [s.location, s.withMemberIds])).toEqual([
      [{ kind: 'away', place: "Grandma's" }, []],
      [{ kind: 'home' }, ['theo']],
    ]);
  });

  it('ignores skipped handoffs and follows a cover', () => {
    const covered = {
      ...pickUp,
      exceptions: [{ date: DATE, kind: 'cover' as const, coverMemberId: 'theo' }],
    };
    const view = rhythm([dropOff, covered, planning]);
    expect(view.handoffs[1]?.to).toEqual({ kind: 'member', memberId: 'theo' });
    expect(view.headsUps.filter((h) => h.type === 'handoff_conflict')).toEqual([]);

    const skipped = {
      ...dropOff,
      exceptions: [{ date: DATE, kind: 'skip' as const, coverMemberId: null }],
    };
    const june = rhythm([skipped, pickUp]).lanes.find((l) => l.memberId === 'june');
    expect(june?.segments.map((s) => s.location.kind)).toEqual(['away', 'home']);
  });

  it('spans the whole local day on the 25-hour fall-back day', () => {
    const sunday = event('sun', {
      startsAt: '2026-11-01T17:00:00Z', // 09:00 PST
      endsAt: '2026-11-01T17:30:00Z',
      memberIds: ['maya'],
      careMemberId: 'june',
      careAction: 'drop_off',
      carePlace: 'Grandma',
    });
    const june = rhythm([sunday], { date: '2026-11-01' }).lanes.find((l) => l.memberId === 'june');
    expect(june?.segments.map((s) => [s.startsAt, s.endsAt])).toEqual([
      ['2026-11-01T07:00:00Z', '2026-11-01T17:00:00Z'],
      ['2026-11-01T17:00:00Z', '2026-11-02T08:00:00Z'],
    ]);
  });
});

describe('heads-ups', () => {
  it('flags a pickup that overlaps another event of the adult doing it', () => {
    const view = rhythm([dropOff, pickUp, planning]);
    expect(view.headsUps).toEqual([
      {
        id: 'handoff_conflict:maya:pickup:2026-11-19:planning:2026-11-19',
        type: 'handoff_conflict',
        memberId: 'maya',
        occurrenceKey: 'pickup:2026-11-19',
        eventId: 'pickup',
        conflictingOccurrenceKey: 'planning:2026-11-19',
        conflictingEventId: 'planning',
        time: at('17:30'),
        text: 'Maya has “Quarterly planning” during June’s pickup at 5:30 PM.',
      },
    ]);
  });

  it('does not count events that only touch, or all-day ones', () => {
    const before = event('before', {
      startsAt: at('16:30'),
      endsAt: at('17:30'),
      memberIds: ['maya'],
    });
    const allDay = event('allday', {
      allDay: true,
      startsAt: at('00:00'),
      endsAt: at('00:00', '2026-11-20'),
      memberIds: ['maya'],
    });
    expect(rhythm([pickUp, before, allDay]).headsUps).toEqual([]);
  });

  it('flags a care event nobody is down for, without inventing a handoff adult', () => {
    const nobody = { ...pickUp, memberIds: ['june'] };
    const vet = event('vet', {
      title: 'Vet checkup',
      startsAt: at('11:00'),
      endsAt: at('11:30'),
      careMemberId: 'biscuit',
    });
    const view = rhythm([nobody, vet]);
    expect(view.headsUps.map((h) => [h.type, h.text])).toEqual([
      ['care_unassigned', 'Nobody is down for “Vet checkup” with Biscuit at 11:00 AM.'],
      ['care_unassigned', 'Nobody is down for June’s pickup at 5:30 PM.'],
    ]);
    expect(view.handoffs[0]?.to).toEqual({ kind: 'nobody' });
  });

  it('flags routine occurrences still open after their day, and only those', () => {
    const tasks = [
      task('trash', {
        title: 'Trash and recycling',
        recurrenceRuleId: 'r1',
        ownerMemberId: 'theo',
        dueAt: at('20:00', '2026-11-18'),
      }),
      task('flea', {
        title: 'Biscuit’s flea meds',
        recurrenceRuleId: 'r2',
        dueOn: '2026-11-01',
      }),
      task('done', { recurrenceRuleId: 'r3', dueOn: '2026-11-17', status: 'done_unverified' }),
      task('plain', { dueOn: '2026-11-17' }),
      task('tonight', { recurrenceRuleId: 'r4', dueOn: DATE }),
    ];
    const view = rhythm([], { tasks });
    expect(view.headsUps.map((h) => [h.type, h.text])).toEqual([
      ['overdue_routine', '“Biscuit’s flea meds” was due Sun, Nov 1 and nobody has it yet.'],
      ['overdue_routine', '“Trash and recycling” was due Wed, Nov 18 and is still open for Theo.'],
    ]);
  });

  it('flags open decisions due today or tomorrow', () => {
    const view = rhythm([], {
      decisions: [
        { id: 'd1', title: 'Thanksgiving plans', dueOn: '2026-11-20' },
        { id: 'd2', title: 'Floor tile', dueOn: '2026-11-25' },
        { id: 'd3', title: 'Sitter', dueOn: DATE },
      ],
    });
    expect(view.headsUps.map((h) => h.text)).toEqual([
      'Decide today: “Sitter”.',
      'Decide by tomorrow: “Thanksgiving plans”.',
    ]);
  });

  it('never quotes notes, locations or care places', () => {
    const withNotes = { ...pickUp, carePlace: 'SECRET PLACE' };
    const view = rhythm([withNotes, { ...planning, title: 'Quarterly planning' }]);
    expect(JSON.stringify(view.headsUps.map((h) => h.text))).not.toContain('SECRET');
  });
});

describe('tasks for the day', () => {
  it('groups timed and all-day tasks by owner, and by subject for children and pets', () => {
    const tasks = [
      task('form', { ownerMemberId: 'theo', dueAt: at('08:00') }),
      task('invoice', { title: 'Pay invoice', ownerMemberId: 'maya', dueOn: DATE }),
      task('flea', { ownerMemberId: 'maya', subjectMemberId: 'biscuit', dueOn: DATE }),
      task('library', { dueOn: DATE }),
      task('tomorrow', { ownerMemberId: 'maya', dueOn: '2026-11-20' }),
      task('inbox', { ownerMemberId: 'maya', dueOn: DATE, status: 'new' }),
      task('finished', { ownerMemberId: 'maya', dueOn: DATE, status: 'done_unverified' }),
      // 23:30 PST on the 19th is the 20th in UTC; still today locally.
      task('late', { ownerMemberId: 'theo', dueAt: at('23:30') }),
    ];
    const view = rhythm([], { tasks });
    const lane = (id: string) => view.lanes.find((l) => l.memberId === id)?.tasks;
    expect(lane('theo')?.timed.map((t) => t.id)).toEqual(['form', 'late']);
    expect(lane('maya')?.dueToday.map((t) => t.id)).toEqual(['finished', 'flea', 'invoice']);
    expect(lane('biscuit')?.dueToday.map((t) => t.id)).toEqual(['flea']);
    expect(view.unassignedTasks.map((t) => t.id)).toEqual(['library']);
  });
});

describe('summary', () => {
  it('counts what the day holds, per member, without scoring anyone', () => {
    const dentist = event('dentist', {
      kind: 'appointment',
      startsAt: at('11:00'),
      endsAt: at('11:45'),
      memberIds: ['theo'],
    });
    const tasks = [
      task('a', { ownerMemberId: 'maya', dueOn: DATE }),
      task('b', { ownerMemberId: 'maya', dueOn: DATE, status: 'done_unverified' }),
      task('c', { ownerMemberId: 'theo', dueAt: at('08:00') }),
      task('late', { ownerMemberId: 'theo', dueOn: '2026-11-17' }),
      task('late-routine', { recurrenceRuleId: 'r', dueOn: '2026-11-18' }),
      task('late-done', { dueOn: '2026-11-18', status: 'verified_complete' }),
    ];
    const view = rhythm([dropOff, pickUp, planning, dentist], { tasks, now: at('09:00') });
    expect(view.summary).toEqual({
      handoffs: 2,
      nextHandoff: {
        time: at('17:30'),
        occurrenceKey: 'pickup:2026-11-19',
        careMemberId: 'june',
        action: 'pick_up',
        byMemberIds: ['maya'],
      },
      events: 4,
      appointments: 1,
      dueToday: 2,
      doneToday: 1,
      overdue: 2,
      byMember: [
        { memberId: 'maya', handoffs: 1, events: 2, appointments: 0, dueToday: 1 },
        { memberId: 'theo', handoffs: 1, events: 2, appointments: 1, dueToday: 1 },
        { memberId: 'june', handoffs: 2, events: 2, appointments: 0, dueToday: 0 },
        { memberId: 'biscuit', handoffs: 0, events: 0, appointments: 0, dueToday: 0 },
      ],
    });
    // No ranking, share or comparison fields.
    expect(JSON.stringify(view.summary)).not.toMatch(/score|share|percent|more|fair|balance/i);
  });

  it('has no next handoff once the day’s handoffs are past', () => {
    expect(rhythm([dropOff, pickUp], { now: at('18:00') }).summary.nextHandoff).toBeNull();
    expect(rhythm([dropOff, pickUp]).summary.nextHandoff?.action).toBe('drop_off');
  });
});

describe('formatting', () => {
  it('formats clock times and days plainly', () => {
    expect(formatClock('2026-11-19T20:05:00Z', LA)).toBe('12:05 PM');
    expect(formatClock('2026-11-19T08:00:00Z', LA)).toBe('12:00 AM');
    expect(formatDay('2026-11-19')).toBe('Thu, Nov 19');
  });
});
