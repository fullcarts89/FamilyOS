import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ASSIGNABLE_ROLES,
  MEMBER_ROLES,
  can,
  isAssignableRole,
  isCaredFor,
} from './permissions';

describe('role permissions', () => {
  it('gives the owner every action', () => {
    for (const action of ACTIONS) expect(can('owner', action)).toBe(true);
  });

  it('keeps membership management with the owner', () => {
    expect(can('adult', 'member.invite')).toBe(false);
    expect(can('adult', 'member.remove')).toBe(false);
    expect(can('adult', 'member.add_child')).toBe(true);
    expect(can('adult', 'member.add_pet')).toBe(true);
    expect(can('adult', 'member.update')).toBe(true);
  });

  it('lets adults manage events and caregivers only read them', () => {
    expect(can('adult', 'event.manage')).toBe(true);
    expect(can('caregiver', 'event.read')).toBe(true);
    expect(can('caregiver', 'event.manage')).toBe(false);
    expect(can('adult', 'calendar.manage')).toBe(true);
    expect(can('caregiver', 'calendar.manage')).toBe(false);
  });

  it('limits caregivers to reading', () => {
    const allowed = ACTIONS.filter((action) => can('caregiver', action));
    expect(allowed).toEqual([
      'household.read',
      'work_item.read',
      'event.read',
      'meal.read',
      'contact.read',
    ]);
  });

  it('keeps decisions, budgets and the weekly plan with the adults', () => {
    for (const action of [
      'decision.read',
      'decision.manage',
      'budget.read',
      'budget.import',
      'reset.run',
      'meal.manage',
      'contact.manage',
      'household.update',
    ] as const) {
      expect(can('adult', action)).toBe(true);
      expect(can('caregiver', action)).toBe(false);
    }
  });

  it('gives children and pets no actions', () => {
    expect(ACTIONS.some((action) => can('child', action))).toBe(false);
    expect(ACTIONS.some((action) => can('pet', action))).toBe(false);
  });

  it('treats children and pets as cared-for members', () => {
    expect(MEMBER_ROLES.filter(isCaredFor)).toEqual(['child', 'pet']);
  });

  it('lets only account-holding roles own work or take routine turns', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['owner', 'adult', 'caregiver']);
    for (const role of ['owner', 'adult', 'caregiver']) expect(isAssignableRole(role)).toBe(true);
    // Children and pets have no account; a role this version doesn't know is never an adult.
    for (const role of ['child', 'pet', 'guest', 'Owner', '']) {
      expect(isAssignableRole(role)).toBe(false);
    }
  });

  it('makes every known role either assignable or cared for, never both', () => {
    for (const role of MEMBER_ROLES) expect(isAssignableRole(role)).toBe(!isCaredFor(role));
  });
});
