// Weekly Reset · Planning session. An agenda rail with status and counts, a session timer, and one
// focused panel per agenda item, ending in a dense week plan table.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Pause,
  Play,
  Plus,
  Sparkle,
  TriangleAlert,
} from 'lucide-react';
import {
  events,
  lastWeek,
  mealIdeas,
  nextWeekDays,
  people,
  suggestions,
  type GroceryItem,
  type PersonId,
  type Task,
} from '../../data';
import { coverageSlots, useFamily } from '../../store';
import { useB } from './ctx';
import { decisionState, DecisionRow } from './decisions';
import { PageHeader } from './header';
import { AgentProposal } from './inspector';
import { Avatar, Kbd, OwnerAvatar, PriorityGlyph } from './ui';
import { clock, cx, dueShort, isTyping, range, weekday } from './util';

const WEEK_START = nextWeekDays[0]!.date;
const WEEK_END = nextWeekDays[6]!.date;
const AWAY: Record<string, boolean> = { '2026-11-23': true, '2026-11-24': true };

const STEPS = [
  { id: 'look', label: 'Look back', est: 3, q: 'How did last week go?' },
  { id: 'loose', label: 'Loose ends', est: 5, q: 'What do we do with what didn’t get done?' },
  { id: 'decide', label: 'Decide together', est: 5, q: 'What do we need to agree on?' },
  { id: 'assign', label: 'Who’s on what', est: 4, q: 'Who covers June, and who takes what?' },
  { id: 'meals', label: 'Meals and groceries', est: 5, q: 'What’s for dinner, and who’s cooking?' },
  { id: 'agent', label: 'Agent help', est: 2, q: 'Anything the assistant could take off our plate?' },
  { id: 'plan', label: 'Week plan', est: 1, q: 'Here’s the week. Ready to commit?' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function looseEnds(tasks: Task[]): string[] {
  return tasks
    .filter((t) => !t.done && !t.projectId && t.due !== '2026-11-17' && (t.waitingOn || !t.due || t.due <= '2026-11-22'))
    .map((t) => t.id);
}

// ---------------------------------------------------------------------------------------------

function useLoad(loose: string[]) {
  const f = useFamily();
  const { carry, coverage, meals } = f.state.reset;
  return useMemo(() => {
    const calc = (p: PersonId) => {
      const tasks = f.state.tasks.filter(
        (t) =>
          !t.done &&
          t.owner === p &&
          ((t.due && t.due >= WEEK_START && t.due <= WEEK_END) || (loose.includes(t.id) && carry[t.id] === 'keep')),
      ).length;
      const care = Object.values(coverage).filter((w) => w === p).length;
      const cook = Object.entries(meals).filter(([d, m]) => d >= WEEK_START && d <= WEEK_END && m.cook === p).length;
      return { tasks, care, cook, total: tasks + care + cook };
    };
    return { maya: calc('maya'), theo: calc('theo') };
  }, [f.state.tasks, carry, coverage, meals, loose]);
}

function LoadBar({ loose, compact }: { loose: string[]; compact?: boolean }) {
  const l = useLoad(loose);
  const total = l.maya.total + l.theo.total || 1;
  const diff = l.maya.total - l.theo.total;
  const verdict =
    Math.abs(diff) <= 1 ? 'Even' : diff > 0 ? `You have ${diff} more` : `Theo has ${-diff} more`;
  const detail = (x: { tasks: number; care: number; cook: number }) =>
    `${x.tasks} to-do${x.tasks === 1 ? '' : 's'} · ${x.care} June · ${x.cook} dinner${x.cook === 1 ? '' : 's'}`;
  return (
    <div className={cx('b-load', compact && 'is-compact')} aria-label={`Load next week: Maya ${l.maya.total}, Theo ${l.theo.total}`}>
      <div className="b-load-top">
        <span className="b-load-side">
          <Avatar id="maya" size={18} />
          <span className="b-load-name">Maya</span>
          <span className="mono b-load-num">{l.maya.total}</span>
          {!compact && <span className="b-faint b-load-detail">{detail(l.maya)}</span>}
        </span>
        <span className={cx('b-load-verdict', Math.abs(diff) > 2 && 'is-warn')}>
          <span className="b-faint">Next week ·</span> {verdict}
        </span>
        <span className="b-load-side is-right">
          {!compact && <span className="b-faint b-load-detail">{detail(l.theo)}</span>}
          <span className="mono b-load-num">{l.theo.total}</span>
          <span className="b-load-name">Theo</span>
          <Avatar id="theo" size={18} />
        </span>
      </div>
      <div className="b-load-bar" aria-hidden="true">
        <span style={{ width: `${(l.maya.total / total) * 100}%`, background: people.maya.color }} />
        <span style={{ width: `${(l.theo.total / total) * 100}%`, background: people.theo.color }} />
        <i className="b-load-mid" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function useTimer() {
  const b = useB();
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (b.resetPaused) return;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [b.resetPaused]);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function Reset() {
  const f = useFamily();
  const b = useB();
  const [loose] = useState(() => looseEnds(f.state.tasks));
  const step = Math.min(f.state.reset.step, STEPS.length - 1);
  const time = useTimer();
  const setStep = (n: number) => {
    f.resetPatch({ step: n });
    document.querySelector('.dir-b .b-reset-panel')?.scrollTo({ top: 0 });
  };

  const { carry, coverage, meals, committed } = f.state.reset;
  const counts: Record<StepId, number | null> = {
    look: null,
    loose: loose.filter((id) => !carry[id]).length,
    decide: f.state.decisions.filter((d) => decisionState(d).tone !== 'good').length,
    assign: coverageSlots.filter((s) => !coverage[s.key]).length,
    meals: nextWeekDays.filter((d) => !meals[d.date]).length,
    agent: suggestions.filter((s) => s.place === 'reset' && f.suggestionStatus(s.id) === 'pending').length,
    plan: null,
  };
  const statusOf = (i: number): 'done' | 'current' | 'todo' => {
    const s = STEPS[i]!;
    if (i === step) return 'current';
    if (s.id === 'plan') return committed ? 'done' : 'todo';
    const c = counts[s.id];
    if (c === 0 || (c === null && i < step)) return 'done';
    return 'todo';
  };
  const cur = STEPS[step]!;
  const doneCount = STEPS.filter((_, i) => statusOf(i) === 'done').length;

  return (
    <>
      <PageHeader
        crumbs={['Weekly Reset', 'Week of Nov 23']}
        right={
          <>
            <div className="b-mode b-hide-phone" role="group" aria-label="How you're doing this">
              {(['together', 'apart'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cx('b-mode-btn', f.state.reset.mode === m && 'is-on')}
                  aria-pressed={f.state.reset.mode === m}
                  onClick={() => f.resetPatch({ mode: m })}
                >
                  {m === 'together' ? 'Together' : 'Own phones'}
                </button>
              ))}
            </div>
            <span className="b-session">
              <span className="b-session-avs">
                <Avatar id="maya" size={18} />
                <Avatar id="theo" size={18} dim={f.state.reset.mode === 'apart'} />
              </span>
              <span className="mono">
                Reset · {time} <span className="b-faint">/ ~25 min</span>
              </span>
              <button
                type="button"
                className="b-icon-btn is-xs"
                aria-label={b.resetPaused ? 'Resume timer' : 'Pause timer'}
                onClick={() => b.setResetPaused(!b.resetPaused)}
              >
                {b.resetPaused ? <Play size={12} strokeWidth={1.75} /> : <Pause size={12} strokeWidth={1.75} />}
              </button>
            </span>
          </>
        }
      />
      <div className="b-reset">
        <nav className="b-agenda" aria-label="Agenda">
          <div className="b-agenda-head">
            <span>Agenda</span>
            <span className="mono b-faint">
              {doneCount}/{STEPS.length}
            </span>
          </div>
          <div className="b-agenda-prog" aria-hidden="true">
            <span style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
          </div>
          <ol className="b-agenda-list">
            {STEPS.map((s, i) => {
              const st = statusOf(i);
              const c = counts[s.id];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={cx('b-agenda-item', `is-${st}`)}
                    aria-current={i === step ? 'step' : undefined}
                    onClick={() => setStep(i)}
                  >
                    <span className="b-agenda-glyph" aria-hidden="true">
                      {st === 'done' ? <CircleCheck size={16} strokeWidth={1.75} /> : <span className="b-agenda-ring" />}
                    </span>
                    <span className="b-agenda-label">{s.label}</span>
                    {c !== null && c > 0 && <span className="b-agenda-count mono">{c}</span>}
                    <span className="b-agenda-est mono">{s.est}m</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="b-agenda-foot">
            {f.state.reset.mode === 'apart' ? (
              <span>
                <Avatar id="theo" size={14} /> Theo is on <span className="mono">Loose ends</span> on his phone
              </span>
            ) : (
              <span>Both of you on this screen. Theo’s votes are shown as he made them.</span>
            )}
          </div>
        </nav>

        <div className="b-reset-panel">
          <div className="b-step">
            <header className="b-step-head">
              <span className="mono b-faint b-step-num">
                {step + 1}/{STEPS.length}
              </span>
              <h1 className="b-step-title">{cur.label}</h1>
              <span className="mono b-faint b-step-est">~{cur.est} min</span>
              <p className="b-step-q">{cur.q}</p>
            </header>
            {cur.id === 'look' && <LookBack />}
            {cur.id === 'loose' && <Triage loose={loose} onDone={() => setStep(step + 1)} />}
            {cur.id === 'decide' && <Decide />}
            {cur.id === 'assign' && <Assign loose={loose} />}
            {cur.id === 'meals' && <Meals />}
            {cur.id === 'agent' && <AgentStep />}
            {cur.id === 'plan' && <WeekPlan loose={loose} />}
            <footer className="b-step-foot">
              <button type="button" className="b-btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                <ArrowLeft size={14} strokeWidth={1.5} /> Back
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="b-btn is-primary" onClick={() => setStep(step + 1)}>
                  Next: {STEPS[step + 1]!.label} <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              ) : committed ? (
                <button type="button" className="b-btn" onClick={() => b.go('home')}>
                  Back to Home
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function LookBack() {
  const total = lastWeek.done.maya + lastWeek.done.theo;
  return (
    <div className="b-look">
      <div className="b-stats">
        <div className="b-stat">
          <span className="b-stat-label">Done</span>
          <span className="b-stat-num mono">{total}</span>
          <div className="b-split" aria-hidden="true">
            <span style={{ width: `${(lastWeek.done.maya / total) * 100}%`, background: people.maya.color }} />
            <span style={{ width: `${(lastWeek.done.theo / total) * 100}%`, background: people.theo.color }} />
          </div>
          <span className="b-stat-sub">
            <Avatar id="maya" size={14} /> <span className="mono">{lastWeek.done.maya}</span>
            <Avatar id="theo" size={14} /> <span className="mono">{lastWeek.done.theo}</span>
          </span>
        </div>
        <div className="b-stat">
          <span className="b-stat-label">Routines kept</span>
          <span className="b-stat-num mono">
            {lastWeek.routinesKept}
            <span className="b-faint">/{lastWeek.routinesTotal}</span>
          </span>
          <div className="b-split" aria-hidden="true">
            <span style={{ width: `${(lastWeek.routinesKept / lastWeek.routinesTotal) * 100}%`, background: 'var(--good)' }} />
          </div>
          <span className="b-stat-sub">Plants missed on Sunday</span>
        </div>
        <div className="b-stat">
          <span className="b-stat-label">June covered</span>
          <span className="b-stat-num mono">
            10<span className="b-faint">/10</span>
          </span>
          <div className="b-split" aria-hidden="true">
            <span style={{ width: '100%', background: people.june.color }} />
          </div>
          <span className="b-stat-sub">Every drop-off and pickup</span>
        </div>
        <div className="b-stat">
          <span className="b-stat-label">Slipped</span>
          <span className="b-stat-num mono b-late">{lastWeek.slipped.length}</span>
          <div className="b-split" aria-hidden="true" />
          <span className="b-stat-sub">Back in loose ends next</span>
        </div>
      </div>
      <div className="b-look-cols">
        <section>
          <h3 className="b-h3">Went well</h3>
          <ul className="b-checklist">
            {lastWeek.highlights.map((h) => (
              <li key={h}>
                <Check size={14} strokeWidth={2} className="b-good" />
                {h}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="b-h3">Slipped</h3>
          <ul className="b-checklist">
            {lastWeek.slipped.map((h) => (
              <li key={h}>
                <Clock size={14} strokeWidth={1.75} className="b-late" />
                {h}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="b-block">
        <header className="b-block-head">
          <h3 className="b-h3">The week ahead</h3>
          <span className="mono b-faint">Nov 23–29</span>
        </header>
        <div className="b-ahead">
          {nextWeekDays.map((d) => {
            const evs = events
              .filter((e) => e.date === d.date)
              .sort((a, c) => a.start.localeCompare(c.start));
            return (
              <div key={d.date} className={cx('b-ahead-day', evs.length === 0 && 'is-quiet')}>
                <div className="b-mday-head">
                  <span className="b-mday-name">{d.day}</span>
                  <span className="mono b-faint">{d.label.split(' ')[1]}</span>
                </div>
                {evs.map((e) => (
                  <div key={e.id} className="b-ahead-ev">
                    <span className="b-avstack">
                      {e.who
                        .filter((w) => w !== 'june' || e.who.length === 1)
                        .map((w) => (
                          <Avatar key={w} id={w} size={14} />
                        ))}
                    </span>
                    <span>
                      <span className="mono b-faint">{e.kind === 'childcare' && e.who.length === 1 ? 'All day' : clock(e.start)}</span>{' '}
                      {e.title.replace('June: ', '')}
                    </span>
                  </div>
                ))}
                {evs.length === 0 && <span className="b-faint b-ahead-free">Open</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const CHOICE_LABEL = { keep: 'Keep', later: 'Later', drop: 'Drop' } as const;

function Triage({ loose, onDone }: { loose: string[]; onDone: () => void }) {
  const f = useFamily();
  const b = useB();
  const carry = f.state.reset.carry;
  const [cursor, setCursor] = useState<string | null>(() => loose.find((id) => !carry[id]) ?? null);
  const items = loose.map((id) => f.state.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const current = items.find((t) => t.id === cursor);
  const decided = loose.filter((id) => carry[id]).length;

  const decide = (choice: 'keep' | 'later' | 'drop', owner?: PersonId) => {
    if (!current) return;
    f.carry(current.id, choice);
    if (owner && owner !== current.owner) f.dispatch({ type: 'assign', id: current.id, owner });
    const idx = loose.indexOf(current.id);
    const order = [...loose.slice(idx + 1), ...loose.slice(0, idx)];
    setCursor(order.find((id) => !carry[id] && id !== current.id) ?? null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || b.captureOpen || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        k: () => decide('keep'),
        l: () => decide('later'),
        d: () => decide('drop'),
        '1': () => decide('keep', 'maya'),
        '2': () => decide('keep', 'theo'),
      };
      if (map[k] && current) {
        e.preventDefault();
        map[k]!();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const summary = {
    keep: loose.filter((id) => carry[id] === 'keep').length,
    later: loose.filter((id) => carry[id] === 'later').length,
    drop: loose.filter((id) => carry[id] === 'drop').length,
  };

  return (
    <div className="b-triage">
      <LoadBar loose={loose} compact />
      <div className="b-triage-progress">
        <span className="mono">
          {Math.min(decided + 1, loose.length)} of {loose.length}
        </span>
        <span className="b-triage-dots" aria-hidden="true">
          {loose.map((id) => (
            <i key={id} className={cx(carry[id] && `is-${carry[id]}`, id === cursor && 'is-cur')} />
          ))}
        </span>
      </div>

      {current ? (
        <div className="b-tcard" key={current.id}>
          <div className="b-tcard-meta">
            <OwnerAvatar owner={current.owner} size={18} />
            <span>{current.owner === 'maya' ? 'Yours' : current.owner ? `${people[current.owner].name}’s` : 'Either of you'}</span>
            <span className="b-sep" />
            <span className={cx('mono', dueShort(current).tone === 'late' && 'b-late')}>
              {current.waitingOn ? `Waiting · ${current.waitingOn}` : current.due ? dueShort(current).text : 'No date'}
            </span>
            <span className="b-sep" />
            <span>{current.area}</span>
            {current.priority === 'high' && <PriorityGlyph high />}
          </div>
          <h2 className="b-tcard-title">{current.title}</h2>
          {current.notes && <p className="b-tcard-notes">{current.notes}</p>}
          <div className="b-tcard-actions">
            <div className="b-tcard-group">
              <button type="button" className="b-tbtn" onClick={() => decide('keep')}>
                Keep <Kbd>K</Kbd>
              </button>
              <button type="button" className="b-tbtn" onClick={() => decide('later')}>
                Later <Kbd>L</Kbd>
              </button>
              <button type="button" className="b-tbtn is-drop" onClick={() => decide('drop')}>
                Drop <Kbd>D</Kbd>
              </button>
            </div>
            <div className="b-tcard-group">
              <span className="b-tcard-label">Keep for</span>
              <button type="button" className={cx('b-tbtn is-person', current.owner === 'maya' && 'is-current')} onClick={() => decide('keep', 'maya')}>
                <Avatar id="maya" size={16} /> Maya <Kbd>1</Kbd>
              </button>
              <button type="button" className={cx('b-tbtn is-person', current.owner === 'theo' && 'is-current')} onClick={() => decide('keep', 'theo')}>
                <Avatar id="theo" size={16} /> Theo <Kbd>2</Kbd>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="b-tcard is-complete">
          <CircleCheck size={20} strokeWidth={1.75} className="b-good" />
          <div>
            <h2 className="b-tcard-title">All {loose.length} loose ends sorted</h2>
            <p className="b-tcard-notes">
              <span className="mono">{summary.keep}</span> kept · <span className="mono">{summary.later}</span> later ·{' '}
              <span className="mono">{summary.drop}</span> dropped. Click any row below to change it.
            </p>
          </div>
          <button type="button" className="b-btn is-primary" onClick={onDone}>
            Next: Decide together <ArrowRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <ol className="b-queue" aria-label="Loose ends">
        {items.map((t, i) => {
          const c = carry[t.id];
          return (
            <li key={t.id}>
              <button type="button" className={cx('b-qrow', t.id === cursor && 'is-cur', c && 'is-decided')} onClick={() => setCursor(t.id)}>
                <span className="mono b-faint b-qnum">{String(i + 1).padStart(2, '0')}</span>
                <span className="b-qtitle">{t.title}</span>
                <span className={cx('mono b-qdue', dueShort(t).tone === 'late' && 'b-late')}>{t.waitingOn ? 'Waiting' : dueShort(t).text}</span>
                <OwnerAvatar owner={t.owner} size={16} />
                <span className={cx('b-qchoice', c && `is-${c}`)}>{c ? CHOICE_LABEL[c] : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Decide() {
  const f = useFamily();
  return (
    <div className="b-decide">
      <div className="b-decide-legend">
        <span>
          <Avatar id="maya" size={14} /> your vote
        </span>
        <span>
          <Avatar id="theo" size={14} /> Theo’s vote
        </span>
        <span className="b-faint">Click an option to vote. Click again to take it back.</span>
      </div>
      {f.state.decisions.map((d) => (
        <DecisionRow key={d.id} d={d} large />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Assign({ loose }: { loose: string[] }) {
  const f = useFamily();
  const { coverage, carry } = f.state.reset;
  const days = nextWeekDays.slice(0, 3);
  const nextTasks = f.state.tasks.filter(
    (t) => !t.done && ((t.due && t.due >= WEEK_START && t.due <= WEEK_END) || (loose.includes(t.id) && carry[t.id] === 'keep')),
  );
  const ctxEvents = events.filter((e) => e.date >= WEEK_START && e.date <= WEEK_END && ['e23', 'e19', 'e24'].includes(e.id));
  const unassigned = coverageSlots.filter((s) => !coverage[s.key]).length;
  return (
    <div className="b-assign">
      <LoadBar loose={loose} />

      <section className="b-block">
        <header className="b-block-head">
          <h3 className="b-h3">
            June’s drop-offs and pickups <span className="mono b-faint">{6 - unassigned}/6</span>
          </h3>
          <button
            type="button"
            className="b-btn is-sm"
            disabled={unassigned === 0}
            onClick={() => coverageSlots.forEach((s) => !coverage[s.key] && f.setCoverage(s.key, s.suggested))}
          >
            Use suggestions
          </button>
        </header>
        <div className="b-cover" role="table" aria-label="June coverage">
          <div className="b-cover-row is-head" role="row">
            <span role="columnheader" />
            {days.map((d) => (
              <span key={d.date} role="columnheader" className="b-cover-day">
                <span>{d.day}</span> <span className="mono b-faint">{d.label}</span>
                {d.note && <span className="b-cover-note">{d.note}</span>}
              </span>
            ))}
          </div>
          {(['drop', 'pick'] as const).map((slot) => (
            <div key={slot} className="b-cover-row" role="row">
              <span role="rowheader" className="b-cover-label">
                {slot === 'drop' ? 'Drop-off' : 'Pickup'} <span className="mono b-faint">{slot === 'drop' ? '8:15' : '5:30'}</span>
              </span>
              {days.map((d) => {
                const s = coverageSlots.find((x) => x.key === `${d.date}-${slot}`)!;
                const who = coverage[s.key];
                const clash = who === 'maya' && AWAY[d.date];
                return (
                  <span key={s.key} role="cell" className={cx('b-cover-cell', clash && 'is-clash', !who && 'is-empty')}>
                    {(['maya', 'theo'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={cx('b-cover-btn', who === p && 'is-on', !who && s.suggested === p && 'is-sugg')}
                        aria-pressed={who === p}
                        aria-label={`${s.day} ${s.label}: ${people[p].name}`}
                        onClick={() => f.setCoverage(s.key, who === p ? null : p)}
                        style={{ ['--c' as string]: people[p].color, ['--t' as string]: people[p].tint }}
                      >
                        <Avatar id={p} size={16} dim={who !== p} />
                        {people[p].name}
                      </button>
                    ))}
                    {clash && (
                      <span className="b-cover-warn">
                        <TriangleAlert size={12} strokeWidth={1.75} /> Maya is in Denver
                      </span>
                    )}
                    {!who && <span className="b-cover-hint">Suggested: {people[s.suggested].name}</span>}
                  </span>
                );
              })}
            </div>
          ))}
          <div className="b-cover-foot">
            <Avatar id="june" size={14} /> Thu–Fri daycare is closed for Thanksgiving. June is home with both of you.
          </div>
        </div>
      </section>

      <section className="b-block">
        <header className="b-block-head">
          <h3 className="b-h3">
            Next week’s to-dos <span className="mono b-faint">{nextTasks.length}</span>
          </h3>
        </header>
        <div className="b-assign-list">
          {nextTasks.map((t) => (
            <div key={t.id} className="b-arow">
              <span className="b-arow-title">{t.title}</span>
              <span className={cx('mono b-arow-due', dueShort(t).tone === 'late' && 'b-late')}>{t.due ? dueShort(t).text : 'No date'}</span>
              <span className="b-ownerseg" role="group" aria-label={`Owner of ${t.title}`}>
                {(['maya', 'theo', null] as (PersonId | null)[]).map((o) => (
                  <button
                    key={o ?? 's'}
                    type="button"
                    className={cx(t.owner === o && 'is-on')}
                    aria-pressed={t.owner === o}
                    onClick={() => t.owner !== o && f.assign(t.id, o)}
                  >
                    <OwnerAvatar owner={o} size={14} />
                    {o === 'maya' ? 'Maya' : o ? 'Theo' : 'Either'}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="b-assign-ctx">
          <span className="b-faint">Already on the calendar:</span>
          {ctxEvents.map((e) => (
            <span key={e.id} className="b-ctxchip">
              <Avatar id={e.who[0]!} size={14} />
              <span className="mono">{weekday(e.date)}</span> {e.title}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const AISLES: GroceryItem['aisle'][] = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Pantry', 'Frozen', 'Household', 'Baby'];

function guessAisle(name: string): GroceryItem['aisle'] {
  const n = name.toLowerCase();
  if (/(apple|banana|lemon|lime|onion|garlic|spinach|lettuce|carrot|potato|herb|avocado|berr|tomato|pepper|broccoli)/.test(n)) return 'Produce';
  if (/(milk|yogurt|cheese|butter|egg|cream)/.test(n)) return 'Dairy & eggs';
  if (/(chicken|beef|pork|turkey|fish|salmon|shrimp|sausage)/.test(n)) return 'Meat & fish';
  if (/(frozen|ice cream|peas)/.test(n)) return 'Frozen';
  if (/(soap|paper|towel|detergent|sponge|trash bag|foil)/.test(n)) return 'Household';
  if (/(diaper|wipes|formula|baby)/.test(n)) return 'Baby';
  return 'Pantry';
}

function Meals() {
  const f = useFamily();
  const b = useB();
  const { meals } = f.state.reset;
  const [draft, setDraft] = useState('');
  const planned = nextWeekDays.filter((d) => meals[d.date]).length;
  const left = f.state.groceries.filter((g) => !g.checked).length;

  const pick = (anchor: HTMLElement, date: string) => {
    const cur = meals[date];
    const options = [...(date === '2026-11-26' ? ['Thanksgiving dinner'] : []), ...mealIdeas, 'Leftovers', 'Eat out'];
    b.openMenu({
      anchor,
      title: `${weekday(date, 'long')} dinner`,
      items: [
        ...options.map((o) => ({ id: o, label: o })),
        ...(cur ? [{ id: '__div', label: '', divider: true }, { id: '__clear', label: 'Clear' }] : []),
      ],
      selected: cur?.title,
      onSelect: (id) => {
        if (id === '__clear') {
          const rest = { ...meals };
          delete rest[date];
          f.resetPatch({ meals: rest });
          return;
        }
        const cook = cur?.cook ?? (AWAY[date] ? 'theo' : id === 'Eat out' || id === 'Leftovers' ? null : 'maya');
        f.setMeal(date, id, cook);
      },
    });
  };

  const fill = () => {
    const used = new Set(Object.values(meals).map((m) => m.title));
    const pool = mealIdeas.filter((m) => !used.has(m));
    let i = 0;
    nextWeekDays.forEach((d, n) => {
      if (meals[d.date]) return;
      const title = d.date === '2026-11-26' ? 'Thanksgiving dinner' : pool[i++ % pool.length]!;
      const cook: PersonId = AWAY[d.date] ? 'theo' : n % 2 === 0 ? 'maya' : 'theo';
      f.setMeal(d.date, title, cook);
    });
  };

  const add = () => {
    if (!draft.trim()) return;
    f.addGrocery(draft, guessAisle(draft));
    setDraft('');
  };

  return (
    <div className="b-meals">
      <section className="b-block">
        <header className="b-block-head">
          <h3 className="b-h3">
            Dinners <span className="mono b-faint">{planned}/7 planned</span>
          </h3>
          <button type="button" className="b-btn is-sm" disabled={planned === 7} onClick={fill}>
            Fill empty days
          </button>
        </header>
        <div className="b-mgrid">
          {nextWeekDays.map((d) => {
            const m = meals[d.date];
            const clash = m?.cook === 'maya' && AWAY[d.date];
            return (
              <div key={d.date} className={cx('b-mday', clash && 'is-clash', !m && 'is-empty')}>
                <div className="b-mday-head">
                  <span className="b-mday-name">{d.day}</span>
                  <span className="mono b-faint">{d.label.split(' ')[1]}</span>
                </div>
                <div className="b-mday-note">{d.note ?? ''}</div>
                <button type="button" className={cx('b-mdish', !m && 'is-empty')} onClick={(e) => pick(e.currentTarget, d.date)}>
                  {m ? m.title : (
                    <>
                      <Plus size={12} strokeWidth={1.75} /> Pick dinner
                    </>
                  )}
                  <ChevronDown size={12} strokeWidth={1.5} className="b-mdish-chev" />
                </button>
                {m && (
                  <button
                    type="button"
                    className="b-mcook"
                    onClick={() => f.setMeal(d.date, m.title, m.cook === 'maya' ? 'theo' : m.cook === 'theo' ? null : 'maya')}
                    aria-label={`Cook: ${m.cook ? people[m.cook].name : 'nobody'}. Change`}
                  >
                    {m.cook ? <Avatar id={m.cook} size={14} /> : <span className="b-mcook-none" />}
                    <span>{m.cook ? `${people[m.cook].name} cooks` : 'No cooking'}</span>
                  </button>
                )}
                {clash && (
                  <span className="b-cover-warn">
                    <TriangleAlert size={12} strokeWidth={1.75} /> Away
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="b-block">
        <header className="b-block-head">
          <h3 className="b-h3">
            Groceries <span className="mono b-faint">{left} left</span>
          </h3>
          <form
            className="b-gadd"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add an item"
              aria-label="Add a grocery item"
              onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), e.stopPropagation())}
            />
            {draft.trim() && <span className="b-gadd-aisle">{guessAisle(draft)}</span>}
            <button type="submit" className="b-btn is-sm" disabled={!draft.trim()}>
              Add
            </button>
          </form>
        </header>
        <div className="b-groc">
          {AISLES.map((a) => {
            const items = f.state.groceries.filter((g) => g.aisle === a);
            if (!items.length) return null;
            return (
              <div key={a} className="b-aisle">
                <div className="b-aisle-head">
                  {a} <span className="mono b-faint">{items.filter((g) => !g.checked).length}</span>
                </div>
                {items.map((g) => (
                  <label key={g.id} className={cx('b-gitem', g.checked && 'is-checked')}>
                    <input type="checkbox" checked={g.checked} onChange={() => f.toggleGrocery(g.id)} />
                    <span className="b-gbox" aria-hidden="true">
                      {g.checked && <Check size={11} strokeWidth={2.5} />}
                    </span>
                    <span className="b-gname">{g.name}</span>
                    {g.detail && <span className="mono b-faint b-gdetail">{g.detail}</span>}
                    <Avatar id={g.addedBy} size={14} title={`Added by ${people[g.addedBy].name}`} />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function AgentStep() {
  const list = suggestions.filter((s) => s.place === 'reset');
  return (
    <div className="b-agentstep">
      <div className="b-agentstep-note">
        <Sparkle size={14} strokeWidth={1.5} />
        These show how an assistant could help later. Approving only changes this prototype. Nothing is sent or paid.
      </div>
      <div className="b-agentgrid">
        {list.map((s) => (
          <AgentProposal key={s.id} id={s.id} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function WeekPlan({ loose }: { loose: string[] }) {
  const f = useFamily();
  const { coverage, meals, carry, committed } = f.state.reset;
  const tasks = f.state.tasks;

  const solo = (p: PersonId, date: string) => {
    const evs = events
      .filter((e) => e.date === date && e.who.includes(p) && !(e.who.includes('maya') && e.who.includes('theo')))
      .map((e) => ({ key: e.id, time: clock(e.start), sort: e.start, text: e.title.replace('June: ', 'June’s '), warn: false }));
    const care = coverageSlots
      .filter((s) => s.date === date && coverage[s.key] === p)
      .map((s) => ({
        key: s.key,
        time: s.label.split(' ')[1]!,
        sort: s.key.endsWith('drop') ? '08:15' : '17:30',
        text: s.label.split(' ')[0]!,
        warn: p === 'maya' && !!AWAY[date],
      }));
    const ts = tasks
      .filter((t) => !t.done && t.owner === p && t.due === date)
      .map((t) => ({ key: t.id, time: '', sort: '99', text: t.title, warn: false }));
    return [...care, ...evs, ...ts].sort((a, b) => a.sort.localeCompare(b.sort));
  };

  return (
    <div className="b-plan">
      {committed ? (
        <div className="b-plan-banner is-done">
          <CircleCheck size={16} strokeWidth={1.75} />
          <span>
            Plan committed. Theo has a copy <span className="b-faint">(simulated)</span>.
          </span>
        </div>
      ) : (
        <div className="b-plan-banner">
          <span className="b-pill">Draft</span>
          <span>Check the week, then commit. Theo gets a copy on his phone.</span>
          <button type="button" className="b-btn is-primary" onClick={() => f.commitPlan()}>
            Commit plan
          </button>
        </div>
      )}

      <div className={cx('b-ptable', committed && 'is-committed')} role="table" aria-label="Week plan">
        <div className="b-prow is-head" role="row">
          <span role="columnheader">Day</span>
          <span role="columnheader">
            <Avatar id="maya" size={16} /> Maya
          </span>
          <span role="columnheader">
            <Avatar id="theo" size={16} /> Theo
          </span>
          <span role="columnheader">
            <Avatar id="june" size={16} /> June
          </span>
          <span role="columnheader">Dinner</span>
        </div>
        {nextWeekDays.map((d) => {
          const together = events.filter((e) => e.date === d.date && e.who.includes('maya') && e.who.includes('theo'));
          const drop = coverageSlots.find((s) => s.key === `${d.date}-drop`);
          const m = meals[d.date];
          const juneLine =
            d.day === 'Thu' ? 'Home · Thanksgiving' : d.day === 'Fri' ? 'Home · daycare closed' : d.day === 'Sat' || d.day === 'Sun' ? 'Home' : null;
          return (
            <div key={d.date} className="b-prow" role="row">
              <span role="cell" className="b-pday">
                <span className="b-pday-name">
                  {d.day} <span className="mono b-faint">{d.label.split(' ')[1]}</span>
                </span>
                {d.note && <span className="b-pday-note">{d.note}</span>}
                {together.map((e) => (
                  <span key={e.id} className="b-pday-note">
                    <span className="mono">{range(e.start, e.end)}</span> {e.title}
                  </span>
                ))}
              </span>
              {(['maya', 'theo'] as PersonId[]).map((p) => {
                const list = solo(p, d.date);
                return (
                  <span key={p} role="cell" className="b-pcell">
                    <span className="b-pcell-label">{people[p].name}</span>
                    {list.length ? (
                      list.map((x) => (
                        <span key={x.key} className={cx('b-pitem', x.warn && 'b-warn')}>
                          <span className="mono b-faint">{x.time}</span>
                          {x.text}
                          {x.warn && <TriangleAlert size={12} strokeWidth={1.75} aria-label="Maya is away" />}
                        </span>
                      ))
                    ) : (
                      <span className="b-faint">–</span>
                    )}
                  </span>
                );
              })}
              <span role="cell" className="b-pcell">
                <span className="b-pcell-label">June</span>
                {drop ? (
                  (['drop', 'pick'] as const).map((slot) => {
                    const who = coverage[`${d.date}-${slot}`];
                    return (
                      <span key={slot} className={cx('b-pitem', !who && 'b-warn')}>
                        <span className="mono b-faint">{slot === 'drop' ? '8:15' : '5:30'}</span>
                        {who ? <Avatar id={who} size={14} /> : <TriangleAlert size={12} strokeWidth={1.75} />}
                        {slot === 'drop' ? 'Drop-off' : 'Pickup'}
                        {!who && ': nobody yet'}
                      </span>
                    );
                  })
                ) : (
                  <span className="b-pitem">{juneLine}</span>
                )}
              </span>
              <span role="cell" className="b-pcell">
                <span className="b-pcell-label">Dinner</span>
                {m ? (
                  <span className="b-pitem">
                    {m.cook ? <Avatar id={m.cook} size={14} /> : <span className="b-mcook-none" />}
                    {m.title}
                  </span>
                ) : (
                  <span className="b-pitem b-warn">Not planned</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="b-plan-cols">
        <section>
          <h3 className="b-h3">Decisions</h3>
          {f.state.decisions.map((d) => {
            const st = decisionState(d);
            return (
              <div key={d.id} className="b-plan-line">
                {st.tone === 'good' ? <Check size={14} strokeWidth={2} className="b-good" /> : <span className="b-dotq" />}
                <span>{st.tone === 'good' ? st.label.replace('Agreed: ', '') : d.question}</span>
                {st.tone !== 'good' && <span className="b-faint mono">{d.dueLabel.replace('Decide by ', 'by ')}</span>}
              </div>
            );
          })}
        </section>
        <section>
          <h3 className="b-h3">Carried over</h3>
          {loose.filter((id) => carry[id] === 'keep').length === 0 && <div className="b-faint">Nothing yet. Sort loose ends first.</div>}
          {loose
            .filter((id) => carry[id] === 'keep')
            .map((id) => {
              const t = tasks.find((x) => x.id === id)!;
              return (
                <div key={id} className="b-plan-line">
                  <OwnerAvatar owner={t.owner} size={14} />
                  <span>{t.title}</span>
                </div>
              );
            })}
        </section>
        <section>
          <h3 className="b-h3">Later or dropped</h3>
          {loose
            .filter((id) => carry[id] === 'later' || carry[id] === 'drop')
            .map((id) => {
              const t = tasks.find((x) => x.id === id)!;
              return (
                <div key={id} className={cx('b-plan-line', carry[id] === 'drop' && 'is-dropped')}>
                  <span className="b-pill">{carry[id] === 'drop' ? 'Dropped' : 'Later'}</span>
                  <span>{t.title}</span>
                </div>
              );
            })}
        </section>
      </div>
    </div>
  );
}

