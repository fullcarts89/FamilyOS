import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Plane, Users } from 'lucide-react';
import { lastWeek, mealIdeas, nextWeekDays, people, suggestions, type PersonId } from '../../data';
import { coverageSlots, useFamily } from '../../store';
import { DecisionCard } from './Home';
import { clock, eventsOn, range } from './lib';
import { Avatar, Either, Simulated, useRhythm } from './ui';

type Row = 'maya' | 'theo' | 'june' | 'dinner' | 'chores';

const MOMENTS: { key: string; title: string; q: string; rows: Row[] }[] = [
  { key: 'look', title: 'Look back', q: 'How did last week go?', rows: [] },
  { key: 'ahead', title: 'The week ahead', q: "What's coming at us?", rows: ['maya', 'theo', 'june'] },
  { key: 'loose', title: 'Loose ends', q: 'What carries into next week?', rows: ['maya', 'theo'] },
  { key: 'decide', title: 'Decide', q: 'Three things need both of you.', rows: ['maya', 'theo'] },
  { key: 'june', title: 'Cover June', q: 'Who has June, and when?', rows: ['june'] },
  { key: 'dinner', title: 'Dinners', q: "What's for dinner each night?", rows: ['dinner'] },
  { key: 'help', title: 'Assistant help', q: 'Hand a few chores to the assistant?', rows: ['dinner', 'chores'] },
  { key: 'commit', title: 'Commit', q: 'Make it our plan.', rows: ['maya', 'theo', 'june', 'dinner', 'chores'] },
];

const AWAY = new Set(['2026-11-23', '2026-11-24']);
const LOOSE_BEFORE = '2026-11-23';

export function Reset() {
  const { state, resetPatch } = useFamily();
  const { phone } = useRhythm();
  const r = state.reset;
  const step = Math.min(r.step, MOMENTS.length - 1);
  const m = MOMENTS[step]!;
  const [dinnerDay, setDinnerDay] = useState(nextWeekDays[2]!.date);
  const set = (i: number) => resetPatch({ step: Math.max(0, Math.min(MOMENTS.length - 1, i)) });

  const focusRows = r.committed ? [] : m.rows;

  return (
    <div className={`c-page c-reset ${r.committed ? 'committed' : ''}`}>
      <header className="c-reset-head">
        <div>
          <div className="c-kicker">Weekly Reset · Sunday 7:30pm</div>
          <h1>{r.committed ? 'Our week, planned together' : 'Plan the week together'}</h1>
          <p>
            Nov 23–29 · Thanksgiving week. Maya is in Denver Monday and Tuesday, daycare is closed Thursday and Friday.
          </p>
        </div>
        <div className="c-mode" role="radiogroup" aria-label="How you're planning">
          <button type="button" role="radio" aria-checked={r.mode === 'together'} className={r.mode === 'together' ? 'on' : ''} onClick={() => resetPatch({ mode: 'together' })}>
            <span className="c-pair">
              <Avatar id="maya" size={22} />
              <Avatar id="theo" size={22} />
            </span>
            <span className="c-long">Together, one screen</span>
            <span className="c-short">Together</span>
          </button>
          <button type="button" role="radio" aria-checked={r.mode === 'apart'} className={r.mode === 'apart' ? 'on' : ''} onClick={() => resetPatch({ mode: 'apart' })}>
            <Users size={16} strokeWidth={2} />
            <span className="c-long">Each on our phones</span>
            <span className="c-short">Apart</span>
          </button>
        </div>
      </header>

      <div className="c-reset-body">
        <aside className="c-moments" aria-label="Moments">
          {phone ? (
            <div className="c-moment-cur">
              <div className="c-moment-prog" aria-hidden="true">
                {MOMENTS.map((x, i) => (
                  <i key={x.key} className={i < step ? 'f' : i === step ? 'on' : ''} />
                ))}
              </div>
              <MomentPanel k={m.key} q={m.q} step={step} dinnerDay={dinnerDay} setDinnerDay={setDinnerDay} />
            </div>
          ) : (
            <ol>
              {MOMENTS.map((x, i) => (
                <li key={x.key} className={`c-moment ${i === step ? 'on' : ''} ${i < step ? 'past' : ''}`}>
                  <button type="button" className="c-moment-btn" aria-current={i === step ? 'step' : undefined} onClick={() => set(i)}>
                    <span className="c-moment-n">{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                    <span className="c-moment-t">{x.title}</span>
                    <MomentBadge k={x.key} />
                  </button>
                  {i === step && (
                    <div className="c-moment-body">
                      <MomentPanel k={x.key} q={x.q} step={i} dinnerDay={dinnerDay} setDinnerDay={setDinnerDay} />
                      <div className="c-moment-nav">
                        <button type="button" className="c-btn ghost" disabled={i === 0} onClick={() => set(i - 1)}>
                          <ArrowLeft size={16} strokeWidth={2.2} /> Back
                        </button>
                        {i < MOMENTS.length - 1 && (
                          <button type="button" className="c-btn ink" onClick={() => set(i + 1)}>
                            {MOMENTS[i + 1]!.title} <ArrowRight size={16} strokeWidth={2.2} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </aside>

        <div className="c-board-wrap">
          <LookBackStrip active={m.key === 'look'} />
          <Board focusRows={focusRows} dinnerDay={m.key === 'dinner' ? dinnerDay : undefined} onDinner={(d) => { setDinnerDay(d); set(5); }} onCover={() => step !== 4 && set(4)} />
        </div>
      </div>

      {phone && (
        <nav className="c-moment-bar" aria-label="Moments">
          <button type="button" className="c-icon-btn" aria-label="Previous moment" disabled={step === 0} onClick={() => set(step - 1)}>
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>
          <div className="c-moment-bar-t">
            <span>
              {step + 1} of {MOMENTS.length}
            </span>
            <b>{m.title}</b>
          </div>
          <button type="button" className="c-icon-btn ink" aria-label="Next moment" disabled={step === MOMENTS.length - 1} onClick={() => set(step + 1)}>
            <ArrowRight size={20} strokeWidth={2.2} />
          </button>
        </nav>
      )}
    </div>
  );
}

function looseEnds(tasks: ReturnType<typeof useFamily>['state']['tasks']) {
  return tasks.filter((t) => !t.done && !t.waitingOn && !t.projectId && t.due !== undefined && t.due < LOOSE_BEFORE);
}

function MomentBadge({ k }: { k: string }) {
  const { state } = useFamily();
  const r = state.reset;
  let text: ReactNode = null;
  if (k === 'loose') {
    const l = looseEnds(state.tasks);
    text = `${l.filter((t) => r.carry[t.id]).length}/${l.length}`;
  } else if (k === 'decide') {
    text = `${state.decisions.filter((d) => d.votes.maya && d.votes.maya === d.votes.theo).length}/${state.decisions.length}`;
  } else if (k === 'june') {
    text = `${coverageSlots.filter((s) => r.coverage[s.key]).length}/${coverageSlots.length}`;
  } else if (k === 'dinner') {
    text = `${nextWeekDays.filter((d) => r.meals[d.date]).length}/7`;
  }
  return text ? <span className="c-moment-badge">{text}</span> : null;
}

function MomentPanel({
  k,
  q,
  dinnerDay,
  setDinnerDay,
}: {
  k: string;
  q: string;
  step: number;
  dinnerDay: string;
  setDinnerDay: (d: string) => void;
}) {
  const { state, carry, vote, setCoverage, setMeal, suggestion, suggestionStatus, commitPlan, resetPatch } = useFamily();
  const r = state.reset;

  if (k === 'look') {
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <p className="c-mp-lede">
          You closed {lastWeek.done.maya}, Theo closed {lastWeek.done.theo}. {lastWeek.routinesKept} of {lastWeek.routinesTotal} routines kept.
        </p>
        <h4>Went well</h4>
        <ul className="c-mp-list">
          {lastWeek.highlights.map((h) => (
            <li key={h}>
              <Check size={15} strokeWidth={2.6} /> {h}
            </li>
          ))}
        </ul>
        <h4>Slipped</h4>
        <ul className="c-mp-list slip">
          {lastWeek.slipped.map((h) => (
            <li key={h}>
              <i className="c-hatch-dot" /> {h}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (k === 'ahead') {
    const items = nextWeekDays.flatMap((d) => eventsOn(d.date).map((e) => ({ d, e })));
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <ul className="c-ahead">
          {items.map(({ d, e }) => (
            <li key={e.id}>
              <span className="c-ahead-d">{d.day}</span>
              <span className="c-ahead-t">
                <b>{e.title}</b>
                <span>
                  {e.kind === 'childcare' ? 'All day' : range(e.start, e.end)}
                  {e.who.filter((p) => p !== 'june').length === 1 ? ` · ${e.who[0] === 'maya' ? 'You' : people[e.who.find((p) => p !== 'june')!].name}` : ''}
                </span>
              </span>
              <span className="c-ahead-who">
                {e.who.map((p) => (
                  <Avatar key={p} id={p} size={18} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (k === 'loose') {
    const l = looseEnds(state.tasks);
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <p className="c-mp-lede">Keep it on the board, push it later, or let it go.</p>
        <ul className="c-triage">
          {l.map((t) => {
            const c = r.carry[t.id];
            return (
              <li key={t.id} className={c ? `is-${c}` : ''}>
                {t.owner ? <Avatar id={t.owner} size={22} /> : <Either size={22} />}
                <span className="c-triage-t">{t.title}</span>
                <span className="c-triage-seg" role="group" aria-label={`What happens to ${t.title}`}>
                  {(['keep', 'later', 'drop'] as const).map((ch) => (
                    <button key={ch} type="button" aria-pressed={c === ch} className={c === ch ? 'on' : ''} onClick={() => carry(t.id, ch)}>
                      {ch === 'keep' ? 'Keep' : ch === 'later' ? 'Later' : 'Drop'}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (k === 'decide') {
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <p className="c-mp-lede">{r.mode === 'together' ? 'You’re on one screen: tap a face to vote for each of you.' : 'Theo votes on his phone.'}</p>
        <div className="c-mp-decs">
          {state.decisions.map((d) => (
            <DecisionCard key={d.id} d={d} both={r.mode === 'together'} onVote={(o, p) => vote(d.id, o, p)} />
          ))}
        </div>
      </div>
    );
  }

  if (k === 'june') {
    const covered = coverageSlots.filter((s) => r.coverage[s.key]).length;
    const clash = coverageSlots.filter((s) => r.coverage[s.key] === 'maya' && AWAY.has(s.date));
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <p className="c-mp-lede">
          {covered} of {coverageSlots.length} handoffs covered. Tap a slot on the board to choose who. Thursday and Friday June is home with you both.
        </p>
        {clash.length > 0 && <p className="c-mp-warn"><i className="c-hatch-dot" /> You're in Denver for {clash.map((s) => `${s.day} ${s.label.split(' ')[0]!.toLowerCase()}`).join(', ')}.</p>}
        <button
          type="button"
          className="c-btn ghost"
          onClick={() => coverageSlots.forEach((s) => !r.coverage[s.key] && setCoverage(s.key, s.suggested))}
        >
          Fill in the usual
        </button>
      </div>
    );
  }

  if (k === 'dinner') {
    const cur = r.meals[dinnerDay];
    const d = nextWeekDays.find((x) => x.date === dinnerDay)!;
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <div className="c-daypick" role="radiogroup" aria-label="Day">
          {nextWeekDays.map((x) => (
            <button key={x.date} type="button" role="radio" aria-checked={x.date === dinnerDay} className={`${x.date === dinnerDay ? 'on' : ''} ${r.meals[x.date] ? 'has' : ''}`} onClick={() => setDinnerDay(x.date)}>
              {x.day}
            </button>
          ))}
        </div>
        <p className="c-mp-lede">
          <b>{d.day}</b>
          {d.note ? ` · ${d.note}` : ''}: {cur ? cur.title : 'nothing yet'}
        </p>
        <div className="c-ideas">
          {(d.day === 'Thu' ? ['Thanksgiving', ...mealIdeas] : mealIdeas).map((idea) => (
            <button key={idea} type="button" className={cur?.title === idea ? 'on' : ''} aria-pressed={cur?.title === idea} onClick={() => setMeal(dinnerDay, idea, cur?.cook ?? null)}>
              {idea}
            </button>
          ))}
        </div>
        <div className="c-cook" role="radiogroup" aria-label="Who cooks">
          <span>Cook</span>
          {(['maya', 'theo', null] as (PersonId | null)[]).map((p) => {
            const blocked = p === 'maya' && AWAY.has(dinnerDay);
            return (
              <button
                key={String(p)}
                type="button"
                role="radio"
                aria-checked={cur?.cook === p}
                disabled={!cur || blocked}
                className={cur && cur.cook === p ? 'on' : ''}
                style={(p ? { '--pc': people[p].color } : { '--pc': '#15201B' }) as CSSProperties}
                onClick={() => cur && setMeal(dinnerDay, cur.title, p)}
                title={blocked ? 'Maya is away' : undefined}
              >
                {p ? <Avatar id={p} size={20} /> : null}
                {p === 'maya' ? 'You' : p === 'theo' ? 'Theo' : 'No one'}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (k === 'help') {
    const list = suggestions.filter((s) => s.place === 'reset');
    return (
      <div className="c-mp">
        <p className="c-mp-q">{q}</p>
        <p className="c-mp-lede">Nothing is sent or paid until you approve.</p>
        <div className="c-helps">
          {list.map((s) => {
            const st = suggestionStatus(s.id);
            return (
              <div key={s.id} className={`c-help is-${st}`}>
                <div className="c-sugg-top">
                  <Simulated />
                  {st === 'approved' && <span className="c-help-st"><Check size={14} strokeWidth={2.6} /> Approved</span>}
                  {st === 'dismissed' && <span className="c-help-st">Dismissed</span>}
                </div>
                <b>{s.title}</b>
                <p>{s.detail}</p>
                {st === 'pending' ? (
                  <div className="c-sugg-act">
                    <button type="button" className="c-btn ink sm" onClick={() => suggestion(s.id, 'approved')}>
                      {s.action}
                    </button>
                    <button type="button" className="c-btn ghost sm" onClick={() => suggestion(s.id, 'dismissed')}>
                      No thanks
                    </button>
                  </div>
                ) : (
                  <button type="button" className="c-link sm" onClick={() => suggestion(s.id, 'pending')}>
                    Undo
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // commit
  const loose = looseEnds(state.tasks);
  const checks = [
    { label: 'June covered', n: coverageSlots.filter((s) => r.coverage[s.key]).length, of: coverageSlots.length },
    { label: 'Dinners planned', n: nextWeekDays.filter((d) => r.meals[d.date]).length, of: 7 },
    { label: 'Decided together', n: state.decisions.filter((d) => d.votes.maya && d.votes.maya === d.votes.theo).length, of: state.decisions.length },
    { label: 'Loose ends sorted', n: loose.filter((t) => r.carry[t.id]).length, of: loose.length },
  ];
  return (
    <div className="c-mp">
      <p className="c-mp-q">{r.committed ? 'This is the plan.' : q}</p>
      <ul className="c-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.n === c.of ? 'ok' : ''}>
            <span className="c-checks-n">
              {c.n}
              <small>/{c.of}</small>
            </span>
            {c.label}
          </li>
        ))}
      </ul>
      {r.committed ? (
        <>
          <p className="c-mp-lede">Theo has a copy (simulated). It shows up on both your Today screens from Monday.</p>
          <button type="button" className="c-btn ghost" onClick={() => resetPatch({ committed: false })}>
            Make changes
          </button>
        </>
      ) : (
        <>
          <p className="c-mp-lede">Anything still open stays marked on the board, so you can sort it during the week.</p>
          <button type="button" className="c-btn ink big" onClick={commitPlan}>
            Make it our plan
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function LookBackStrip({ active }: { active: boolean }) {
  const kept = lastWeek.routinesKept / lastWeek.routinesTotal;
  return (
    <section className={`c-lookback ${active ? 'on' : ''}`} aria-label={`Last week, ${lastWeek.range}`}>
      <span className="c-lookback-l">Last week</span>
      {(['maya', 'theo'] as const).map((p) => (
        <div key={p} className="c-lookback-p" style={{ '--pc': people[p].color } as CSSProperties}>
          <Avatar id={p} size={20} />
          <span className="c-lookback-beads" aria-label={`${lastWeek.done[p]} done`}>
            {Array.from({ length: lastWeek.done[p] }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 30}ms` }} />
            ))}
          </span>
          <b>{lastWeek.done[p]}</b>
        </div>
      ))}
      <div className="c-lookback-r">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="8.5" fill="none" stroke="#E3E3DC" strokeWidth="3" />
          <circle cx="11" cy="11" r="8.5" fill="none" stroke="#15201B" strokeWidth="3" strokeDasharray={`${kept * 53.4} 60`} transform="rotate(-90 11 11)" strokeLinecap="round" />
        </svg>
        <span>
          <b>
            {lastWeek.routinesKept}/{lastWeek.routinesTotal}
          </b>{' '}
          routines kept
        </span>
      </div>
    </section>
  );
}

const CHORES: { date: string; id: string; title: string; who: PersonId }[] = [
  { date: '2026-11-23', id: 'r3', title: 'Laundry', who: 'maya' },
  { date: '2026-11-25', id: 'r1', title: 'Trash out', who: 'maya' },
  { date: '2026-11-26', id: 'r3', title: 'Laundry', who: 'maya' },
  { date: '2026-11-28', id: 'r5', title: 'Groceries', who: 'theo' },
  { date: '2026-11-29', id: 'r6', title: 'Plants', who: 'theo' },
];

const ROW_LABEL: Record<Row, string> = { maya: 'Maya', theo: 'Theo', june: "June's care", dinner: 'Dinners', chores: 'Chores' };

function Board({
  focusRows,
  dinnerDay,
  onDinner,
  onCover,
}: {
  focusRows: Row[];
  dinnerDay?: string;
  onDinner: (d: string) => void;
  onCover: () => void;
}) {
  const { state, setCoverage } = useFamily();
  const { phone } = useRhythm();
  const r = state.reset;
  const [chores, setChores] = useState<Record<string, PersonId>>({});
  const q1 = state.decisions.find((d) => d.id === 'q1')!;
  const q1agreed = q1.votes.maya && q1.votes.maya === q1.votes.theo ? q1.options.find((o) => o.id === q1.votes.maya)?.label : undefined;
  const rows: Row[] = ['maya', 'theo', 'june', 'dinner', 'chores'];
  const dim = (row: Row) => (focusRows.length && !focusRows.includes(row) ? 'dim' : focusRows.includes(row) && focusRows.length < 5 ? 'lit' : '');
  const kept = state.tasks.filter((t) => r.carry[t.id] === 'keep' && !t.done);

  const cycle = (key: string) => {
    if (r.committed) return;
    const cur = r.coverage[key] ?? null;
    const nxt: PersonId | null = cur === null ? 'theo' : cur === 'theo' ? 'maya' : null;
    setCoverage(key, nxt);
    onCover();
  };

  return (
    <section className={`c-board ${r.committed ? 'is-plan' : ''}`} aria-label="Next week board">
      {r.committed && (
        <div className="c-plan-stamp">
          <Check size={16} strokeWidth={2.8} /> Shared plan · Theo has it too
        </div>
      )}
      {!phone && (
        <div className="c-bcol c-blabels" aria-hidden="true">
          <div className="c-bhead" />
          {rows.map((row) => (
            <div key={row} className={`c-blabel r-${row} ${dim(row)}`} data-lane={row === 'june' ? 'june' : row === 'maya' || row === 'theo' ? row : undefined}>
              {row === 'maya' || row === 'theo' || row === 'june' ? <Avatar id={row} size={22} /> : null}
              <span>{ROW_LABEL[row]}</span>
              {(row === 'maya' || row === 'theo') && kept.filter((t) => t.owner === row).length > 0 && (
                <small className="c-blabel-carry">+{kept.filter((t) => t.owner === row).length} carried</small>
              )}
            </div>
          ))}
        </div>
      )}
      {nextWeekDays.map((d) => {
        const evs = eventsOn(d.date);
        const away = AWAY.has(d.date);
        const meal = r.meals[d.date];
        const slots = coverageSlots.filter((s) => s.date === d.date);
        const closed = evs.find((e) => e.kind === 'childcare' && e.title.startsWith('Daycare closed'));
        const chore = CHORES.filter((c) => c.date === d.date);
        const thanks = evs.find((e) => e.title === 'Thanksgiving dinner');
        const personCell = (p: 'maya' | 'theo') => {
          if (p === 'maya' && away) {
            return (
              <div className={`c-bcell r-maya blocked ${dim('maya')}`} data-lane="maya">
                <span className="c-blocked-pill">
                  <span>
                    <Plane size={14} strokeWidth={2.2} />
                    <b>Denver</b>
                  </span>
                  <span>{d.day === 'Mon' ? 'Flies 6:40am' : 'Home late'}</span>
                </span>
              </div>
            );
          }
          const mine = evs.filter((e) => e.who.includes(p) && e.kind !== 'childcare' && e.id !== thanks?.id);
          return (
            <div className={`c-bcell r-${p} ${dim(p)}`} data-lane={p} style={{ '--pc': people[p].color, '--pt': people[p].tint } as CSSProperties}>
              {mine.map((e) => (
                <span key={e.id} className="c-bev">
                  <Avatar id={p} size={16} className="c-bev-av" />
                  <b>{e.title.replace('June: ', '')}</b>
                  <span>{range(e.start, e.end)}</span>
                </span>
              ))}
              {thanks && (
                <span className="c-bev together">
                  <b>Thanksgiving</b>
                  <span>{q1agreed ?? 'Host or Salem?'}</span>
                </span>
              )}
              {p === 'theo' && away && <span className="c-bsolo">Solo with June</span>}
            </div>
          );
        };
        return (
          <div key={d.date} className={`c-bcol c-bday ${away ? 'away' : ''} ${dinnerDay === d.date ? 'picked' : ''}`}>
            <div className="c-bhead">
              <span className="c-bday-n">{d.day}</span>
              <span className="c-bday-d">{d.label.replace('Nov ', '')}</span>
              {d.note && <span className="c-bday-note">{d.note}</span>}
            </div>
            {personCell('maya')}
            {personCell('theo')}
            <div className={`c-bcell r-june ${dim('june')} ${closed ? 'closed' : ''}`} data-lane="june">
              {phone && <span className="c-bcell-k">June</span>}
              {slots.map((s) => {
                const who = r.coverage[s.key] ?? null;
                const clash = who === 'maya' && away;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`c-slot ${who ? 'set' : ''} ${clash ? 'clash' : ''}`}
                    style={(who ? { '--pc': people[who].color, '--pt': people[who].tint } : {}) as CSSProperties}
                    onClick={() => cycle(s.key)}
                    aria-label={`${d.day} ${s.label}: ${who ? people[who].name : 'nobody yet'}. Tap to change.`}
                    disabled={r.committed}
                  >
                    <span className="c-slot-l">{s.label.startsWith('Drop') ? 'Drop' : 'Pick'}</span>
                    <span className="c-slot-t">{clock(s.label.split(' ')[1]!)}</span>
                    {who ? <Avatar id={who} size={20} /> : <span className="c-slot-q">?</span>}
                  </button>
                );
              })}
              {closed && (
                <span className="c-bjune">
                  <b>Daycare closed</b>
                  <span>Home with you both</span>
                </span>
              )}
              {!slots.length && !closed && <span className="c-bjune quiet">Home</span>}
            </div>
            <button
              type="button"
              className={`c-bcell r-dinner ${dim('dinner')} ${meal ? 'has' : 'empty'}`}
              onClick={() => !r.committed && onDinner(d.date)}
              aria-label={`${d.day} dinner: ${meal ? meal.title : 'not planned'}`}
              disabled={r.committed && !meal}
            >
              {phone && <span className="c-bcell-k">Dinner</span>}
              {meal ? (
                <>
                  <b>{meal.title}</b>
                  {meal.cook ? (
                    <span className="c-cookline">
                      <Avatar id={meal.cook} size={16} /> {meal.cook === 'maya' ? 'You cook' : `${people[meal.cook].name} cooks`}
                    </span>
                  ) : (
                    <span className="c-cookline">No cooking</span>
                  )}
                </>
              ) : (
                <span className="c-bempty">{r.committed ? 'Open' : 'Add dinner'}</span>
              )}
            </button>
            <div className={`c-bcell r-chores ${dim('chores')}`}>
              {phone && chore.length > 0 && <span className="c-bcell-k">Chores</span>}
              {chore.map((c) => {
                const who = chores[`${c.date}-${c.id}`] ?? c.who;
                const clash = who === 'maya' && away;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`c-chore ${clash ? 'clash' : ''}`}
                    style={{ '--pc': people[who].color, '--pt': people[who].tint } as CSSProperties}
                    onClick={() => !r.committed && setChores((s) => ({ ...s, [`${c.date}-${c.id}`]: who === 'maya' ? 'theo' : 'maya' }))}
                    aria-label={`${c.title}, ${people[who].name}${clash ? ', but Maya is away' : ''}. Tap to swap.`}
                    disabled={r.committed}
                  >
                    <i />
                    {c.title}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

