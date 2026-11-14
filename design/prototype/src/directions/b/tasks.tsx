// Tasks: a Linear-style list with grouping (Owner / Area / Due), view tabs, a routines table and
// project rows that open to their subtasks.
import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Clock, Inbox, Plus, Rows3 } from 'lucide-react';
import { areaOrder, people, projects, type PersonId, type Routine, type Task } from '../../data';
import { useFamily } from '../../store';
import { useB, type TaskView } from './ctx';
import { PageHeader } from './header';
import { AgentProposal } from './inspector';
import { Avatar, Kbd, OwnerAvatar, projectIcon, TaskRow } from './ui';
import { addDays, cx, daysBetween, monthDay, TODAY } from './util';

type Grouping = 'owner' | 'area' | 'due';

const VIEW_LABEL: Record<TaskView, string> = {
  all: 'All',
  mine: 'Mine',
  theo: 'Theo',
  shared: 'Shared',
  routines: 'Routines',
  projects: 'Projects',
  inbox: 'Inbox',
  june: 'June',
};

export function Tasks() {
  const b = useB();
  const f = useFamily();
  const [grouping, setGrouping] = useState<Grouping>('owner');
  const open = f.state.tasks.filter((t) => !t.done);
  const counts = {
    all: open.length,
    mine: open.filter((t) => t.owner === 'maya').length,
    theo: open.filter((t) => t.owner === 'theo').length,
    shared: open.filter((t) => t.owner === null).length,
    routines: f.state.routines.length,
    projects: projects.length,
  };
  const isList = !['routines', 'projects'].includes(b.taskView);
  const crumbs: React.ReactNode[] =
    b.taskView === 'inbox'
      ? ['Inbox']
      : b.taskView === 'june'
        ? ['People', 'June']
        : b.taskView === 'projects' && b.openProject
          ? ['Projects', projects.find((p) => p.id === b.openProject)?.title ?? '']
          : ['Tasks'];

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        tabs={(['all', 'mine', 'theo', 'shared', 'routines', 'projects'] as const).map((v) => ({
          id: v,
          label: VIEW_LABEL[v],
          count: counts[v],
        }))}
        tab={b.taskView}
        onTab={(v) => {
          b.setTaskView(v as TaskView);
          b.setOpenProject(null);
        }}
        right={
          <>
            {isList && (
              <button
                type="button"
                className="b-btn is-sm"
                onClick={(e) =>
                  b.openMenu({
                    anchor: e.currentTarget,
                    title: 'Group by',
                    align: 'end',
                    items: [
                      { id: 'owner', label: 'Owner' },
                      { id: 'area', label: 'Area' },
                      { id: 'due', label: 'Due' },
                    ],
                    selected: grouping,
                    onSelect: (id) => setGrouping(id as Grouping),
                  })
                }
              >
                <Rows3 size={14} strokeWidth={1.5} />
                <span className="b-hide-phone">Group:</span> {grouping === 'owner' ? 'Owner' : grouping === 'area' ? 'Area' : 'Due'}
                <ChevronDown size={14} strokeWidth={1.5} className="b-faint" />
              </button>
            )}
            <button type="button" className="b-btn is-sm b-hide-phone" onClick={() => b.openCapture(b.taskView === 'theo' ? '@theo ' : b.taskView === 'shared' ? '@us ' : '')}>
              <Plus size={14} strokeWidth={1.5} /> Add <Kbd>C</Kbd>
            </button>
          </>
        }
      />
      <div className="b-scroll">
        {b.taskView === 'routines' ? <RoutinesTable /> : b.taskView === 'projects' ? <ProjectsView /> : <TaskList grouping={grouping} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

interface Group {
  id: string;
  label: string;
  icon: React.ReactNode;
  tasks: Task[];
  prefill?: string;
  tone?: 'late';
}

const sortTasks = (a: Task, b: Task) => {
  const da = a.due ?? '9999';
  const db = b.due ?? '9999';
  return da.localeCompare(db) || (a.priority ? 0 : 1) - (b.priority ? 0 : 1);
};

function TaskList({ grouping }: { grouping: Grouping }) {
  const f = useFamily();
  const b = useB();
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const scoped = useMemo(() => {
    const v = b.taskView;
    return f.state.tasks.filter((t) =>
      v === 'mine'
        ? t.owner === 'maya'
        : v === 'theo'
          ? t.owner === 'theo'
          : v === 'shared'
            ? t.owner === null
            : v === 'inbox'
              ? !t.due && !t.projectId && (t.owner === null || t.id.startsWith('new-'))
              : v === 'june'
                ? t.area === 'June'
                : true,
    );
  }, [f.state.tasks, b.taskView]);

  const openTasks = scoped.filter((t) => !t.done).sort(sortTasks);
  const done = scoped.filter((t) => t.done);

  const groups: Group[] = useMemo(() => {
    if (grouping === 'owner') {
      const owners: (PersonId | null)[] = ['maya', 'theo', null];
      return owners.map((o) => ({
        id: o ?? 'shared',
        label: o === 'maya' ? 'Maya (you)' : o ? people[o].name : 'Either of you',
        icon: <OwnerAvatar owner={o} size={18} />,
        tasks: openTasks.filter((t) => t.owner === o),
        prefill: o === 'theo' ? '@theo ' : o === null ? '@us ' : '',
      }));
    }
    if (grouping === 'area') {
      return areaOrder.map((a) => ({
        id: a,
        label: a,
        icon: <span className="b-areadot" data-area={a} />,
        tasks: openTasks.filter((t) => t.area === a),
        prefill: a === 'June' ? '#june ' : a === 'Renovation' ? '#reno ' : a === 'Errands' ? '#errands ' : a === 'Admin' ? '#admin ' : '',
      }));
    }
    const weekEnd = addDays(TODAY, 5);
    const buckets: [string, string, (t: Task) => boolean, string, 'late'?][] = [
      ['late', 'Late', (t) => !!t.due && t.due < TODAY, '', 'late'],
      ['today', 'Today', (t) => t.due === TODAY, 'today '],
      ['tomorrow', 'Tomorrow', (t) => t.due === addDays(TODAY, 1), 'tomorrow '],
      ['week', 'This week', (t) => !!t.due && t.due > addDays(TODAY, 1) && t.due <= weekEnd, 'this weekend '],
      ['later', 'Later', (t) => !!t.due && t.due > weekEnd, ''],
      ['none', 'No date', (t) => !t.due, ''],
    ];
    return buckets.map(([id, label, fn, prefill, tone]) => ({
      id,
      label,
      icon: <Clock size={14} strokeWidth={1.5} />,
      tasks: openTasks.filter(fn),
      prefill,
      tone,
    }));
  }, [grouping, openTasks]);

  const showAgent = (b.taskView === 'all' || b.taskView === 'theo') && f.suggestionStatus('s2') === 'pending';

  return (
    <div className="b-list" role="listbox" aria-label="Tasks" aria-multiselectable="false">
      {showAgent && (
        <div className="b-list-agent">
          <AgentProposal id="s2" compact onEdit={() => b.select({ kind: 'task', id: 't2' })} />
        </div>
      )}
      {b.taskView === 'inbox' && (
        <div className="b-list-intro">
          <Inbox size={14} strokeWidth={1.5} />
          Quick captures with no day yet. Give each one an owner and a day, or leave it for the Weekly Reset.
        </div>
      )}
      {groups
        .filter((g) => g.tasks.length > 0)
        .map((g) => (
          <section key={g.id} className="b-group" aria-label={g.label}>
            <header className={cx('b-group-head', g.tone === 'late' && 'is-late')}>
              <button
                type="button"
                className="b-group-toggle"
                aria-expanded={!collapsed[g.id]}
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              >
                <ChevronRight size={12} strokeWidth={1.75} className={cx('b-caret', !collapsed[g.id] && 'is-open')} />
                {g.icon}
                <span className="b-group-name">{g.label}</span>
                <span className="mono b-faint">{g.tasks.length}</span>
              </button>
              <button type="button" className="b-icon-btn is-xs" aria-label={`Add to ${g.label}`} onClick={() => b.openCapture(g.prefill ?? '')}>
                <Plus size={14} strokeWidth={1.5} />
              </button>
            </header>
            {!collapsed[g.id] && g.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
          </section>
        ))}
      {openTasks.length === 0 && <div className="b-empty">Nothing here. Press <Kbd>C</Kbd> to add something.</div>}
      {done.length > 0 && (
        <section className="b-group is-donegroup">
          <header className="b-group-head">
            <button type="button" className="b-group-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <ChevronRight size={12} strokeWidth={1.75} className={cx('b-caret', showDone && 'is-open')} />
              <span className="b-group-name">Done</span>
              <span className="mono b-faint">{done.length}</span>
            </button>
          </header>
          {showDone && done.map((t) => <TaskRow key={t.id} task={t} />)}
        </section>
      )}
      <div className="b-hintbar is-list b-hide-phone">
        <span className="mono b-faint">{openTasks.length} open</span>
        <span><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
        <span><Kbd>X</Kbd> complete</span>
        <span><Kbd>A</Kbd> assign</span>
        <span><Kbd>↵</Kbd> details</span>
        <span><Kbd>C</Kbd> add</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function Rotation({ r }: { r: Routine }) {
  return (
    <span className="b-rot" aria-label={`Turn order: ${r.rotation.map((p) => people[p].name).join(', then ')}. Next: ${people[r.rotation[r.turn]!].name}`}>
      {r.rotation.map((p, i) => (
        <span key={`${p}${i}`} className={cx('b-rot-item', i === r.turn && 'is-next')}>
          {i > 0 && <ArrowRight size={12} strokeWidth={1.5} className="b-faint" />}
          <Avatar id={p} size={20} ring={i === r.turn} dim={i !== r.turn} />
        </span>
      ))}
      {r.rotation.length > 1 && <span className="b-rot-label">{r.rotation[r.turn] === 'maya' ? 'You next' : `${people[r.rotation[r.turn]!].name} next`}</span>}
    </span>
  );
}

function RoutinesTable() {
  const f = useFamily();
  return (
    <div className="b-table b-routines" role="table" aria-label="Routines">
      <div className="b-tr is-head" role="row">
        <span role="columnheader">Routine</span>
        <span role="columnheader">Cadence</span>
        <span role="columnheader">Turn order</span>
        <span role="columnheader">Next</span>
        <span role="columnheader">Last done</span>
        <span role="columnheader" className="b-sr">Actions</span>
      </div>
      {f.state.routines.map((r) => {
        const last = r.history[0];
        const late = r.nextDue < TODAY;
        return (
          <div key={r.id} className="b-tr" role="row">
            <span className="b-td-title" role="cell">
              <span className="b-routine-glyph">{r.area === 'June' ? <Avatar id="june" size={16} /> : <RepeatIcon />}</span>
              {r.title}
            </span>
            <span className="b-td-muted" role="cell">{r.cadence}</span>
            <span role="cell">
              <Rotation r={r} />
            </span>
            <span role="cell" className={cx('mono', late ? 'b-late' : r.nextDue === TODAY && 'b-accent')}>
              {r.nextLabel}
            </span>
            <span role="cell" className="b-td-last">
              {last ? (
                <>
                  <Avatar id={last.who} size={16} />
                  <span className="mono">{monthDay(last.date)}</span>
                  {!last.done && <span className="b-pill is-late">Missed</span>}
                </>
              ) : (
                <span className="b-faint">Not yet</span>
              )}
            </span>
            <span role="cell" className="b-td-actions">
              <button type="button" className="b-btn is-sm" onClick={() => f.routineDone(r.id)}>
                Done
              </button>
              <button type="button" className="b-btn is-sm is-quiet" disabled={r.rotation.length < 2} onClick={() => f.routineSwap(r.id)}>
                Swap
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RepeatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ProjectsView() {
  const f = useFamily();
  const b = useB();
  return (
    <div className="b-projects">
      {projects.map((p) => {
        const ts = f.state.tasks.filter((t) => t.projectId === p.id);
        const done = ts.filter((t) => t.done).length;
        const isOpen = b.openProject === p.id;
        const owners = Array.from(new Set(ts.filter((t) => !t.done).map((t) => t.owner)));
        return (
          <section key={p.id} className={cx('b-proj', isOpen && 'is-open')}>
            <button type="button" className="b-proj-row" aria-expanded={isOpen} onClick={() => b.setOpenProject(isOpen ? null : p.id)}>
              <ChevronRight size={12} strokeWidth={1.75} className={cx('b-caret', isOpen && 'is-open')} />
              <span className="b-proj-icon">{projectIcon(p.id, 16)}</span>
              <span className="b-proj-title">{p.title}</span>
              <span className="b-proj-owners">
                {owners.map((o) => (
                  <OwnerAvatar key={o ?? 's'} owner={o} size={18} />
                ))}
              </span>
              <span className="b-proj-progress">
                <span className="b-progress">
                  <span style={{ width: `${(done / ts.length) * 100}%` }} />
                </span>
                <span className="mono">
                  {done}/{ts.length}
                </span>
              </span>
              <span className="b-proj-target mono">{p.target ? monthDay(p.target) : ''}</span>
              <span className="b-proj-days mono b-faint">{p.target ? `${daysBetween(TODAY, p.target)}d` : ''}</span>
            </button>
            {isOpen && (
              <div className="b-proj-body">
                <div className="b-proj-summary">
                  <p>{p.summary}</p>
                  {p.budget && (
                    <span className="b-proj-budget">
                      Budget <span className="mono">{p.budget}</span>
                    </span>
                  )}
                </div>
                <div role="listbox" aria-label={`${p.title} to-dos`}>
                  {[...ts].sort((a, c) => Number(a.done) - Number(c.done) || sortTasks(a, c)).map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
                <button type="button" className="b-addrow" onClick={() => b.openCapture(p.id === 'p1' ? '#reno ' : '#garage ')}>
                  <Plus size={14} strokeWidth={1.5} /> Add to {p.id === 'p1' ? 'Hall bathroom' : 'Garage'}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
