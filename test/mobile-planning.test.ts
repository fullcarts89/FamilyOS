import { describe, expect, it } from 'vitest';
import type { LookBackEntry, Unresolved } from '../apps/mobile/lib/api';
import { guessAisle, splitDetail } from '../apps/mobile/lib/grocery-words';
import {
  appreciation,
  thankYouGroups,
  completionLine,
  entryDetail,
  listWords,
  shortWeekday,
  stillOpen,
  weekRange,
} from '../apps/mobile/lib/reset-words';

// Synthetic household members.
const JUNE = '00000000-0000-4000-8000-000000000003';
const names: Record<string, string> = { [JUNE]: 'June' };
const nameOf = (id: string | null) => (id ? (names[id] ?? null) : null);

describe('grocery aisles', () => {
  it('guesses the aisle from the name, longest match first', () => {
    expect(guessAisle('Bananas')).toBe('produce');
    expect(guessAisle('Whole milk')).toBe('dairy_eggs');
    expect(guessAisle('Peanut butter')).toBe('pantry');
    expect(guessAisle('Diapers')).toBe('baby');
    expect(guessAisle('Dog food')).toBe('pet');
    expect(guessAisle('Dish soap')).toBe('household');
    expect(guessAisle('Salmon fillets')).toBe('meat_fish');
    expect(guessAisle('Something unusual')).toBe('other');
  });

  it('splits a quantity or a note from the name', () => {
    expect(splitDetail('2 lemons')).toEqual({ name: 'Lemons', detail: '2' });
    expect(splitDetail('Milk, 1 gal')).toEqual({ name: 'Milk', detail: '1 gal' });
    expect(splitDetail('Diapers (size 5)')).toEqual({ name: 'Diapers', detail: 'size 5' });
    expect(splitDetail('  Sourdough  ')).toEqual({ name: 'Sourdough', detail: null });
  });
});

describe('Weekly Reset words', () => {
  const routine: LookBackEntry = {
    kind: 'routine',
    routineId: 'r1',
    title: 'Bath and bedtime',
    reason: 'care',
    subjectMemberId: JUNE,
    dates: ['2026-11-09', '2026-11-11', '2026-11-13'],
    itemIds: ['a', 'b', 'c'],
  };
  const project: LookBackEntry = {
    kind: 'item',
    id: 'p1',
    title: 'Switch June to a toddler bed',
    type: 'project',
    reason: 'project',
    completedOn: '2026-11-14',
    parentId: null,
    parentTitle: null,
    subjectMemberId: JUNE,
  };
  const step: LookBackEntry = {
    kind: 'item',
    id: 's1',
    title: 'Get three contractor quotes',
    type: 'task',
    reason: 'subtask',
    completedOn: '2026-11-10',
    parentId: 'p2',
    parentTitle: 'Hall bathroom renovation',
    subjectMemberId: null,
  };

  it('lists and names days plainly', () => {
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
    expect(shortWeekday('2026-11-16')).toBe('Mon');
    expect(weekRange('2026-11-16', '2026-11-22')).toBe('Nov 16–22');
    expect(weekRange('2026-11-30', '2026-12-06')).toBe('Nov 30–Dec 6');
  });

  it('describes what each entry was', () => {
    expect(entryDetail(routine, nameOf)).toBe('With June · Mon, Wed and Fri');
    expect(entryDetail(project, nameOf)).toBe('Saw the whole project through');
    expect(entryDetail(step, nameOf)).toBe('A step forward on Hall bathroom renovation');
  });

  it('thanks someone in words, never with a count', () => {
    const line = appreciation('Maya', [routine, project, step], nameOf);
    expect(line).toBe(
      'Maya looked after June, saw “Switch June to a toddler bed” through and moved “Hall bathroom renovation” forward.',
    );
    expect(line).not.toMatch(/\d/);
    expect(appreciation('Theo', [], nameOf)).toBe('Theo kept things moving.');
  });

  it('always thanks both partners, then anyone else who finished something', () => {
    const known = (id: string) => ['maya', 'theo', 'nana'].includes(id);
    const groups = thankYouGroups(
      ['maya', 'theo'],
      [
        { memberId: 'maya', entries: [routine] },
        { memberId: 'nana', entries: [project] },
        { memberId: 'gone', entries: [step] },
        { memberId: null, entries: [step] },
      ],
      known,
    );
    expect(groups).toEqual([
      { memberId: 'maya', entries: [routine] },
      { memberId: 'theo', entries: [] },
      { memberId: 'nana', entries: [project] },
    ]);
    // A quiet week: both partners still appear, with nothing listed.
    expect(thankYouGroups(['maya', 'theo'], [], known)).toEqual([
      { memberId: 'maya', entries: [] },
      { memberId: 'theo', entries: [] },
    ]);
  });

  it('never claims the week is handled while something important is open', () => {
    expect(stillOpen([])).toBeNull();
    expect(completionLine([])).toBe('You’re ready to take it on together.');
    const open: Unresolved[] = [
      { type: 'handoff_conflict', occurrenceKey: 'k', memberId: 'm', time: '2026-11-20T01:30:00Z' },
      { type: 'decision_open', decisionId: 'd1', dueOn: null },
      { type: 'decision_open', decisionId: 'd2', dueOn: null },
      { type: 'overdue', workItemId: 'w', dueOn: '2026-11-08' },
    ];
    expect(stillOpen(open)).toBe(
      'One drop-off or pickup still needs someone, 2 decisions are still open and one thing from before is still late.',
    );
    expect(completionLine(open)).toMatch(/4 things still to sort/);
    expect(completionLine(open.slice(1, 2))).toMatch(/one thing still to sort: it’s marked/);
  });
});
