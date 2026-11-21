import { describe, expect, it } from 'vitest';
import { todayLists } from '../apps/mobile/components/tasks/lists';
import { dueText, timeText, whenOf } from '../apps/mobile/components/tasks/rules';
import type { WorkItem } from '../apps/mobile/lib/api';
import { clockRange, parseTime } from '../apps/mobile/lib/dates';

// Time blocks in the app's words, and when one is late (components/tasks/rules.ts, lib/dates.ts).
// A synthetic household on Thursday 2026-11-19 in Los Angeles (UTC-8 in November).
const TZ = 'America/Los_Angeles';
const TODAY = '2026-11-19';
const MAYA = '00000000-0000-4000-8000-000000000001';
/** A wall time on a date in Los Angeles, as an ISO instant. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-08:00`).toISOString();

const item = (id: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  type: 'task',
  title: id,
  description: null,
  status: 'ready',
  ownerMemberId: MAYA,
  parentId: null,
  dueOn: null,
  dueAt: null,
  visibility: 'household',
  createdByMemberId: MAYA,
  recurrenceRuleId: null,
  occurrenceIndex: null,
  occurrenceOn: null,
  completedByMemberId: null,
  version: 1,
  updatedAt: '2026-11-19T12:00:00Z',
  ...overrides,
});

describe('the app’s time words for a time block', () => {
  it('says the block, "5:30–6pm", where a moment says "5:30pm"', () => {
    const walk = item('walk', { dueAt: at(TODAY, '17:30'), durationMinutes: 30 });
    expect(timeText(walk, TZ)).toBe('5:30–6pm');
    expect(dueText(walk, TODAY, TZ)).toBe('Today 5:30–6pm');
    const moment = item('call', { dueAt: at(TODAY, '17:30') });
    expect(timeText(moment, TZ)).toBe('5:30pm');
    expect(dueText(moment, TODAY, TZ)).toBe('Today 5:30pm');
    expect(timeText(item('allDay', { dueOn: TODAY }), TZ)).toBeNull();
    // Across noon and across midnight, each end keeps its own am/pm.
    expect(timeText(item('x', { dueAt: at(TODAY, '11:30'), durationMinutes: 60 }), TZ)).toBe(
      '11:30am–12:30pm',
    );
    expect(timeText(item('y', { dueAt: at(TODAY, '23:30'), durationMinutes: 60 }), TZ)).toBe(
      '11:30pm–12:30am',
    );
  });

  it('writes a wall-clock span the same way', () => {
    expect(clockRange('17:30', 30)).toBe('5:30–6pm');
    expect(clockRange('17:30', null)).toBe('5:30pm');
    expect(clockRange('09:00', 120)).toBe('9–11am');
    expect(clockRange('11:30', 60)).toBe('11:30am–12:30pm');
    expect(clockRange('23:30', 60)).toBe('11:30pm–12:30am');
    expect(clockRange('00:15', 30)).toBe('12:15–12:45am');
  });

  it('reads times the way the event sheet always has', () => {
    expect(['5:30pm', '17:30', '5:30 pm', '5pm', '12am', '8:15'].map(parseTime)).toEqual([
      '17:30',
      '17:30',
      '17:30',
      '17:00',
      '00:00',
      '08:15',
    ]);
    expect(['25:00', '13pm', 'soon', ''].map(parseTime)).toEqual([null, null, null, null]);
  });
});

describe('when a time block is late', () => {
  it('is today’s until the day it ends on is over, as the lists and "On you" count it', () => {
    const walk = item('walk', { dueAt: at(TODAY, '17:30'), durationMinutes: 30 });
    expect(whenOf(walk, TODAY, TZ)).toBe('today');
    expect(whenOf(walk, '2026-11-20', TZ)).toBe('late');
    // Under way past midnight: still today's on Friday, late on Saturday.
    const night = item('night', { dueAt: at(TODAY, '23:30'), durationMinutes: 60 });
    expect(whenOf(night, '2026-11-20', TZ)).toBe('today');
    expect(whenOf(night, '2026-11-21', TZ)).toBe('late');
    // The same task with no length is late on Friday, as before.
    expect(whenOf({ ...night, durationMinutes: null }, '2026-11-20', TZ)).toBe('late');

    const lists = todayLists({ items: [night], today: '2026-11-20', timeZone: TZ });
    expect(lists.get(MAYA)?.groups.today.map((i) => i.id)).toEqual(['night']);
    expect(lists.get(MAYA)?.groups.late).toEqual([]);
  });
});
