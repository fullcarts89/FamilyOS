import type { CSSProperties } from 'react';
import { Bath, Car } from 'lucide-react';
import { NOW, people, type FamilyEvent, type PersonId } from '../../data';
import { useFamily } from '../../store';
import {
  clock,
  clockFull,
  DAY_END,
  DAY_START,
  eventsOn,
  frac,
  isTogether,
  juneDay,
  NOW_MIN,
  range,
  toMin,
  type JuneSeg,
} from './lib';
import { Avatar, useRhythm, useSize, type Lane } from './ui';

const ORDER: Lane[] = ['maya', 'june', 'theo'];

interface Geo {
  vertical: boolean;
  len: number; // track length along the time axis
  thick: number; // track size across lanes
  lanes: Record<Lane, { a: number; t: number }>;
  along: (min: number) => number;
}

function geometry(vertical: boolean, w: number): Geo {
  if (!vertical) {
    const lanes = { maya: { a: 0, t: 60 }, june: { a: 84, t: 44 }, theo: { a: 152, t: 60 } };
    return { vertical, len: w, thick: 212, lanes, along: (m) => frac(m) * w };
  }
  const ch = 10;
  const unit = (w - ch * 2) / 3;
  const len = 16 * 48;
  const lanes = { maya: { a: 0, t: unit }, june: { a: unit + ch, t: unit }, theo: { a: unit * 2 + ch * 2, t: unit } };
  return { vertical, len, thick: w, lanes, along: (m) => frac(m) * len };
}

function box(g: Geo, start: number, end: number, a: number, t: number): CSSProperties {
  const p0 = g.along(start);
  const p1 = g.along(end);
  return g.vertical
    ? { top: p0, height: p1 - p0, left: a, width: t }
    : { left: p0, width: p1 - p0, top: a, height: t };
}

export function Timeline() {
  const { phone } = useRhythm();
  const [ref, size] = useSize<HTMLDivElement>();
  const g = geometry(phone, size.w);
  const day = eventsOn(NOW.date);
  const together = day.filter(isTogether);
  const june = juneDay(NOW.date);
  const ready = size.w > 0;

  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);

  return (
    <section className={`c-tl ${phone ? 'v' : 'h'}`} aria-label="Today's rhythm, 6am to 10pm">
      {phone && <LaneHeads />}
      <div className="c-tl-body">
        {!phone && <LaneHeads />}
        <div className="c-tl-trackwrap">
          <div className="c-tl-axis" aria-hidden="true" style={phone ? { height: g.len } : undefined}>
            {ready &&
              hours.filter((m) => Math.abs(m - NOW_MIN) > 22).map((m) => (
                <span
                  key={m}
                  className={`c-tl-hour ${m === 12 * 60 ? 'noon' : ''}`}
                  style={phone ? { top: g.along(m) } : { left: g.along(m) }}
                >
                  {hourLabel(m)}
                </span>
              ))}
          </div>
          <div className="c-tl-track" ref={ref} style={phone ? { height: g.len } : { height: g.thick }}>
            {ready && (
              <>
                {ORDER.map((l) => (
                  <div
                    key={l}
                    className={`c-tl-lane l-${l}`}
                    data-lane={l}
                    style={g.vertical ? { top: 0, height: g.len, left: g.lanes[l].a, width: g.lanes[l].t } : { left: 0, width: g.len, top: g.lanes[l].a, height: g.lanes[l].t }}
                  />
                ))}
                {hours.map((m) => (
                  <i key={m} className="c-tl-grid" style={g.vertical ? { top: g.along(m) } : { left: g.along(m) }} />
                ))}
                {together.map((e) => (
                  <div key={e.id} className="c-tl-band" style={box(g, toMin(e.start), toMin(e.end), 0, g.thick)} title={`${e.title} · everyone`}>
                    {g.vertical && <span>{e.title.split(':')[0]}</span>}
                  </div>
                ))}
                {(['maya', 'theo'] as const).map((l) =>
                  day
                    .filter((e) => e.who.includes(l) && !isTogether(e))
                    .map((e) => <EventBlock key={`${l}-${e.id}`} e={e} lane={l} g={g} />),
                )}
                {june.map((s, i) => (
                  <JuneBlock key={i} s={s} g={g} />
                ))}
                {june
                  .filter((s) => s.place === 'with' && s.with[0])
                  .map((s, i) => (
                    <Bridge key={i} s={s} g={g} />
                  ))}
                <div className="c-tl-past" style={box(g, DAY_START, NOW_MIN, -6, g.thick + 12)} aria-hidden="true" />
                <div className="c-tl-now" style={g.vertical ? { top: g.along(NOW_MIN) } : { left: g.along(NOW_MIN) }} aria-label={`Now, ${NOW.time}`}>
                  <span>{clockFull(NOW.time)}</span>
                </div>
              </>
            )}
          </div>
          {!phone && ready && (
            <div className="c-tl-foot" aria-hidden="true">
              {together.map((e) => (
                <span key={e.id} style={{ left: g.along((toMin(e.start) + toMin(e.end)) / 2) }}>
                  {e.title.split(':')[0]}, all three
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function hourLabel(m: number): string {
  const h = m / 60;
  if (h === 6) return '6am';
  if (h === 12) return 'noon';
  if (h === 18) return '6pm';
  if (h === 22) return '10pm';
  return String(h > 12 ? h - 12 : h);
}

function EventBlock({ e, lane, g }: { e: FamilyEvent; lane: 'maya' | 'theo'; g: Geo }) {
  const s = toMin(e.start);
  const en = toMin(e.end);
  const L = g.lanes[lane];
  const pad = g.vertical ? 3 : 7;
  const style = box(g, s, en, L.a + pad, L.t - pad * 2);
  const px = g.along(en) - g.along(s);
  const care = e.kind === 'childcare' || (e.kind === 'routine' && e.who.includes('june'));
  const label0 = e.title.replace('Plumber: bathroom rough-in', 'Plumber, home 1–3');
  const roomy = g.vertical ? px >= 34 : px >= Math.max(62, label0.length * 7.4 + 22);
  const p = people[lane];
  if (g.vertical && px < 24) style.height = 24;
  const label = label0;
  return (
    <div
      className={`c-ev ${care ? 'care' : ''} ${roomy ? '' : 'tight'}`}
      data-lane={care ? `${lane} june` : lane}
      style={{ ...style, '--pc': p.color, '--pt': p.tint } as CSSProperties}
      title={`${e.title} · ${range(e.start, e.end)}${e.location ? ` · ${e.location}` : ''}`}
    >
      {care && <CareGlyph e={e} px={px} vertical={g.vertical} />}
      {!care && (roomy || g.vertical) && (
        <>
          <b>{label}</b>
          {(g.vertical ? px >= 40 : px >= 96) && <span>{range(e.start, e.end)}</span>}
        </>
      )}
      {!care && !roomy && !g.vertical && (
        <span className="c-ev-out">
          <b>{label}</b> {clock(e.start)}
        </span>
      )}
    </div>
  );
}

/** Handoffs show a car, bedtime a bath: no colored block is left unexplained. */
function CareGlyph({ e, px, vertical }: { e: FamilyEvent; px: number; vertical: boolean }) {
  const size = vertical ? 13 : px < 30 ? 14 : 16;
  const label = e.handoff ? (e.handoff.to === 'daycare' ? 'Drop-off' : 'Pickup') : 'Bath';
  return (
    <span className="c-ev-glyph" aria-label={`${label} ${range(e.start, e.end)}`}>
      {e.handoff ? <Car size={size} strokeWidth={2.4} /> : <Bath size={size} strokeWidth={2.4} />}
    </span>
  );
}

function JuneBlock({ s, g }: { s: JuneSeg; g: Geo }) {
  const L = g.lanes.june;
  const pad = g.vertical ? 3 : 6;
  const style = box(g, s.start, s.end, L.a + pad, L.t - pad * 2) as CSSProperties & Record<string, string | number>;
  const px = g.along(s.end) - g.along(s.start);
  const by = s.with.length === 1 ? s.with[0] : undefined;
  if (by) {
    style['--pc'] = people[by].color;
  }
  const lanes = by ? `june ${by}` : 'june';
  let text = s.label;
  if (s.place === 'home' && px > 150 && !g.vertical) text = 'Home with you both';
  if (s.place === 'care' && px > 260 && !g.vertical) text = 'Little Oaks · Sunflower room';
  return (
    <div className={`c-jseg ${s.place}`} data-lane={lanes} style={style} title={`${s.label || `With ${by ? people[by].name : ''}`} · ${clock(s.start)}–${clock(s.end)}`}>
      {px > (g.vertical ? 22 : 40) && text && <span>{text}</span>}
    </div>
  );
}

/** A handoff: the adult's block flows across the channel into June's lane. */
function Bridge({ s, g }: { s: JuneSeg; g: Geo }) {
  const by = s.with[0] as PersonId;
  const adult = g.lanes[by as 'maya' | 'theo'];
  const J = g.lanes.june;
  const above = adult.a < J.a;
  const a0 = above ? adult.a + adult.t - 7 : J.a + J.t - 6;
  const a1 = above ? J.a + 6 : adult.a + 7;
  const style = box(g, s.start, s.end, a0, a1 - a0);
  const p = people[by];
  const ev = s.eventId ? eventsOn(NOW.date).find((e) => e.id === s.eventId) : undefined;
  const who = by === 'maya' ? 'You' : p.name;
  let text = '';
  if (ev?.handoff?.to === 'daycare') text = `${who} ${by === 'maya' ? 'drop' : 'drops'} June at Little Oaks`;
  else if (ev?.handoff?.from === 'daycare') text = `${who} ${by === 'maya' ? 'pick' : 'picks'} June up`;
  else if (ev) text = `Bath and bed: ${who}`;
  const labelPos: CSSProperties = g.vertical
    ? {}
    : { left: g.along(s.end) + 8, top: above ? adult.a + adult.t + 1 : J.a + J.t + 1 };
  return (
    <>
      <div className="c-bridge" data-lane={`june ${by}`} style={{ ...style, '--pc': p.color } as CSSProperties} aria-hidden="true">
        <i />
        <i />
      </div>
      {!g.vertical && text && (
        <div className="c-bridge-label" data-lane={`june ${by}`} style={{ ...labelPos, '--pc': p.color } as CSSProperties}>
          <b>{clock(ev?.start ?? '00:00')}</b> {text}
        </div>
      )}
    </>
  );
}

function LaneHeads() {
  const { state } = useFamily();
  const { popped, focus, setFocus } = useRhythm();
  const june = juneDay(NOW.date);
  const care = june.find((s) => s.place === 'care');
  return (
    <div className="c-tl-heads">
      {ORDER.map((l) => {
        const p = people[l];
        const load =
          l === 'june'
            ? []
            : state.tasks
                .filter((t) => t.owner === l && t.due && t.due <= NOW.date && !t.waitingOn)
                .sort((a, b) => Number(b.done) - Number(a.done));
        const done = load.filter((t) => t.done).length;
        return (
          <button
            type="button"
            key={l}
            className={`c-tl-head l-${l} ${focus === l ? 'on' : ''}`}
            data-lane={l}
            aria-pressed={focus === l}
            onClick={() => setFocus(focus === l ? null : l)}
            style={{ '--pc': p.color, '--pt': p.tint } as CSSProperties}
          >
            <Avatar id={l} size={26} />
            <span className="c-tl-head-txt">
              <b>{l === 'maya' ? 'You' : p.name}</b>
              {l === 'june' ? (
                <small>{care ? `Little Oaks ${clock(care.start)}–${clock(care.end)}` : 'Home today'}</small>
              ) : (
                <small className="c-beads" aria-label={`${done} of ${load.length} done today`}>
                  {load.map((t) => (
                    <i key={t.id} className={`${t.done ? 'f' : ''} ${popped === t.id && t.done ? 'pop' : ''}`} />
                  ))}
                  <em>
                    {done}/{load.length}
                  </em>
                </small>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
