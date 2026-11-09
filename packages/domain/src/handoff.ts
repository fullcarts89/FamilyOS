import { defineStateMachine } from './state-machine';

/** A proposed change of owner. The work item's owner changes only on `accepted`. */
export const HANDOFF_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const handoffMachine = defineStateMachine<HandoffStatus>('handoff_request', {
  pending: ['accepted', 'declined', 'withdrawn'],
  accepted: [],
  declined: [],
  withdrawn: [],
});
