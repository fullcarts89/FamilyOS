import type { Member, MyHousehold } from './api';

/**
 * Whether the one-screen welcome (app/(app)/welcome.tsx) is for this person: someone invited into
 * a household that already has an adult in it. It is decided from what the app loads for every
 * signed-in person (GET /me's role for this household, and the household's members), never from
 * how they got here:
 * - an owner never gets it. The first owner of a new household claims a one-time link like an
 *   invited adult does, but joins an empty household and goes to the guided setup instead;
 * - an adult or caregiver gets it only when another adult (the owner or an adult) is already
 *   there, since the screen is about sharing with them.
 * Pure, so the rule is unit-tested (test/mobile-welcome.test.ts).
 */
export function welcomeApplies(
  role: MyHousehold['role'] | undefined,
  members: readonly { role: Member['role']; isMe: boolean }[],
): boolean {
  if (role !== 'adult' && role !== 'caregiver') return false;
  return members.some((m) => !m.isMe && (m.role === 'owner' || m.role === 'adult'));
}
