import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { durationLabel, isValidDuration, timeBlock } from './time-block';
import { buildToday, dueThrough, isOverdue, type TodayItem } from './today';

const LA = 'America/Los_Angeles';
const at = (date: string, time: string) =>
  Temporal.Instant.from(`${date}T${time}:00-08:00`).toString();
const day = (date: string) => Temporal.PlainDate.from(date);

const item = (overrides: Partial<TodayItem>): TodayItem => ({
  id: 'walk',
  status: 'ready',
  ownerMemberId: 'maya',
  dueOn: null,
  dueAt: null,
  updatedAt: '2026-11-19T16:00:00Z',
  ...overrides,
});

describe('lengths', () => {
  it('allows five minutes to twelve hours, in steps of five', () => {
    expect([5, 15, 30, 45, 60, 90, 120, 720].every(isValidDuration)).toBe(true);
    expect([0, 3, 7, 4.5, 725, -5, 1000].some(isValidDuration)).toBe(false);
  });

  it('names a length plainly', () => {
    expect([15, 45, 60, 90, 120, 720].map(durationLabel)).toEqual([
      '15 min',
      '45 min',
      '1 hour',
      '1 hour 30 min',
      '2 hours',
      '12 hours',
    ]);
  });
});

describe('timeBlock', () => {
  it('runs from the task’s time to that plus its length', () => {
    expect(timeBlock({ dueAt: at('2026-11-19', '17:30'), durationMinutes: 30 })).toEqual({
      startsAt: at('2026-11-19', '17:30'),
      endsAt: at('2026-11-19', '18:00'),
      minutes: 30,
    });
  });

  it('is nothing without a time or without a length', () => {
    expect(timeBlock({ dueAt: at('2026-11-19', '17:30') })).toBeNull();
    expect(timeBlock({ dueAt: at('2026-11-19', '17:30'), durationMinutes: null })).toBeNull();
    expect(timeBlock({ dueAt: null, durationMinutes: 30 })).toBeNull();
  });

  it('keeps its length across the clocks going back (an instant plus minutes)', () => {
    // 2026-11-01 01:30 PDT, for an hour: 01:30 PST, after the repeated hour.
    const block = timeBlock({ dueAt: '2026-11-01T08:30:00Z', durationMinutes: 60 });
    expect(block?.endsAt).toBe('2026-11-01T09:30:00Z');
  });
});

describe('lateness of a time block', () => {
  const thursday = day('2026-11-19');
  const friday = day('2026-11-20');

  it('is late only once the day its block ends on is over', () => {
    const walk = item({ dueAt: at('2026-11-19', '17:30'), durationMinutes: 30 });
    expect(isOverdue(walk, thursday, LA)).toBe(false);
    expect(isOverdue(walk, friday, LA)).toBe(true);
  });

  it('is not late while a block that runs past midnight is still under way', () => {
    const night = item({ dueAt: at('2026-11-19', '23:30'), durationMinutes: 60 });
    expect(dueThrough(night, LA)?.toString()).toBe('2026-11-20');
    expect(isOverdue(night, friday, LA)).toBe(false);
    expect(isOverdue(night, day('2026-11-21'), LA)).toBe(true);
    // Without its length the same task is late on Friday, as before.
    expect(isOverdue({ ...night, durationMinutes: null }, friday, LA)).toBe(true);
  });

  it('treats a block ending exactly at midnight as the day it ran', () => {
    const late = item({ dueAt: at('2026-11-19', '23:00'), durationMinutes: 60 });
    expect(dueThrough(late, LA)?.toString()).toBe('2026-11-19');
    expect(isOverdue(late, friday, LA)).toBe(true);
  });

  it('leaves all-day dates and moments as they were', () => {
    expect(dueThrough(item({ dueOn: '2026-11-19' }), LA)?.toString()).toBe('2026-11-19');
    expect(dueThrough(item({ dueAt: at('2026-11-19', '23:30') }), LA)?.toString()).toBe(
      '2026-11-19',
    );
    expect(dueThrough(item({}), LA)).toBeNull();
  });

  it('keeps a block still under way on Today as due, not as needing rescue', () => {
    const night = item({ dueAt: at('2026-11-19', '23:30'), durationMinutes: 60 });
    // 00:10 on Friday: the walk is still going.
    const view = buildToday({
      items: [night],
      memberId: 'maya',
      now: new Date(at('2026-11-20', '00:10')),
      timeZone: LA,
    });
    expect(view.needsYou).toEqual([]);
    expect(view.thisWeek.map((i) => i.id)).toEqual(['walk']);
  });
});
