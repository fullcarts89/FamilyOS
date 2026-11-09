import { describe, expect, it } from 'vitest';
import { AGENT_RUN_STATES, agentRunMachine } from './agent-run';
import { reachableFrom } from './reachability';

describe('agent run state', () => {
  it('reaches every state from planned', () => {
    expect([...reachableFrom(agentRunMachine, 'planned')].sort()).toEqual(
      [...AGENT_RUN_STATES].sort(),
    );
  });

  it('has closed, failed and cancelled as the only terminal states', () => {
    const terminal = AGENT_RUN_STATES.filter((s) => agentRunMachine.isTerminal(s));
    expect(terminal.sort()).toEqual(['cancelled', 'closed', 'failed']);
  });

  it('enters sending only from an approval state', () => {
    const into = AGENT_RUN_STATES.filter((s) => agentRunMachine.canTransition(s, 'sending'));
    expect(into.sort()).toEqual(['awaiting_approval', 'awaiting_booking_approval']);
  });

  it('never retries from delivery_unknown straight into sending', () => {
    expect(agentRunMachine.canTransition('delivery_unknown', 'sending')).toBe(false);
  });

  it('reaches booked only after a booking request', () => {
    const into = AGENT_RUN_STATES.filter((s) => agentRunMachine.canTransition(s, 'booked'));
    expect(into).toEqual(['booking_requested']);
  });
});
