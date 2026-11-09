import type { WorkItemStatus } from './work-item';

/**
 * How each status reads in the app (PRD §10: never a generic "Done" without evidence).
 * Every status has its own label; tone picks the colour family.
 */
export type StatusTone =
  'neutral' | 'attention' | 'active' | 'waiting' | 'done' | 'unverified' | 'stopped';

export const STATUS_PRESENTATION: Readonly<
  Record<WorkItemStatus, { label: string; tone: StatusTone }>
> = {
  new: { label: 'In inbox', tone: 'neutral' },
  ready: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'active' },
  needs_you: { label: 'Needs you', tone: 'attention' },
  waiting_on_others: { label: 'Waiting on others', tone: 'waiting' },
  scheduled: { label: 'Scheduled', tone: 'waiting' },
  awaiting_completion: { label: 'Confirm it’s done', tone: 'attention' },
  verified_complete: { label: 'Verified complete', tone: 'done' },
  done_unverified: { label: 'Marked done (not verified)', tone: 'unverified' },
  blocked: { label: 'Blocked', tone: 'stopped' },
  cancelled: { label: 'Cancelled', tone: 'stopped' },
};

/** Status changes a person can pick from a given status, in a sensible order for the UI. */
export const STATUS_ACTIONS: Readonly<Partial<Record<WorkItemStatus, string>>> = {
  ready: 'Move to to-do',
  in_progress: 'Start',
  needs_you: 'Needs a decision',
  waiting_on_others: 'Waiting on someone',
  scheduled: 'Scheduled',
  awaiting_completion: 'Ask to confirm',
  verified_complete: 'Done — I confirm it',
  done_unverified: 'Mark done (can’t confirm)',
  blocked: 'Blocked',
  cancelled: 'Cancel',
};
