import { useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Flag, Plus } from 'lucide-react';
import { NOW, people, projects, suggestions, type PersonId, type Routine, type Task } from '../../data';
import { useFamily } from '../../store';
import { whenOf, WHEN_LABEL, type When } from './lib';
import { LoadMeter, TaskRow } from './rows';
import { Avatar, Either, Simulated, useFlip, useRhythm } from './ui';

const COLS: { id: PersonId | null; name: string; sub: string }[] = [
  { id: 'maya', name: 'You', sub: 'Maya' },
  { id: 'theo', name: 'Theo', sub: 'Theo' },
  { id: null, name: 'Shared', sub: 'Either of you' },
];
const GROUPS: When[] = ['late', 'today', 'week', 'later'];

export function Tasks() {
  return (
    <div className="c-page c-tasks">
      <header className="c-pagehead">
        <h1>Who’s carrying what</h1>
        <p>Everything open in the household, by who has it. Tap a face to hand something over.</p>
      </header>
      <Columns />
      <Projects />
      <Routines />
    </div>
  );
}

function Columns() {
  const { state, suggestion, suggestionStatus } = useFamily();
  const { phone, openCapture } = useRhythm();
  const [seg, setSeg] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref);
  const open = state.tasks.filter((t) => !t.done && !t.projectId);
  const s2 = suggestions.find((s) => s.id === 's2')!;
  const s2status = suggestionStatus('s2');
  const total = open.length;

  return (
    <section className="c-sec c-carry" ref={ref} aria-label="Open things by person">
      {phone && (
        <div className="c-seg" role="tablist" aria-label="Whose list">
          {COLS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="tab"
              aria-selected={seg === i}
              className={seg === i ? 'on' : ''}
              style={(c.id ? { '--pc': people[c.id].color } : { '--pc': '#15201B' }) as CSSProperties}
              onClick={() => setSeg(i)}
            >
              <i />
              {c.name} <b>{open.filter((t) => t.owner === c.id).length}</b>
            </button>
          ))}
        </div>
      )}
      <div className="c-carry-cols">
        {COLS.map((c, i) => {
          if (phone && i !== seg) return null;
          const mine = open.filter((t) => t.owner === c.id);
          const active = mine.filter((t) => !t.waitingOn);
          const waiting = mine.filter((t) => t.waitingOn);
          const color = c.id ? people[c.id].color : '#15201B';
          const late = active.filter((t) => whenOf(t) === 'late').length;
          const share = total ? mine.length / total : 0;
          return (
            <div key={c.name} className="c-carry-col" data-lane={c.id ?? 'shared'} style={(c.id ? { '--pc': color, '--pt': people[c.id].tint } : { '--pc': color, '--pt': '#EFEFEA' }) as CSSProperties}>
              <div className="c-carry-head">
                <div className="c-carry-who">
                  {c.id ? <Avatar id={c.id} size={36} /> : <Either size={36} />}
                  <div>
                    <h2>{c.name}</h2>
                    <span>
                      {late > 0 ? `${late} late · ` : ''}
                      {Math.round(share * 100)}% of what's open
                    </span>
                  </div>
                  <span className="c-carry-n">{mine.length}</span>
                </div>
                <LoadMeter tasks={mine} color={color} />
              </div>
              <ul className="c-rows">
                {GROUPS.map((g) => {
                  const rows = active.filter((t) => whenOf(t) === g);
                  if (!rows.length) return null;
                  return [
                    <li key={`h-${g}`} className={`c-grp ${g}`} data-flip={`th-${c.name}-${g}`}>
                      {WHEN_LABEL[g]} <em>{rows.length}</em>
                    </li>,
                    ...rows.flatMap((t) => [
                      <TaskRow key={t.id} task={t} />,
                      t.id === 't2' && t.owner === 'theo' && s2status !== 'dismissed' ? (
                        <li key="s2" className="c-inline-sugg" data-flip="s2">
                          <Simulated />
                          {s2status === 'approved' ? (
                            <span>Renewal prepared for Theo to review and pay.</span>
                          ) : (
                            <>
                              <span>{s2.detail}</span>
                              <span className="c-inline-act">
                                <button type="button" className="c-btn ink sm" onClick={() => suggestion('s2', 'approved')}>
                                  {s2.action}
                                </button>
                                <button type="button" className="c-btn ghost sm" onClick={() => suggestion('s2', 'dismissed')}>
                                  Not now
                                </button>
                              </span>
                            </>
                          )}
                        </li>
                      ) : null,
                    ]),
                  ];
                })}
                {waiting.length > 0 && [
                  <li key="h-wait" className="c-grp" data-flip={`th-${c.name}-wait`}>
                    Waiting on someone else <em>{waiting.length}</em>
                  </li>,
                  ...waiting.map((t) => <WaitingRow key={t.id} t={t} />),
                ]}
              </ul>
              <button type="button" className="c-col-add" onClick={() => openCapture(c.id)}>
                <Plus size={16} strokeWidth={2.2} /> Add
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WaitingRow({ t }: { t: Task }) {
  return (
    <li className="c-row waiting" data-flip={t.id}>
      <span className="c-wait-dot" aria-hidden="true" />
      <div className="c-row-main">
        <span className="c-row-title">{t.title}</span>
        <span className="c-row-meta">
          <span>{t.waitingOn}</span>
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------

const SCALE_START = '2026-11-10';
const SCALE_END = '2026-12-21';
const span = Date.parse(SCALE_END) - Date.parse(SCALE_START);
const pos = (iso: string) => ((Date.parse(iso) - Date.parse(SCALE_START)) / span) * 100;
const TICKS = ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'];
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Projects() {
  const { state } = useFamily();
  return (
    <section className="c-sec c-proj" aria-labelledby="c-proj-h">
      <div className="c-sec-head">
        <h2 id="c-proj-h">Projects</h2>
        <span className="c-sec-sub">Tracks to their target dates</span>
      </div>
      <div className="c-proj-scale" aria-hidden="true">
        <span className="c-proj-scale-pad" />
        <div className="c-proj-ticks">
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${pos(t)}%` }}>
              {fmtDay(t)}
            </span>
          ))}
          <b style={{ left: `${pos(NOW.date)}%` }}>Today</b>
        </div>
      </div>
      {projects.map((p) => (
        <ProjectTrack key={p.id} id={p.id} tasks={state.tasks.filter((t) => t.projectId === p.id)} />
      ))}
    </section>
  );
}

function ProjectTrack({ id, tasks }: { id: string; tasks: Task[] }) {
  const p = projects.find((x) => x.id === id)!;
  const { complete } = useRhythm();
  const [open, setOpen] = useState(false);
  const done = tasks.filter((t) => t.done).length;
  const dated = tasks.filter((t) => t.due).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const undatedDone = tasks.filter((t) => !t.due && t.done);
  const undatedOpen = tasks.filter((t) => !t.due && !t.done);
  const daysLeft = Math.round((Date.parse(p.target!) - Date.parse(NOW.date)) / 86400000);

  const bead = (t: Task, style?: CSSProperties) => (
    <button
      key={t.id}
      type="button"
      className={`c-pbead ${t.done ? 'f' : ''} ${whenOf(t) === 'late' && !t.done ? 'late' : ''}`}
      style={{ ...style, '--pc': t.owner ? people[t.owner].color : '#15201B' } as CSSProperties}
      aria-label={`${t.done ? 'Reopen' : 'Complete'} ${t.title}`}
      title={`${t.title}${t.owner ? ` · ${people[t.owner].name}` : ' · either of you'}`}
      onClick={() => complete(t)}
    />
  );

  return (
    <div className="c-ptrack">
      <div className="c-pinfo">
        <h3>{p.title}</h3>
        <p>
          <b>
            {done} of {tasks.length}
          </b>{' '}
          steps · {daysLeft} days to {fmtDay(p.target!)}
          {p.budget ? ` · ${p.budget}` : ''}
        </p>
        <button type="button" className="c-link sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide steps' : 'Show steps'} <ChevronDown size={14} strokeWidth={2.4} className={open ? 'flip' : ''} />
        </button>
      </div>
      <div className="c-pline-wrap">
        <div className="c-pdone" aria-label="Done, no date">
          {undatedDone.map((t) => bead(t))}
        </div>
        <div className="c-pline">
          <i className="c-pline-rail" style={{ left: `${pos(NOW.date)}%`, width: `${pos(p.target!) - pos(NOW.date)}%` }} />
          <i className="c-pline-past" style={{ width: `${pos(NOW.date)}%` }} />
          <i className="c-pline-today" style={{ left: `${pos(NOW.date)}%` }} />
          {dated.map((t) => bead(t, { left: `${pos(t.due!)}%` }))}
          <span className="c-pflag" style={{ left: `${pos(p.target!)}%` }}>
            <Flag size={14} strokeWidth={2.2} />
            {fmtDay(p.target!)}
          </span>
        </div>
        <div className="c-pnodate" aria-label="No date yet">
          {undatedOpen.map((t) => bead(t))}
          {undatedOpen.length > 0 && <span>no date</span>}
        </div>
      </div>
      {open && (
        <ul className="c-rows c-psteps">
          {tasks.map((t) => (t.done ? <DoneStep key={t.id} t={t} /> : <TaskRow key={t.id} task={t} />))}
        </ul>
      )}
    </div>
  );
}

function DoneStep({ t }: { t: Task }) {
  const { complete } = useRhythm();
  return (
    <li className="c-row is-done" style={{ '--pc': t.doneBy ? people[t.doneBy].color : '#15201B' } as CSSProperties}>
      <button type="button" className="c-beadcheck done" aria-label={`Reopen ${t.title}`} onClick={() => complete(t)}>
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="c-row-main">
        <span className="c-row-title">{t.title}</span>
        <span className="c-row-meta">
          <span>Done{t.doneBy ? ` by ${t.doneBy === 'maya' ? 'you' : people[t.doneBy].name}` : ''}</span>
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------

function Routines() {
  const { state } = useFamily();
  return (
    <section className="c-sec c-rout" aria-labelledby="c-rout-h">
      <div className="c-sec-head">
        <h2 id="c-rout-h">Routines</h2>
        <span className="c-sec-sub">Whose turn is next</span>
      </div>
      <div className="c-rings">
        {state.routines.map((r) => (
          <RoutineRing key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}

function RoutineRing({ r }: { r: Routine }) {
  const { routineDone, routineSwap } = useFamily();
  const n = r.rotation.length;
  const who = r.rotation[r.turn] ?? r.rotation[0]!;
  const R = 30;
  const C = 2 * Math.PI * R;
  const gap = n > 1 ? 7 : 0;
  const seg = C / n - gap;
  const segDeg = ((seg - (n > 1 ? 4 : 0)) / C) * 360;
  const next = r.rotation[(r.turn + 1) % n]!;
  const doneToday = r.history[0]?.date === NOW.date;
  return (
    <div className="c-ring" style={{ '--pc': people[who].color, '--pt': people[who].tint } as CSSProperties} data-lane={who}>
      <div className="c-ring-art">
        <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
          <g className="c-ring-rot" style={{ transform: `rotate(${n > 1 ? -90 - (r.turn * 360) / n - segDeg / 2 : -90}deg)` }}>
            {r.rotation.map((p, i) => (
              <circle
                key={i}
                cx="38"
                cy="38"
                r={R}
                fill="none"
                stroke={people[p].color}
                strokeOpacity={i === r.turn ? 1 : 0.28}
                strokeWidth={i === r.turn ? 7 : 4}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.1, seg - (n > 1 ? 4 : 0))} ${C}`}
                strokeDashoffset={-(i * C) / n}
              />
            ))}
          </g>
        </svg>
        <Avatar id={who} size={36} className="c-ring-av" />
      </div>
      <div className="c-ring-txt">
        <h3>{r.title}</h3>
        <p className="c-ring-next">
          <b>{who === 'maya' ? 'Your turn' : `${people[who].name}'s turn`}</b> · {r.nextLabel}
        </p>
        <p className="c-ring-cad">{n > 1 ? `Then ${next === 'maya' ? 'you' : people[next].name} · ${r.cadence.split(' · ')[0]}` : r.cadence}</p>
        <div className="c-ring-hist" aria-label="Recent turns">
          {r.history.slice(0, 4).map((h, i) => (
            <i key={i} className={h.done ? 'f' : 'miss'} style={{ '--pc': people[h.who].color } as CSSProperties} title={`${people[h.who].name} · ${fmtDay(h.date)}${h.done ? '' : ' · missed'}`} />
          ))}
          {doneToday && <span>done today</span>}
        </div>
        <div className="c-ring-act">
          <button type="button" className="c-btn sm ink" onClick={() => routineDone(r.id)}>
            Done
          </button>
          <button type="button" className="c-btn sm ghost" disabled={n < 2} onClick={() => routineSwap(r.id)} title={n < 2 ? 'Only one person on this routine' : 'Swap turns'}>
            Swap
          </button>
        </div>
      </div>
    </div>
  );
}

