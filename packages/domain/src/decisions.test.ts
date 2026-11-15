import { describe, expect, it } from 'vitest';
import { agreedOption } from './decisions';

describe('agreement on a decision', () => {
  const adults = ['maya', 'theo'];

  it('is reached when both adults chose the same option', () => {
    expect(
      agreedOption(adults, [
        { memberId: 'maya', optionId: 'a' },
        { memberId: 'theo', optionId: 'a' },
      ]),
    ).toBe('a');
  });

  it('waits for every adult and for the same choice', () => {
    expect(agreedOption(adults, [{ memberId: 'maya', optionId: 'a' }])).toBeNull();
    expect(
      agreedOption(adults, [
        { memberId: 'maya', optionId: 'a' },
        { memberId: 'theo', optionId: 'b' },
      ]),
    ).toBeNull();
  });

  it('ignores votes from anyone who is not one of the adults', () => {
    expect(
      agreedOption(
        ['maya'],
        [
          { memberId: 'maya', optionId: 'a' },
          { memberId: 'former', optionId: 'b' },
        ],
      ),
    ).toBe('a');
    expect(agreedOption([], [{ memberId: 'maya', optionId: 'a' }])).toBeNull();
  });
});
