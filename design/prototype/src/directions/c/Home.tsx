import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { decisions as seedDecisions, mealsThisWeek, NOW, people, suggestions, type FamilyEvent, type PersonId, type Task } from '../../data';
import { useFamily } from '../../store';
import {
  addDays,
  clock,
  clockAP,
  dayNum,
  dayShort,
  eventsOn,
  frac,
  isTogether,
  NOW_MIN,
  toMin,
  whenOf,
  WHEN_LABEL,
  type When,
} from './lib';
import { LoadMeter, TaskRow } from './rows';
import { Timeline } from './Timeline';
import { Avatar, BeadCheck, Either, Simulated, useFlip, useRhythm } from './ui';

const HOME_WINDOW = '2026-11-20';

export function Home() {
  return (
    <div className="c-page c-home">
      <Headline />
      <Timeline />
      <LoadColumns />
      <WeekStrip />
      <Decisions />
    </div>
  );
}

function Headline() {
  const day = eventsOn(NOW.date);
  const next = day.find((e) => e.handoff && toMin(e.start) > NOW_MIN);
  const mins = next ? toMin(next.start) - NOW_MIN : 0;
  const by = next?.handoff?.from === 'daycare' ? next.handoff.to : next?.handoff?.from;
  const pickup = day.find((e) => e.handoff?.from === 'daycare');
  return (
    <header className="c-head">
      <div className="c-head-time" aria-label={`It's ${NOW.time}`}>
        {clock(NOW.time)}
        <span className="c-head-dot">.</span>
      </div>
      <div className="c-head-txt">
        <div className="c-head-date">{NOW.label}</div>
        <h1>
          {next && by ? (
            <>
              <span className="c-ink-p" style={{ '--pc': people[by as PersonId].color } as CSSProperties}>
                {people[by as PersonId].name}
              </span>{' '}
              leaves for drop-off in {mins}&nbsp;minutes.
            </>
          ) : (
            'A quiet stretch.'
          )}
        </h1>
        <p>
          June's home with you both until then. You're home for the plumber 1–3pm, and pickup at{' '}
          {pickup ? clock(pickup.start) : '5:30'} is yours.
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------

const COLS: { id: PersonId | null; title: string; empty: string }[] = [
  { id: 'maya', title: 'On you', empty: 'Nothing on you this week.' },
  { id: 'theo', title: "Theo's handling", empty: 'Theo is clear.' },
  { id: null, title: 'Up for grabs', empty: 'Nothing waiting for a taker.' },
];
const GROUPS: When[] = ['late', 'today', 'week', 'later'];

function LoadColumns() {
  const { state } = useFamily();
  const { openCapture, phone } = useRhythm();
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [seg, setSeg] = useState(0);
  useFlip(ref);

  const open = state.tasks.filter(
    (t) => !t.done && !t.waitingOn && ((t.due && t.due <= HOME_WINDOW) || t.id.startsWith('new-')),
  );
  const doneToday = state.tasks.filter((t) => t.done && t.due === NOW.date);

  // On a phone the columns are swipeable panes: the strip takes the height of the pane in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (!phone) {
      el.style.height = '';
      return;
    }
    const pane = el.children[seg] as HTMLElement | undefined;
    if (pane) el.style.height = `${pane.offsetHeight}px`;
  });

  const jump = (i: number) => {
    setSeg(i);
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section className="c-sec c-load" aria-labelledby="c-load-h" ref={ref}>
      <div className="c-sec-head">
        <h2 id="c-load-h">Who's on what</h2>
        <span className="c-sec-sub">Late, today and the rest of the week</span>
      </div>
      {phone && (
        <div className="c-seg" role="tablist" aria-label="Whose list">
          {COLS.map((c, i) => {
            const n = open.filter((t) => t.owner === c.id).length;
            return (
              <button
                key={c.title}
                type="button"
                role="tab"
                aria-selected={seg === i}
                className={seg === i ? 'on' : ''}
                style={(c.id ? { '--pc': people[c.id].color } : { '--pc': '#15201B' }) as CSSProperties}
                onClick={() => jump(i)}
              >
                <i />
                {c.id === 'maya' ? 'You' : c.id === 'theo' ? 'Theo' : 'Either'} <b>{n}</b>
              </button>
            );
          })}
        </div>
      )}
      <div
        className="c-cols"
        ref={scroller}
        onScroll={(e) => {
          if (!phone) return;
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== seg) setSeg(i);
        }}
      >
        {COLS.map((c) => {
          const mine = open.filter((t) => t.owner === c.id);
          const done = doneToday.filter((t) => (t.doneBy ?? t.owner) === c.id && c.id !== null);
          const color = c.id ? people[c.id].color : '#15201B';
          return (
            <div key={c.title} className="c-col" data-lane={c.id ?? 'shared'} style={(c.id ? { '--pc': color, '--pt': people[c.id].tint } : { '--pc': color, '--pt': '#EFEFEA' }) as CSSProperties}>
              <div className="c-col-head">
                {c.id ? <Avatar id={c.id} size={30} /> : <Either size={30} />}
                <div className="c-col-title">
                  <h3>{c.title}</h3>
                  <LoadMeter tasks={mine} color={color} />
                </div>
                <span className="c-col-n">{mine.length}</span>
              </div>
              <ul className="c-rows">
                {GROUPS.map((g) => {
                  const rows = mine.filter((t) => whenOf(t) === g);
                  if (!rows.length) return null;
                  return [
                    <li key={`h-${g}`} className={`c-grp ${g}`} data-flip={`h-${c.title}-${g}`}>
                      {g === 'later' ? 'No day yet' : WHEN_LABEL[g]}
                    </li>,
                    ...rows.map((t) => <TaskRow key={t.id} task={t} compact />),
                  ];
                })}
                {!mine.length && <li className="c-empty">{c.empty}</li>}
              </ul>
              {done.length > 0 && <DoneStrip tasks={done} />}
              <button type="button" className="c-col-add" onClick={() => openCapture(c.id)}>
                <Plus size={16} strokeWidth={2.2} />
                {c.id === 'theo' ? 'Ask Theo' : c.id === null ? 'Add for either of you' : 'Add for you'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DoneStrip({ tasks }: { tasks: Task[] }) {
  return (
    <div className="c-done" aria-label="Done today">
      <span className="c-done-l">Done today</span>
      <ul>
        {tasks.map((t) => (
          <li key={t.id} data-flip={`d-${t.id}`}>
            <BeadCheck task={t} />
            <span>{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The rest of the week, as a strip of tiny rhythms.

const WEEK = Array.from({ length: 7 }, (_, i) => addDays('2026-11-16', i));

interface MiniBlock {
  s: number;
  e: number;
  who: PersonId;
  kind: 'ev' | 'care' | 'conflict';
  title: string;
}

function weekDay(date: string, swapped: boolean) {
  const evs = eventsOn(date).map((e): FamilyEvent => {
    if (swapped && e.id === 'e14') return { ...e, who: ['theo', 'june'], handoff: { from: 'daycare', to: 'theo' } };
    return e;
  });
  const lanes: Record<'maya' | 'theo' | 'june', MiniBlock[]> = { maya: [], theo: [], june: [] };
  let conflict: { s: number; e: number; who: PersonId; with: string } | null = null;
  const drop = evs.find((e) => e.handoff?.to === 'daycare');
  const pick = evs.find((e) => e.handoff?.from === 'daycare');
  if (drop || pick) {
    lanes.june.push({ s: drop ? toMin(drop.end) : 8 * 60 + 35, e: pick ? toMin(pick.start) : 17 * 60 + 30, who: 'june', kind: 'care', title: 'Little Oaks' });
  }
  for (const e of evs) {
    if (isTogether(e)) continue;
    for (const p of ['maya', 'theo'] as const) {
      if (!e.who.includes(p)) continue;
      const care = !!e.handoff;
      lanes[p].push({ s: toMin(e.start), e: toMin(e.end), who: p, kind: care ? 'care' : 'ev', title: e.title });
      if (care) lanes.june.push({ s: toMin(e.start), e: toMin(e.end), who: p, kind: 'care', title: e.title });
    }
  }
  for (const e of evs.filter((x) => x.handoff && x.handoff.to !== 'daycare')) {
    const p = e.handoff!.to as PersonId;
    const clash = evs.find((o) => o.id !== e.id && o.who.includes(p) && !o.handoff && toMin(o.start) < toMin(e.end) && toMin(o.end) > toMin(e.start));
    if (clash) conflict = { s: Math.max(toMin(e.start), toMin(clash.start)), e: Math.min(toMin(clash.end), 18 * 60), who: p, with: clash.title };
  }
  if (conflict) lanes[conflict.who as 'maya'].push({ s: conflict.s, e: conflict.e, who: conflict.who, kind: 'conflict', title: 'Conflict' });
  const notes = evs.filter((e) => !e.handoff && !isTogether(e) && e.kind !== 'childcare').slice(0, 2);
  const handoffs = evs.filter((e) => e.handoff);
  return { lanes, conflict, notes, handoffs };
}

function WeekStrip() {
  const { suggestion, suggestionStatus } = useFamily();
  const { go } = useRhythm();
  const s1 = suggestions.find((s) => s.id === 's1')!;
  const status = suggestionStatus('s1');
  const swapped = status === 'approved';

  return (
    <section className="c-sec c-wk" aria-labelledby="c-wk-h">
      <div className="c-sec-head">
        <h2 id="c-wk-h">The rest of the week</h2>
        <span className="c-sec-sub">Nov 16–22</span>
        <button type="button" className="c-link" onClick={() => go('reset')}>
          Plan next week <ArrowRight size={16} strokeWidth={2.2} />
        </button>
      </div>
      <div className="c-wk-grid">
        {WEEK.map((d) => {
          const info = weekDay(d, swapped);
          const meal = mealsThisWeek.find((m) => m.date === d);
          const today = d === NOW.date;
          const past = d < NOW.date;
          return [
            <div key={d} className={`c-wk-day ${today ? 'today' : ''} ${past ? 'past' : ''} ${info.conflict ? 'clash' : ''}`}>
              <div className="c-wk-dh">
                <span className="c-wk-name">{today ? 'Today' : dayShort(d)}</span>
                <span className="c-wk-num">{dayNum(d)}</span>
              </div>
              <div className="c-wk-lanes" aria-hidden="true">
                {(['maya', 'june', 'theo'] as const).map((l) => (
                  <div key={l} className="c-wk-lane" data-lane={l}>
                    {info.lanes[l].map((b, i) => (
                      <i
                        key={i}
                        className={b.kind}
                        style={{ left: `${frac(b.s) * 100}%`, width: `${Math.max(0.012, frac(b.e) - frac(b.s)) * 100}%`, '--pc': people[b.who].color, '--pt': people[b.who].tint } as CSSProperties}
                      />
                    ))}
                    {today && <b className="c-wk-now" style={{ left: `${frac(NOW_MIN) * 100}%` }} />}
                  </div>
                ))}
              </div>
              <ul className="c-wk-notes">
                {info.handoffs.length > 0 && (
                  <li className="c-wk-care">
                    {info.handoffs.map((h) => {
                      const p = (h.handoff!.to === 'daycare' ? h.handoff!.from : h.handoff!.to) as PersonId;
                      const clash = info.conflict && h.handoff!.to === info.conflict.who;
                      return (
                        <span key={h.id} className={clash ? 'clash' : ''} style={{ '--pc': people[p].color } as CSSProperties}>
                          <i />
                          {h.handoff!.to === 'daycare' ? 'Drop' : 'Pick'} {clock(h.start)}
                        </span>
                      );
                    })}
                  </li>
                )}
                {info.notes.map((n) => (
                  <li key={n.id}>
                    <span className="c-wk-t">{clockAP(n.start)}</span> {n.title.replace(' (runs late)', '')}
                  </li>
                ))}
                {meal && (
                  <li className="c-wk-meal">
                    {meal.cook && <i style={{ background: people[meal.cook].color }} />}
                    <span>{meal.title}</span>
                  </li>
                )}
              </ul>
            </div>,
            d === '2026-11-19' && status !== 'dismissed' ? (
              <div key="sugg" className={`c-wk-sugg ${swapped ? 'ok' : ''}`}>
                <div className="c-sugg-top">
                  <Simulated />
                  <span className="c-sugg-k">A thought about Thursday</span>
                </div>
                {swapped ? (
                  <p className="c-sugg-title">
                    <Check size={16} strokeWidth={2.6} /> Theo has Thursday pickup. Asked him for you.
                  </p>
                ) : (
                  <>
                    <p className="c-sugg-title">{s1.title}</p>
                    <p className="c-sugg-d">{s1.detail}</p>
                    <div className="c-sugg-act">
                      <button type="button" className="c-btn ink" onClick={() => suggestion('s1', 'approved')}>
                        {s1.action}
                      </button>
                      <button type="button" className="c-btn ghost" onClick={() => suggestion('s1', 'dismissed')}>
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null,
          ];
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function Decisions() {
  const { state, vote } = useFamily();
  return (
    <section className="c-sec c-dec" aria-labelledby="c-dec-h">
      <div className="c-sec-head">
        <h2 id="c-dec-h">Needs both of you</h2>
        <span className="c-sec-sub">{state.decisions.length} decisions</span>
      </div>
      <div className="c-dec-grid">
        {state.decisions.map((d) => (
          <DecisionCard key={d.id} d={d} onVote={(o, p) => vote(d.id, o, p)} />
        ))}
      </div>
    </section>
  );
}

export function DecisionCard({
  d,
  onVote,
  both,
}: {
  d: (typeof seedDecisions)[number];
  onVote: (option: string | undefined, person: PersonId) => void;
  both?: boolean;
}) {
  const agreed = d.votes.maya && d.votes.maya === d.votes.theo ? d.options.find((o) => o.id === d.votes.maya) : undefined;
  return (
    <article className={`c-decision ${agreed ? 'agreed' : ''}`}>
      <div className="c-dec-due">{agreed ? 'Decided together' : d.dueLabel}</div>
      <h3>{d.question}</h3>
      <p>{d.context}</p>
      <div className="c-opts">
        {d.options.map((o) => {
          const mine = d.votes.maya === o.id;
          const theirs = d.votes.theo === o.id;
          return (
            <div key={o.id} className={`c-opt ${mine ? 'mine' : ''} ${agreed?.id === o.id ? 'win' : ''}`}>
              <button
                type="button"
                className="c-opt-main"
                aria-pressed={mine}
                onClick={() => onVote(mine ? undefined : o.id, 'maya')}
              >
                <span className="c-opt-l">{o.label}</span>
                <span className="c-opt-d">{o.detail}</span>
              </button>
              <span className="c-opt-votes">
                {mine && <Avatar id="maya" size={20} />}
                {both ? (
                  <button
                    type="button"
                    className={`c-opt-theo ${theirs ? 'on' : ''}`}
                    aria-pressed={theirs}
                    aria-label={`Theo's vote: ${o.label}`}
                    onClick={() => onVote(theirs ? undefined : o.id, 'theo')}
                  >
                    <Avatar id="theo" size={20} />
                  </button>
                ) : (
                  theirs && <Avatar id="theo" size={20} />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
