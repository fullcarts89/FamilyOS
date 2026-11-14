// The right-hand inspector: task details with editable properties, event details, and Home's
// default "Up next" + agent proposal.
import { ArrowRight, ChevronDown, CornerUpLeft, MapPin, Sparkle, X } from 'lucide-react';
import { people, projects, suggestions, type FamilyEvent, type Task } from '../../data';
import { useFamily } from '../../store';
import { useB } from './ctx';
import { Avatar, AvatarStack, Kbd, OwnerAvatar, PriorityGlyph, projectIcon, SimTag, StatusCircle, useTaskMenus } from './ui';
import { clock, cx, daysBetween, dueShort, eventsOn, findEvent, leadOf, monthDay, NOW_MIN, range, TODAY, toMin, weekday } from './util';

export function Inspector() {
  const b = useB();
  const f = useFamily();
  if (b.sel?.kind === 'task') {
    const t = f.state.tasks.find((x) => x.id === b.sel!.id);
    if (t) return <TaskDetail task={t} />;
  }
  if (b.sel?.kind === 'event') {
    const e = findEvent(b.sel.id);
    if (e) return <EventDetail ev={e} />;
  }
  return <HomeDefault />;
}

function InspHead({ crumb }: { crumb: React.ReactNode }) {
  const b = useB();
  return (
    <header className="b-insp-head">
      {b.screen === 'home' && !b.phone ? (
        <button type="button" className="b-ghost is-sm" onClick={() => b.select(null)}>
          <CornerUpLeft size={14} strokeWidth={1.5} /> Up next
        </button>
      ) : (
        <span className="b-insp-crumb">{crumb}</span>
      )}
      <span className="b-insp-headkeys">
        <Kbd>esc</Kbd>
      </span>
      <button type="button" className="b-icon-btn" aria-label="Close details" onClick={() => b.select(null)}>
        <X size={16} strokeWidth={1.5} />
      </button>
    </header>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="b-prop">
      <span className="b-prop-label">{label}</span>
      <span className="b-prop-value">{children}</span>
    </div>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const b = useB();
  const f = useFamily();
  const menus = useTaskMenus();
  const due = dueShort(task);
  const project = projects.find((p) => p.id === task.projectId);
  const projTasks = project ? f.state.tasks.filter((t) => t.projectId === project.id) : [];
  const projDone = projTasks.filter((t) => t.done).length;
  const repeat = b.repeats[task.id];
  const s2 = task.id === 't2' ? suggestions.find((s) => s.id === 's2') : undefined;
  const history = [
    ...(b.activity[task.id] ?? []).map((a) => ({ ...a, live: true })),
    ...(task.done && task.doneBy && !(b.activity[task.id] ?? []).some((a) => a.text.includes('done')) ? [{ at: '', text: `Done by ${people[task.doneBy].name}`, live: false }] : []),
    ...(task.waitingOn ? [{ at: '', text: `Waiting on ${task.waitingOn.toLowerCase()}`, live: false }] : []),
    ...(task.due && task.due < TODAY && !task.done ? [{ at: monthDay(task.due), text: 'Became late', live: false }] : []),
    { at: '', text: `Added to ${task.area}`, live: false },
  ];

  return (
    <div className="b-insp-inner">
      <InspHead crumb={<>{project ? project.title : 'Tasks'} <span className="b-faint">/</span> {task.area}</>} />
      <div className="b-insp-body">
        <div className="b-insp-titlerow">
          <StatusCircle task={task} size={18} />
          <h2 className={cx('b-insp-title', task.done && 'is-done')}>{task.title}</h2>
        </div>
        {task.priority === 'high' && (
          <div className="b-insp-flag">
            <PriorityGlyph high /> Important
          </div>
        )}

        <div className="b-props">
          <Prop label="Status">
            <button type="button" className="b-propbtn" onClick={() => b.complete(task.id)}>
              {task.done ? (
                <>Done{task.doneBy ? ` by ${people[task.doneBy].name}` : ''}</>
              ) : task.waitingOn ? (
                'Waiting'
              ) : due.tone === 'late' ? (
                <span className="b-late">Late</span>
              ) : (
                'To do'
              )}
              <Kbd>X</Kbd>
            </button>
          </Prop>
          <Prop label="Owner">
            <button type="button" className="b-propbtn" onClick={(e) => menus.owner(e.currentTarget, task)}>
              <OwnerAvatar owner={task.owner} size={18} />
              {task.owner === 'maya' ? 'Maya (you)' : task.owner ? people[task.owner].name : 'Either of you'}
              <Kbd>A</Kbd>
            </button>
          </Prop>
          <Prop label="Due">
            <button type="button" className="b-propbtn" onClick={(e) => menus.due(e.currentTarget, task)}>
              {task.due ? (
                <>
                  <span className="mono">
                    {weekday(task.due)} {monthDay(task.due)}
                    {task.dueTime ? ` · ${clock(task.dueTime)}` : ''}
                  </span>
                  <span className={cx('b-due-tag mono', `is-${due.tone}`)}>{due.text}</span>
                </>
              ) : (
                <span className="b-faint">No date</span>
              )}
              <ChevronDown size={14} strokeWidth={1.5} className="b-propchev" />
            </button>
          </Prop>
          <Prop label="Project">
            <button type="button" className="b-propbtn" onClick={(e) => menus.project(e.currentTarget, task)}>
              {project ? (
                <>
                  {projectIcon(project.id)} {project.title}
                </>
              ) : (
                <span className="b-faint">None</span>
              )}
              <ChevronDown size={14} strokeWidth={1.5} className="b-propchev" />
            </button>
          </Prop>
          <Prop label="Repeats">
            <button type="button" className="b-propbtn" onClick={(e) => menus.repeat(e.currentTarget, task)}>
              {repeat && repeat !== 'none' ? repeat : <span className="b-faint">Doesn't repeat</span>}
              <ChevronDown size={14} strokeWidth={1.5} className="b-propchev" />
            </button>
          </Prop>
          <Prop label="Area">
            <span className="b-proptext">{task.area}</span>
          </Prop>
        </div>

        {task.notes && (
          <section className="b-insp-sec">
            <h3 className="b-h3">Notes</h3>
            <p className="b-notes">{task.notes}</p>
          </section>
        )}

        {project && (
          <section className="b-insp-sec">
            <h3 className="b-h3">
              {project.title}
              <span className="mono b-faint">
                {projDone}/{projTasks.length}
              </span>
            </h3>
            <div className="b-progress">
              <span style={{ width: `${(projDone / projTasks.length) * 100}%` }} />
            </div>
            <div className="b-insp-meta mono">
              Target {monthDay(project.target ?? TODAY)} · {daysBetween(TODAY, project.target ?? TODAY)} days
              {project.budget ? ` · ${project.budget}` : ''}
            </div>
          </section>
        )}

        {s2 && f.suggestionStatus('s2') !== 'dismissed' && (
          <section className="b-insp-sec">
            <AgentProposal id="s2" compact />
          </section>
        )}

        <section className="b-insp-sec">
          <h3 className="b-h3">History</h3>
          <ol className="b-history">
            {history.map((h, i) => (
              <li key={i} className={cx(h.live && 'is-live')}>
                <span className="b-hist-dot" />
                <span className="b-hist-text">{h.text}</span>
                <span className="mono b-faint">{h.live ? 'just now' : h.at}</span>
              </li>
            ))}
          </ol>
        </section>
        <div className="b-insp-keys">
          <span><Kbd>X</Kbd> complete</span>
          <span><Kbd>A</Kbd> assign</span>
          <span><Kbd>J</Kbd><Kbd>K</Kbd> next / previous</span>
        </div>
      </div>
    </div>
  );
}

function EventDetail({ ev }: { ev: FamilyEvent }) {
  const b = useB();
  const lead = leadOf(ev);
  const mins = toMin(ev.start) - NOW_MIN;
  return (
    <div className="b-insp-inner">
      <InspHead crumb={<>Calendar <span className="b-faint">/</span> {weekday(ev.date, 'long')}</>} />
      <div className="b-insp-body">
        <div className="b-insp-titlerow">
          <span className="b-evbar" style={{ background: lead ? people[lead].color : '#A1A1AA' }} />
          <h2 className="b-insp-title">{ev.title}</h2>
        </div>
        <div className="b-props">
          <Prop label="When">
            <span className="b-proptext mono">
              {weekday(ev.date)} {monthDay(ev.date)} · {range(ev.start, ev.end)}
            </span>
          </Prop>
          {ev.date === TODAY && mins > 0 && (
            <Prop label="Starts">
              <span className="b-proptext mono">in {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`}</span>
            </Prop>
          )}
          <Prop label="Who">
            <span className="b-proptext">
              <AvatarStack ids={ev.who} />
              {ev.who.map((w) => (w === 'maya' ? 'You' : people[w].name)).join(', ')}
            </span>
          </Prop>
          {ev.location && (
            <Prop label="Where">
              <span className="b-proptext">
                <MapPin size={14} strokeWidth={1.5} /> {ev.location}
              </span>
            </Prop>
          )}
          {ev.handoff && (
            <Prop label="June">
              <span className="b-proptext">
                {ev.handoff.from === 'daycare' ? 'Little Oaks' : people[ev.handoff.from].name}
                <ArrowRight size={14} strokeWidth={1.5} />
                {ev.handoff.to === 'daycare' ? 'Little Oaks' : people[ev.handoff.to].name}
              </span>
            </Prop>
          )}
        </div>
        {ev.note && (
          <section className="b-insp-sec">
            <h3 className="b-h3">Notes</h3>
            <p className="b-notes">{ev.note}</p>
          </section>
        )}
        <div className="b-insp-actions">
          <button
            type="button"
            className="b-btn"
            onClick={() => b.openCapture(`${ev.title}: `)}
          >
            Add a to-do for this
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpNext({ limit = 3 }: { limit?: number }) {
  const b = useB();
  const next = eventsOn(TODAY).filter((e) => toMin(e.end) > NOW_MIN).slice(0, limit);
  return (
    <ul className="b-upnext">
      {next.map((e) => {
        const lead = leadOf(e);
        const mins = toMin(e.start) - NOW_MIN;
        return (
          <li key={e.id}>
            <button type="button" className="b-upnext-row" onClick={() => b.select({ kind: 'event', id: e.id })}>
              <span className="mono b-upnext-time">{clock(e.start)}</span>
              <span className="b-evbar" style={{ background: lead ? people[lead].color : '#A1A1AA' }} />
              <span className="b-upnext-main">
                <span className="b-upnext-title">{e.title}</span>
                <span className="b-upnext-sub">
                  {e.handoff
                    ? `${e.handoff.from === 'daycare' ? 'Little Oaks' : people[e.handoff.from].name} → ${e.handoff.to === 'daycare' ? 'Little Oaks' : people[e.handoff.to].name}`
                    : (e.location ?? range(e.start, e.end))}
                </span>
              </span>
              <span className="b-upnext-right">
                <AvatarStack ids={e.who.filter((w) => w !== 'june')} size={16} />
                <span className="mono b-faint">{mins > 0 ? (mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`) : 'now'}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HomeDefault() {
  return (
    <div className="b-insp-inner">
      <header className="b-insp-head">
        <span className="b-insp-crumb">Up next</span>
        <span className="mono b-faint b-insp-now">7:42</span>
      </header>
      <div className="b-insp-body">
        <UpNext />
        <section className="b-insp-sec">
          <AgentProposal id="s1" />
        </section>
        <section className="b-insp-sec">
          <h3 className="b-h3">Tonight</h3>
          <div className="b-tonight">
            <div>
              <span className="mono b-faint">6:15</span> Dinner · sheet-pan salmon <Avatar id="theo" size={16} />
            </div>
            <div>
              <span className="mono b-faint">7:15</span> Bath and bedtime <Avatar id="theo" size={16} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function AgentProposal({ id, compact, onEdit }: { id: string; compact?: boolean; onEdit?: () => void }) {
  const f = useFamily();
  const b = useB();
  const s = suggestions.find((x) => x.id === id);
  if (!s) return null;
  const status = f.suggestionStatus(id);
  const edit =
    onEdit ??
    (id === 's1' ? () => b.openCapture('Ask Theo to swap Thursday pickup @theo thursday') : undefined);
  return (
    <div className={cx('b-agent', `is-${status}`, compact && 'is-compact')}>
      <div className="b-agent-head">
        <Sparkle size={14} strokeWidth={1.5} />
        <span>Agent proposal</span>
        <SimTag />
      </div>
      <div className="b-agent-title">{s.title}</div>
      {status !== 'dismissed' && <p className="b-agent-detail">{s.detail}</p>}
      {status === 'pending' && (
        <>
          <div className="b-agent-proposed">
            <ArrowRight size={14} strokeWidth={1.5} />
            {s.action}
          </div>
          <div className="b-agent-actions">
            <button type="button" className="b-btn is-primary is-sm" onClick={() => f.suggestion(id, 'approved')}>
              Approve
            </button>
            {edit && (
              <button type="button" className="b-btn is-sm" onClick={edit}>
                Edit
              </button>
            )}
            <button type="button" className="b-btn is-quiet is-sm" onClick={() => f.suggestion(id, 'dismissed')}>
              Dismiss
            </button>
          </div>
        </>
      )}
      {status === 'approved' && (
        <div className="b-agent-done">
          <span className="b-good">Approved</span>
          <span className="b-faint">Simulated · nothing sent</span>
          <button type="button" className="b-link" onClick={() => f.dispatch({ type: 'suggestion', id, status: 'pending' })}>
            Undo
          </button>
        </div>
      )}
      {status === 'dismissed' && (
        <div className="b-agent-done">
          <span className="b-faint">Dismissed</span>
          <button type="button" className="b-link" onClick={() => f.dispatch({ type: 'suggestion', id, status: 'pending' })}>
            Restore
          </button>
        </div>
      )}
    </div>
  );
}

