import type { CSSProperties } from 'react';
import { ArrowRightLeft, Repeat2 } from 'lucide-react';
import { people, projects, type PersonId, type Task } from '../../data';
import { useFamily } from '../../store';
import { dueText, otherAdult, whenOf } from './lib';
import { Avatar, BeadCheck, useRhythm } from './ui';

/** One task as a row: bead check, title, quiet meta, and the hand-off move for its column. */
export function TaskRow({ task, compact }: { task: Task; compact?: boolean }) {
  const { assign } = useFamily();
  const { leaving, landed } = useRhythm();
  const when = whenOf(task);
  const due = dueText(task);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const meta = [project ? project.title.replace(' renovation', '').replace(' clean-out', '') : task.area, task.notes && !compact ? task.notes.split('.')[0] : undefined].filter(Boolean);
  const owner = task.owner;
  return (
    <li
      className={`c-row ${leaving.has(task.id) ? 'leaving' : ''} ${landed === task.id ? 'landed' : ''} ${when === 'late' ? 'late' : ''}`}
      data-flip={task.id}
      data-lane={owner ?? 'shared'}
      style={(owner ? { '--pc': people[owner].color, '--pt': people[owner].tint } : { '--pc': '#15201B', '--pt': '#EFEFEA' }) as CSSProperties}
    >
      <BeadCheck task={task} />
      <div className="c-row-main">
        <span className="c-row-title">
          {task.title}
          {task.priority === 'high' && <span className="c-hi" aria-label="Important" title="Important" />}
        </span>
        <span className="c-row-meta">
          {due && <span className={`c-due ${when}`}>{due}</span>}
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {task.routineId && <Repeat2 size={13} strokeWidth={2} />}
        </span>
      </div>
      <div className="c-row-act">
        {owner === null ? (
          <>
            <button type="button" className="c-take" onClick={() => assign(task.id, 'maya')}>
              I'll take it
            </button>
            <button type="button" className="c-ask" aria-label={`Ask Theo to take ${task.title}`} title="Hand this to Theo" onClick={() => assign(task.id, 'theo')}>
              <ArrowRightLeft size={13} strokeWidth={2.2} />
              Ask Theo
            </button>
          </>
        ) : (
          <HandButton task={task} to={otherAdult(owner as PersonId)} />
        )}
      </div>
    </li>
  );
}

function HandButton({ task, to }: { task: Task; to: PersonId }) {
  const { assign } = useFamily();
  const verb = to === 'maya' ? 'Take it' : 'Hand to Theo';
  return (
    <button
      type="button"
      className="c-hand wide"
      aria-label={`${verb}: ${task.title}`}
      title={verb}
      onClick={() => assign(task.id, to)}
      style={{ '--pc': people[to].color } as CSSProperties}
    >
      <ArrowRightLeft size={14} strokeWidth={2.2} />
      <Avatar id={to} size={22} />
      <span className="c-hand-txt">{to === 'maya' ? 'Take it' : 'Theo'}</span>
    </button>
  );
}

/** A meter made of beads: hatched when late, solid today, outlined later. */
export function LoadMeter({ tasks, color }: { tasks: Task[]; color: string }) {
  const order = { late: 0, today: 1, week: 2, later: 3 } as const;
  const sorted = [...tasks].sort((a, b) => order[whenOf(a)] - order[whenOf(b)]);
  return (
    <span className="c-meter" style={{ '--pc': color } as CSSProperties} aria-hidden="true">
      {sorted.map((t) => (
        <i key={t.id} className={whenOf(t)} />
      ))}
    </span>
  );
}
