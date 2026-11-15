import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { expandEvents, type EventSeries } from './events';
import type { CalendarRule } from './recurrence';
import {
  buildLookBack,
  buildWeekRhythm,
  defaultResetWeek,
  isWeekStart,
  lookBackReason,
  unresolvedForWeek,
  weekDates,
  weekStartOf,
  type LookBackSourceItem,
} from './reset';
import type { RhythmMember } from './rhythm';

// The week of Monday 2026-11-16 in Los Angeles (PST, UTC−8).
const LA = 'America/Los_Angeles';
const WEEK = '2026-11-16';
const members: RhythmMember[] = [
  { id: 'maya', role: 'owner', displayName: 'Maya' },
  { id: 'theo', role: 'adult', displayName: 'Theo' },
  { id: 'june', role: 'child', displayName: 'June' },
];
const caredFor = (id: string) => id === 'june';
const at = (date: string, time: string) =>
  Temporal.Instant.from(`${date}T${time}:00-08:00`).toString();

const event = (id: string, overrides: Partial<EventSeries>): EventSeries => ({
  id,
  title: id,
  kind: 'other',
  startsAt: at(WEEK, '09:00'),
  endsAt: at(WEEK, '10:00'),
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

describe('the week a Reset plans', () => {
  it('starts on Monday and plans the coming week from Friday on', () => {
    expect(weekStartOf('2026-11-19')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
    expect(isWeekStart('2026-11-16')).toBe(true);
    expect(isWeekStart('2026-11-17')).toBe(false);
    expect(defaultResetWeek('2026-11-16')).toBe('2026-11-16');
    expect(defaultResetWeek('2026-11-19')).toBe('2026-11-16');
    expect(defaultResetWeek('2026-11-20')).toBe('2026-11-23');
    expect(defaultResetWeek('2026-11-22')).toBe('2026-11-23');
    expect(weekDates(WEEK)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });
});

describe('the week ahead', () => {
  const pickUp = event('pickup', {
    title: 'Daycare pickup',
    kind: 'childcare',
    startsAt: at(WEEK, '17:30'),
    endsAt: at(WEEK, '17:50'),
    recurrence: weekdays,
    memberIds: ['maya', 'june'],
    careMemberId: 'june',
    careAction: 'pick_up',
    carePlace: 'Little Oaks',
    // Tuesday's pickup has nobody yet: Maya is away and nobody covers it.
    exceptions: [],
  });
  const thursdayPlanning = event('planning', {
    title: 'Quarterly planning',
    kind: 'work',
    startsAt: at('2026-11-19', '14:00'),
    endsAt: at('2026-11-19', '18:00'),
    memberIds: ['maya'],
  });
  const saturdayVet = event('vet', {
    title: 'Vet',
    kind: 'appointment',
    startsAt: at('2026-11-21', '10:00'),
    endsAt: at('2026-11-21', '10:45'),
    careMemberId: 'june',
  });
  // A late-night event that runs past midnight Friday into Saturday.
  const lateDropOff = event('late', {
    title: 'Sleepover drop-off',
    kind: 'childcare',
    startsAt: at('2026-11-20', '23:45'),
    endsAt: at('2026-11-21', '00:30'),
    careMemberId: 'june',
    careAction: 'drop_off',
    carePlace: 'Grandma’s',
  });
  const series = [pickUp, thursdayPlanning, saturdayVet, lateDropOff];
  const occurrences = expandEvents(
    series,
    { from: WEEK, to: '2026-11-22', timeZone: LA },
    caredFor,
  );
  const week = buildWeekRhythm({ weekStart: WEEK, timeZone: LA, members, occurrences });

  it('finds a conflict on the one day it happens', () => {
    expect(week.conflicts).toEqual([
      expect.objectContaining({
        type: 'handoff_conflict',
        memberId: 'maya',
        occurrenceKey: 'pickup:2026-11-19',
        conflictingEventId: 'planning',
      }),
    ]);
    const thursday = week.days.find((d) => d.date === '2026-11-19');
    expect(thursday?.headsUps.map((h) => h.type)).toEqual(['handoff_conflict']);
    expect(
      week.days.filter((d) => d.headsUps.some((h) => h.type === 'handoff_conflict')),
    ).toHaveLength(1);
  });

  it('lists each care event nobody is down for once, even across midnight', () => {
    expect(week.needsOwner.map((h) => h.occurrenceKey)).toEqual([
      'late:2026-11-20',
      'vet:2026-11-21',
    ]);
    // The late drop-off touches Friday and Saturday; it is a handoff only on Friday.
    const friday = week.days.find((d) => d.date === '2026-11-20');
    const saturday = week.days.find((d) => d.date === '2026-11-21');
    expect(friday?.handoffs.map((h) => h.occurrenceKey)).toContain('late:2026-11-20');
    expect(saturday?.handoffs.map((h) => h.occurrenceKey)).not.toContain('late:2026-11-20');
  });

  it('clears the conflict once somebody covers the pickup', () => {
    const covered = expandEvents(
      [
        { ...pickUp, exceptions: [{ date: '2026-11-19', kind: 'cover', coverMemberId: 'theo' }] },
        thursdayPlanning,
      ],
      { from: WEEK, to: '2026-11-22', timeZone: LA },
      caredFor,
    );
    const resolved = buildWeekRhythm({
      weekStart: WEEK,
      timeZone: LA,
      members,
      occurrences: covered,
    });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.days[3]?.handoffs[0]?.byMemberIds).toEqual(['theo']);
  });

  it('marks everything still open, so the plan never claims all is handled', () => {
    const open = unresolvedForWeek({
      week,
      openDecisions: [{ id: 'd1', dueOn: '2026-11-17' }],
      overdue: [{ id: 't1', dueOn: '2026-11-12', dueAt: null }],
      timeZone: LA,
    });
    expect(open.map((u) => u.type)).toEqual([
      'handoff_conflict',
      'care_unassigned',
      'care_unassigned',
      'decision_open',
      'overdue',
    ]);
    const clear = unresolvedForWeek({
      week: buildWeekRhythm({ weekStart: WEEK, timeZone: LA, members, occurrences: [] }),
      openDecisions: [],
      overdue: [],
      timeZone: LA,
    });
    expect(clear).toEqual([]);
  });
});

describe('looking back', () => {
  const done = (id: string, overrides: Partial<LookBackSourceItem>): LookBackSourceItem => ({
    id,
    title: id,
    type: 'task',
    status: 'done_unverified',
    priority: null,
    parentId: null,
    subjectMemberId: null,
    recurrenceRuleId: null,
    completedAt: at('2026-11-12', '12:00'),
    completedByMemberId: 'maya',
    ...overrides,
  });
  const routines = [
    { ruleId: 'r-bed', routineId: 'bedtime', title: 'Bath and bedtime', subjectMemberId: 'june' },
    { ruleId: 'r-trash', routineId: 'trash', title: 'Trash', subjectMemberId: null },
  ];
  const items = [
    done('registration', {
      priority: 1,
      completedAt: at('2026-11-11', '12:00'),
      completedByMemberId: 'theo',
    }),
    done('quotes', { parentId: 'reno', completedAt: at('2026-11-10', '09:00') }),
    done('reno', { type: 'project', completedAt: at('2026-11-15', '18:00') }),
    done('checkup', { subjectMemberId: 'june', completedByMemberId: 'theo' }),
    done('bed-1', {
      recurrenceRuleId: 'r-bed',
      completedAt: at('2026-11-10', '19:30'),
      completedByMemberId: 'theo',
    }),
    done('bed-3', {
      recurrenceRuleId: 'r-bed',
      completedAt: at('2026-11-12', '19:30'),
      completedByMemberId: 'theo',
    }),
    done('bed-2', { recurrenceRuleId: 'r-bed', completedAt: at('2026-11-11', '19:30') }),
    // Not worth reflecting on: an ordinary chore, a low-key task, something cancelled.
    done('trash-1', { recurrenceRuleId: 'r-trash' }),
    done('library', {}),
    done('cancelled', { priority: 1, status: 'cancelled' }),
    // Outside the week, and done by nobody in particular.
    done('old', { priority: 1, completedAt: at('2026-11-08', '12:00') }),
    done('anon', { priority: 1, completedByMemberId: null }),
  ];
  const groups = buildLookBack({
    from: '2026-11-09',
    to: '2026-11-15',
    timeZone: LA,
    memberIds: ['maya', 'theo'],
    items,
    routines,
    parents: [{ id: 'reno', title: 'Hall bathroom' }],
  });

  it('groups what mattered by who did it, in member order, as items', () => {
    expect(groups.map((g) => g.memberId)).toEqual(['maya', 'theo', null]);
    const maya = groups[0]?.entries ?? [];
    expect(maya.map((e) => (e.kind === 'item' ? e.id : e.routineId))).toEqual([
      'quotes',
      'bedtime',
      'reno',
    ]);
    expect(maya[0]).toMatchObject({ reason: 'subtask', parentTitle: 'Hall bathroom' });
    expect(maya[2]).toMatchObject({ reason: 'project', completedOn: '2026-11-15' });
    const theo = groups[1]?.entries ?? [];
    expect(theo).toEqual([
      expect.objectContaining({
        kind: 'routine',
        routineId: 'bedtime',
        dates: ['2026-11-10', '2026-11-12'],
      }),
      expect.objectContaining({ kind: 'item', id: 'registration', reason: 'priority' }),
      expect.objectContaining({
        kind: 'item',
        id: 'checkup',
        reason: 'care',
        subjectMemberId: 'june',
      }),
    ]);
    expect(groups[2]?.entries.map((e) => (e.kind === 'item' ? e.id : ''))).toEqual(['anon']);
  });

  it('never counts or scores anyone', () => {
    for (const group of groups) {
      expect(Object.keys(group).sort()).toEqual(['entries', 'memberId']);
    }
    expect(JSON.stringify(groups)).not.toMatch(/count|score|total/i);
  });

  it('names why an item mattered', () => {
    expect(lookBackReason(done('x', { type: 'project', priority: 1 }), undefined)).toBe('project');
    expect(lookBackReason(done('x', { priority: 2 }), undefined)).toBeNull();
    expect(lookBackReason(done('x', { recurrenceRuleId: 'r-trash' }), routines[1])).toBeNull();
  });
});
