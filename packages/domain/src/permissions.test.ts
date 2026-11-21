import { describe, expect, it } from 'vitest';
import { ACTIONS, ASSIGNABLE_ROLES, can, isAssignableRole } from './permissions';

describe('role permissions', () => {
  it('gives the owner every action', () => {
    for (const action of ACTIONS) expect(can('owner', action)).toBe(true);
  });

  it('keeps membership management with the owner', () => {
    expect(can('adult', 'member.invite')).toBe(false);
    expect(can('adult', 'member.remove')).toBe(false);
    expect(can('adult', 'member.add_child')).toBe(true);
  });

  it('limits caregivers to reading', () => {
    const allowed = ACTIONS.filter((action) => can('caregiver', action));
    expect(allowed).toEqual(['household.read', 'work_item.read']);
  });

  it('gives children no actions', () => {
    expect(ACTIONS.some((action) => can('child', action))).toBe(false);
  });

  it('lets only account-holding roles own work or take routine turns', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['owner', 'adult', 'caregiver']);
    for (const role of ['owner', 'adult', 'caregiver']) expect(isAssignableRole(role)).toBe(true);
    // Children and pets have no account; a role this version doesn't know is never an adult.
    for (const role of ['child', 'pet', 'guest', 'Owner', '']) {
      expect(isAssignableRole(role)).toBe(false);
    }
  });
});
