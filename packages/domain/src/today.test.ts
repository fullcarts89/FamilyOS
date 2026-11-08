import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildToday, localDueDate, type TodayItem } from './today';
import { WORK_ITEM_STATUSES } from './work-item';

const ME = 'me';
const PARTNER = 'partner';
const TZ = 'America/Los_Angeles';
// Sunday 2026-11-08, 09:00 in Los Angeles (PST, UTC-8, the day after DST ended on 11-01).
const NOW = new Date('2026-11-08T17:00:00Z');

let seq = 0;
const item = (overrides: Partial<TodayItem>): TodayItem => ({
  id: `item-${(seq += 1)}`,
  status: 'ready',
  ownerMemberId: ME,
  dueOn: null,
  dueAt: null,
  updatedAt: '2026-11-08T16:00:00Z',
  ...overrides,
});

const ids = (list: TodayItem[]) => list.map((i) => i.id);
const today = (items: TodayItem[], memberId = ME) =>
  buildToday({ items, memberId, now: NOW, timeZone: TZ });

describe('Today', () => {
  it('computes the local date in the household timezone', () => {
    // 05:00 UTC on the 9th is still the evening of the 8th in Los Angeles.
    expect(
      buildToday({ items: [], memberId: ME, now: new Date('2026-11-09T05:00:00Z'), timeZone: TZ })
        .date,
    ).toBe('2026-11-08');
    expect(
      buildToday({
        items: [],
        memberId: ME,
        now: new Date('2026-11-09T05:00:00Z'),
        timeZone: 'Europe/London',
      }).date,
    ).toBe('2026-11-09');
  });

  it('puts my decisions, confirmations and overdue items in Needs you', () => {
    const decision = item({ status: 'needs_you' });
    const confirm = item({ status: 'awaiting_completion' });
    const overdue = item({ status: 'in_progress', dueOn: '2026-11-07' });
    const partnersOverdue = item({
      status: 'in_progress',
      dueOn: '2026-11-07',
      ownerMemberId: PARTNER,
    });
    const view = today([decision, confirm, overdue, partnersOverdue]);
    expect(ids(view.needsYou).sort()).toEqual(ids([decision, confirm, overdue]).sort());
    // My partner's overdue item is visible to me, but not as my action.
    expect(ids(view.inProgress)).toEqual([partnersOverdue.id]);
    expect(ids(today([partnersOverdue], PARTNER).needsYou)).toEqual([partnersOverdue.id]);
  });

  it('shows a missed item nobody owns to every adult in Needs you', () => {
    const missed = item({ status: 'ready', dueOn: '2026-11-07', ownerMemberId: null });
    expect(ids(today([missed]).needsYou)).toEqual([missed.id]);
    expect(ids(today([missed], PARTNER).needsYou)).toEqual([missed.id]);
  });

  it('lists the next seven local days in This week, earliest first', () => {
    const tuesday = item({ dueOn: '2026-11-10' });
    const todayItem = item({ dueOn: '2026-11-08' });
    const lastDay = item({ dueOn: '2026-11-14' });
    const nextWeek = item({ dueOn: '2026-11-15' });
    expect(ids(today([tuesday, nextWeek, lastDay, todayItem]).thisWeek)).toEqual(
      ids([todayItem, tuesday, lastDay]),
    );
  });

  it('converts timed due dates to the local day', () => {
    // 07:30 UTC on the 8th is 23:30 on the 7th in Los Angeles: yesterday, so overdue.
    const lateLastNight = item({ status: 'ready', dueAt: '2026-11-08T07:30:00Z' });
    expect(localDueDate(lateLastNight, TZ)?.toString()).toBe('2026-11-07');
    expect(ids(today([lateLastNight]).needsYou)).toEqual([lateLastNight.id]);
  });

  it('shows done items from the last seven days in Handled, newest first', () => {
    const recent = item({ status: 'verified_complete', updatedAt: '2026-11-08T15:00:00Z' });
    const unverified = item({ status: 'done_unverified', updatedAt: '2026-11-05T15:00:00Z' });
    const old = item({ status: 'verified_complete', updatedAt: '2026-10-31T15:00:00Z' });
    expect(ids(today([old, unverified, recent]).handled)).toEqual(ids([recent, unverified]));
  });

  it('keeps inbox and cancelled items off Today', () => {
    const view = today([
      item({ status: 'new', dueOn: '2026-11-01' }),
      item({ status: 'cancelled', dueOn: '2026-11-09' }),
    ]);
    expect([...view.needsYou, ...view.inProgress, ...view.thisWeek, ...view.handled]).toEqual([]);
  });

  it('places every item in at most one section, whatever its status, owner or date', () => {
    const arbitraryItem = fc.record({
      id: fc.uuid(),
      status: fc.constantFrom(...WORK_ITEM_STATUSES),
      ownerMemberId: fc.constantFrom(ME, PARTNER, null),
      dueOn: fc.option(
        fc
          .date({ min: new Date('2026-10-01'), max: new Date('2026-12-31'), noInvalidDate: true })
          .map((d) => d.toISOString().slice(0, 10)),
        { nil: null },
      ),
      dueAt: fc.constant(null),
      updatedAt: fc
        .date({
          min: new Date('2026-10-20'),
          max: new Date('2026-11-08T17:00:00Z'),
          noInvalidDate: true,
        })
        .map((d) => d.toISOString()),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(arbitraryItem, { selector: (i) => i.id, maxLength: 30 }),
        (items) => {
          const view = today(items);
          const placed = [
            ...view.needsYou,
            ...view.inProgress,
            ...view.thisWeek,
            ...view.handled,
          ].map((i) => i.id);
          expect(new Set(placed).size).toBe(placed.length);
          for (const id of ids(view.needsYou)) {
            expect([ME, null]).toContain(items.find((i) => i.id === id)?.ownerMemberId);
          }
        },
      ),
    );
  });
});
