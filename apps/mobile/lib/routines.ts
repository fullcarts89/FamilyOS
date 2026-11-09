/** Who does a routine: one person, turns between people, or nobody yet. */
export function whoLabel(
  routine: { rotation: string[]; ownerMemberId: string | null },
  memberName: (id: string | null) => string | null,
): string {
  if (routine.rotation.length > 0)
    return `Turns: ${routine.rotation.map((id) => memberName(id) ?? 'Someone').join(' → ')}`;
  return memberName(routine.ownerMemberId) ?? 'Anyone';
}
