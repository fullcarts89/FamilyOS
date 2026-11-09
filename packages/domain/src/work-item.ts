import { defineStateMachine } from './state-machine';
import { supportsVerifiedComplete, type EvidenceLevel } from './evidence';

/** What the household sees (ADR-001 §5). Separate from the machine state of an agent run. */
export const WORK_ITEM_STATUSES = [
  'new',
  'ready',
  'in_progress',
  'needs_you',
  'waiting_on_others',
  'scheduled',
  'awaiting_completion',
  'verified_complete',
  'done_unverified',
  'blocked',
  'cancelled',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const workItemMachine = defineStateMachine<WorkItemStatus>('work_item', {
  new: ['ready', 'in_progress', 'cancelled'],
  ready: [
    'in_progress',
    'needs_you',
    'scheduled',
    'blocked',
    'done_unverified',
    'verified_complete',
    'cancelled',
  ],
  in_progress: [
    'needs_you',
    'waiting_on_others',
    'scheduled',
    'awaiting_completion',
    'blocked',
    'done_unverified',
    'verified_complete',
    'cancelled',
  ],
  needs_you: [
    'in_progress',
    'waiting_on_others',
    'scheduled',
    'blocked',
    'done_unverified',
    'verified_complete',
    'cancelled',
  ],
  waiting_on_others: ['in_progress', 'needs_you', 'scheduled', 'blocked', 'cancelled'],
  scheduled: ['in_progress', 'needs_you', 'awaiting_completion', 'cancelled'],
  awaiting_completion: ['in_progress', 'needs_you', 'done_unverified', 'verified_complete'],
  // An honest "done" without proof; adding evidence later upgrades it.
  done_unverified: ['verified_complete', 'in_progress'],
  // Reopening is allowed and audited like any other transition.
  verified_complete: ['in_progress'],
  blocked: ['ready', 'in_progress', 'needs_you', 'cancelled'],
  cancelled: ['ready'],
});

export class MissingEvidenceError extends Error {
  constructor() {
    super('verified_complete requires E3 (member confirmation) or E4 (document) evidence');
    this.name = 'MissingEvidenceError';
  }
}

/**
 * The only entry point for status changes: checks the table, then the evidence rule.
 * Marking something done without evidence must use `done_unverified`.
 */
export function assertWorkItemTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
  evidence: Iterable<EvidenceLevel> = [],
): void {
  workItemMachine.assertTransition(from, to);
  if (to === 'verified_complete' && !supportsVerifiedComplete(evidence)) {
    throw new MissingEvidenceError();
  }
}
