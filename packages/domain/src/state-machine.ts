/**
 * Table-driven state machines (ADR-001 §5). Every state lists the states it may move to;
 * anything not listed is rejected. Guards that depend on data (for example evidence) live
 * next to the table that uses them, never inside model output.
 */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: transition ${from} -> ${to} is not allowed`);
    this.name = 'IllegalTransitionError';
  }
}

export interface StateMachine<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly table: TransitionTable<S>;
  canTransition(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  isTerminal(state: S): boolean;
}

export function defineStateMachine<S extends string>(
  name: string,
  table: TransitionTable<S>,
): StateMachine<S> {
  const states = Object.keys(table) as S[];
  for (const [from, targets] of Object.entries(table) as [S, readonly S[]][]) {
    for (const to of targets) {
      if (!(to in table)) throw new Error(`${name}: ${from} -> ${to} targets an unknown state`);
      if (to === from) throw new Error(`${name}: ${from} lists itself as a target`);
    }
  }
  return {
    name,
    states,
    table,
    canTransition: (from, to) => table[from].includes(to),
    assertTransition(from, to) {
      if (!table[from].includes(to)) throw new IllegalTransitionError(name, from, to);
    },
    isTerminal: (state) => table[state].length === 0,
  };
}
