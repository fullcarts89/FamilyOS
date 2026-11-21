import { describe, expect, it } from 'vitest';
import { welcomeApplies } from '../apps/mobile/lib/welcome';

const me = (role: 'owner' | 'adult' | 'caregiver') => ({ role, isMe: true });
const other = (role: 'owner' | 'adult' | 'caregiver' | 'child' | 'pet') => ({ role, isMe: false });

describe('who gets the one-screen welcome', () => {
  it('an adult invited into a household with its owner', () => {
    expect(welcomeApplies('adult', [other('owner'), me('adult'), other('child')])).toBe(true);
  });

  it('a caregiver invited by an adult', () => {
    expect(welcomeApplies('caregiver', [other('adult'), me('caregiver')])).toBe(true);
  });

  it('never the first owner of a new household (they go to the guided setup)', () => {
    expect(welcomeApplies('owner', [me('owner')])).toBe(false);
  });

  it('never an owner, even once others have joined', () => {
    expect(welcomeApplies('owner', [me('owner'), other('adult')])).toBe(false);
  });

  it('not an adult with nobody else to share with yet (only children or pets)', () => {
    expect(welcomeApplies('adult', [me('adult'), other('child'), other('pet')])).toBe(false);
  });

  it('not while the role is unknown', () => {
    expect(welcomeApplies(undefined, [other('owner')])).toBe(false);
  });
});
