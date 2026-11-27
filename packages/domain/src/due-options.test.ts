import { describe, expect, it } from 'vitest';
import {
  calendarWeeks,
  describeDue,
  dueOptions,
  formatDue,
  monthStartOptions,
  monthTitle,
  shiftMonth,
} from './due-options';

describe('due options', () => {
  it('offers today, tomorrow, the coming weekend and next Monday', () => {
    // Wednesday 2026-11-11
    expect(dueOptions('2026-11-11').map((o) => o.date)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-14',
      '2026-11-16',
    ]);
  });

  it('drops weekend choices that repeat an earlier day', () => {
    // Saturday: "This weekend" is today. Sunday: it is today, and "Next week" is tomorrow.
    expect(dueOptions('2026-11-07').map((o) => o.label)).toEqual([
      'Today',
      'Tomorrow',
      'Next week',
    ]);
    expect(dueOptions('2026-11-08').map((o) => o.label)).toEqual(['Today', 'Tomorrow']);
  });

  it('crosses month and year ends', () => {
    expect(dueOptions('2026-12-31').map((o) => o.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-04',
    ]);
  });

  it('formats relative and absolute dates', () => {
    expect(formatDue('2026-11-08', '2026-11-08')).toBe('Today');
    expect(formatDue('2026-11-09', '2026-11-08')).toBe('Tomorrow');
    expect(formatDue('2026-11-07', '2026-11-08')).toBe('Yesterday');
    expect(formatDue('2026-11-10', '2026-11-08')).toBe('Tue 10 Nov');
    expect(formatDue('2027-12-01', '2026-11-08')).toBe('Wed 1 Dec 2027');
  });

  it('describes timed due dates in the household timezone, not by their UTC date', () => {
    // 19:00 on Sunday 8 Nov in Los Angeles is 03:00 UTC on Monday.
    const item = { dueOn: null, dueAt: '2026-11-09T03:00:00Z' };
    expect(describeDue(item, '2026-11-08', 'America/Los_Angeles')).toBe('Today 19:00');
    expect(describeDue(item, '2026-11-08', 'America/New_York')).toBe('Today 22:00');
    expect(describeDue(item, '2026-11-08', 'Europe/London')).toBe('Tomorrow 03:00');
    expect(describeDue({ dueOn: '2026-11-10', dueAt: null }, '2026-11-08', 'UTC')).toBe(
      'Tue 10 Nov',
    );
    expect(describeDue({ dueOn: null, dueAt: null }, '2026-11-08', 'UTC')).toBeNull();
  });

  it('lays a month out in Monday-to-Sunday weeks for the date picker', () => {
    // November 2026 starts on a Sunday and ends on a Monday: six weeks.
    const november = calendarWeeks('2026-11');
    expect(november).toHaveLength(6);
    expect(november[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(november[1]?.[0]).toBe('2026-11-02');
    expect(november[5]).toEqual(['2026-11-30', null, null, null, null, null, null]);
    // February 2027 starts on a Monday and has 28 days: exactly four weeks, no blanks.
    const february = calendarWeeks('2027-02');
    expect(february).toHaveLength(4);
    expect(february.flat()).not.toContain(null);
    expect(february[3]?.[6]).toBe('2027-02-28');
    // A leap year's February has its 29th.
    expect(calendarWeeks('2028-02').flat()).toContain('2028-02-29');
    expect(calendarWeeks('2028-02').flat().filter(Boolean)).toHaveLength(29);
  });

  it('steps between months across year ends, and names them', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(monthTitle('2026-12')).toBe('December 2026');
    expect(monthTitle('2027-01')).toBe('January 2027');
  });

  it('offers this month and the next two as monthly starts', () => {
    expect(monthStartOptions('2026-11-08')).toEqual([
      { label: 'From November', date: '2026-11-01' },
      { label: 'From December', date: '2026-12-01' },
      { label: 'From January', date: '2027-01-01' },
    ]);
  });
});
