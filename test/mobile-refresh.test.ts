import { describe, expect, it } from 'vitest';
import {
  REFRESH_EVERY_MS,
  createWriteTracker,
  msUntilLocalMidnight,
} from '../apps/mobile/lib/refresh';

const LA = 'America/Los_Angeles';

describe('when an open screen reloads', () => {
  it('reloads every minute while visible', () => {
    expect(REFRESH_EVERY_MS).toBe(60_000);
  });

  it('knows how long until midnight in the household’s zone, not the phone’s', () => {
    // 23:59:30 in Los Angeles (UTC-8 in November) is 07:59:30 UTC.
    expect(msUntilLocalMidnight(new Date('2026-11-20T07:59:30Z'), LA)).toBe(30_000);
    // The same instant is already past midnight in London.
    expect(msUntilLocalMidnight(new Date('2026-11-20T07:59:30Z'), 'Europe/London')).toBe(
      (16 * 3600 + 30) * 1000,
    );
  });

  it('counts a short night when the clocks change (spring forward, 23 hours)', () => {
    // Saturday 2027-03-13, 1:00am PST: an ordinary night, midnight is 23 hours away.
    expect(msUntilLocalMidnight(new Date('2027-03-13T09:00:00Z'), LA)).toBe(23 * 3600 * 1000);
    // From Sunday 1am PST the day is 23 hours long: midnight is 22 hours away.
    expect(msUntilLocalMidnight(new Date('2027-03-14T09:00:00Z'), LA)).toBe(22 * 3600 * 1000);
  });
});

describe('a reload never lands on top of a write still being saved', () => {
  it('a read that started before a write is stale, even after the write ends', () => {
    const writes = createWriteTracker();
    const read = writes.snapshot();
    const done = writes.start();
    expect(writes.current(read)).toBe(false);
    done();
    expect(writes.current(read)).toBe(false);
    // A fresh read after the write is fine.
    expect(writes.current(writes.snapshot())).toBe(true);
  });

  it('a read that started during a write is stale', () => {
    const writes = createWriteTracker();
    const done = writes.start();
    const read = writes.snapshot();
    expect(writes.current(read)).toBe(false);
    done();
    expect(writes.current(read)).toBe(false);
  });

  it('says when the last write in flight has finished, once per quiet moment', () => {
    const writes = createWriteTracker();
    let idle = 0;
    writes.onIdle(() => (idle += 1));
    const a = writes.start();
    const b = writes.start();
    a();
    expect(idle).toBe(0);
    expect(writes.busy()).toBe(true);
    b();
    b();
    expect(idle).toBe(1);
    expect(writes.busy()).toBe(false);
  });
});
