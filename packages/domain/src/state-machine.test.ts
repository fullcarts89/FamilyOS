import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, defineStateMachine } from './state-machine';

describe('defineStateMachine', () => {
  const machine = defineStateMachine<'a' | 'b' | 'c'>('demo', { a: ['b'], b: ['c'], c: [] });

  it('allows only listed transitions', () => {
    expect(machine.canTransition('a', 'b')).toBe(true);
    expect(machine.canTransition('a', 'c')).toBe(false);
    expect(() => machine.assertTransition('a', 'c')).toThrow(IllegalTransitionError);
  });

  it('reports terminal states', () => {
    expect(machine.isTerminal('c')).toBe(true);
    expect(machine.isTerminal('a')).toBe(false);
  });

  it('rejects tables that target unknown states or loop on themselves', () => {
    expect(() => defineStateMachine('bad', { a: ['z' as 'a'] })).toThrow(/unknown state/);
    expect(() => defineStateMachine('bad', { a: ['a'] })).toThrow(/lists itself/);
  });
});
