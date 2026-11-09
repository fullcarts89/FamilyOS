import { defineStateMachine } from './state-machine';

/** Weekly Reset session lifecycle (PRD WF-06). Reopening a committed plan is audited. */
export const WEEKLY_PLAN_STATUSES = ['draft', 'in_session', 'committed'] as const;
export type WeeklyPlanStatus = (typeof WEEKLY_PLAN_STATUSES)[number];

export const weeklyPlanMachine = defineStateMachine<WeeklyPlanStatus>('weekly_plan', {
  draft: ['in_session', 'committed'],
  in_session: ['committed'],
  committed: ['in_session'],
});

export const WEEKLY_DECISION_STATES = ['decided', 'deferred', 'unresolved'] as const;
export type WeeklyDecisionState = (typeof WEEKLY_DECISION_STATES)[number];
