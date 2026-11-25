import { describe, expect, it } from 'vitest';
import { budgetTypeOfGroup, monthsToSync, nextSyncAround } from './monarch-sync';

const TZ = 'America/Chicago';

describe('Monarch sync: when the next one is', () => {
  it('is the next of 7am, 12pm, 6pm and 9pm, household time', () => {
    // 6:10am in Chicago (UTC-6 in November).
    expect(nextSyncAround(new Date('2026-11-25T12:10:00Z'), TZ)).toEqual({
      time: '07:00',
      tomorrow: false,
    });
    // Exactly 12pm: the next one is 6pm.
    expect(nextSyncAround(new Date('2026-11-25T18:00:00Z'), TZ)).toEqual({
      time: '18:00',
      tomorrow: false,
    });
    // 9:30pm: tomorrow at 7am.
    expect(nextSyncAround(new Date('2026-11-26T03:30:00Z'), TZ)).toEqual({
      time: '07:00',
      tomorrow: true,
    });
  });
});

describe('Monarch sync: which months it posts', () => {
  it('is this month, with last month in the first five days, and months with waiting plans', () => {
    expect(monthsToSync(new Date('2026-11-25T18:00:00Z'), TZ)).toEqual(['2026-11-01']);
    expect(monthsToSync(new Date('2026-12-03T18:00:00Z'), TZ)).toEqual([
      '2026-11-01',
      '2026-12-01',
    ]);
    // New Year: last month is December of the year before.
    expect(monthsToSync(new Date('2027-01-02T18:00:00Z'), TZ)).toEqual([
      '2026-12-01',
      '2027-01-01',
    ]);
    expect(
      monthsToSync(new Date('2026-11-25T18:00:00Z'), TZ, ['2027-01-01', '2026-11-01']),
    ).toEqual(['2026-11-01', '2027-01-01']);
    // The household's own date: 11pm on Nov 30 in Chicago is already December in UTC.
    expect(monthsToSync(new Date('2026-12-01T05:00:00Z'), TZ)).toEqual(['2026-11-01']);
  });
});

describe('budget CSV rows: income and transfers by their group', () => {
  it('reads Monarch’s Income and Transfers groups, and everything else as spending', () => {
    expect(budgetTypeOfGroup('Income')).toBe('income');
    expect(budgetTypeOfGroup(' transfers ')).toBe('transfer');
    expect(budgetTypeOfGroup('Food & Dining')).toBe('expense');
    expect(budgetTypeOfGroup(null)).toBe('expense');
  });
});
