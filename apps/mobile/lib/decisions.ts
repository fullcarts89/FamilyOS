import { useCallback, useEffect, useRef } from 'react';
import { useCelebrate, useHaptics } from '../design/motion';
import { useToast } from '../design/Toast';
import { api, errorMessage, type Decision } from './api';
import { usePressTick } from './events';
import { useHousehold } from './household';
import { usePeople } from './people';

/** The milestone key for a decision settled together: shown once per person. */
export const decidedKey = (id: string) => `decided:${id}`;

/** The option a decision landed on. */
export const decidedLabel = (d: Decision) =>
  d.options.find((o) => o.id === d.decidedOptionId)?.label ?? null;

/**
 * Voting and deciding, optimistic where it's safe: my vote shows at once and goes back if the
 * API refuses. "Decided together" is celebrated only once the server says so (both voted the same
 * way, or we agreed on one screen), and only once per person.
 */
export function useDecisionActions(onChange: (d: Decision) => void) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const haptics = useHaptics();
  const tick = usePressTick();
  const { celebrate } = useCelebrate();
  const base = household ? `/households/${household.id}/decisions` : '';

  const settled = useCallback(
    (d: Decision) => {
      const label = decidedLabel(d);
      celebrate({
        key: decidedKey(d.id),
        title: 'Decided together',
        line: label ? `${d.question} ${label}.` : d.question,
        colors: people.adults.map((p) => p.color),
      });
    },
    [celebrate, people.adults],
  );

  const vote = useCallback(
    async (d: Decision, optionId: string): Promise<Decision | null> => {
      const me = people.me?.id ?? '';
      // A tick under the finger now; the success haptic once the server has the vote.
      tick();
      onChange({
        ...d,
        myVoteOptionId: optionId,
        votes: [
          ...d.votes.filter((v) => v.memberId !== me),
          { memberId: me, optionId, votedAt: new Date().toISOString() },
        ],
        waitingOn: d.waitingOn.filter((id) => id !== me),
      });
      try {
        const { decision } = await api<{ decision: Decision }>(`${base}/${d.id}/vote`, {
          method: 'POST',
          body: { optionId },
        });
        onChange(decision);
        if (decision.status === 'decided') settled(decision);
        else {
          haptics.light();
          const waiting = decision.waitingOn
            .map((id) => people.byId(id))
            .filter((p) => p && !p.isMe)
            .map((p) => p?.name);
          const label = d.options.find((o) => o.id === optionId)?.label ?? '';
          const others = decision.votes.filter((v) => v.memberId !== me);
          toast.show(`Your vote: ${label}`, {
            detail: waiting.length
              ? `Waiting on ${waiting.join(' and ')}.`
              : others.length
                ? 'You picked differently. Talk it through, or one of you makes the call.'
                : undefined,
          });
        }
        return decision;
      } catch (caught) {
        onChange(d);
        toast.show('Couldn’t save your vote.', { error: true, detail: errorMessage(caught) });
        return null;
      }
    },
    [base, people, haptics, tick, onChange, toast, settled],
  );

  /** On one screen, both agree out loud: settle it on the option you both chose. */
  const decideTogether = useCallback(
    async (d: Decision, optionId: string): Promise<Decision | null> => {
      try {
        const { decision } = await api<{ decision: Decision }>(`${base}/${d.id}/decide`, {
          method: 'POST',
          body: { optionId, expectedVersion: d.version },
        });
        onChange(decision);
        settled(decision);
        return decision;
      } catch (caught) {
        toast.show('Couldn’t settle that one.', { error: true, detail: errorMessage(caught) });
        return null;
      }
    },
    [base, onChange, settled, toast],
  );

  const reopen = useCallback(
    async (d: Decision): Promise<Decision | null> => {
      try {
        const { decision } = await api<{ decision: Decision }>(`${base}/${d.id}/reopen`, {
          method: 'POST',
          body: { expectedVersion: d.version },
        });
        onChange(decision);
        toast.show(`Open again: ${d.question}`);
        return decision;
      } catch (caught) {
        toast.show('Couldn’t reopen it.', { error: true, detail: errorMessage(caught) });
        return null;
      }
    },
    [base, onChange, toast],
  );

  const create = useCallback(
    async (input: {
      question: string;
      options: string[];
      dueOn?: string | null;
      context?: string | null;
    }): Promise<Decision | null> => {
      try {
        const { decision } = await api<{ decision: Decision }>(base, {
          method: 'POST',
          body: {
            question: input.question.trim(),
            ...(input.context?.trim() && { context: input.context.trim() }),
            ...(input.dueOn && { dueOn: input.dueOn }),
            options: input.options
              .map((o) => o.trim())
              .filter(Boolean)
              .map((label) => ({ label })),
          },
        });
        onChange(decision);
        toast.show('Added to decide together', { detail: decision.question });
        return decision;
      } catch (caught) {
        toast.show('Couldn’t add that decision.', { error: true, detail: errorMessage(caught) });
        return null;
      }
    },
    [base, onChange, toast],
  );

  return { vote, decideTogether, reopen, create, settled };
}

const RECENT_MS = 3 * 24 * 3600 * 1000;

/**
 * Notices a decision settled elsewhere (your partner's vote on their phone completed the
 * agreement) and acknowledges it here, once per person. On first load, only a recent one
 * someone else settled counts; after that, any that turns decided while you watch.
 */
export function useSettledWatcher(
  all: Decision[] | null,
  settled: (d: Decision) => void,
  meId: string | null | undefined,
) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!all) return;
    const decided = all.filter((d) => d.status === 'decided');
    if (seen.current === null) {
      seen.current = new Set(decided.map((d) => d.id));
      const fresh = decided
        .filter((d) => d.decidedAt && Date.now() - new Date(d.decidedAt).getTime() < RECENT_MS)
        .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))[0];
      if (fresh && fresh.decidedByMemberId !== meId) settled(fresh);
      return;
    }
    for (const d of decided) {
      if (!seen.current.has(d.id)) {
        seen.current.add(d.id);
        settled(d);
      }
    }
  }, [all, settled, meId]);
}
