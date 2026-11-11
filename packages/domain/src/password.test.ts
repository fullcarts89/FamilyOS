import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, passwordProblem } from './password';

describe('passwordProblem', () => {
  it('needs at least the minimum length, counted in characters', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too_short');
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordProblem('correct horse battery')).toBeNull();
    // Twelve emoji are twelve characters, though more UTF-16 units.
    expect(passwordProblem('🏠'.repeat(12))).toBeNull();
  });

  it('refuses passwords bcrypt would truncate', () => {
    expect(passwordProblem('a'.repeat(72))).toBeNull();
    expect(passwordProblem('a'.repeat(73))).toBe('too_long');
    expect(passwordProblem('é'.repeat(37))).toBe('too_long');
  });
});
