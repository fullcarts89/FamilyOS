import type { StateMachine } from './state-machine';

/** States reachable from `start` through allowed transitions (breadth-first). */
export function reachableFrom<S extends string>(machine: StateMachine<S>, start: S): Set<S> {
  const seen = new Set<S>([start]);
  const queue: S[] = [start];
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const next of machine.table[state]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
