// Two-person decisions: Maya votes, Theo's vote is shown. Used on Home and in the Weekly Reset.
import { Check } from 'lucide-react';
import type { Decision } from '../../data';
import { useFamily } from '../../store';
import { Avatar } from './ui';
import { cx } from './util';

export function decisionState(d: Decision): { label: string; tone: 'good' | 'warn' | 'wait' | 'none' } {
  const m = d.votes.maya;
  const t = d.votes.theo;
  if (m && t && m === t) return { label: `Agreed: ${d.options.find((o) => o.id === m)?.label}`, tone: 'good' };
  if (m && t) return { label: 'Split. Talk it through', tone: 'warn' };
  if (t && !m) return { label: 'Theo voted. Your turn', tone: 'wait' };
  if (m && !t) return { label: 'Waiting on Theo', tone: 'none' };
  return { label: 'No votes yet', tone: 'wait' };
}

export function DecisionRow({ d, large }: { d: Decision; large?: boolean }) {
  const f = useFamily();
  const st = decisionState(d);
  return (
    <div className={cx('b-dec', large && 'is-large', `is-${st.tone}`)}>
      <div className="b-dec-main">
        <div className="b-dec-q">
          {st.tone === 'good' && <Check size={14} strokeWidth={2} className="b-good" />}
          {d.question}
        </div>
        <div className="b-dec-meta">
          <span className="mono">{d.dueLabel}</span>
          <span className={cx('b-dec-state', `is-${st.tone}`)}>{st.label}</span>
        </div>
        {large && <p className="b-dec-ctx">{d.context}</p>}
      </div>
      <div className="b-dec-opts" role="group" aria-label={`Vote: ${d.question}`}>
        {d.options.map((o) => {
          const mine = d.votes.maya === o.id;
          const theo = d.votes.theo === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={cx('b-vote', mine && 'is-mine')}
              aria-pressed={mine}
              onClick={() => f.vote(d.id, mine ? undefined : o.id, 'maya')}
              title={o.detail}
            >
              <span className="b-vote-text">
                <span className="b-vote-label">{o.label}</span>
                {large && <span className="b-vote-detail">{o.detail}</span>}
              </span>
              <span className="b-vote-avs">
                {theo && <Avatar id="theo" size={16} title="Theo voted for this" />}
                {mine ? <Avatar id="maya" size={16} title="Your vote" /> : <span className="b-vote-empty" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
