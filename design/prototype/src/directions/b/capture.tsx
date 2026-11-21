// Command capture: ⌘K / C. Type naturally; owner, day and project are parsed into chips that can be
// changed before Enter. On phone it is a bottom sheet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CornerDownLeft, FolderClosed, Plus, Tag } from 'lucide-react';
import { people, projects, type PersonId } from '../../data';
import { parseCapture, useFamily } from '../../store';
import { useB } from './ctx';
import {
  DUE_CHOICES,
  dueIdFor,
  dueItems,
  Kbd,
  OwnerAvatar,
  ownerItems,
  PriorityGlyph,
  projectIcon,
  projectItems,
  projectShort,
} from './ui';
import { cx, monthDay, weekday } from './util';

const EXAMPLES = ['Call plumber tomorrow @theo #reno', 'Buy a gift for Nora this weekend', 'Book furnace service friday @theo !'];

interface Overrides {
  owner?: PersonId | null;
  dueId?: string;
  projectId?: string;
  priority?: boolean;
}

export function Capture({ prefill, onClose }: { prefill: string; onClose: () => void }) {
  const f = useFamily();
  const b = useB();
  const [text, setText] = useState(prefill);
  const [ov, setOv] = useState<Overrides>({});
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseCapture(text), [text]);

  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owner = ov.owner !== undefined ? ov.owner : parsed.owner;
  const ownerFrom = ov.owner !== undefined ? 'set' : /(@|for\s+)(maya|theo|me|us|both|shared)\b/i.test(text) ? 'parsed' : 'default';
  const dueChoice = ov.dueId ? DUE_CHOICES.find((d) => d.id === ov.dueId) : undefined;
  const due = ov.dueId ? dueChoice?.date : parsed.due;
  const dueText = ov.dueId ? dueChoice?.label : parsed.dueLabel;
  const projectId = ov.projectId !== undefined ? (ov.projectId === 'none' ? undefined : ov.projectId) : parsed.projectId;
  const priority = ov.priority !== undefined ? ov.priority : parsed.priority === 'high';

  const submit = () => {
    if (!parsed.title) return;
    const task = f.capture(text, {
      owner,
      due,
      projectId,
      priority: priority ? 'high' : undefined,
      ...(projectId === 'p1' ? { area: 'Renovation' as const } : {}),
    });
    if (task) b.log(task.id, 'Maya added this');
    onClose();
  };

  const chipState = (from: string) => (from === 'set' ? 'is-set' : from === 'parsed' ? 'is-parsed' : '');

  return (
    <div className="b-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="b-capture" role="dialog" aria-modal="true" aria-label="Add to the household">
        <div className="b-capture-grab" aria-hidden="true" />
        <div className="b-capture-top">
          <Plus size={16} strokeWidth={1.5} className="b-capture-plus" />
          <input
            ref={input}
            className="b-capture-input"
            value={text}
            placeholder="Add something for the household…"
            aria-label="What needs doing"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
          />
          <span className="b-capture-esc">
            <Kbd>esc</Kbd>
          </span>
        </div>

        <div className="b-capture-chips" aria-label="Details">
          <button
            type="button"
            className={cx('b-cchip', chipState(ownerFrom))}
            onClick={(e) =>
              b.openMenu({
                anchor: e.currentTarget,
                title: 'Who has it',
                items: ownerItems(),
                selected: owner ?? 'shared',
                onSelect: (id) => setOv((o) => ({ ...o, owner: id === 'shared' ? null : (id as PersonId) })),
              })
            }
          >
            <OwnerAvatar owner={owner} size={16} />
            {owner === 'maya' ? 'Me' : owner ? people[owner].name : 'Either of us'}
          </button>
          <button
            type="button"
            className={cx('b-cchip', chipState(ov.dueId ? 'set' : parsed.due ? 'parsed' : ''), !due && 'is-empty')}
            onClick={(e) =>
              b.openMenu({
                anchor: e.currentTarget,
                title: 'Due',
                items: dueItems(),
                selected: ov.dueId ?? dueIdFor(parsed.due),
                onSelect: (id) => setOv((o) => ({ ...o, dueId: id })),
              })
            }
          >
            <Calendar size={14} strokeWidth={1.5} />
            {due ? (
              <>
                {dueText}
                <span className="mono b-cchip-sub">
                  {weekday(due)} {monthDay(due).split(' ')[1]}
                </span>
              </>
            ) : (
              'No date'
            )}
          </button>
          <button
            type="button"
            className={cx('b-cchip', chipState(ov.projectId !== undefined ? 'set' : parsed.projectId ? 'parsed' : ''), !projectId && 'is-empty')}
            onClick={(e) =>
              b.openMenu({
                anchor: e.currentTarget,
                title: 'Project',
                items: projectItems(),
                selected: projectId ?? 'none',
                onSelect: (id) => setOv((o) => ({ ...o, projectId: id })),
              })
            }
          >
            {projectId ? projectIcon(projectId) : <FolderClosed size={14} strokeWidth={1.5} />}
            {projectId ? projectShort(projectId) : 'No project'}
          </button>
          <button
            type="button"
            className={cx('b-cchip', priority && 'is-parsed', !priority && 'is-empty')}
            aria-pressed={priority}
            onClick={() => setOv((o) => ({ ...o, priority: !priority }))}
          >
            {priority ? <PriorityGlyph high /> : <span className="b-cchip-bang">!</span>}
            {priority ? 'Important' : 'Normal'}
          </button>
          <span className="b-capture-area">
            <Tag size={12} strokeWidth={1.5} /> {projectId ? projects.find((p) => p.id === projectId)?.area : parsed.area}
          </span>
        </div>

        {!text.trim() ? (
          <div className="b-capture-ex">
            <div className="b-capture-label">Try</div>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="b-capture-exrow" onClick={() => {
                setText(ex);
                setOv({});
                input.current?.focus();
              }}>
                <span className="mono">{ex}</span>
                <CornerDownLeft size={14} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        ) : (
          <div className="b-capture-preview">
            <span className="b-capture-label">Adds</span>
            <span className="b-capture-title">{parsed.title || '…'}</span>
          </div>
        )}

        <div className="b-capture-foot">
          <span className="b-capture-hints">
            <span><Kbd>@</Kbd> who</span>
            <span><Kbd>#</Kbd> project</span>
            <span><Kbd>!</Kbd> important</span>
            <span><span className="clock b-hint-word">fri</span> day</span>
          </span>
          <button type="button" className="b-btn is-primary" disabled={!parsed.title} onClick={submit}>
            Add
            <Kbd dark>↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
