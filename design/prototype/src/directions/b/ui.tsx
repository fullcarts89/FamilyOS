// Small, shared building blocks for Direction B: avatars, glyphs, kbd hints, menus and task rows.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Hammer, Repeat2, Users, Warehouse } from 'lucide-react';
import { people, projects, type PersonId, type Task } from '../../data';
import { useFamily } from '../../store';
import { useB, type MenuItem, type MenuOpts } from './ctx';
import { addDays, cx, dueShort, monthDay, TODAY, weekday } from './util';

// ---------------------------------------------------------------------------------------------
// People

export function Avatar({ id, size = 20, ring, dim, title }: { id: PersonId; size?: number; ring?: boolean; dim?: boolean; title?: string }) {
  const p = people[id];
  return (
    <span
      className={cx('b-av', ring && 'is-ring', dim && 'is-dim')}
      style={{ width: size, height: size, background: p.color, fontSize: Math.round(size * 0.48), ['--ring' as string]: p.color }}
      title={title ?? p.name}
      aria-label={title ?? p.name}
      role="img"
    >
      {p.initials}
    </span>
  );
}

export function OwnerAvatar({ owner, size = 20 }: { owner: PersonId | null; size?: number }) {
  if (owner) return <Avatar id={owner} size={size} />;
  return (
    <span className="b-av is-shared" style={{ width: size, height: size }} title="Either of you" aria-label="Either of you" role="img">
      <Users size={Math.round(size * 0.6)} strokeWidth={1.75} />
    </span>
  );
}

export function AvatarStack({ ids, size = 18 }: { ids: PersonId[]; size?: number }) {
  return (
    <span className="b-avstack">
      {ids.map((id) => (
        <Avatar key={id} id={id} size={size} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Glyphs

export function Kbd({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <kbd className={cx('b-kbd', dark && 'is-dark')}>{children}</kbd>;
}

export function SimTag() {
  return <span className="b-simtag">Simulated</span>;
}

/** The round status control: empty, late (red), today (indigo arc), done (filled). */
export function StatusCircle({ task, size = 16 }: { task: Task; size?: number }) {
  const b = useB();
  const tone = task.done ? 'done' : dueShort(task).tone;
  return (
    <button
      type="button"
      className={cx('b-status', `is-${tone}`)}
      style={{ width: size + 8, height: size + 8 }}
      aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      aria-pressed={task.done}
      title={task.done ? 'Reopen' : 'Complete  ·  X'}
      onClick={(e) => {
        e.stopPropagation();
        b.complete(task.id);
      }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        {task.done ? (
          <>
            <circle cx="8" cy="8" r="7" className="fill" />
            <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <circle cx="8" cy="8" r="6.25" className="ring" fill="none" strokeWidth="1.5" />
            {tone === 'today' && <path d="M8 4.5 A3.5 3.5 0 0 1 8 11.5 Z" className="half" />}
          </>
        )}
      </svg>
    </button>
  );
}

export function PriorityGlyph({ high }: { high?: boolean }) {
  if (!high) return <span className="b-prio" aria-hidden="true" />;
  return (
    <span className="b-prio is-high" title="Important" aria-label="Important" role="img">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="0.5" y="0.5" width="13" height="13" rx="3.5" fill="currentColor" />
        <path d="M7 3.6v4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="7" cy="10.2" r="1" fill="#fff" />
      </svg>
    </span>
  );
}

/** Small progress pie for projects. */
export function Pie({ value, size = 14 }: { value: number; size?: number }) {
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="b-pie" aria-hidden="true">
      <circle cx="7" cy="7" r="6.25" fill="none" strokeWidth="1.5" className="pie-ring" />
      <circle
        cx="7"
        cy="7"
        r={r / 2}
        fill="none"
        strokeWidth={r}
        className="pie-fill"
        strokeDasharray={`${(c / 2) * value} ${c}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

export const projectIcon = (id?: string, size = 14) =>
  id === 'p2' ? <Warehouse size={size} strokeWidth={1.5} /> : <Hammer size={size} strokeWidth={1.5} />;

export const projectShort = (id?: string) => (id === 'p1' ? 'Hall bathroom' : id === 'p2' ? 'Garage' : '');

export function ProjectLabel({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <span className="b-plabel">
      {projectIcon(id, 12)}
      {projectShort(id)}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Menus (one host at the root; positioned against the anchor, flipped when it would overflow)

export function MenuHost({ opts, root, onClose }: { opts: MenuOpts | null; root: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);
  const items = opts?.items.filter((i) => !i.divider) ?? [];

  useLayoutEffect(() => {
    if (!opts || !root || !ref.current) return;
    const r = root.getBoundingClientRect();
    const scale = r.width / root.offsetWidth || 1;
    const a = opts.anchor.getBoundingClientRect();
    const mw = ref.current.offsetWidth;
    const mh = ref.current.offsetHeight;
    const W = root.offsetWidth;
    const H = root.offsetHeight;
    let left = ((opts.align === 'end' ? a.right : a.left) - r.left) / scale - (opts.align === 'end' ? mw : 0);
    let top = (a.bottom - r.top) / scale + 4;
    if (top + mh > H - 8) top = (a.top - r.top) / scale - mh - 4;
    left = Math.max(8, Math.min(left, W - mw - 8));
    top = Math.max(8, top);
    setPos({ top, left });
    const sel = items.findIndex((i) => i.id === opts.selected);
    setActive(sel >= 0 ? sel : 0);
    ref.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, root]);

  useEffect(() => {
    if (!opts) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !opts.anchor.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [opts, onClose]);

  if (!opts) return null;
  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    opts.onSelect(item.id);
    onClose();
    opts.anchor.focus();
  };
  return (
    <div
      ref={ref}
      className="b-menu"
      role="menu"
      tabIndex={-1}
      aria-label={opts.title}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault();
          setActive((a) => (a + 1) % items.length);
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault();
          setActive((a) => (a - 1 + items.length) % items.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const it = items[active];
          if (it) choose(it);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          opts.anchor.focus();
        }
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      {opts.title && <div className="b-menu-title">{opts.title}</div>}
      {opts.items.map((item, i) =>
        item.divider ? (
          <div key={`d${i}`} className="b-menu-div" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitemradio"
            aria-checked={item.id === opts.selected}
            disabled={item.disabled}
            className={cx('b-menu-item', items[active]?.id === item.id && 'is-active')}
            onMouseEnter={() => setActive(items.indexOf(item))}
            onClick={() => choose(item)}
            tabIndex={-1}
          >
            <span className="b-menu-icon">{item.icon}</span>
            <span className="b-menu-label">{item.label}</span>
            {item.hint && <span className="b-menu-hint mono">{item.hint}</span>}
            <span className="b-menu-check">{item.id === opts.selected && <Check size={14} strokeWidth={1.75} />}</span>
          </button>
        ),
      )}
    </div>
  );
}

// Menu item sets ------------------------------------------------------------------------------

export const ownerItems = (): MenuItem[] => [
  { id: 'maya', label: 'Maya (you)', icon: <Avatar id="maya" size={16} />, hint: '1' },
  { id: 'theo', label: 'Theo', icon: <Avatar id="theo" size={16} />, hint: '2' },
  { id: 'shared', label: 'Either of you', icon: <OwnerAvatar owner={null} size={16} />, hint: '3' },
];

export const DUE_CHOICES: { id: string; label: string; date?: string }[] = [
  { id: 'today', label: 'Today', date: TODAY },
  { id: 'tomorrow', label: 'Tomorrow', date: addDays(TODAY, 1) },
  { id: 'thu', label: 'Thursday', date: addDays(TODAY, 2) },
  { id: 'fri', label: 'Friday', date: addDays(TODAY, 3) },
  { id: 'weekend', label: 'This weekend', date: addDays(TODAY, 4) },
  { id: 'nextweek', label: 'Next week', date: addDays(TODAY, 6) },
  { id: 'none', label: 'No date' },
];

export const dueItems = (): MenuItem[] =>
  DUE_CHOICES.map((d) => ({
    id: d.id,
    label: d.label,
    hint: d.date ? `${weekday(d.date)} ${monthDay(d.date).split(' ')[1]}` : undefined,
  }));

export const dueIdFor = (due?: string) => (due ? (DUE_CHOICES.find((d) => d.date === due)?.id ?? '') : 'none');

export const projectItems = (): MenuItem[] => [
  { id: 'none', label: 'No project' },
  ...projects.map((p) => ({ id: p.id, label: p.title, icon: projectIcon(p.id) })),
];

export const repeatItems = (): MenuItem[] => [
  { id: 'none', label: "Doesn't repeat" },
  { id: 'Weekly', label: 'Every week' },
  { id: 'Every other week', label: 'Every other week' },
  { id: 'Monthly', label: 'Every month' },
];

// ---------------------------------------------------------------------------------------------
// Task rows

export function useTaskMenus() {
  const f = useFamily();
  const b = useB();
  return {
    owner(anchor: HTMLElement, t: Task) {
      b.openMenu({
        anchor,
        title: 'Who has it',
        items: ownerItems(),
        selected: t.owner ?? 'shared',
        onSelect: (id) => {
          const owner = id === 'shared' ? null : (id as PersonId);
          if (owner === t.owner) return;
          f.assign(t.id, owner);
          b.log(t.id, `Maya gave this to ${owner === 'maya' ? 'herself' : owner ? people[owner].name : 'either of you'}`);
        },
      });
    },
    due(anchor: HTMLElement, t: Task) {
      b.openMenu({
        anchor,
        title: 'Due',
        items: dueItems(),
        selected: dueIdFor(t.due),
        onSelect: (id) => {
          const d = DUE_CHOICES.find((x) => x.id === id);
          if (!d || d.date === t.due) return;
          f.setDue(t.id, d.date);
          b.log(t.id, d.date ? `Maya moved it to ${d.label.toLowerCase()}` : 'Maya removed the date');
        },
      });
    },
    project(anchor: HTMLElement, t: Task) {
      b.openMenu({
        anchor,
        title: 'Project',
        items: projectItems(),
        selected: t.projectId ?? 'none',
        onSelect: (id) => {
          const projectId = id === 'none' ? undefined : id;
          if (projectId === t.projectId) return;
          const index = f.state.tasks.findIndex((x) => x.id === t.id);
          const next: Task = { ...t, projectId, area: projectId === 'p1' ? 'Renovation' : t.area };
          f.dispatch({ type: 'batch', actions: [{ type: 'removeTask', id: t.id }, { type: 'restoreTask', task: next, index }] });
          f.dispatch({
            type: 'toast',
            message: projectId ? `Moved to ${projectShort(projectId)}` : 'Removed from project',
            undo: { type: 'batch', actions: [{ type: 'removeTask', id: t.id }, { type: 'restoreTask', task: t, index }] },
          });
          b.log(t.id, projectId ? `Maya filed it under ${projectShort(projectId)}` : 'Maya removed the project');
        },
      });
    },
    repeat(anchor: HTMLElement, t: Task) {
      b.openMenu({
        anchor,
        title: 'Repeats',
        items: repeatItems(),
        selected: b.repeats[t.id] ?? 'none',
        onSelect: (id) => {
          b.setRepeat(t.id, id);
          b.log(t.id, id === 'none' ? 'Maya stopped it repeating' : `Maya set it to repeat: ${id.toLowerCase()}`);
        },
      });
    },
  };
}

export function DueText({ task }: { task: Task }) {
  const d = dueShort(task);
  return <span className={cx('b-due mono', `is-${d.tone}`)}>{d.text}</span>;
}

/** The core list row. `dense` is the compact two-line Home column variant. */
export function TaskRow({ task, dense, showOwner = true, take }: { task: Task; dense?: boolean; showOwner?: boolean; take?: boolean }) {
  const b = useB();
  const f = useFamily();
  const menus = useTaskMenus();
  const selected = b.sel?.kind === 'task' && b.sel.id === task.id;
  const repeat = b.repeats[task.id];
  return (
    <div
      className={cx('b-row', dense && 'is-dense', selected && 'is-sel', task.done && 'is-done', b.flash === task.id && 'is-flash')}
      data-row-id={task.id}
      tabIndex={0}
      role="option"
      aria-selected={selected}
      title={dense ? 'X complete · A assign · J/K move' : undefined}
      onClick={() => b.select({ kind: 'task', id: task.id })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) b.select({ kind: 'task', id: task.id });
      }}
    >
      <StatusCircle task={task} />
      {dense ? (
        <span className="b-row-body">
          <span className="b-row-text">{task.title}</span>
          <span className="b-row-sub">
            {task.priority === 'high' && <PriorityGlyph high />}
            {task.due && <DueText task={task} />}
            {task.due && <span className="b-sep" aria-hidden="true" />}
            <span className="b-row-area">{task.waitingOn ? `Waiting · ${task.waitingOn}` : task.projectId ? projectShort(task.projectId) : task.area}</span>
          </span>
        </span>
      ) : (
        <>
          <PriorityGlyph high={task.priority === 'high'} />
          <span className="b-row-title">
            <span className="b-row-text">{task.title}</span>
            {task.waitingOn && <span className="b-wait">Waiting · {task.waitingOn}</span>}
          </span>
          <span className="b-row-meta">
            <ProjectLabel id={task.projectId} />
            {repeat && repeat !== 'none' && (
              <span className="b-rep" title={`Repeats: ${repeat.toLowerCase()}`}>
                <Repeat2 size={14} strokeWidth={1.5} />
              </span>
            )}
            <span className="b-area">{task.area}</span>
          </span>
          <span className="b-row-keys" aria-hidden="true">
            <Kbd>X</Kbd>
            <Kbd>A</Kbd>
          </span>
          <DueText task={task} />
        </>
      )}
      {take && !task.done && (
        <button
          type="button"
          className="b-take"
          onClick={(e) => {
            e.stopPropagation();
            f.assign(task.id, 'maya');
            b.log(task.id, 'Maya took this');
          }}
        >
          Take
        </button>
      )}
      {showOwner && (
        <button
          type="button"
          className="b-ownerbtn"
          aria-label={`Owner: ${task.owner ? people[task.owner].name : 'either of you'}. Change`}
          title="Assign · A"
          onClick={(e) => {
            e.stopPropagation();
            menus.owner(e.currentTarget, task);
          }}
        >
          <OwnerAvatar owner={task.owner} size={20} />
        </button>
      )}
    </div>
  );
}
