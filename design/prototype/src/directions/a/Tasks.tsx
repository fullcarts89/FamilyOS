// Tasks: Things 3 quality, adapted for two adults.
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowRight, CalendarDays, Check, Layers, Moon, Repeat, Sun, X } from 'lucide-react';
import { areaOrder, people, projects, type PersonId, type Routine, type Task } from '../../data';
import { useFamily } from '../../store';
import { END_OF_WEEK, TODAY, TOMORROW, cx, dayParts, isLate, plural, who } from './helpers';
import { Avatar, CheckCircle, EitherMark, ProgressPie, TaskRow, ic, icSm, useStillVisible } from './ui';

export type TaskView =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'anytime' }
  | { kind: 'owner'; owner: PersonId | null }
  | { kind: 'routines' }
  | { kind: 'project'; id: string };

const viewKey = (v: TaskView) => (v.kind === 'owner' ? `owner-${v.owner}` : v.kind === 'project' ? `p-${v.id}` : v.kind);

const isOpen = (t: Task) => !t.done;

export function TasksScreen({ view, setView }: { view: TaskView; setView: (v: TaskView) => void }) {
  const { state } = useFamily();
  const open = state.tasks.filter(isOpen);
  const k = viewKey(view);
  const count = {
    today: open.filter((t) => t.due && t.due <= TODAY).length,
    upcoming: open.filter((t) => t.due && t.due > TODAY).length,
    anytime: open.filter((t) => !t.due).length,
    mine: open.filter((t) => t.owner === 'maya').length,
    theo: open.filter((t) => t.owner === 'theo').length,
    shared: open.filter((t) => t.owner === null).length,
  };
  const late = open.filter(isLate).length;

  const item = (v: TaskView, icon: ReactNode, label: string, n?: number, badge?: number) => {
    const on = viewKey(v) === k;
    return (
      <button
        key={viewKey(v)}
        type="button"
        className={cx('a-list-item', on && 'is-on')}
        aria-current={on ? 'page' : undefined}
        onClick={() => setView(v)}
      >
        <span className="a-list-icon">{icon}</span>
        <span className="a-list-label">{label}</span>
        {badge ? <span className="a-list-badge">{badge}</span> : null}
        {n !== undefined && <span className="a-list-count">{n}</span>}
      </button>
    );
  };

  return (
    <div className="a-tasks">
      <nav className="a-lists" aria-label="Lists">
        <div className="a-lists-group">
          {item({ kind: 'today' }, <Sun {...ic} className="a-ic-today" />, 'Today', count.today, late)}
          {item({ kind: 'upcoming' }, <CalendarDays {...ic} className="a-ic-up" />, 'Upcoming', count.upcoming)}
          {item({ kind: 'anytime' }, <Layers {...ic} className="a-ic-any" />, 'Anytime', count.anytime)}
        </div>
        <div className="a-lists-group">
          {item({ kind: 'owner', owner: 'maya' }, <Avatar id="maya" size={18} />, 'Mine', count.mine)}
          {item({ kind: 'owner', owner: 'theo' }, <Avatar id="theo" size={18} />, 'Theo’s', count.theo)}
          {item({ kind: 'owner', owner: null }, <EitherMark size={18} />, 'Shared', count.shared)}
        </div>
        <div className="a-lists-group">{item({ kind: 'routines' }, <Repeat {...ic} />, 'Routines', state.routines.length)}</div>
        <div className="a-lists-group">
          <p className="a-lists-head">Projects</p>
          {projects.map((p) => {
            const sub = state.tasks.filter((t) => t.projectId === p.id);
            const done = sub.filter((t) => t.done).length;
            return item(
              { kind: 'project', id: p.id },
              <ProgressPie value={sub.length ? done / sub.length : 0} />,
              p.id === 'p1' ? 'Hall bathroom' : 'Garage',
            );
          })}
        </div>
      </nav>

      <div className="a-tasks-main" key={k}>
        {view.kind === 'today' && <TodayView />}
        {view.kind === 'upcoming' && <UpcomingView />}
        {view.kind === 'anytime' && <AnytimeView />}
        {view.kind === 'owner' && <OwnerView owner={view.owner} />}
        {view.kind === 'routines' && <RoutinesView />}
        {view.kind === 'project' && <ProjectView id={view.id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function ViewHead({ icon, title, sub }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <header className="a-vhead">
      <h2 className="a-vtitle">
        {icon}
        {title}
      </h2>
      {sub && <p className="a-vsub">{sub}</p>}
    </header>
  );
}

function Group({
  title,
  aside,
  tasks,
  tone,
  showOwner = true,
  showProject = true,
  big,
}: {
  title: ReactNode;
  aside?: ReactNode;
  tasks: Task[];
  tone?: 'late';
  showOwner?: boolean;
  showProject?: boolean;
  big?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!tasks.length) return null;
  return (
    <section className={cx('a-tsec', tone === 'late' && 'is-late')}>
      <h3 className="a-tsec-title">
        {big}
        <span>{title}</span>
        {aside && <span className="a-tsec-aside">{aside}</span>}
      </h3>
      <ul className="a-list">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} expanded={open === t.id} onExpand={setOpen} showOwner={showOwner} showProject={showProject} />
        ))}
      </ul>
    </section>
  );
}

const byTime = (a: Task, b: Task) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
  (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') ||
  Number(b.priority === 'high') - Number(a.priority === 'high');

function TodayView() {
  const { state } = useFamily();
  const visible = useStillVisible(state.tasks);
  const shown = state.tasks.filter((t) => visible(t) && !t.waitingOn);
  const late = shown.filter((t) => t.due && t.due < TODAY).sort(byTime);
  const today = shown.filter((t) => t.due === TODAY || (t.id.startsWith('new-') && !t.due)).sort(byTime);
  const yours = today.filter((t) => t.owner === 'maya' && !t.done).length;
  const tomorrow = shown.filter((t) => t.due === TOMORROW).sort(byTime);
  return (
    <>
      <ViewHead
        icon={<Sun size={26} strokeWidth={1.75} className="a-ic-today" aria-hidden="true" />}
        title="Today"
        sub={`Tuesday, November 17 · ${plural(yours, 'thing')} for you, ${late.length} running late`}
      />
      <Group title="Late" tasks={late} tone="late" aside={plural(late.length, 'item')} />
      <Group title="Today" tasks={today} aside={plural(today.length, 'item')} />
      <EveningRoutines />
      <Group title="Tomorrow" tasks={tomorrow} aside="Wednesday" />
    </>
  );
}

function UpcomingView() {
  const { state } = useFamily();
  const visible = useStillVisible(state.tasks);
  const up = state.tasks.filter((t) => visible(t) && t.due && t.due > TODAY).sort(byTime);
  const dates = [...new Set(up.map((t) => t.due!))];
  return (
    <>
      <ViewHead icon={<CalendarDays size={26} strokeWidth={1.75} className="a-ic-up" aria-hidden="true" />} title="Upcoming" />
      {dates.map((d) => {
        const p = dayParts(d);
        const label = d === '2026-11-18' ? 'Tomorrow' : d <= END_OF_WEEK ? p.long : `${p.long}, ${p.month} ${p.num}`;
        return (
          <Group key={d} big={<span className="a-bignum">{p.num}</span>} title={label} tasks={up.filter((t) => t.due === d)} />
        );
      })}
    </>
  );
}

function AnytimeView() {
  const { state } = useFamily();
  const visible = useStillVisible(state.tasks);
  const any = state.tasks.filter((t) => visible(t) && !t.due);
  return (
    <>
      <ViewHead
        icon={<Layers size={26} strokeWidth={1.75} className="a-ic-any" aria-hidden="true" />}
        title="Anytime"
        sub="No date yet. Pick one up when there’s a gap."
      />
      {areaOrder.map((a) => (
        <Group key={a} title={a} tasks={any.filter((t) => t.area === a)} />
      ))}
    </>
  );
}

function OwnerView({ owner }: { owner: PersonId | null }) {
  const { state } = useFamily();
  const visible = useStillVisible(state.tasks);
  const mine = state.tasks.filter((t) => t.owner === owner && visible(t)).sort(byTime);
  const groups: [string, Task[], 'late'?][] = [
    ['Late', mine.filter((t) => !t.waitingOn && t.due && t.due < TODAY), 'late'],
    ['Today', mine.filter((t) => !t.waitingOn && t.due === TODAY)],
    ['This week', mine.filter((t) => !t.waitingOn && t.due && t.due > TODAY && t.due <= END_OF_WEEK)],
    ['Later', mine.filter((t) => !t.waitingOn && t.due && t.due > END_OF_WEEK)],
    ['Anytime', mine.filter((t) => !t.waitingOn && !t.due)],
    ['Waiting', mine.filter((t) => t.waitingOn)],
  ];
  const n = mine.filter((t) => !t.done).length;
  const title = owner === 'maya' ? 'Mine' : owner === 'theo' ? 'Theo’s' : 'Shared';
  const sub =
    owner === 'maya'
      ? `${plural(n, 'open item')} on your plate`
      : owner === 'theo'
        ? `${plural(n, 'open item')}. Open one to nudge, reassign or move it.`
        : `${plural(n, 'open item')} either of you can pick up`;
  return (
    <>
      <ViewHead
        icon={owner ? <Avatar id={owner} size={28} /> : <EitherMark size={28} />}
        title={title}
        sub={sub}
      />
      {groups.map(([g, list, tone]) => (
        <Group key={g} title={g} tasks={list} tone={tone} showOwner={owner === null} aside={plural(list.length, 'item')} />
      ))}
    </>
  );
}

/** Things-style "This evening": today's routine turns, with whose turn it is. */
function EveningRoutines() {
  const f = useFamily();
  const due = f.state.routines.filter((r) => r.nextDue === TODAY || r.history[0]?.date === TODAY);
  if (!due.length) return null;
  return (
    <section className="a-tsec">
      <h3 className="a-tsec-title">
        <Moon size={18} strokeWidth={1.75} className="a-tsec-ic" aria-hidden="true" />
        <span>This evening</span>
        <span className="a-tsec-aside">Routines</span>
      </h3>
      <ul className="a-list">
        {due.map((r) => {
          const doneToday = r.history[0]?.date === TODAY && r.history[0].done;
          const cur = doneToday ? r.history[0]!.who : (r.rotation[r.turn] ?? r.rotation[0]!);
          return (
            <li key={r.id} className={cx('a-task', doneToday && 'is-done')}>
              <div className="a-task-line">
                <CheckCircle
                  checked={!!doneToday}
                  onChange={() => (doneToday ? undefined : f.routineDone(r.id))}
                  label={`Done: ${r.title}`}
                />
                <span className="a-task-main">
                  <span className="a-task-title">{r.title}</span>
                  <span className="a-row-meta">
                    <span className="a-meta-part">
                      <Repeat size={12} strokeWidth={2} aria-hidden="true" />
                      &nbsp;{doneToday ? `Done by ${who(cur, true)}` : `${who(cur)}${cur === 'maya' ? '’re' : '’s'} up tonight`}
                    </span>
                    <span className="a-meta-part">{r.area}</span>
                  </span>
                </span>
                <span className="a-task-owner">
                  <Avatar id={cur} size={22} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- Routines -----------------------------------------------------------------------------------

function when(r: Routine) {
  if (/nightly/i.test(r.cadence)) return 'tonight';
  if (/weekly|wednesdays|saturdays/i.test(r.cadence)) return 'this week';
  return 'this time';
}

function RoutinesView() {
  const f = useFamily();
  return (
    <>
      <ViewHead
        icon={<Repeat size={26} strokeWidth={1.75} aria-hidden="true" />}
        title="Routines"
        sub="The things that keep coming back, and whose turn it is."
      />
      <ul className="a-routines">
        {f.state.routines.map((r) => {
          const cur = r.rotation[r.turn] ?? r.rotation[0]!;
          const next = r.rotation[(r.turn + 1) % r.rotation.length]!;
          const solo = r.rotation.length < 2;
          return (
            <li key={r.id} className="a-routine">
              <div className="a-routine-main">
                <h4 className="a-routine-title">{r.title}</h4>
                <p className="a-routine-meta">
                  {r.cadence} · Next {r.nextLabel.toLowerCase().startsWith('to') ? r.nextLabel.toLowerCase() : r.nextLabel}
                </p>
              </div>
              <div className="a-rotation" aria-label={solo ? `Always ${who(cur, true)}` : `${who(cur)} ${when(r)}, ${who(next, true)} next`}>
                <span className="a-turn is-cur">
                  <Avatar id={cur} size={26} />
                  <span>
                    {solo ? `Always ${who(cur, true)}` : `${who(cur)} ${when(r)}`}
                  </span>
                </span>
                {!solo && (
                  <>
                    <ArrowRight className="a-turn-arrow" size={14} strokeWidth={2} aria-hidden="true" />
                    <span className="a-turn">
                      <Avatar id={next} size={20} />
                      <span>{who(next, true)} next</span>
                    </span>
                  </>
                )}
              </div>
              <div className="a-routine-hist" aria-label="Recent turns">
                {r.history.slice(0, 4).map((h, i) => (
                  <span
                    key={i}
                    className={cx('a-hist', !h.done && 'is-miss')}
                    style={{ color: people[h.who].color }}
                    title={`${dayParts(h.date).short} ${dayParts(h.date).num}: ${people[h.who].name}${h.done ? '' : ' (missed)'}`}
                  >
                    {h.done ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
                  </span>
                ))}
              </div>
              <div className="a-routine-actions">
                <button type="button" className="a-btn a-btn--sm" onClick={() => f.routineDone(r.id)}>
                  <Check {...icSm} aria-hidden="true" />
                  Done
                </button>
                {!solo && (
                  <button type="button" className="a-btn a-btn--sm a-btn--quiet" onClick={() => f.routineSwap(r.id)}>
                    <ArrowLeftRight {...icSm} aria-hidden="true" />
                    Swap turns
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// --- Project page -------------------------------------------------------------------------------

function ProjectView({ id }: { id: string }) {
  const { state } = useFamily();
  const p = projects.find((x) => x.id === id)!;
  const sub = state.tasks.filter((t) => t.projectId === id);
  const visible = useStillVisible(sub);
  const done = sub.filter((t) => t.done).length;
  const openOnes = sub.filter((t) => visible(t)).sort(byTime);
  const finished = sub.filter((t) => !visible(t));
  const target = p.target ? dayParts(p.target) : undefined;
  const budget = p.budget ? /\$([\d,]+) of \$([\d,]+)/.exec(p.budget) : null;
  const spent = budget ? Number(budget[1]!.replace(/,/g, '')) : 0;
  const total = budget ? Number(budget[2]!.replace(/,/g, '')) : 0;
  const pct = sub.length ? done / sub.length : 0;
  return (
    <>
      <header className="a-vhead">
        <h2 className="a-vtitle">
          <ProgressPie value={pct} size={26} />
          {p.title}
        </h2>
        <p className="a-proj-summary">{p.summary}</p>
        <dl className="a-proj-facts">
          <div>
            <dt>Progress</dt>
            <dd>
              {done} of {sub.length} done
            </dd>
          </div>
          {target && (
            <div>
              <dt>Target</dt>
              <dd>
                {target.month} {target.num}
              </dd>
            </div>
          )}
          <div>
            <dt>Who</dt>
            <dd className="a-proj-who">
              {p.owner ? <Avatar id={p.owner} size={18} /> : <EitherMark size={18} />}
              {p.owner ? who(p.owner) : 'Both of you'}
            </dd>
          </div>
          {budget && (
            <div className="a-proj-budget">
              <dt>Budget</dt>
              <dd>
                <span>
                  ${budget[1]} <span className="a-muted">of ${budget[2]} · ${(total - spent).toLocaleString()} left</span>
                </span>
                <span className="a-bar" aria-hidden="true">
                  <span style={{ width: `${(spent / total) * 100}%` }} />
                </span>
              </dd>
            </div>
          )}
        </dl>
      </header>
      <Group title="To do" tasks={openOnes} showProject={false} aside={plural(openOnes.filter((t) => !t.done).length, 'left', 'left')} />
      <Group title="Done" tasks={finished} showProject={false} />
    </>
  );
}
