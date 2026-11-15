import { describe, expect, it } from 'vitest';
import {
  expandEvents,
  isOccurrenceDate,
  isValidEventRule,
  occurrenceOf,
  rangeDays,
  type EventSeries,
} from './events';

const LA = 'America/Los_Angeles';
const series = (overrides: Partial<EventSeries> = {}): EventSeries => ({
  id: 'e1',
  title: 'Daycare drop-off',
  kind: 'childcare',
  startsAt: '2026-10-26T15:15:00Z', // Mon 08:15 PDT
  endsAt: '2026-10-26T15:35:00Z',
  allDay: false,
  timezone: LA,
  recurrence: null,
  recursUntil: null,
  memberIds: ['theo', 'june'],
  careMemberId: 'june',
  careAction: 'drop_off',
  carePlace: 'Little Oaks',
  exceptions: [],
  ...overrides,
});
const weekdays = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] } as const;
const caredFor = (id: string) => id === 'june' || id === 'biscuit';

describe('event rules', () => {
  it('accepts calendar rules and refuses after-completion ones', () => {
    expect(isValidEventRule({ freq: 'weekly', interval: 1, weekdays: [1] })).toBe(true);
    expect(isValidEventRule({ freq: 'monthly', interval: 1, dayOfMonth: 1 })).toBe(true);
    expect(isValidEventRule({ freq: 'after_completion', intervalDays: 3 })).toBe(false);
    expect(isValidEventRule({ freq: 'weekly', interval: 1, weekdays: [] })).toBe(false);
    expect(isValidEventRule(null)).toBe(false);
  });

  it('counts range days inclusively', () => {
    expect(rangeDays('2026-11-01', '2026-11-01')).toBe(1);
    expect(rangeDays('2026-11-01', '2027-01-01')).toBe(62);
  });
});

describe('expanding events', () => {
  it('returns a one-off event only in ranges it overlaps', () => {
    const one = series();
    expect(expandEvents([one], { from: '2026-10-26', to: '2026-10-26', timeZone: LA })).toEqual([
      expect.objectContaining({
        key: 'e1:2026-10-26',
        date: '2026-10-26',
        startsAt: '2026-10-26T15:15:00Z',
        endsAt: '2026-10-26T15:35:00Z',
        recurring: false,
        memberIds: ['theo', 'june'],
        careAction: 'drop_off',
        skipped: false,
        cover: null,
      }),
    ]);
    expect(expandEvents([one], { from: '2026-10-27', to: '2026-10-30', timeZone: LA })).toEqual(
      [],
    );
  });

  it('finds multi-day events from the days they run into, not only their first', () => {
    const trip = series({
      id: 'trip',
      startsAt: '2026-11-23T14:40:00Z',
      endsAt: '2026-11-25T05:00:00Z',
      careMemberId: null,
      careAction: null,
      carePlace: null,
    });
    const keys = (from: string, to: string) =>
      expandEvents([trip], { from, to, timeZone: LA }).map((o) => o.key);
    expect(keys('2026-11-24', '2026-11-24')).toEqual(['trip:2026-11-23']);
    expect(keys('2026-11-25', '2026-11-25')).toEqual([]);
  });

  it('keeps local wall-clock times across the fall-back change', () => {
    const daily = series({ recurrence: weekdays });
    const got = expandEvents([daily], { from: '2026-10-29', to: '2026-11-03', timeZone: LA });
    expect(got.map((o) => [o.date, o.startsAt, o.endsAt])).toEqual([
      ['2026-10-29', '2026-10-29T15:15:00Z', '2026-10-29T15:35:00Z'],
      ['2026-10-30', '2026-10-30T15:15:00Z', '2026-10-30T15:35:00Z'],
      // DST ends Sunday Nov 1: 08:15 PST is an hour later in UTC.
      ['2026-11-02', '2026-11-02T16:15:00Z', '2026-11-02T16:35:00Z'],
      ['2026-11-03', '2026-11-03T16:15:00Z', '2026-11-03T16:35:00Z'],
    ]);
  });

  it('moves a time that does not exist on spring-forward day forward by the gap', () => {
    const early = series({
      id: 'early',
      startsAt: '2027-03-12T10:30:00Z', // Fri 02:30 PST
      endsAt: '2027-03-12T11:00:00Z',
      recurrence: { freq: 'daily', interval: 1 },
      careMemberId: null,
      careAction: null,
      carePlace: null,
    });
    const got = expandEvents([early], { from: '2027-03-13', to: '2027-03-15', timeZone: LA });
    expect(got.map((o) => [o.date, o.startsAt, o.endsAt])).toEqual([
      ['2027-03-13', '2027-03-13T10:30:00Z', '2027-03-13T11:00:00Z'],
      // 02:30 is skipped on Mar 14; it becomes 03:30 PDT, and the end keeps 03:00 → 03:00 PDT.
      ['2027-03-14', '2027-03-14T10:30:00Z', '2027-03-14T10:30:00Z'],
      ['2027-03-15', '2027-03-15T09:30:00Z', '2027-03-15T10:00:00Z'],
    ]);
  });

  it('repeats all-day events on their local dates', () => {
    const closed = series({
      id: 'closed',
      title: 'Daycare closed',
      allDay: true,
      startsAt: '2026-10-31T07:00:00Z', // Sat 00:00 PDT
      endsAt: '2026-11-01T07:00:00Z',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [6] },
      careAction: null,
      carePlace: null,
    });
    const got = expandEvents([closed], { from: '2026-11-07', to: '2026-11-07', timeZone: LA });
    expect(got.map((o) => [o.date, o.startsAt, o.endsAt, o.allDay])).toEqual([
      ['2026-11-07', '2026-11-07T08:00:00Z', '2026-11-08T08:00:00Z', true],
    ]);
  });

  it('stops a series after its last date', () => {
    const ending = series({ recurrence: weekdays, recursUntil: '2026-10-28' });
    const got = expandEvents([ending], { from: '2026-10-26', to: '2026-11-06', timeZone: LA });
    expect(got.map((o) => o.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('marks skipped occurrences and swaps in the covering adult', () => {
    const daily = series({
      recurrence: weekdays,
      exceptions: [
        { date: '2026-10-27', kind: 'skip', coverMemberId: null },
        { date: '2026-10-28', kind: 'cover', coverMemberId: 'maya' },
      ],
    });
    const got = expandEvents(
      [daily],
      { from: '2026-10-26', to: '2026-10-28', timeZone: LA },
      caredFor,
    );
    expect(got.map((o) => [o.date, o.skipped, o.memberIds, o.cover])).toEqual([
      ['2026-10-26', false, ['theo', 'june'], null],
      ['2026-10-27', true, ['theo', 'june'], null],
      ['2026-10-28', false, ['maya', 'june'], { memberId: 'maya', replacedMemberIds: ['theo'] }],
    ]);
  });

  it('sorts occurrences from several series by start', () => {
    const a = series({ id: 'a', recurrence: weekdays });
    const b = series({
      id: 'b',
      startsAt: '2026-10-26T14:00:00Z',
      endsAt: '2026-10-26T14:30:00Z',
      recurrence: weekdays,
    });
    const got = expandEvents([a, b], { from: '2026-10-27', to: '2026-10-27', timeZone: LA });
    expect(got.map((o) => o.key)).toEqual(['b:2026-10-27', 'a:2026-10-27']);
  });

  it('tells which dates are occurrences', () => {
    const daily = series({ recurrence: weekdays, recursUntil: '2026-11-30' });
    expect(isOccurrenceDate(daily, '2026-10-26')).toBe(true);
    expect(isOccurrenceDate(daily, '2026-10-31')).toBe(false); // Saturday
    expect(isOccurrenceDate(daily, '2026-10-23')).toBe(false); // before the start
    expect(isOccurrenceDate(daily, '2026-12-01')).toBe(false); // after the end
    expect(isOccurrenceDate(series(), '2026-10-26')).toBe(true);
    expect(isOccurrenceDate(series(), '2026-10-27')).toBe(false);
    expect(occurrenceOf(daily, '2026-11-02')?.startsAt).toBe('2026-11-02T16:15:00Z');
    expect(occurrenceOf(daily, '2026-11-01')).toBeNull();
  });
});
