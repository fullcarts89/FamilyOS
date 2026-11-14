import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check } from 'lucide-react';
import { people, type PersonId, type Task } from '../../data';
import { useFamily } from '../../store';
import { reduceMotion } from './lib';
import type { Screen } from '../types';

export type Lane = 'maya' | 'theo' | 'june';

interface RhythmCtx {
  focus: Lane | null;
  setFocus: (l: Lane | null) => void;
  phone: boolean;
  openCapture: (owner?: PersonId | null) => void;
  /** The last captured task, so it can land visibly. */
  landed: string | null;
  /** Ids mid-completion (shrinking), and the last one completed (its bead pops). */
  leaving: Set<string>;
  popped: string | null;
  complete: (t: Task) => void;
  go: (s: Screen) => void;
}

export const Rhythm = createContext<RhythmCtx | null>(null);
export function useRhythm(): RhythmCtx {
  const v = useContext(Rhythm);
  if (!v) throw new Error('useRhythm outside DirectionC');
  return v;
}

/** Completing: the row shrinks first, then the task is marked done and its bead fills. */
export function useCompletion() {
  const { toggleTask } = useFamily();
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [popped, setPopped] = useState<string | null>(null);
  const complete = (t: Task) => {
    if (t.done) {
      toggleTask(t.id, 'maya');
      return;
    }
    const by = (t.owner ?? 'maya') as PersonId;
    const finish = () => {
      toggleTask(t.id, by);
      setPopped(t.id);
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
    };
    if (reduceMotion()) return finish();
    setLeaving((s) => new Set(s).add(t.id));
    window.setTimeout(finish, 280);
  };
  return { leaving, popped, complete };
}

export function Avatar({ id, size = 28, ring, className = '' }: { id: PersonId; size?: number; ring?: boolean; className?: string }) {
  const p = people[id];
  return (
    <span
      className={`c-av ${ring ? 'ring' : ''} ${className}`}
      style={{ '--pc': p.color, '--pt': p.tint, width: size, height: size, fontSize: size * 0.44 } as CSSProperties}
      aria-hidden="true"
    >
      {p.initials}
    </span>
  );
}

/** The round "bead" check: hollow in the owner's color, fills when done. */
export function BeadCheck({ task, label }: { task: Task; label?: string }) {
  const { complete } = useRhythm();
  const c = task.owner ? people[task.owner].color : '#15201B';
  return (
    <button
      type="button"
      className={`c-beadcheck ${task.done ? 'done' : ''}`}
      style={{ '--pc': c } as CSSProperties}
      aria-label={label ?? (task.done ? `Reopen ${task.title}` : `Complete ${task.title}`)}
      aria-pressed={task.done}
      onClick={() => complete(task)}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

export function Simulated() {
  return <span className="c-sim">Simulated</span>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="c-kicker">{children}</div>;
}

/** FLIP: rows marked data-flip glide to their new place when the list reshuffles. */
export function useFlip(ref: RefObject<HTMLElement>) {
  const prev = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const calm = reduceMotion();
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip!;
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - base.left, y: r.top - base.top };
      next.set(id, pos);
      const p = prev.current.get(id);
      if (calm || !p) return;
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: Math.abs(dx) > 40 ? 520 : 320, easing: 'cubic-bezier(.2,.75,.2,1)' },
        );
      }
    });
    prev.current = next;
  });
}

/** Width/height of an element, kept current. */
export function useSize<T extends HTMLElement>(): [RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export const pc = (id: PersonId | null | undefined): CSSProperties =>
  (id
    ? { '--pc': people[id].color, '--pt': people[id].tint }
    : { '--pc': '#15201B', '--pt': '#EFEFEA' }) as CSSProperties;

/** "Either of you": two overlapping dots, one per adult. */
export function Either({ size = 28 }: { size?: number }) {
  return (
    <span className="c-either" style={{ width: size, height: size }} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
