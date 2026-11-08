/**
 * Evidence levels (ADR-001 §5). Completion is derived from evidence rows, never from
 * model output: E0 (an agent's own assertion) can never change state.
 */
export const EVIDENCE_LEVELS = ['E0', 'E1', 'E2', 'E3', 'E4'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_MEANING: Readonly<Record<EvidenceLevel, string>> = {
  E0: 'Agent assertion',
  E1: 'Provider receipt (message ID, delivery event)',
  E2: 'Authenticated third-party message',
  E3: 'Explicit household-member confirmation',
  E4: 'Document (invoice, receipt)',
};

const hasAny = (levels: Iterable<EvidenceLevel>, wanted: readonly EvidenceLevel[]): boolean => {
  for (const level of levels) if (wanted.includes(level)) return true;
  return false;
};

/** A booking counts only with vendor confirmation (E2) or a household member's (E3). */
export const supportsBooked = (levels: Iterable<EvidenceLevel>): boolean =>
  hasAny(levels, ['E2', 'E3']);

/** Verified completion needs a member's confirmation (E3) or a document (E4). */
export const supportsVerifiedComplete = (levels: Iterable<EvidenceLevel>): boolean =>
  hasAny(levels, ['E3', 'E4']);
