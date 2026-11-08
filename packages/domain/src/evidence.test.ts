import { describe, expect, it } from 'vitest';
import { supportsBooked, supportsVerifiedComplete } from './evidence';

describe('evidence rules', () => {
  it('books only on vendor or member confirmation', () => {
    expect(supportsBooked(['E0', 'E1'])).toBe(false);
    expect(supportsBooked(['E2'])).toBe(true);
    expect(supportsBooked(['E3'])).toBe(true);
  });

  it('verifies completion only on member confirmation or a document', () => {
    expect(supportsVerifiedComplete(['E0', 'E1', 'E2'])).toBe(false);
    expect(supportsVerifiedComplete(['E3'])).toBe(true);
    expect(supportsVerifiedComplete(['E4'])).toBe(true);
  });
});
