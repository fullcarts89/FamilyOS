import type { CSSProperties } from 'react';
import { people } from '../../data';
import type { Screen } from '../types';
import { useRhythm } from './ui';

const COPY: Record<string, { title: string; line: string; lanes: [number, number][][] }> = {
  calendar: {
    title: 'Week',
    line: 'Seven days of the same lanes, side by side: who has June each morning and evening, and where the week gets tight.',
    lanes: [
      [[8, 22], [30, 18], [62, 12]],
      [[10, 30], [48, 8], [70, 14]],
      [[4, 14], [20, 52], [78, 18]],
    ],
  },
  household: {
    title: 'Household',
    line: 'The Riveras: Maya, Theo, June and Priya the sitter. Colors, places, the people who help, and the details everyone keeps forgetting.',
    lanes: [
      [[6, 40], [52, 30]],
      [[12, 24], [44, 40]],
      [[2, 70]],
    ],
  },
  meals: {
    title: 'Meals & groceries',
    line: 'Dinners as a row in the week, who cooks, and one list you both add to at the store.',
    lanes: [
      [[70, 12]],
      [[64, 14], [82, 8]],
      [[66, 16]],
    ],
  },
};

export function Placeholder({ screen }: { screen: Screen }) {
  const { go } = useRhythm();
  const c = COPY[screen] ?? COPY.calendar!;
  const order = ['maya', 'june', 'theo'] as const;
  return (
    <div className="c-page c-ph">
      <div className="c-kicker">Designed after you choose a direction</div>
      <h1>{c.title}</h1>
      <p>{c.line}</p>
      <div className="c-ph-art" aria-hidden="true">
        {order.map((p, i) => (
          <div key={p} className="c-ph-lane" style={{ '--pc': people[p].color, '--pt': people[p].tint } as CSSProperties}>
            {c.lanes[i]!.map(([l, w], j) => (
              <i key={j} style={{ left: `${l}%`, width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="c-btn ink" onClick={() => go('home')}>
        Back to today
      </button>
    </div>
  );
}
