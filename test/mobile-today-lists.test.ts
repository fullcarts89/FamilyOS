import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../apps/mobile/lib/api';
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
