import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTLE_FADE_MS,
  SETTLE_HOLD_MS,
  createSettler,
  type Settler,
} from '../apps/mobile/lib/use-settle';

const open = { status: 'ready' as const };
const done = (id: string) => ({ id, status: 'verified_complete' as const });

describe('the moment after ticking something off', () => {
  let settler: Settler;
  beforeEach(() => {
    vi.useFakeTimers();
    settler = createSettler();
  });
  afterEach(() => {
    settler.dispose();
    vi.useRealTimers();
  });

  it('holds a finished row for 1.2 s, fades it, then lets it go', () => {
    expect(SETTLE_HOLD_MS).toBe(1200);
    settler.observe(open, done('a'));
    expect(settler.snapshot().get('a')).toBe('held');
    vi.advanceTimersByTime(SETTLE_HOLD_MS - 1);
    expect(settler.snapshot().get('a')).toBe('held');
    vi.advanceTimersByTime(1);
    expect(settler.snapshot().get('a')).toBe('leaving');
    vi.advanceTimersByTime(SETTLE_FADE_MS);
    expect(settler.snapshot().has('a')).toBe(false);
  });

  it('a failed save (the item open again) ends the moment at once', () => {
    settler.observe(open, done('a'));
    vi.advanceTimersByTime(60);
    settler.observe(done('a'), { id: 'a', ...open });
    expect(settler.snapshot().has('a')).toBe(false);
    // And no stray timer brings it back.
    vi.advanceTimersByTime(5000);
    expect(settler.snapshot().has('a')).toBe(false);
  });

  it('keeps each of several quick ticks on its own clock', () => {
    settler.observe(open, done('a'));
    vi.advanceTimersByTime(150);
    settler.observe(open, done('b'));
    vi.advanceTimersByTime(150);
    settler.observe(open, done('c'));
    expect([...settler.snapshot().keys()]).toEqual(['a', 'b', 'c']);
    vi.advanceTimersByTime(SETTLE_HOLD_MS - 300);
    expect(settler.snapshot().get('a')).toBe('leaving');
    expect(settler.snapshot().get('c')).toBe('held');
    vi.advanceTimersByTime(SETTLE_FADE_MS + 300);
    expect([...settler.snapshot().keys()]).toEqual([]);
  });

  it('only something newly done starts the moment; the server’s confirmation doesn’t restart it', () => {
    settler.observe(undefined, done('x'));
    settler.observe(done('y'), done('y'));
    expect(settler.snapshot().size).toBe(0);
    settler.observe(open, done('a'));
    vi.advanceTimersByTime(1000);
    settler.observe(done('a'), done('a'));
    vi.advanceTimersByTime(200);
    expect(settler.snapshot().get('a')).toBe('leaving');
  });

  it('tells its subscribers about every change, with a new snapshot each time', () => {
    const seen: ReadonlyMap<string, string>[] = [];
    const stop = settler.subscribe(() => seen.push(settler.snapshot()));
    settler.observe(open, done('a'));
    vi.advanceTimersByTime(SETTLE_HOLD_MS + SETTLE_FADE_MS);
    stop();
    expect(seen.map((m) => m.get('a') ?? 'gone')).toEqual(['held', 'leaving', 'gone']);
    expect(new Set(seen).size).toBe(3);
  });
});
