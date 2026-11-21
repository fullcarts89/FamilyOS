import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../apps/mobile/lib/api';
import { lateRows, missedTurns, todayLists } from '../apps/mobile/components/tasks/lists';
import { clearsToday } from '../apps/mobile/components/tasks/rules';

// A synthetic household's work, on Friday 2026-11-20 in Los Angeles.
const TZ = 'America/Los_Angeles';
const TODAY = '2026-11-20';
const MAYA = '00000000-0000-4000-8000-000000000001';
const THEO = '00000000-0000-4000-8000-000000000002';

const item = (id: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  type: 'task',
  title: id,
  description: null,
  status: 'ready',
  ownerMemberId: MAYA,
  parentId: null,
  dueOn: TODAY,
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

describe('the daily milestone', () => {
  const ask = (after: WorkItem, items: WorkItem[]) =>
    clearsToday({ after, items, memberId: MAYA, today: TODAY, timeZone: TZ });

  it('fires when your last late or due-today item is done', () => {
    const invoice = item('invoice', { status: 'verified_complete' });
    expect(
      ask(invoice, [
        invoice,
        item('rsvp', { dueOn: '2026-11-21' }),
        item('theo-late', { ownerMemberId: THEO, dueOn: '2026-11-17' }),
      ]),
    ).toBe(true);
  });

  it('waits while something of yours is still late or due today', () => {
    const invoice = item('invoice', { status: 'verified_complete' });
    expect(ask(invoice, [invoice, item('filter', { dueOn: '2026-11-18' })])).toBe(false);
    expect(
      ask(invoice, [invoice, item('plumber', { dueAt: '2026-11-20T21:00:00Z', dueOn: null })]),
    ).toBe(false);
  });

  it('never for someone else’s item, a later one, or a project step', () => {
    const theos = item('theos', { ownerMemberId: THEO, status: 'verified_complete' });
    expect(ask(theos, [theos])).toBe(false);
    const later = item('later', { dueOn: '2026-11-24', status: 'verified_complete' });
    expect(ask(later, [later])).toBe(false);
    const step = item('step', { parentId: 'reno', status: 'verified_complete' });
    expect(ask(step, [step])).toBe(false);
  });
});

/** One turn of a daily routine (Walk Biscuit), on a date. */
const turn = (index: number, on: string, overrides: Partial<WorkItem> = {}) =>
  item(`walk-${index}`, {
    title: 'Walk Biscuit',
    recurrenceRuleId: 'rule-walk',
    occurrenceIndex: index,
    occurrenceOn: on,
    dueOn: on,
    isCurrentTurn: false,
    ...({ routineId: 'routine-walk' } as Partial<WorkItem>),
    ...overrides,
  });

describe('a routine’s missed turns', () => {
  const walks = [
    turn(10, '2026-11-16', { isCurrentTurn: true }),
    turn(11, '2026-11-17', { ownerMemberId: THEO }),
    turn(12, '2026-11-18'),
    turn(13, '2026-11-19'),
    turn(14, '2026-11-20'), // today's: not missed
    turn(9, '2026-11-15', { status: 'verified_complete' }),
  ];

  it('are one row: the open late turns, oldest first, on the latest turn’s owner’s list', () => {
    const [walk, ...rest] = missedTurns(walks, TODAY, TZ);
    expect(rest).toEqual([]);
    expect(walk?.title).toBe('Walk Biscuit');
    expect(walk?.routineId).toBe('routine-walk');
    expect(walk?.turns.map((t) => t.occurrenceIndex)).toEqual([10, 11, 12, 13]);
    expect(walk?.ownerMemberId).toBe(MAYA);
  });

  it('one late turn is just a late row; two or more are grouped', () => {
    expect(missedTurns([turn(13, '2026-11-19'), turn(14, '2026-11-20')], TODAY, TZ)).toEqual([]);
    expect(missedTurns(walks.slice(2, 4), TODAY, TZ)).toHaveLength(1);
  });

  it('replace the routine’s separate rows on Today, and count once as late', () => {
    const lists = todayLists({
      items: [...walks, item('invoice'), item('filter', { dueOn: '2026-11-14' })],
      today: TODAY,
      timeZone: TZ,
    });
    const maya = lists.get(MAYA);
    expect(maya?.missed.map((m) => m.title)).toEqual(['Walk Biscuit']);
    expect(maya?.groups.late.map((i) => i.id)).toEqual(['filter']);
    expect(maya?.groups.today.map((i) => i.id)).toEqual(['invoice']);
    // No walk turn shows on its own anywhere.
    const rows = [...lists.values()].flatMap((l) => Object.values(l.groups).flat());
    expect(rows.some((i) => i.title === 'Walk Biscuit')).toBe(false);
    expect(lateRows(maya)).toBe(2);
    expect(lateRows(lists.get(THEO))).toBe(0);
  });
});

describe('“Anytime”', () => {
  it('lists open things with no date on their owner’s list, never giving them one', () => {
    const lists = todayLists({
      items: [
        item('paint', { dueOn: null, updatedAt: '2026-11-18T10:00:00Z' }),
        item('vet', { dueOn: null, updatedAt: '2026-11-20T10:00:00Z' }),
        item('door', { dueOn: null, ownerMemberId: null }),
        item('later', { dueOn: '2026-12-20' }),
        item('waiting', { dueOn: null, status: 'waiting_on_others' }),
        item('done', { dueOn: null, status: 'verified_complete' }),
        item('reno', { dueOn: null, type: 'project' }),
        item('unowned-step', { dueOn: null, ownerMemberId: null, parentId: 'reno' }),
      ],
      today: TODAY,
      timeZone: TZ,
    });
    // Newest first; a date far off stays out (it's in Tasks under "Later").
    expect(lists.get(MAYA)?.anytime.map((i) => i.id)).toEqual(['vet', 'paint']);
    expect(lists.get(null)?.anytime.map((i) => i.id)).toEqual(['door']);
    expect(lists.get(MAYA)?.anytime.every((i) => i.dueOn === null && i.dueAt === null)).toBe(true);
  });

  it('keeps a just-finished undated row in place for its moment', () => {
    const done = item('vet', { dueOn: null, status: 'verified_complete' });
    const keep = (id: string) => id === 'vet';
    expect(
      todayLists({ items: [done], today: TODAY, timeZone: TZ, keep }).get(MAYA)?.anytime,
    ).toEqual([done]);
  });
});
