// Weekly Reset: "Sunday at the table". A guided ritual in chapters, ending in a set plan page.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Plus, Sparkles } from 'lucide-react';
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
import { coverageSlots, dueLabel, useFamily } from '../../store';
import { END_OF_WEEK, clock, cx, dayParts, isLate, plural, range, who } from './helpers';
import { Avatar, AvatarStack, CheckCircle, DecisionBlock, OwnerMark, OwnerSwitch, Simulated, decisionState, ic, icSm } from './ui';

const CHAPTERS = [
  'Look back',
  'The week ahead',
  'Loose ends',
  'Decide together',
  'Who’s on what',
  'Meals & groceries',
  'Let the assistant help',
  'Our plan',
];

const AWAY: Record<string, string> = { '2026-11-23': 'in Denver', '2026-11-24': 'flying home late' };

/** Notes in the viewer's voice: "Maya in Denver" reads "You’re in Denver". */
const voice = (note: string) => note.replace(/^Maya in/, 'You’re in').replace(/^Maya flies/, 'You fly');

export function ResetScreen() {
  const f = useFamily();
  const { step, mode, partnerStep, committed } = f.state.reset;
  const goTo = (n: number) =>
    f.resetPatch({ step: n, partnerStep: mode === 'apart' ? Math.max(partnerStep, n - 1, 0) : partnerStep });

  return (
    <div className="a-reset">
      <header className="a-reset-top">
        <div className="a-reset-id">
          <h2 className="a-reset-name">Weekly Reset</h2>
          <p className="a-reset-when">
            <span className="a-long">Sunday, November 22 · 7:30pm · Planning Nov 23–29</span>
            <span className="a-short">Sun, Nov 22 · 7:30pm</span>
          </p>
        </div>
        <div className="a-reset-mode">
          <AvatarStack ids={['maya', 'theo']} size={26} />
          <div className="a-seg" role="radiogroup" aria-label="How you’re doing this">
            {(
              [
                ['together', 'Together on this screen', 'Together'],
                ['apart', 'On our own phones', 'Own phones'],
              ] as const
            ).map(([m, label, short]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={cx(mode === m && 'is-on')}
                onClick={() => f.resetPatch({ mode: m, partnerStep: m === 'apart' ? Math.max(0, step - 1) : partnerStep })}
              >
                <span className="a-long">{label}</span>
                <span className="a-short">{short}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="a-reset-body">
        <ol className="a-chapters" aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                className={cx('a-chapter', i === step && 'is-on', i < step && 'is-past')}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="a-chapter-n">{i < step || (i === 7 && committed) ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                <span className="a-chapter-label">{c}</span>
                {mode === 'apart' && partnerStep === i && (
                  <span className="a-chapter-theo" title="Theo is here">
                    <Avatar id="theo" size={18} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>

        <div className="a-mprogress" aria-hidden="true">
          <div className="a-mprogress-bar">
            {CHAPTERS.map((c, i) => (
              <span key={c} className={cx(i <= step && 'is-on')} />
            ))}
          </div>
          <p>
            {step + 1} of {CHAPTERS.length} · <b>{CHAPTERS[step]}</b>
          </p>
        </div>

        <article className="a-chapter-page" key={step}>
          {mode === 'apart' && (
            <p className="a-apart-note">
              <Avatar id="theo" size={18} />
              Theo is on his phone, at “{CHAPTERS[partnerStep]}”. Your answers meet in the plan.
            </p>
          )}
          {step === 0 && <LookBack />}
          {step === 1 && <WeekAhead />}
          {step === 2 && <LooseEnds />}
          {step === 3 && <Decide />}
          {step === 4 && <Coverage />}
          {step === 5 && <Meals />}
          {step === 6 && <Assistant />}
          {step === 7 && <OurWeek />}

          <footer className="a-chapter-foot">
            {step > 0 ? (
              <button type="button" className="a-btn a-btn--quiet" onClick={() => goTo(step - 1)}>
                <ArrowLeft {...icSm} aria-hidden="true" />
                Back
              </button>
            ) : (
              <span />
            )}
            <span className="a-foot-step">
              {step + 1} of {CHAPTERS.length}
            </span>
            {step < CHAPTERS.length - 1 ? (
              <button type="button" className="a-btn a-btn--primary" onClick={() => goTo(step + 1)}>
                <span className="a-long">Next: {CHAPTERS[step + 1]}</span>
                <span className="a-short">Next</span>
                <ArrowRight {...icSm} aria-hidden="true" />
              </button>
            ) : committed ? (
              <span className="a-foot-done">
                <CircleCheck {...icSm} aria-hidden="true" /> Saved
              </span>
            ) : (
              <button type="button" className="a-btn a-btn--primary" onClick={() => f.commitPlan()}>
                <Check {...icSm} aria-hidden="true" />
                Save our plan
              </button>
            )}
          </footer>
        </article>
      </div>
    </div>
  );
}

function ChapterHead({ n, q, lede }: { n: number; q: string; lede?: ReactNode }) {
  return (
    <header className="a-ch-head">
      <p className="a-eyebrow">
        Chapter {n + 1} · {CHAPTERS[n]}
      </p>
      <h3 className="a-ch-q">{q}</h3>
      {lede && <p className="a-ch-lede">{lede}</p>}
    </header>
  );
}

// --- 1 · Look back ------------------------------------------------------------------------------

function LookBack() {
  const { state } = useFamily();
  const total = lastWeek.done.maya + lastWeek.done.theo;
  const doneList = state.tasks.filter((t) => t.done && t.doneBy);
  return (
    <>
      <ChapterHead
        n={0}
        q="How did this week go?"
        lede={`This week, ${lastWeek.range}. Between you, ${total} things got done and ${lastWeek.routinesKept} of ${lastWeek.routinesTotal} routines held.`}
      />
      <div className="a-balance" aria-label={`You ${lastWeek.done.maya}, Theo ${lastWeek.done.theo}`}>
        <div className="a-balance-names">
          <span>
            <Avatar id="maya" size={22} /> You <b>{lastWeek.done.maya}</b>
          </span>
          <span>
            <b>{lastWeek.done.theo}</b> Theo <Avatar id="theo" size={22} />
          </span>
        </div>
        <div className="a-balance-bar">
          <span style={{ flex: lastWeek.done.maya, background: people.maya.color }} />
          <span style={{ flex: lastWeek.done.theo, background: people.theo.color }} />
        </div>
        <p className="a-balance-note">Close to even. Theo carried more of June’s week; you carried more of the admin.</p>
      </div>
      <div className="a-cols-2">
        <section>
          <h4 className="a-h4">Went well</h4>
          <ul className="a-bullets">
            {lastWeek.highlights.map((h) => (
              <li key={h}>
                <CircleCheck {...icSm} className="a-good" aria-hidden="true" />
                {h}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="a-h4">Slipped</h4>
          <ul className="a-bullets">
            {lastWeek.slipped.map((h) => (
              <li key={h}>
                <span className="a-dot-amber" aria-hidden="true" />
                {h}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <h4 className="a-h4">Crossed off</h4>
        <ul className="a-logbook">
          {doneList.map((t) => (
            <li key={t.id}>
              <Check size={14} strokeWidth={2.5} className="a-good" aria-hidden="true" />
              <span className="a-logbook-title">{t.title}</span>
              <Avatar id={t.doneBy!} size={18} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// --- 2 · The week ahead -------------------------------------------------------------------------

function WeekAhead() {
  return (
    <>
      <ChapterHead
        n={1}
        q="What’s coming next week?"
        lede="You’re in Denver until Tuesday night, June has her checkup, and daycare closes for Thanksgiving."
      />
      <ol className="a-week">
        {nextWeekDays.map((d) => {
          const evs = events.filter((e) => e.date === d.date).sort((a, b) => a.start.localeCompare(b.start));
          const p = dayParts(d.date);
          return (
            <li key={d.date} className={cx('a-week-day', AWAY[d.date] && 'is-away')}>
              <span className="a-week-date">
                <span className="a-week-num">{p.num}</span>
                <span className="a-week-wd">{d.day}</span>
              </span>
              <div className="a-week-items">
                {d.note && <span className="a-tag">{voice(d.note)}</span>}
                {evs.map((e) => (
                  <span key={e.id} className="a-week-ev">
                    <span className="a-week-time">{e.end > '17:59' && e.start < '09:00' ? 'All day' : clock(e.start)}</span>
                    <span className="a-week-title">{e.title}</span>
                    <AvatarStack ids={e.who} size={18} />
                  </span>
                ))}
                {!evs.length && !d.note && <span className="a-muted">Nothing planned yet</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// --- 3 · Loose ends -----------------------------------------------------------------------------

const CARRY: { id: 'keep' | 'later' | 'drop'; label: string }[] = [
  { id: 'keep', label: 'Next week' },
  { id: 'later', label: 'Later' },
  { id: 'drop', label: 'Let go' },
];

export const looseEnds = (tasks: Task[]) =>
  tasks.filter((t) => !t.done && ((t.due && t.due <= END_OF_WEEK) || t.waitingOn));

function LooseEnds() {
  const f = useFamily();
  const items = looseEnds(f.state.tasks);
  const carry = f.state.reset.carry;
  const left = items.filter((t) => !carry[t.id]).length;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = [
    { id: 'late', label: 'Late', items: items.filter((t) => isLate(t) && !t.waitingOn) },
    { id: 'week', label: 'This week', items: items.filter((t) => !isLate(t) && !t.waitingOn && t.due) },
    { id: 'none', label: 'No date', items: items.filter((t) => t.waitingOn || !t.due) },
  ];
  const firstGroup = groups.findIndex((g) => g.items.length);
  return (
    <>
      <ChapterHead
        n={2}
        q="What do we do with what’s left?"
        lede="Anything not done by Sunday. Carry it into next week, park it for later, or let it go for good."
      />
      <div className="a-triage-bar">
        <span>
          {left ? (
            <>
              <b>{left}</b> still to sort · {items.length - left} sorted
            </>
          ) : (
            <>
              <Check size={14} strokeWidth={2.5} className="a-good" aria-hidden="true" /> All sorted
            </>
          )}
        </span>
        {left > 0 && (
          <button
            type="button"
            className="a-link"
            onClick={() => items.forEach((t) => !carry[t.id] && f.carry(t.id, 'keep'))}
          >
            Carry the rest to next week
          </button>
        )}
      </div>
      {groups.map((g, gi) => {
        if (!g.items.length) return null;
        const limit = gi === firstGroup || open[g.id] ? Infinity : 2;
        const shown = g.items.slice(0, limit);
        const hidden = g.items.length - shown.length;
        return (
          <section key={g.id} className={cx('a-triage-group', g.id === 'late' && 'is-late')}>
            <h4 className="a-triage-head">
              {g.label}
              <span>{g.items.filter((t) => !carry[t.id]).length || 'All'} {g.items.filter((t) => !carry[t.id]).length ? 'to sort' : 'sorted'}</span>
            </h4>
            <ul className="a-triage">
              {shown.map((t) => (
                <TriageRow key={t.id} t={t} c={carry[t.id]} onPick={(id) => f.carry(t.id, id)} />
              ))}
            </ul>
            {hidden > 0 && (
              <button type="button" className="a-more" onClick={() => setOpen((o) => ({ ...o, [g.id]: true }))}>
                <ChevronDown {...icSm} aria-hidden="true" />
                Show {hidden} more
              </button>
            )}
          </section>
        );
      })}
    </>
  );
}

function TriageRow({ t, c, onPick }: { t: Task; c?: 'keep' | 'later' | 'drop'; onPick: (id: 'keep' | 'later' | 'drop') => void }) {
  return (
    <li className={cx('a-triage-row', c && `is-${c}`)}>
      <OwnerMark owner={t.owner} size={22} />
      <span className="a-triage-text">
        <span className="a-task-title">{t.title}</span>
        <span className={cx('a-row-meta', isLate(t) && 'a-late')}>
          {t.waitingOn ? `Waiting on ${t.waitingOn.toLowerCase()}` : dueLabel(t.due)}
        </span>
      </span>
      <span className="a-seg a-seg--sm" role="radiogroup" aria-label={`What to do with ${t.title}`}>
        {CARRY.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={c === o.id}
            className={cx(c === o.id && 'is-on', `is-${o.id}`)}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </li>
  );
}

// --- 4 · Decide together ------------------------------------------------------------------------

function Decide() {
  const f = useFamily();
  const together = f.state.reset.mode === 'together';
  return (
    <>
      <ChapterHead
        n={3}
        q="What do you two need to settle?"
        lede={
          together
            ? 'Sitting together, so you can both weigh in here. Tap an option for you, or “Theo’s pick” for him.'
            : 'Pick what you’d choose. Theo’s choices show up as he makes them.'
        }
      />
      <div className="a-decisions a-decisions--full">
        {f.state.decisions.map((d) => (
          <DecisionBlock key={d.id} decision={d} voters={together ? ['maya', 'theo'] : ['maya']} />
        ))}
      </div>
    </>
  );
}

// --- 5 · Who's on what --------------------------------------------------------------------------

function Coverage() {
  const f = useFamily();
  const cov = f.state.reset.coverage;
  const days = [...new Set(coverageSlots.map((s) => s.date))];
  const assigned = (k: string) => cov[k];
  const count = (p: PersonId) => coverageSlots.filter((s) => assigned(s.key) === p).length;
  const open = coverageSlots.filter((s) => !assigned(s.key)).length;
  return (
    <>
      <ChapterHead
        n={4}
        q="Who has June next week?"
        lede="Daycare runs Monday to Wednesday, then closes for Thanksgiving. You’re away until Tuesday night, so Theo has the first two days."
      />
      <div className="a-triage-bar">
        <span className="a-cov-tally">
          <Avatar id="maya" size={20} /> You <b>{count('maya')}</b>
          <span className="a-sep" />
          <Avatar id="theo" size={20} /> Theo <b>{count('theo')}</b>
          {open > 0 && <span className="a-muted"> · {open} open</span>}
        </span>
        {open > 0 && (
          <button
            type="button"
            className="a-link"
            onClick={() => coverageSlots.forEach((s) => !assigned(s.key) && f.setCoverage(s.key, s.suggested))}
          >
            Use the suggestions
          </button>
        )}
      </div>
      <div className="a-cov">
        <div className="a-cov-head" aria-hidden="true">
          <span />
          <span>Drop-off · 8:15</span>
          <span>Pickup · 5:30</span>
        </div>
        {days.map((d) => {
          const p = dayParts(d);
          const slots = coverageSlots.filter((s) => s.date === d);
          return (
            <div key={d} className="a-cov-row">
              <span className="a-cov-day">
                <span className="a-week-num">{p.num}</span>
                <span>
                  <span className="a-cov-wd">{p.long}</span>
                  {AWAY[d] && <span className="a-cov-away">You’re {AWAY[d]}</span>}
                </span>
              </span>
              {slots.map((s) => {
                const v = assigned(s.key);
                return (
                  <div key={s.key} className={cx('a-cov-cell', !v && 'is-open')} role="radiogroup" aria-label={`${p.long} ${s.label}`}>
                    <span className="a-cov-label">{s.label.replace(/ \d.*/, '')}</span>
                    {(['maya', 'theo'] as PersonId[]).map((pid) => {
                      const away = pid === 'maya' && !!AWAY[d];
                      const on = v === pid;
                      const sugg = !v && s.suggested === pid;
                      return (
                        <button
                          key={pid}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={away}
                          className={cx('a-cov-pick', on && 'is-on', sugg && 'is-sugg')}
                          style={on ? { background: people[pid].tint, borderColor: people[pid].color } : undefined}
                          onClick={() => f.setCoverage(s.key, on ? null : pid)}
                          title={away ? 'You’re away' : sugg ? 'Suggested' : undefined}
                        >
                          <Avatar id={pid} size={20} />
                          <span>{away ? 'Away' : who(pid)}</span>
                          {sugg && <span className="a-cov-sugg">suggested</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="a-cov-row is-closed">
          <span className="a-cov-day">
            <span className="a-week-num">26</span>
            <span>
              <span className="a-cov-wd">Thu and Fri</span>
            </span>
          </span>
          <p className="a-cov-closed">Daycare closed for Thanksgiving. June is home with you both.</p>
        </div>
      </div>
      {count('theo') >= 5 && (
        <p className="a-gentle">
          Theo is doing {count('theo')} of 6 handoffs. If you’re up for it, take Wednesday drop-off: the tile delivery
          lands on his morning.
        </p>
      )}
    </>
  );
}

// --- 6 · Meals & groceries ----------------------------------------------------------------------

const AISLES: GroceryItem['aisle'][] = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Pantry', 'Frozen', 'Baby', 'Household'];

function Meals() {
  const f = useFamily();
  const meals = f.state.reset.meals;
  const [editing, setEditing] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [newItem, setNewItem] = useState('');
  const [aisle, setAisle] = useState<GroceryItem['aisle']>('Produce');
  const g = f.state.groceries;
  const remaining = g.filter((x) => !x.checked).length;
  const planned = nextWeekDays.filter((d) => meals[d.date]).length;

  const pick = (date: string, title: string) => {
    const prev = meals[date];
    f.setMeal(date, title, prev?.cook ?? (AWAY[date] ? 'theo' : null));
    setEditing(null);
    setCustom('');
  };

  return (
    <>
      <ChapterHead n={5} q="What’s for dinner, and what do we need?" lede="Thursday is Thanksgiving, wherever you end up. Plan the other nights." />
      <div className="a-meals">
        <section className="a-meal-plan" aria-label="Dinners">
          <h4 className="a-h4">
            Dinners <span className="a-muted">{planned} of 7 planned</span>
          </h4>
          <ul className="a-meal-list">
            {nextWeekDays.map((d) => {
              const m = meals[d.date];
              const thanks = d.day === 'Thu';
              const isEditing = editing === d.date;
              return (
                <li key={d.date} className={cx('a-meal', isEditing && 'is-editing')}>
                  <div className="a-meal-line">
                    <span className="a-meal-day">
                      <span className="a-meal-wd">{d.day}</span>
                      <span className="a-meal-num">{dayParts(d.date).num}</span>
                    </span>
                    {thanks && !m ? (
                      <span className="a-meal-title is-fixed">Thanksgiving dinner</span>
                    ) : (
                      <button
                        type="button"
                        className={cx('a-meal-title', !m && 'is-empty')}
                        title={m?.title}
                        aria-expanded={isEditing}
                        onClick={() => setEditing(isEditing ? null : d.date)}
                      >
                        {m ? m.title : 'Plan dinner'}
                        {!m && <Plus size={14} strokeWidth={2} aria-hidden="true" />}
                      </button>
                    )}
                    {m && (
                      <OwnerSwitch value={m.cook} onChange={(c) => f.setMeal(d.date, m.title, c)} size="sm" label={`Who cooks ${d.day}`} />
                    )}
                  </div>
                  {d.note && !thanks && !isEditing && <span className="a-meal-note">{voice(d.note)}</span>}
                  {isEditing && (
                    <div className="a-meal-ideas">
                      {mealIdeas.map((idea) => (
                        <button key={idea} type="button" className="a-pill" onClick={() => pick(d.date, idea)}>
                          {idea}
                        </button>
                      ))}
                      <form
                        className="a-inline-add"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (custom.trim()) pick(d.date, custom.trim());
                        }}
                      >
                        <input
                          value={custom}
                          onChange={(e) => setCustom(e.target.value)}
                          placeholder="Something else…"
                          aria-label="Other dinner"
                        />
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="a-grocery" aria-label="Grocery list">
          <h4 className="a-h4">
            Groceries <span className="a-muted">{remaining} of {g.length} left</span>
          </h4>
          <form
            className="a-grocery-add"
            onSubmit={(e) => {
              e.preventDefault();
              f.addGrocery(newItem, aisle);
              setNewItem('');
            }}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item" aria-label="Add an item" />
            <select value={aisle} onChange={(e) => setAisle(e.target.value as GroceryItem['aisle'])} aria-label="Aisle">
              {AISLES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </form>
          {AISLES.map((a) => {
            const items = g.filter((x) => x.aisle === a);
            if (!items.length) return null;
            return (
              <div key={a} className="a-aisle">
                <p className="a-aisle-name">
                  {a}
                  <span>{items.filter((x) => !x.checked).length}</span>
                </p>
                <ul>
                  {items.map((x) => (
                    <li key={x.id} className={cx('a-gitem', x.checked && 'is-done', x.id.startsWith('g-') && 'is-new')}>
                      <CheckCircle checked={x.checked} onChange={() => f.toggleGrocery(x.id)} label={`Got ${x.name}`} />
                      <button type="button" className="a-gitem-text" onClick={() => f.toggleGrocery(x.id)}>
                        <span className="a-gitem-name">{x.name}</span>
                        {x.detail && <span className="a-gitem-detail">{x.detail}</span>}
                      </button>
                      <Avatar id={x.addedBy} size={16} title={`Added by ${people[x.addedBy].name}`} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}

// --- 7 · Let the assistant help -----------------------------------------------------------------

function Assistant() {
  const f = useFamily();
  const list = suggestions.filter((s) => s.place === 'reset');
  return (
    <>
      <ChapterHead
        n={6}
        q="Want a hand with any of this?"
        lede="Ideas for the busywork. Nothing happens unless you say yes, and in this prototype nothing is sent at all."
      />
      <ul className="a-suggest">
        {list.map((s) => {
          const st = f.suggestionStatus(s.id);
          return (
            <li key={s.id} className={cx('a-suggest-item', `is-${st}`)}>
              <Sparkles {...ic} className="a-suggest-ic" aria-hidden="true" />
              <div className="a-suggest-body">
                <p className="a-suggest-title">
                  {s.title} <Simulated />
                </p>
                <p className="a-suggest-detail">{s.detail}</p>
                {st === 'pending' ? (
                  <div className="a-thought-actions">
                    <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => f.suggestion(s.id, 'approved')}>
                      {s.action}
                    </button>
                    <button type="button" className="a-btn a-btn--quiet a-btn--sm" onClick={() => f.suggestion(s.id, 'dismissed')}>
                      No thanks
                    </button>
                  </div>
                ) : (
                  <p className={cx('a-suggest-state', st === 'approved' && 'a-good')}>
                    {st === 'approved' ? (
                      <>
                        <Check size={14} strokeWidth={2.5} aria-hidden="true" /> Approved. You’ll review it before anything goes out.
                      </>
                    ) : (
                      'Skipped'
                    )}
                    <button type="button" className="a-link" onClick={() => f.suggestion(s.id, 'pending')}>
                      Undo
                    </button>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// --- 8 · Our plan -------------------------------------------------------------------------------

function OurWeek() {
  const f = useFamily();
  const { coverage, meals, carry, committed } = f.state.reset;
  const tasks = f.state.tasks;
  const loose = looseEnds(tasks);
  const pile = (c: 'keep' | 'later' | 'drop') => tasks.filter((t) => carry[t.id] === c);
  const approved = suggestions.filter((s) => s.place === 'reset' && f.suggestionStatus(s.id) === 'approved');
  const unsorted = loose.filter((t) => !carry[t.id]).length;
  const days = [...new Set(coverageSlots.map((s) => s.date))];
  const cooks = nextWeekDays.map((d) => meals[d.date]?.cook).filter(Boolean) as PersonId[];

  return (
    <div className={cx('a-plan', committed && 'is-committed')}>
      <header className="a-plan-head">
        <p className="a-eyebrow">Nov 23–29 · {committed ? 'Saved together' : 'Draft'}</p>
        <h3 className="a-plan-title">Our week</h3>
        <p className="a-plan-lede">
          You’re in Denver Monday and Tuesday, so Theo has June. Wednesday is back to normal. Thursday is Thanksgiving,
          and daycare stays closed through Friday.
        </p>
        {committed ? (
          <p className="a-plan-saved">
            <CircleCheck {...icSm} aria-hidden="true" />
            Saved Sunday at 8:04pm. Theo has a copy (simulated).
          </p>
        ) : (
          <div className="a-plan-cta">
            <button type="button" className="a-btn a-btn--primary" onClick={() => f.commitPlan()}>
              <Check {...icSm} aria-hidden="true" />
              Save our plan
            </button>
            <span className="a-muted">
              {unsorted ? `${plural(unsorted, 'loose end')} not sorted yet. ` : ''}Theo gets a copy.
            </span>
          </div>
        )}
      </header>

      <div className="a-plan-grid">
        <section className="a-plan-sec">
          <h4 className="a-plan-h">June’s drop-offs and pickups</h4>
          <table className="a-plan-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Drop-off 8:15</th>
                <th scope="col">Pickup 5:30</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <th scope="row">{dayParts(d).long}</th>
                  {coverageSlots
                    .filter((s) => s.date === d)
                    .map((s) => {
                      const v = coverage[s.key];
                      return (
                        <td key={s.key}>
                          {v ? (
                            <span className="a-plan-who">
                              <Avatar id={v} size={18} /> {who(v)}
                            </span>
                          ) : (
                            <span className="a-late">Not covered</span>
                          )}
                        </td>
                      );
                    })}
                </tr>
              ))}
              <tr>
                <th scope="row">Thu, Fri</th>
                <td colSpan={2} className="a-muted">
                  Daycare closed · home together
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="a-plan-sec">
          <h4 className="a-plan-h">
            Dinners
            {cooks.length > 0 && (
              <span className="a-muted">
                {' '}
                ·{' '}
                {(['theo', 'maya'] as PersonId[])
                  .map((p) => [p, cooks.filter((c) => c === p).length] as const)
                  .filter(([, n]) => n > 0)
                  .map(([p, n]) => `${p === 'maya' ? 'you cook' : 'Theo cooks'} ${n}`)
                  .join(', ') || 'cooks not set'}
              </span>
            )}
          </h4>
          <ul className="a-plan-meals">
            {nextWeekDays.map((d) => {
              const m = meals[d.date];
              return (
                <li key={d.date}>
                  <span className="a-plan-day">{d.day}</span>
                  <span className={cx(!m && d.day !== 'Thu' && 'a-muted')}>
                    {m ? m.title : d.day === 'Thu' ? 'Thanksgiving dinner' : 'Open'}
                  </span>
                  {m && <OwnerMark owner={m.cook} size={18} />}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="a-plan-sec">
          <h4 className="a-plan-h">What you decided</h4>
          <ul className="a-plan-list">
            {f.state.decisions.map((d) => {
              const st = decisionState(d);
              return (
                <li key={d.id}>
                  <span className="a-plan-q">{d.question}</span>
                  <span className={cx('a-plan-a', st.kind === 'agreed' ? 'a-good' : 'a-attn')}>
                    {st.kind === 'agreed' ? st.text.replace('Agreed: ', '') : `Still open · ${d.dueLabel.toLowerCase()}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="a-plan-sec">
          <h4 className="a-plan-h">What carried over</h4>
          {(['keep', 'later', 'drop'] as const).map((c) => {
            const list = pile(c);
            if (!list.length) return null;
            return (
              <div key={c} className="a-plan-pile">
                <p className="a-label">{c === 'keep' ? 'Into next week' : c === 'later' ? 'Parked for later' : 'Let go'}</p>
                <ul>
                  {list.map((t) => (
                    <li key={t.id} className={cx(c === 'drop' && 'is-dropped')}>
                      <OwnerMark owner={t.owner} size={16} />
                      {t.title}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!Object.keys(carry).length && <p className="a-muted">Nothing sorted yet. Loose ends is chapter 3.</p>}
        </section>

        {approved.length > 0 && (
          <section className="a-plan-sec">
            <h4 className="a-plan-h">
              Help you said yes to <Simulated />
            </h4>
            <ul className="a-plan-list">
              {approved.map((s) => (
                <li key={s.id}>
                  <span className="a-plan-q">{s.action}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <p className="a-plan-foot">
        Next Weekly Reset: Sunday, November 29, {range('19:30', '20:15')}.
      </p>
    </div>
  );
}
