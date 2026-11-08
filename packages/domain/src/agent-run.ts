import { defineStateMachine } from './state-machine';

/**
 * Machine state of a delegated run (ADR-001 §5). Provisional until the control plane is
 * built in M12, where the scenario suite (plan §1.1) pins every transition.
 */
export const AGENT_RUN_STATES = [
  'planned',
  'researching',
  'drafting',
  'awaiting_approval',
  'sending',
  'delivery_unknown',
  'awaiting_reply',
  'awaiting_user_decision',
  'awaiting_booking_approval',
  'booking_requested',
  'booked',
  'awaiting_completion_evidence',
  'closed',
  'failed',
  'cancelled',
] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export const agentRunMachine = defineStateMachine<AgentRunState>('agent_run', {
  planned: ['researching', 'drafting', 'failed', 'cancelled'],
  researching: ['drafting', 'awaiting_user_decision', 'failed', 'cancelled'],
  drafting: ['awaiting_approval', 'failed', 'cancelled'],
  // Rejected or edited drafts go back to drafting and need a fresh approval.
  awaiting_approval: ['sending', 'drafting', 'cancelled'],
  // A send whose outcome is unknown is surfaced to a person, never retried blindly.
  sending: ['awaiting_reply', 'booking_requested', 'delivery_unknown', 'failed'],
  delivery_unknown: ['awaiting_reply', 'booking_requested', 'drafting', 'cancelled'],
  awaiting_reply: ['awaiting_user_decision', 'drafting', 'closed', 'cancelled'],
  awaiting_user_decision: ['drafting', 'awaiting_booking_approval', 'closed', 'cancelled'],
  awaiting_booking_approval: ['sending', 'awaiting_user_decision', 'cancelled'],
  booking_requested: ['booked', 'awaiting_user_decision', 'cancelled'],
  booked: ['awaiting_completion_evidence', 'cancelled'],
  awaiting_completion_evidence: ['closed', 'cancelled'],
  closed: [],
  failed: [],
  cancelled: [],
});
