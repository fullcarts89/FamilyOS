// Home · Today: signals, a compact day timeline, You · Theo · Either columns, decisions, and a
// "This week" tab grouped by day.
import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Clock, Plus, Scale, TriangleAlert, Users, Wrench } from 'lucide-react';
import { people, type FamilyEvent, type PersonId, type Routine, type Task } from '../../data';
import { isOverdue, useFamily } from '../../store';
import { useB } from './ctx';
import { decisionState, DecisionRow } from './decisions';
import { PageHeader } from './header';
import { AgentProposal, UpNext } from './inspector';
import { Avatar, AvatarStack, Kbd, OwnerAvatar, TaskRow } from './ui';
import { addDays, clock, cx, dayNum, eventsOn, leadOf, monthDay, NOW_MIN, range, restOfWeek, TODAY, toMin, weekday } from './util';

const SOON = addDays(TODAY, 2);

export function Home() {
  const [tab, setTab] = useState<'today' | 'week'>('today');
  const [flashDay, setFlashDay] = useState<string | null>(null);
  const b = useB();
  return (
    <>
      <PageHeader
        crumbs={['Home']}
        tabs={[
          { id: 'today', label: 'Today' },
          { id: 'week', label: 'This week' },
        ]}
        tab={tab}
        onTab={(t) => setTab(t as 'today' | 'week')}
        right={
          <>
            <span className="mono b-faint b-hide-phone">Tue Nov 17 · 7:42</span>
            <button type="button" className="b-btn is-sm b-hide-phone" onClick={() => b.openCapture()}>
              <Plus size={14} strokeWidth={1.5} /> Add <Kbd>C</Kbd>
            </button>
          </>
        }
      />
      <div className="b-scroll">
        {tab === 'today' ? (
          <Today
            toWeek={(d) => {
              setTab('week');
              setFlashDay(d);
            }}
          />
        ) : (
          <WeekList flashDay={flashDay} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function Today({ toWeek }: { toWeek: (day: string) => void }) {
  const f = useFamily();
  const b = useB();
  const [lateOnly, setLateOnly] = useState(false);
  const [col, setCol] = useState<'maya' | 'theo' | 'shared'>('maya');
  const decRef = useRef<HTMLElement>(null);

  const open = f.state.tasks.filter((t) => !t.waitingOn && t.due && t.due <= SOON && (!t.done || b.activity[t.id]));
  const late = f.state.tasks.filter((t) => isOverdue(t) && !t.waitingOn);
  const pendingDecisions = f.state.decisions.filter((d) => !d.votes.maya);
  const sitter = f.state.tasks.find((t) => t.id === 't8');

  const signals = (
    <div className="b-signals" role="toolbar" aria-label="Signals">
      <button type="button" className="b-signal is-warn" onClick={() => toWeek('2026-11-19')}>
        <TriangleAlert size={14} strokeWidth={1.5} />
        <span className="mono">1</span> conflict Thu
      </button>
      <button
        type="button"
        className={cx('b-signal is-late', lateOnly && 'is-on')}
        aria-pressed={lateOnly}
        onClick={() => setLateOnly(!lateOnly)}
      >
        <Clock size={14} strokeWidth={1.5} />
        <span className="mono">{late.length}</span> late
      </button>
      <button
        type="button"
        className="b-signal"
        onClick={() => decRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        <Scale size={14} strokeWidth={1.5} />
        <span className="mono">{pendingDecisions.length}</span> decisions
      </button>
      <button type="button" className="b-signal" onClick={() => b.select({ kind: 'event', id: 'e5' })}>
        <Wrench size={14} strokeWidth={1.5} />
        Plumber <span className="mono">1–3</span> today
      </button>
      {sitter && !sitter.done && (
        <button type="button" className="b-signal" onClick={() => b.select({ kind: 'task', id: 't8' })}>
          <Users size={14} strokeWidth={1.5} />
          Sitter needed Fri
        </button>
      )}
    </div>
  );

  const byOwner = (o: PersonId | null) => {
    const list = (lateOnly ? late : open).filter((t) => t.owner === o);
    const sort = (a: Task, b2: Task) => (a.due ?? '').localeCompare(b2.due ?? '') || (a.priority ? -1 : 1);
    return {
      now: list.filter((t) => (t.due ?? '') <= TODAY).sort(sort),
      soon: list.filter((t) => (t.due ?? '') > TODAY).sort(sort),
    };
  };
  const routinesFor = (o: PersonId | null) =>
    lateOnly ? [] : f.state.routines.filter((r) => r.nextDue <= TODAY && r.rotation[r.turn] === o);

  const cols: { key: 'maya' | 'theo' | 'shared'; owner: PersonId | null; label: string }[] = [
    { key: 'maya', owner: 'maya', label: 'You' },
    { key: 'theo', owner: 'theo', label: 'Theo' },
    { key: 'shared', owner: null, label: 'Either' },
  ];
  const data = cols.map((c) => ({ ...c, ...byOwner(c.owner), routines: routinesFor(c.owner) }));

  return (
    <div className="b-home">
      {signals}
      <div className="b-home-grid">
        <section className="b-tl-wrap" aria-label="Today's schedule">
          <h2 className="b-sechead">
            Schedule <span className="mono b-faint">{eventsOn(TODAY).length}</span>
          </h2>
          <DayTimeline />
        </section>
        <section className="b-cols-wrap" aria-label="Today's to-dos">
          <div className="b-seg b-show-phone" role="tablist" aria-label="Whose list">
            {data.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={col === c.key}
                className={cx('b-seg-btn', col === c.key && 'is-on')}
                onClick={() => setCol(c.key)}
              >
                <OwnerAvatar owner={c.owner} size={16} />
                {c.label}
                <span className="mono b-faint">{c.now.filter((t) => !t.done).length + c.soon.filter((t) => !t.done).length + c.routines.length}</span>
              </button>
            ))}
          </div>
          <div className="b-cols">
            {data.map((c) => (
              <div key={c.key} className={cx('b-col', col === c.key && 'is-active')} role="listbox" aria-label={c.label}>
                <div className="b-col-head">
                  <OwnerAvatar owner={c.owner} size={18} />
                  <span className="b-col-name">{c.label}</span>
                  <span className="mono b-faint">{c.now.filter((t) => !t.done).length + c.routines.length}</span>
                  <button
                    type="button"
                    className="b-icon-btn is-xs"
                    aria-label={`Add for ${c.label}`}
                    onClick={() => b.openCapture(c.owner === 'theo' ? '@theo ' : c.owner === null ? '@us ' : '')}
                  >
                    <Plus size={14} strokeWidth={1.5} />
                  </button>
                </div>
                {c.now.length + c.routines.length === 0 && (
                  <div className="b-col-empty">{lateOnly ? 'Nothing late' : 'Nothing due today'}</div>
                )}
                {c.now.map((t) => (
                  <TaskRow key={t.id} task={t} dense showOwner={false} take={c.owner === null} />
                ))}
                {c.routines.map((r) => (
                  <RoutineMini key={r.id} r={r} />
                ))}
                {c.soon.length > 0 && (
                  <>
                    <div className="b-col-sub">Next two days</div>
                    {c.soon.map((t) => (
                      <TaskRow key={t.id} task={t} dense showOwner={false} take={c.owner === null} />
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="b-hintbar b-hide-phone">
            <span><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
            <span><Kbd>X</Kbd> complete</span>
            <span><Kbd>A</Kbd> assign</span>
            <span><Kbd>C</Kbd> add</span>
          </div>
          <section className="b-home-sec" ref={decRef} aria-label="Decisions">
            <h2 className="b-sechead">
              Needs both of you <span className="mono b-faint">{f.state.decisions.filter((d) => decisionState(d).tone !== 'good').length}</span>
            </h2>
            <div className="b-declist">
              {f.state.decisions.map((d) => (
                <DecisionRow key={d.id} d={d} />
              ))}
            </div>
          </section>
        </section>
      </div>

      <div className="b-home-aside">
        <section>
          <h2 className="b-sechead">Up next</h2>
          <UpNext />
        </section>
        <AgentProposal id="s1" />
      </div>

    </div>
  );
}

function RoutineMini({ r }: { r: Routine }) {
  const f = useFamily();
  const next = r.rotation[(r.turn + 1) % r.rotation.length]!;
  return (
    <div className="b-row is-dense is-routine">
      <span className="b-status is-routine" aria-hidden="true">
        <Avatar id={r.rotation[r.turn]!} size={14} />
      </span>
      <span className="b-row-body">
        <span className="b-row-text">{r.title}</span>
        <span className="b-row-sub" title={`Then ${next === 'maya' ? 'you' : people[next].name}`}>
          <span className="mono">{r.nextLabel}</span>
          <span className="b-row-next">
            then <Avatar id={next} size={14} />
          </span>
        </span>
      </span>
      <button type="button" className="b-take" onClick={() => f.routineDone(r.id)}>
        Done
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Day timeline 7:00–21:00

const START = 7 * 60;
const END = 21 * 60;
const PX = 40; // per hour

function DayTimeline() {
  const b = useB();
  const evs = eventsOn(TODAY);
  const y = (m: number) => ((m - START) / 60) * PX;
  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => 7 + i);
  return (
    <div className="b-tl" style={{ height: y(END) + 8 }}>
      {hours.map((h) => (
        <div key={h} className="b-tl-hour" style={{ top: y(h * 60) }}>
          {Math.abs(h * 60 - NOW_MIN) > 25 && (
            <span>
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? 'am' : 'pm'}
            </span>
          )}
        </div>
      ))}
      <div className="b-tl-past" style={{ height: y(NOW_MIN) }} aria-hidden="true" />
      {evs.map((e) => (
        <TimelineBlock key={e.id} e={e} top={y(toMin(e.start))} h={y(toMin(e.end)) - y(toMin(e.start))} selected={b.sel?.id === e.id} />
      ))}
      <div className="b-tl-now" style={{ top: y(NOW_MIN) }}>
        <span className="clock">7:42</span>
      </div>
    </div>
  );
}

function TimelineBlock({ e, top, h, selected }: { e: FamilyEvent; top: number; h: number; selected: boolean }) {
  const b = useB();
  const lead = leadOf(e);
  const p = lead ? people[lead] : null;
  const past = toMin(e.end) <= NOW_MIN;
  const tall = h >= 36;
  return (
    <button
      type="button"
      className={cx('b-tl-ev', past && 'is-past', selected && 'is-sel', !p && 'is-all', tall && 'is-tall')}
      style={{
        top: top + 1,
        height: Math.max(19, h - 2),
        ['--c' as string]: p?.color ?? '#A1A1AA',
        ['--t' as string]: p?.tint ?? '#F4F4F5',
      }}
      onClick={() => b.select({ kind: 'event', id: e.id })}
      aria-label={`${e.title}, ${range(e.start, e.end)}`}
    >
      <span className="b-tl-line">
        <span className="clock b-tl-time">{clock(e.start)}</span>
        <span className="b-tl-title">{e.title}</span>
        {e.handoff && <ArrowRightLeft size={12} strokeWidth={1.75} className="b-tl-hand" aria-label="June handoff" />}
        {!p && <AvatarStack ids={e.who.filter((w) => w !== 'june')} size={14} />}
      </span>
      {tall && (
        <span className="b-tl-sub">
          {e.handoff
            ? `${e.handoff.from === 'daycare' ? 'Little Oaks' : people[e.handoff.from].name} → ${e.handoff.to === 'daycare' ? 'Little Oaks' : people[e.handoff.to].name}`
            : (e.location ?? range(e.start, e.end))}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// This week, grouped by day

function WeekList({ flashDay }: { flashDay: string | null }) {
  const f = useFamily();
  const b = useB();
  const refs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (flashDay) refs.current[flashDay]?.scrollIntoView({ block: 'start' });
  }, [flashDay]);
  return (
    <div className="b-week">
      {restOfWeek.map((d) => {
        const evs = eventsOn(d);
        const ts = f.state.tasks.filter((t) => t.due === d && !t.waitingOn);
        const conflict = d === '2026-11-19';
        return (
          <section
            key={d}
            ref={(el) => {
              refs.current[d] = el;
            }}
            className={cx('b-wday', flashDay === d && 'is-flash')}
            aria-label={`${weekday(d, 'long')} ${monthDay(d)}`}
          >
            <header className="b-wday-head">
              <span className="b-wday-num mono">{dayNum(d)}</span>
              <span className="b-wday-name">{d === TODAY ? 'Today' : weekday(d, 'long')}</span>
              <span className="mono b-faint">{monthDay(d)}</span>
              {conflict && (
                <span className="b-pill is-warn">
                  <TriangleAlert size={12} strokeWidth={1.75} /> Pickup conflict
                </span>
              )}
              <span className="b-wday-count mono b-faint">
                {evs.length} {evs.length === 1 ? 'event' : 'events'} · {ts.filter((t) => !t.done).length}{' '}
                {ts.filter((t) => !t.done).length === 1 ? 'to-do' : 'to-dos'}
              </span>
            </header>
            {evs.map((e) => {
              const lead = leadOf(e);
              const isConflict = conflict && (e.id === 'e14' || e.id === 'e13');
              return (
                <button
                  key={e.id}
                  type="button"
                  className={cx('b-wrow', isConflict && 'is-conflict', b.sel?.id === e.id && 'is-sel', d === TODAY && toMin(e.end) <= NOW_MIN && 'is-past')}
                  onClick={() => b.select({ kind: 'event', id: e.id })}
                >
                  <span className="clock b-wrow-time">{range(e.start, e.end)}</span>
                  <span className="b-evbar" style={{ background: lead ? people[lead].color : '#A1A1AA' }} />
                  <span className="b-wrow-title">{e.title}</span>
                  {e.handoff && (
                    <span className="b-wrow-hand">
                      <ArrowRightLeft size={12} strokeWidth={1.75} /> June
                    </span>
                  )}
                  {isConflict && e.id === 'e14' && <span className="b-wrow-note">Maya is in planning until 6</span>}
                  <span className="b-wrow-avs">
                    <AvatarStack ids={e.who.filter((w) => w !== 'june')} size={18} />
                  </span>
                </button>
              );
            })}
            {conflict && (
              <div className="b-wday-agent">
                <AgentProposal id="s1" compact />
              </div>
            )}
            {ts.length > 0 && (
              <div className="b-wday-tasks" role="listbox" aria-label="To-dos">
                {ts.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div className="b-week-foot mono b-faint">
        Next: Weekly Reset Sun 7:30 · <Avatar id="maya" size={14} /> <Avatar id="theo" size={14} />
      </div>
    </div>
  );
}
