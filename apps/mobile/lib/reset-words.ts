import type { LookBackEntry, Unresolved } from './api';

/**
 * The Weekly Reset's words, derived from real data only (pure: no React Native, so it's tested
 * directly). Appreciation is written in words, item by item: nothing here counts one person's
 * work, ranks it or sets it against another's.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon" for a YYYY-MM-DD date. */
export function shortWeekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return WEEKDAYS[(day + 6) % 7] ?? '';
}

/** "a", "a and b", "a, b and c". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What a look-back entry was, in a line: "With June · Mon, Wed and Fri", "Finished the whole project". */
export function entryDetail(
  e: LookBackEntry,
  nameOf: (id: string | null) => string | null,
): string {
  const subject = nameOf(e.subjectMemberId);
  if (e.kind === 'routine') {
    const days = listWords(e.dates.map(shortWeekday));
    return subject ? `With ${subject} · ${days}` : days;
  }
  switch (e.reason) {
    case 'project':
      return 'Saw the whole project through';
    case 'subtask':
      return e.parentTitle ? `A step forward on ${e.parentTitle}` : 'A step on a project';
    case 'priority':
      return 'One of the important ones';
    case 'care':
      return subject ? `For ${subject}` : 'Looking after the family';
  }
}

/**
 * Look back's thank-you cards: both partners always, in household order (a quiet week on the
 * list is never a missing card), then anyone else who finished something that mattered.
 */
export function thankYouGroups(
  partnerIds: readonly string[],
  byMember: readonly { memberId: string | null; entries: LookBackEntry[] }[],
  known: (id: string) => boolean,
): { memberId: string; entries: LookBackEntry[] }[] {
  const entriesOf = new Map(byMember.map((g) => [g.memberId, g.entries]));
  const partners = partnerIds
    .filter(known)
    .map((id) => ({ memberId: id, entries: entriesOf.get(id) ?? [] }));
  const others = byMember.flatMap((g) =>
    g.memberId && known(g.memberId) && !partnerIds.includes(g.memberId) && g.entries.length > 0
      ? [{ memberId: g.memberId, entries: g.entries }]
      : [],
  );
  return [...partners, ...others];
}

/**
 * One sentence of thanks for what someone carried, in words: "Maya looked after June, saw
 * “Switch June to a toddler bed” through and moved the bathroom renovation forward."
 */
export function appreciation(
  name: string,
  entries: LookBackEntry[],
  nameOf: (id: string | null) => string | null,
): string {
  const phrases: string[] = [];
  const cared = [
    ...new Set(
      entries
        .filter((e) => e.reason === 'care')
        .map((e) => nameOf(e.subjectMemberId))
        .filter((n): n is string => !!n),
    ),
  ];
  if (cared.length) phrases.push(`looked after ${listWords(cared)}`);
  const projects = entries.filter((e) => e.kind === 'item' && e.reason === 'project');
  for (const p of projects.slice(0, 2)) phrases.push(`saw “${p.title}” through`);
  const finished = new Set(projects.map((p) => (p.kind === 'item' ? p.id : '')));
  const forward = [
    ...new Set(
      entries
        .filter(
          (e): e is Extract<LookBackEntry, { kind: 'item' }> =>
            e.kind === 'item' && e.reason === 'subtask' && !finished.has(e.parentId ?? ''),
        )
        .map((e) => e.parentTitle)
        .filter((t): t is string => !!t),
    ),
  ];
  if (forward.length) phrases.push(`moved ${listWords(forward.map((t) => `“${t}”`))} forward`);
  const important = entries.filter((e) => e.kind === 'item' && e.reason === 'priority');
  if (important.length) {
    phrases.push(
      important.length === 1
        ? `got “${important[0]?.title}” done`
        : 'got the important things done',
    );
  }
  if (phrases.length === 0) return `${name} kept things moving.`;
  return `${name} ${listWords(phrases.slice(0, 3))}.`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What's still open, in one honest sentence, or null when nothing important is: "One pickup
 * still needs someone, 2 decisions are open and 3 things from before are still late."
 */
export function stillOpen(unresolved: Unresolved[]): string | null {
  const care = unresolved.filter(
    (u) => u.type === 'care_unassigned' || u.type === 'handoff_conflict',
  ).length;
  const decisions = unresolved.filter((u) => u.type === 'decision_open').length;
  const late = unresolved.filter((u) => u.type === 'overdue').length;
  const parts: string[] = [];
  if (care) {
    parts.push(
      care === 1
        ? 'one drop-off or pickup still needs someone'
        : `${care} drop-offs and pickups still need someone`,
    );
  }
  if (decisions) {
    parts.push(
      decisions === 1 ? 'one decision is still open' : `${decisions} decisions are still open`,
    );
  }
  if (late) {
    parts.push(
      late === 1
        ? 'one thing from before is still late'
        : `${late} things from before are still late`,
    );
  }
  if (parts.length === 0) return null;
  const sentence = listWords(parts);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The completion line: never claims everything is handled while something important is open. */
export function completionLine(unresolved: Unresolved[]): string {
  const open = stillOpen(unresolved);
  if (!open) return 'You’re ready to take it on together.';
  const n = unresolved.length;
  return n === 1
    ? 'You’re ready to take it on together, with one thing still to sort: it’s marked below, and on Today until it’s done.'
    : `You’re ready to take it on together, with ${plural(n, 'one thing', `${n} things`)} still to sort: they’re marked below, and on Today until they’re done.`;
}

/** "Nov 16–22" or "Nov 30–Dec 6". */
export function weekRange(start: string, end: string): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  const a = `${M[(sm ?? 1) - 1]} ${sd}`;
  return sm === em ? `${a}–${ed}` : `${a}–${M[(em ?? 1) - 1]} ${ed}`;
}
