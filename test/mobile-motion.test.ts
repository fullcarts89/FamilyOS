import { describe, expect, it } from 'vitest';
import {
  celebrationSpring,
  duration,
  linger,
  springOvershoot,
} from '../apps/mobile/design/motion/timing';

describe('motion tokens', () => {
  it('the celebration check settles with at most a 20% overshoot (it was 33%)', () => {
    expect(springOvershoot({ friction: 5, tension: 140 })).toBeCloseTo(0.33, 1);
    expect(springOvershoot(celebrationSpring)).toBeLessThanOrEqual(0.2);
    expect(springOvershoot(celebrationSpring)).toBeGreaterThan(0);
  });

  it('exits are a short fade, shorter than entrances', () => {
    expect(duration.exit).toBe(150);
    expect(duration.exit).toBeLessThan(duration.enter);
  });

  it('anything with an action stays longer than a plain confirmation', () => {
    expect(linger.toastWithAction).toBeGreaterThan(linger.toast);
    expect(linger.celebrationWithAction).toBeGreaterThan(linger.celebration);
  });
});
