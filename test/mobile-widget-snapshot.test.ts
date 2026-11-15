import { describe, expect, it } from 'vitest';
import {
  buildWidgetSnapshot,
  WIDGET_ITEM_LIMIT,
  type RhythmForWidget,
  type RhythmWidgetTask,
} from '../apps/mobile/native/widget-snapshot';

// Synthetic household: two adults and a child.
const ME = '00000000-0000-4000-8000-000000000001';
const PARTNER = '00000000-0000-4000-8000-000000000002';
const CHILD = '00000000-0000-4000-8000-000000000003';

const task = (id: string, overrides: Partial<RhythmWidgetTask> = {}): RhythmWidgetTask => ({
  id,
  title: `Task ${id}`,
  status: 'ready',
  version: 1,
  dueAt: null,
  dueOn: '2026-11-15',
  ownerMemberId: ME,
  ...overrides,
});

function rhythm(overrides: Partial<RhythmForWidget> = {}): RhythmForWidget {
  return {
    date: '2026-11-15',
    timezone: 'America/Los_Angeles',
    lanes: [
      {
        memberId: ME,
        caredFor: false,
        tasks: {
          timed: [task('t1', { dueAt: '2026-11-15T17:00:00.000Z', dueOn: null })],
          dueToday: [task('a1'), task('done', { status: 'verified_complete' })],
        },
      },
      {
        memberId: PARTNER,
        caredFor: false,
        tasks: { timed: [], dueToday: [task('p1', { ownerMemberId: PARTNER })] },
      },
      { memberId: CHILD, caredFor: true, tasks: { timed: [], dueToday: [] } },
    ],
    handoffs: [
      {
        time: '2026-11-15T16:00:00Z',
        careMemberId: CHILD,
        action: 'drop_off',
        byMemberIds: [ME],
        place: 'School',
      },
      {
        time: '2026-11-15T23:15:00Z',
        careMemberId: CHILD,
        action: 'pick_up',
        byMemberIds: [PARTNER],
        place: 'School',
      },
    ],
    members: [
      { id: ME, displayName: 'Alex' },
      { id: PARTNER, displayName: 'Theo' },
      { id: CHILD, displayName: 'June' },
    ],
    ...overrides,
  };
}

const build = (r: RhythmForWidget, now = new Date('2026-11-15T18:00:00Z')) =>
  buildWidgetSnapshot({
    rhythm: r,
    householdId: 'h1',
    memberId: ME,
    colorOf: (id) => (id === ME ? '#D2553F' : '#2F6FB3'),
    now,
  });

describe('buildWidgetSnapshot', () => {
  it("lists only my open items due today, timed first, with each item's version", () => {
    const snapshot = build(rhythm());
    expect(snapshot.items.map((i) => i.id)).toEqual(['t1', 'a1']);
    expect(snapshot.dueTodayCount).toBe(2);
    expect(snapshot.items[0]).toMatchObject({ version: 1, ownerMemberId: ME, canComplete: true });
    expect(snapshot.date).toBe('2026-11-15');
    expect(snapshot.timezone).toBe('America/Los_Angeles');
  });

  it('keeps only handoffs still to come', () => {
    const snapshot = build(rhythm());
    expect(snapshot.handoffs).toEqual([
      {
        time: '2026-11-15T23:15:00Z',
        careMemberId: CHILD,
        action: 'pick_up',
        byMemberIds: [PARTNER],
        place: 'School',
      },
    ]);
  });

  it('caps the list but counts everything due', () => {
    const many = Array.from({ length: 12 }, (_, i) => task(`m${i}`));
    const r = rhythm();
    r.lanes[0] = { memberId: ME, caredFor: false, tasks: { timed: [], dueToday: many } };
    const snapshot = build(r);
    expect(snapshot.items).toHaveLength(WIDGET_ITEM_LIMIT);
    expect(snapshot.dueTodayCount).toBe(12);
  });

  it("marks items that can't be ticked off yet", () => {
    const r = rhythm();
    r.lanes[0] = {
      memberId: ME,
      caredFor: false,
      tasks: { timed: [], dueToday: [task('w', { status: 'waiting_on_others' })] },
    };
    expect(build(r).items[0]?.canComplete).toBe(false);
  });

  it('is empty, not invented, when I have no lane', () => {
    const snapshot = build(rhythm({ lanes: [] }));
    expect(snapshot.items).toEqual([]);
    expect(snapshot.dueTodayCount).toBe(0);
  });

  it("carries each member's color and name", () => {
    const snapshot = build(rhythm());
    expect(snapshot.members[0]).toEqual({ id: ME, name: 'Alex', color: '#D2553F' });
  });
});
