import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_LEVELS, type EvidenceLevel } from './evidence';
import { reachableFrom } from './reachability';
import { IllegalTransitionError } from './state-machine';
import {
  MissingEvidenceError,
  WORK_ITEM_STATUSES,
  assertWorkItemTransition,
  workItemMachine,
} from './work-item';

describe('work item status', () => {
  it('reaches every status from new', () => {
    expect([...reachableFrom(workItemMachine, 'new')].sort()).toEqual(
      [...WORK_ITEM_STATUSES].sort(),
    );
  });

  it('requires E3 or E4 evidence for verified_complete', () => {
    expect(() => assertWorkItemTransition('in_progress', 'verified_complete')).toThrow(
      MissingEvidenceError,
    );
    expect(() =>
      assertWorkItemTransition('in_progress', 'verified_complete', ['E0', 'E1', 'E2']),
    ).toThrow(MissingEvidenceError);
    expect(() =>
      assertWorkItemTransition('in_progress', 'verified_complete', ['E3']),
    ).not.toThrow();
    expect(() =>
      assertWorkItemTransition('awaiting_completion', 'verified_complete', ['E4']),
    ).not.toThrow();
  });

  it('lets a household member mark done without evidence only as done_unverified', () => {
    expect(() => assertWorkItemTransition('in_progress', 'done_unverified')).not.toThrow();
    expect(() =>
      assertWorkItemTransition('done_unverified', 'verified_complete', ['E4']),
    ).not.toThrow();
  });

  it('never lets agent assertions (E0) or receipts (E1) verify completion, from any status', () => {
    const lowEvidence = fc.subarray<EvidenceLevel>(['E0', 'E1', 'E2']);
    fc.assert(
      fc.property(fc.constantFrom(...WORK_ITEM_STATUSES), lowEvidence, (from, evidence) => {
        expect(() => assertWorkItemTransition(from, 'verified_complete', evidence)).toThrow();
      }),
    );
  });

  it('accepts exactly the transitions in the table, for any pair and any evidence', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WORK_ITEM_STATUSES),
        fc.constantFrom(...WORK_ITEM_STATUSES),
        fc.subarray([...EVIDENCE_LEVELS]),
        (from, to, evidence) => {
          let error: unknown;
          try {
            assertWorkItemTransition(from, to, evidence);
          } catch (caught) {
            error = caught;
          }
          if (!workItemMachine.canTransition(from, to)) {
            expect(error).toBeInstanceOf(IllegalTransitionError);
          } else if (
            to === 'verified_complete' &&
            !evidence.some((e) => e === 'E3' || e === 'E4')
          ) {
            expect(error).toBeInstanceOf(MissingEvidenceError);
          } else {
            expect(error).toBeUndefined();
          }
        },
      ),
    );
  });
});
