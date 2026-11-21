// Calendar, Household and Meals: present in navigation, designed once a direction is chosen.
import { CalendarDays, Users, UtensilsCrossed } from 'lucide-react';
import { people, type PersonId } from '../../data';
import type { Screen } from '../types';
import { Avatar } from './ui';

const COPY: Record<'calendar' | 'household' | 'meals', { title: string; line: string; will: string[]; Icon: typeof Users }> = {
  calendar: {
    title: 'Calendar',
    line: 'One calendar for the four of you, with June’s handoffs drawn in.',
    will: ['Week and day views, coloured by person', 'Drop-offs and pickups as plain sentences', 'Clashes flagged before they happen'],
    Icon: CalendarDays,
  },
  household: {
    title: 'Household',
    line: 'The people, places and details that make the Riveras run.',
    will: ['Who’s who, including Priya and Grandma Rosa', 'Little Oaks, the pediatrician, the contractor', 'Shared notes: wifi, codes, sizes'],
    Icon: Users,
  },
  meals: {
    title: 'Meals & groceries',
    line: 'Dinners for the week and one list you both shop from.',
    will: ['A week of dinners, with who’s cooking', 'Ideas you both like, kept for next time', 'A grocery list sorted by aisle'],
    Icon: UtensilsCrossed,
  },
};

export function Placeholder({ screen }: { screen: 'calendar' | 'household' | 'meals' }) {
  const c = COPY[screen];
  const members: PersonId[] = ['maya', 'theo', 'june', 'priya'];
  return (
    <div className="a-page a-ph">
      <p className="a-eyebrow">
        <c.Icon size={14} strokeWidth={2} aria-hidden="true" /> Designed after you choose a direction
      </p>
      <h2 className="a-greet">{c.title}</h2>
      <p className="a-summary">{c.line}</p>
      <div className="a-ph-sketch" aria-hidden="true">
        {screen === 'calendar' && (
          <div className="a-ph-cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <div key={d} className="a-ph-col">
                <span>{d}</span>
                <i style={{ top: 18 + ((i * 23) % 50), height: 26, background: i % 2 ? people.theo.tint : people.maya.tint }} />
                <i style={{ top: 92 + ((i * 17) % 40), height: 18, background: people.june.tint }} />
              </div>
            ))}
          </div>
        )}
        {screen === 'household' && (
          <ul className="a-ph-people">
            {members.map((m) => (
              <li key={m}>
                <Avatar id={m} size={36} />
                <span>
                  <b>{people[m].name}</b>
                  <small>{people[m].note ?? (people[m].role === 'adult' ? 'Adult' : '')}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
        {screen === 'meals' && (
          <ul className="a-ph-meals">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
              <li key={d}>
                <span>{d}</span>
                <i style={{ width: `${48 + ((i * 19) % 40)}%` }} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <h3 className="a-h4">What will live here</h3>
      <ul className="a-bullets">
        {c.will.map((w) => (
          <li key={w}>
            <span className="a-dot" aria-hidden="true" />
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { Screen };
