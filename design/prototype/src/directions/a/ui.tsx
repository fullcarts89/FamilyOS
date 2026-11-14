// Shared building blocks for Direction A: avatars, checkboxes, chips, task rows, decisions, toasts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Flag, Hourglass, Undo2, X, Folder } from 'lucide-react';
import { people, type Decision, type PersonId, type Task } from '../../data';
import { dueLabel, useFamily, type Toast } from '../../store';
import { TODAY, TOMORROW, WEEKEND, cx, isLate, projectTitle, tshort } from './helpers';

export const ic = { size: 18, strokeWidth: 1.75 } as const;
export const icSm = { size: 16, strokeWidth: 1.75 } as const;

// --- People -------------------------------------------------------------------------------------

export function Avatar({ id, size = 24, ring = false, title }: { id: PersonId; size?: number; ring?: boolean; title?: string }) {
  const p = people[id];
  return (
    <span
      className={cx('a-av', ring && 'a-av--ring')}
      style={{ width: size, height: size, background: p.color, fontSize: Math.round(size * 0.46) }}
      title={title ?? p.name}
      aria-label={title ?? p.name}
      role="img"
    >
      {p.initials}
    </span>
  );
}

/** Two-tone dot meaning "either of you". */
export function EitherMark({ size = 24 }: { size?: number }) {
  return (
    <span className="a-either" style={{ width: size, height: size }} role="img" aria-label="Either of you" title="Either of you">
      <span style={{ background: people.maya.color }} />
      <span style={{ background: people.theo.color }} />
    </span>
  );
}

export function OwnerMark({ owner, size = 22 }: { owner: PersonId | null; size?: number }) {
  return owner ? <Avatar id={owner} size={size} /> : <EitherMark size={size} />;
}

export function AvatarStack({ ids, size = 24 }: { ids: PersonId[]; size?: number }) {
  return (
    <span className="a-stack" aria-label={ids.map((i) => people[i].name).join(', ')}>
      {ids.map((i) => (
        <Avatar key={i} id={i} size={size} ring />
      ))}
    </span>
  );
}

// --- Inputs -------------------------------------------------------------------------------------

export function CheckCircle({
  checked,
  onChange,
  label,
  late,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  late?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('a-check', checked && 'is-on', late && 'is-late')}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <Check size={13} strokeWidth={2.75} aria-hidden="true" />
    </button>
  );
}

type OwnerChoice = PersonId | null;
const OWNER_CHOICES: { id: OwnerChoice; label: string }[] = [
  { id: 'maya', label: 'Me' },
  { id: 'theo', label: 'Theo' },
  { id: null, label: 'Either' },
];

export function OwnerSwitch({
  value,
  onChange,
  size = 'md',
  label = 'Who',
}: {
  value: OwnerChoice;
  onChange: (o: OwnerChoice) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <div className={cx('a-owner-switch', size === 'sm' && 'is-sm')} role="radiogroup" aria-label={label}>
      {OWNER_CHOICES.map((c) => (
        <button
          key={c.label}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          className={cx('a-pill', value === c.id && 'is-on')}
          onClick={(e) => {
            e.stopPropagation();
            onChange(c.id);
          }}
        >
          <OwnerMark owner={c.id} size={size === 'sm' ? 16 : 18} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

const WHEN: { label: string; due: string | undefined }[] = [
  { label: 'Today', due: TODAY },
  { label: 'Tomorrow', due: TOMORROW },
  { label: 'This weekend', due: WEEKEND },
  { label: 'No date', due: undefined },
];

export function WhenChips({ value, onChange }: { value: string | undefined; onChange: (d: string | undefined) => void }) {
  const known = WHEN.some((w) => w.due === value);
  return (
    <div className="a-chiprow" role="radiogroup" aria-label="When">
      {WHEN.map((w) => (
        <button
          key={w.label}
          type="button"
          role="radio"
          aria-checked={value === w.due}
          className={cx('a-pill', value === w.due && 'is-on')}
          onClick={(e) => {
            e.stopPropagation();
            onChange(w.due);
          }}
        >
          {w.label}
        </button>
      ))}
      {!known && value && <span className="a-pill is-on is-static">{dueLabel(value)}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="a-kbd">{children}</kbd>;
}

export function Simulated() {
  return <span className="a-sim">Simulated</span>;
}

export function ProgressPie({ value, size = 16 }: { value: number; size?: number }) {
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * (r / 2);
  return (
    <svg className="a-pie" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={r}
        strokeDasharray={`${c * value} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// --- Task meta ----------------------------------------------------------------------------------

export function DueText({ task }: { task: Task }) {
  if (task.waitingOn)
    return (
      <span className="a-meta-wait">
        <Hourglass size={12} strokeWidth={2} aria-hidden="true" /> Waiting on {task.waitingOn.toLowerCase()}
      </span>
    );
  if (!task.due) return null;
  const late = isLate(task);
  const label = dueLabel(task.due);
  return (
    <span className={cx(late && 'a-late', task.due === TODAY && !task.done && 'a-today')}>
      {label}
      {task.dueTime ? ` · ${tshort(task.dueTime)}` : ''}
    </span>
  );
}

export function TaskMeta({ task, showArea = true, showProject = true }: { task: Task; showArea?: boolean; showProject?: boolean }) {
  const proj = showProject ? projectTitle(task.projectId) : undefined;
  const parts: ReactNode[] = [];
  const due = <DueText task={task} />;
  if (task.due || task.waitingOn) parts.push(due);
  if (proj) parts.push(<span>{proj}</span>);
  else if (showArea) parts.push(<span>{task.area}</span>);
  if (!parts.length) return null;
  return (
    <span className="a-row-meta">
      {task.priority === 'high' && !task.done && <Flag className="a-flag" size={12} strokeWidth={2.25} aria-label="Important" />}
      {parts.map((p, i) => (
        <span key={i} className="a-meta-part">
          {p}
        </span>
      ))}
    </span>
  );
}

// --- Task row (Things-style expand in place) ----------------------------------------------------

export function TaskRow({
  task,
  expanded,
  onExpand,
  showOwner = true,
  showProject = true,
  showArea = true,
}: {
  task: Task;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  showOwner?: boolean;
  showProject?: boolean;
  showArea?: boolean;
}) {
  const f = useFamily();
  const proj = projectTitle(task.projectId);
  return (
    <li className={cx('a-task', expanded && 'is-open', task.done && 'is-done', task.id.startsWith('new-') && 'is-new')}>
      <div className="a-task-line">
        <CheckCircle checked={task.done} onChange={() => f.toggleTask(task.id)} label={`Complete: ${task.title}`} late={isLate(task)} />
        <button
          type="button"
          className="a-task-main"
          aria-expanded={expanded}
          onClick={() => onExpand(expanded ? null : task.id)}
        >
          <span className="a-task-title">{task.title}</span>
          {!expanded && <TaskMeta task={task} showProject={showProject} showArea={showArea} />}
        </button>
        {showOwner && (
          <span className="a-task-owner">
            <OwnerMark owner={task.owner} size={22} />
          </span>
        )}
      </div>
      {expanded && (
        <div className="a-task-detail">
          <p className={cx('a-task-notes', !task.notes && 'is-empty')}>{task.notes ?? 'No notes yet.'}</p>
          {task.waitingOn && (
            <p className="a-task-wait">
              <Hourglass {...icSm} aria-hidden="true" /> Waiting on {task.waitingOn.toLowerCase()}
            </p>
          )}
          <div className="a-task-fields">
            <div className="a-field">
              <span className="a-label">Who</span>
              <OwnerSwitch value={task.owner} onChange={(o) => f.assign(task.id, o)} size="sm" />
            </div>
            <div className="a-field">
              <span className="a-label">When</span>
              <WhenChips value={task.due} onChange={(d) => f.setDue(task.id, d)} />
            </div>
            <div className="a-field">
              <span className="a-label">{proj ? 'Project' : 'Area'}</span>
              <span className="a-field-value">
                <Folder {...icSm} aria-hidden="true" />
                {proj ?? task.area}
              </span>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// --- Decisions ----------------------------------------------------------------------------------

export function decisionState(d: Decision) {
  const m = d.votes.maya;
  const t = d.votes.theo;
  const label = (id?: string) => d.options.find((o) => o.id === id)?.label;
  if (m && t && m === t) return { kind: 'agreed' as const, text: `Agreed: ${label(m)}` };
  if (m && t) return { kind: 'split' as const, text: 'You see it differently. Talk it over on Sunday.' };
  if (t) return { kind: 'waiting' as const, text: `Theo leans ${label(t)?.toLowerCase()}` };
  if (m) return { kind: 'waiting' as const, text: 'Waiting for Theo' };
  return { kind: 'open' as const, text: 'Nobody has weighed in yet' };
}

export function DecisionBlock({
  decision,
  voters = ['maya'],
  compact = false,
}: {
  decision: Decision;
  /** Who can vote from this screen. Maya always; Theo too when sitting together. */
  voters?: PersonId[];
  compact?: boolean;
}) {
  const f = useFamily();
  const st = decisionState(decision);
  const soon = decision.dueLabel.includes('tomorrow');
  return (
    <div className={cx('a-decision', compact && 'is-compact', st.kind === 'agreed' && 'is-agreed')}>
      <div className="a-decision-head">
        <h4 className="a-decision-q">{decision.question}</h4>
        <span className={cx('a-decision-due', soon && 'is-soon')}>{decision.dueLabel}</span>
      </div>
      {!compact && <p className="a-decision-ctx">{decision.context}</p>}
      <div className="a-options">
        {decision.options.map((o) => {
          const by = (['maya', 'theo'] as PersonId[]).filter((p) => decision.votes[p] === o.id);
          const mine = decision.votes.maya === o.id;
          return (
            <div key={o.id} className={cx('a-option', mine && 'is-mine', by.length === 2 && 'is-both')}>
              <button
                type="button"
                className="a-option-btn"
                aria-pressed={mine}
                onClick={() => f.vote(decision.id, mine ? undefined : o.id, 'maya')}
              >
                <span className="a-option-text">
                  <span className="a-option-label">{o.label}</span>
                  <span className="a-option-detail">{o.detail}</span>
                </span>
                <span className="a-option-votes">
                  {by.map((p) => (
                    <Avatar key={p} id={p} size={20} ring title={`${people[p].name} voted for this`} />
                  ))}
                </span>
              </button>
              {voters.includes('theo') && (
                <button
                  type="button"
                  className={cx('a-option-theo', decision.votes.theo === o.id && 'is-on')}
                  aria-pressed={decision.votes.theo === o.id}
                  onClick={() => f.vote(decision.id, decision.votes.theo === o.id ? undefined : o.id, 'theo')}
                >
                  Theo’s pick
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className={cx('a-decision-state', `is-${st.kind}`)}>
        {st.kind === 'agreed' && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
        {st.text}
      </p>
    </div>
  );
}

// --- Toasts -------------------------------------------------------------------------------------

function ToastItem({ t }: { t: Toast }) {
  const f = useFamily();
  const { dismissToast } = f;
  const dismiss = useRef(dismissToast);
  dismiss.current = dismissToast;
  useEffect(() => {
    const h = window.setTimeout(() => dismiss.current(t.id), 4200);
    return () => window.clearTimeout(h);
  }, [t.id]);
  return (
    <div className="a-toast" role="status">
      <span className="a-toast-msg">{t.message}</span>
      {t.undo && (
        <button type="button" className="a-toast-undo" onClick={() => f.undoToast(t)}>
          <Undo2 size={14} strokeWidth={2} aria-hidden="true" />
          Undo
        </button>
      )}
      <button type="button" className="a-toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Toasts() {
  const { state } = useFamily();
  return (
    <div className="a-toasts" aria-live="polite">
      {state.toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}

/** Keeps items completed while a view is open visible (struck through) until the view changes,
 * like Things. Snapshot the open ids when the view mounts. */
export function useStillVisible(tasks: Task[]) {
  const [snap] = useState(() => new Set(tasks.filter((t) => !t.done).map((t) => t.id)));
  return (t: Task) => !t.done || snap.has(t.id);
}
