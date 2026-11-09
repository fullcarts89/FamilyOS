import { describe, expect, it } from 'vitest';
import { handoffMachine } from './handoff';
import { weeklyPlanMachine } from './weekly-plan';

describe('weekly plan', () => {
  it('commits from draft or in_session and reopens only into in_session', () => {
    expect(weeklyPlanMachine.canTransition('draft', 'committed')).toBe(true);
    expect(weeklyPlanMachine.canTransition('in_session', 'committed')).toBe(true);
    expect(weeklyPlanMachine.table.committed).toEqual(['in_session']);
    expect(weeklyPlanMachine.canTransition('committed', 'draft')).toBe(false);
  });
});

describe('handoff request', () => {
  it('resolves exactly once', () => {
    for (const end of ['accepted', 'declined', 'withdrawn'] as const) {
      expect(handoffMachine.canTransition('pending', end)).toBe(true);
      expect(handoffMachine.isTerminal(end)).toBe(true);
    }
  });
});
