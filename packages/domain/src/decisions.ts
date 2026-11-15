/**
 * Household decisions (Weekly Reset, "Decide"). Each adult votes once and can change their vote.
 * A decision is decided by agreement when every adult has voted and all chose the same option;
 * otherwise it stays open until an adult makes the call. Pure: the caller passes the adults.
 */
export const DECISION_STATUSES = ['open', 'decided', 'dropped'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** The most options one decision may have. */
export const MAX_DECISION_OPTIONS = 8;

export interface DecisionVote {
  memberId: string;
  optionId: string;
}

/**
 * The option every adult agreed on, or null. Votes from anyone who isn't one of `adultIds`
 * (a removed member, say) don't count, and a household with no adults agrees on nothing.
 */
export function agreedOption(
  adultIds: readonly string[],
  votes: readonly DecisionVote[],
): string | null {
  if (adultIds.length === 0) return null;
  const chosen = new Set<string>();
  for (const adult of adultIds) {
    const vote = votes.find((v) => v.memberId === adult);
    if (!vote) return null;
    chosen.add(vote.optionId);
  }
  return chosen.size === 1 ? ([...chosen][0] ?? null) : null;
}
