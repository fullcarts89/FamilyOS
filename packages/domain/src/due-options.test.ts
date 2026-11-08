import { describe, expect, it } from 'vitest';
import { dueOptions, formatDue } from './due-options';

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

  it('treats a weekend day as this weekend', () => {
    expect(dueOptions('2026-11-08')[2]?.date).toBe('2026-11-08'); // Sunday
    expect(dueOptions('2026-11-07')[2]?.date).toBe('2026-11-07'); // Saturday
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
  });
});
