import { describe, expect, it } from 'vitest';
import { STATUS_ACTIONS, STATUS_PRESENTATION } from './presentation';
import { WORK_ITEM_STATUSES } from './work-item';

describe('status presentation (G2: every status renders distinctly)', () => {
  it('gives every status its own label', () => {
    const labels = WORK_ITEM_STATUSES.map((s) => STATUS_PRESENTATION[s].label);
    expect(new Set(labels).size).toBe(WORK_ITEM_STATUSES.length);
  });

  it('never labels anything plain "Done"', () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(STATUS_PRESENTATION[status].label).not.toMatch(/^done$/i);
    }
  });

  it('keeps verified and unverified completion visibly different', () => {
    expect(STATUS_PRESENTATION.verified_complete.tone).not.toBe(
      STATUS_PRESENTATION.done_unverified.tone,
    );
  });

  it('has an action label for every status a person can move to', () => {
    for (const status of WORK_ITEM_STATUSES.filter((s) => s !== 'new')) {
      expect(STATUS_ACTIONS[status]).toBeTruthy();
    }
  });
});
