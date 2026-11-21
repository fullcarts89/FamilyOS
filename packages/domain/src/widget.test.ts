import { describe, expect, it } from 'vitest';
import { WIDGET_ITEM_LIMIT, widgetItems, type WidgetSourceTask } from './widget';

const LA = 'America/Los_Angeles';
const TODAY = '2026-11-16';
const task = (id: string, overrides: Partial<WidgetSourceTask>): WidgetSourceTask => ({
  id,
  title: id,
  status: 'ready',
  ownerMemberId: 'me',
  dueOn: TODAY,
  dueAt: null,
  recurrenceRuleId: null,
  isCurrentTurn: null,
  ...overrides,
});

describe('widget items', () => {
  const options = { memberId: 'me', today: TODAY, timeZone: LA };

  it('lists my open items due today or late: late first, then by time, then all-day by title', () => {
    const { items, count } = widgetItems(
      [
        task('zebra', {}),
        task('apple', {}),
        task('evening', { dueOn: null, dueAt: '2026-11-17T01:00:00Z' }),
        task('morning', { dueOn: null, dueAt: '2026-11-16T16:00:00Z' }),
        task('late-2', { dueOn: '2026-11-14' }),
        task('late-1', { dueOn: '2026-11-10' }),
        task('tomorrow', { dueOn: '2026-11-17' }),
        task('undated', { dueOn: null }),
        task('partner', { ownerMemberId: 'partner' }),
        task('done', { status: 'done_unverified' }),
        task('inbox', { status: 'new' }),
        task('cancelled', { status: 'cancelled' }),
      ],
      options,
    );
    expect(items.map((t) => t.id)).toEqual([
      'late-1',
      'late-2',
      'morning',
      'evening',
      'apple',
      'zebra',
    ]);
    expect(count).toBe(6);
  });

  it('keeps a time block still under way past midnight with today’s, not the late ones', () => {
    const { items } = widgetItems(
      [
        // Sunday 23:30 PST for an hour: under way until 00:30 on Monday.
        task('night', { dueOn: null, dueAt: '2026-11-16T07:30:00Z', durationMinutes: 60 }),
        task('late', { dueOn: '2026-11-15' }),
        task('morning', { dueOn: null, dueAt: '2026-11-16T16:00:00Z' }),
      ],
      options,
    );
    expect(items.map((t) => t.id)).toEqual(['late', 'night', 'morning']);
    // Without its length the same task is late, and sorts with the late ones.
    const point = widgetItems(
      [
        task('night', { dueOn: null, dueAt: '2026-11-16T07:30:00Z' }),
        task('late', { dueOn: '2026-11-14' }),
      ],
      options,
    );
    expect(point.items.map((t) => t.id)).toEqual(['late', 'night']);
  });

  it("shows only each routine's current turn, and caps the list but not the count", () => {
    const { items } = widgetItems(
      [
        task('turn-today', { recurrenceRuleId: 'r', isCurrentTurn: false }),
        task('turn-late', { recurrenceRuleId: 'r', isCurrentTurn: true, dueOn: '2026-11-15' }),
      ],
      options,
    );
    expect(items.map((t) => t.id)).toEqual(['turn-late']);
    const many = widgetItems(
      Array.from({ length: 12 }, (_, i) => task(`t${String(i).padStart(2, '0')}`, {})),
      options,
    );
    expect(many.items).toHaveLength(WIDGET_ITEM_LIMIT);
    expect(many.count).toBe(12);
  });
});
