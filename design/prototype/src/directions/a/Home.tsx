// Home: "the day page". Reads top to bottom like a well-set page, not a dashboard.
import { Fragment, useState, type ReactNode } from 'react';
import { ArrowRight, BellRing, Hand, Lightbulb, Moon } from 'lucide-react';
import { events, NOW, suggestions, type FamilyEvent, type Task } from '../../data';
import { useFamily } from '../../store';
import type { Screen } from '../types';
import { CaptureBox } from './Capture';
import {
  TODAY,
  TOMORROW,
  adultsIn,
  clock,
  cx,
  dayParts,
  handoffSentence,
  isLate,
  meridiem,
  minutes,
  plural,
  range,
} from './helpers';
import { AvatarStack, DecisionBlock, OwnerMark, Simulated, TaskMeta, TaskRow, icSm, useStillVisible } from './ui';
import { people } from '../../data';

const isNew = (t: Task) => t.id.startsWith('new-');

export function HomeScreen({ go }: { go: (s: Screen) => void }) {
  const f = useFamily();
  const { tasks, decisions } = f.state;
  const visible = useStillVisible(tasks);
  const [open, setOpen] = useState<string | null>(null);

  const order = (a: Task, b: Task) =>
    Number(isNew(b)) - Number(isNew(a)) ||
    Number(isLate(b)) - Number(isLate(a)) ||
    (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99');

  const relevant = (t: Task, until = TODAY) => !t.waitingOn && ((t.due && t.due <= until) || isNew(t));
  const mine = tasks.filter((t) => t.owner === 'maya' && relevant(t) && visible(t)).sort(order);
  const theos = tasks.filter((t) => t.owner === 'theo' && relevant(t) && !t.done).sort(order);
  const shared = tasks.filter((t) => t.owner === null && relevant(t, TOMORROW) && visible(t)).sort(order);
  const theoLate = theos.filter(isLate).length;
  const openDecisions = decisions.filter((d) => !(d.votes.maya && d.votes.maya === d.votes.theo));

  return (
    <div className="a-page a-home">
      <header className="a-hello">
        <h2 className="a-greet">Good morning, Maya</h2>
        <p className="a-date">{NOW.label}</p>
        <p className="a-summary">
          <b>Theo</b> has drop-off, <b>you’re</b> home for the plumber from 1 to 3, and pickup is <b>yours</b>.
        </p>
      </header>

      <CaptureBox variant="inline" />

      <div className="a-home-grid">
        <section className="a-sec a-todaysec" aria-labelledby="a-today-h">
          <SectionHead id="a-today-h" title="Today" meta="9 things · 2 handoffs" />
          <TodayRail />
        </section>

        <div className="a-home-side">
          <section className="a-sec" aria-labelledby="a-plate-h">
            <SectionHead id="a-plate-h" title="On your plate" meta={plural(mine.filter((t) => !t.done).length, 'thing')} />
            {mine.length ? (
              <ul className="a-list">
                {mine.map((t) => (
                  <TaskRow key={t.id} task={t} expanded={open === t.id} onExpand={setOpen} showOwner={false} />
                ))}
              </ul>
            ) : (
              <p className="a-empty">Nothing due. Enjoy it.</p>
            )}
          </section>

          <section className="a-sec" aria-labelledby="a-theo-h">
            <SectionHead
              id="a-theo-h"
              title="Theo’s handling"
              meta={theoLate ? `${theoLate} running late` : plural(theos.length, 'thing')}
              metaTone={theoLate ? 'late' : undefined}
            />
            <ul className="a-list">
              {theos.map((t) => (
                <li key={t.id} className={cx('a-glance', isNew(t) && 'is-new')}>
                  <span className="a-glance-dot" style={{ borderColor: people.theo.color }} aria-hidden="true" />
                  <span className="a-glance-text">
                    <span className="a-task-title">{t.title}</span>
                    <TaskMeta task={t} />
                  </span>
                  <span className="a-glance-actions">
                    <button
                      type="button"
                      className="a-ghost"
                      aria-label={`Nudge Theo about ${t.title}`}
                      onClick={() => f.toast(`Nudged Theo about “${t.title}”`)}
                    >
                      <BellRing {...icSm} aria-hidden="true" />
                      <span className="a-ghost-label">Nudge</span>
                    </button>
                    <button type="button" className="a-ghost" aria-label={`Take ${t.title} yourself`} onClick={() => f.assign(t.id, 'maya')}>
                      <Hand {...icSm} aria-hidden="true" />
                      <span className="a-ghost-label">I’ll take it</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {shared.length > 0 && (
            <section className="a-sec" aria-labelledby="a-shared-h">
              <SectionHead id="a-shared-h" title="Up for grabs" meta="Either of you" />
              <ul className="a-list">
                {shared.map((t) => (
                  <TaskRow key={t.id} task={t} expanded={open === t.id} onExpand={setOpen} />
                ))}
              </ul>
            </section>
          )}

          <section className="a-sec" aria-labelledby="a-both-h">
            <SectionHead
              id="a-both-h"
              title="Needs both of you"
              meta={openDecisions.length ? plural(openDecisions.length, 'decision') : 'All settled'}
            />
            <div className="a-decisions">
              {decisions.map((d) => (
                <DecisionBlock key={d.id} decision={d} compact />
              ))}
            </div>
          </section>

          <section className="a-sec" aria-labelledby="a-next-h">
            <SectionHead
              id="a-next-h"
              title="Coming up"
              meta="Next 5 days"
              action={
                <button type="button" className="a-link" onClick={() => go('calendar')}>
                  Calendar <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              }
            />
            <ComingUp />
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHead({
  id,
  title,
  meta,
  metaTone,
  action,
}: {
  id: string;
  title: string;
  meta?: string;
  metaTone?: 'late';
  action?: ReactNode;
}) {
  return (
    <div className="a-sec-head">
      <h3 id={id} className="a-sec-title">
        {title}
      </h3>
      {meta && <span className={cx('a-sec-meta', metaTone === 'late' && 'a-late')}>{meta}</span>}
      {action && <span className="a-sec-action">{action}</span>}
    </div>
  );
}

function capColor(e: FamilyEvent) {
  if (e.handoff) return { fill: people.june.tint, edge: people.june.color };
  const adults = adultsIn(e.who);
  if (adults.length === 1) return { fill: people[adults[0]!].tint, edge: people[adults[0]!].color };
  return { fill: '#EDEAE2', edge: '#9C9A90' };
}

/** Quieter notes for the rail, where the event's own note repeats what the line already says. */
const RAIL_NOTE: Record<string, string> = { e5: 'You need to be home for the window' };

function TodayRail() {
  const today = events.filter((e) => e.date === TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const now = minutes(NOW.time);
  let nowShown = false;
  let eveningShown = false;
  const rows: ReactNode[] = [];
  today.forEach((e, i) => {
    const start = minutes(e.start);
    const end = minutes(e.end);
    if (!nowShown && start > now) {
      nowShown = true;
      rows.push(
        <li key="now" className="a-now" aria-label={`Now, ${clock(NOW.time)}`}>
          <span className="a-now-pill">{clock(NOW.time)}</span>
          <span className="a-now-line" aria-hidden="true" />
        </li>,
      );
    }
    if (!eveningShown && start >= 17 * 60) {
      eveningShown = true;
      rows.push(
        <li key="eve" className="a-evening">
          <Moon size={14} strokeWidth={2} aria-hidden="true" />
          This evening
        </li>,
      );
    }
    const c = capColor(e);
    const sentence = handoffSentence(e);
    const ongoing = start <= now && end > now;
    const past = end <= now;
    const h = Math.max(10, Math.min(44, (end - start) / 2.6));
    const detail = [range(e.start, e.end), e.location && !e.handoff && e.location !== 'Home' ? e.location : undefined].filter(Boolean).join(' · ');
    rows.push(
      <li key={e.id} className={cx('a-rail-item', ongoing && 'is-now', past && 'is-past', e.handoff && 'is-handoff')} style={{ ['--i' as string]: i }}>
        <span className="a-rail-time">
          <span className="a-num">{clock(e.start)}</span>
          <span className="a-mer">{meridiem(e.start)}</span>
        </span>
        <span className="a-rail-track" aria-hidden="true">
          <span className="a-rail-cap" style={{ height: h, background: c.fill, borderColor: c.edge }} />
        </span>
        <span className="a-rail-body">
          <span className="a-rail-title">
            {sentence ?? e.title}
            {ongoing && <span className="a-rail-tag">Now</span>}
          </span>
          <span className="a-rail-meta">
            {detail}
            {(RAIL_NOTE[e.id] ?? e.note) && <span className="a-rail-note"> · {RAIL_NOTE[e.id] ?? e.note}</span>}
          </span>
        </span>
        <span className="a-rail-who">
          <AvatarStack ids={e.who.filter((p) => p !== 'june' || !!e.handoff || e.who.length > 2)} size={22} />
        </span>
      </li>,
    );
  });
  return <ol className="a-rail">{rows}</ol>;
}

function ComingUp() {
  const f = useFamily();
  const s1 = suggestions.find((s) => s.id === 's1')!;
  const st = f.suggestionStatus('s1');
  const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  return (
    <ol className="a-upnext">
      {days.map((d) => {
        const p = dayParts(d);
        const evs = events.filter((e) => e.date === d).sort((a, b) => a.start.localeCompare(b.start));
        const todos = f.state.tasks.filter((t) => t.due === d && !t.done).length;
        return (
          <Fragment key={d}>
            <li className="a-up-day">
              <span className="a-up-date">
                <span className="a-up-num">{p.num}</span>
                <span className="a-up-wd">{p.short}</span>
              </span>
              <ul className="a-up-items">
                {evs.map((e) => {
                  const clash = e.id === 'e14';
                  const settled = clash && st === 'approved';
                  return (
                    <li key={e.id} className={cx('a-up-item', clash && !settled && 'is-clash')}>
                      <span className="a-up-time">{clock(e.start)}</span>
                      <span className="a-up-title">
                        {settled ? 'Theo picks up June (asked)' : (handoffSentence(e) ?? e.title)}
                        {clash && !settled && <span className="a-clash">Clash</span>}
                      </span>
                      <span className="a-up-who">
                        {settled ? <OwnerMark owner="theo" size={18} /> : <AvatarStack ids={adultsIn(e.who)} size={18} />}
                      </span>
                    </li>
                  );
                })}
                {todos > 0 && (
                  <li className="a-up-item is-todos">
                    <span className="a-up-time" />
                    <span className="a-up-title">{plural(todos, 'to-do')} due</span>
                  </li>
                )}
              </ul>
            </li>
            {d === '2026-11-19' && st !== 'dismissed' && (
              <li className={cx('a-thought', st === 'approved' && 'is-done')}>
                <div className="a-thought-head">
                  <Lightbulb {...icSm} aria-hidden="true" />
                  <span className="a-thought-label">A thought</span>
                  <Simulated />
                </div>
                {st === 'pending' ? (
                  <>
                    <p className="a-thought-title">{s1.title}</p>
                    <p className="a-thought-detail">{s1.detail}</p>
                    <div className="a-thought-actions">
                      <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => f.suggestion('s1', 'approved')}>
                        {s1.action}
                      </button>
                      <button type="button" className="a-btn a-btn--quiet a-btn--sm" onClick={() => f.suggestion('s1', 'dismissed')}>
                        Not now
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="a-thought-detail">Asked Theo to take Thursday pickup. He’ll see it next time he opens the app.</p>
                )}
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

