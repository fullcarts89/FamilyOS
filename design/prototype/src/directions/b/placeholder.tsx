// "Designed after you choose" placeholders for Calendar, Household and Meals, each with a quiet
// preview drawn from the real household data so the space never looks empty.
import { CalendarDays, House, UtensilsCrossed } from 'lucide-react';
import { household, mealsThisWeek as thisWeekMeals, people, type PersonId } from '../../data';
import { PageHeader } from './header';
import { Avatar } from './ui';
import { eventsOn, leadOf, restOfWeek, toMin, weekday, dayNum, clock } from './util';

const COPY = {
  calendar: {
    title: 'Calendar',
    icon: CalendarDays,
    lines: ['Week and day views colored by person', 'June’s handoffs on every day', 'Conflicts flagged before they happen'],
  },
  household: {
    title: 'Household',
    icon: House,
    lines: ['People, sitters and daycare contacts', 'Home records: warranties, filters, paint colors', 'Who can see and change what'],
  },
  meals: {
    title: 'Meals',
    icon: UtensilsCrossed,
    lines: ['A running list of dinners that work', 'Plan the week, then build the grocery list', 'Who cooks, and what June eats'],
  },
} as const;

export function Placeholder({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind];
  const Icon = c.icon;
  return (
    <>
      <PageHeader crumbs={[c.title]} />
      <div className="b-scroll">
        <div className="b-ph">
          <div className="b-ph-intro">
            <span className="b-ph-icon">
              <Icon size={16} strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="b-ph-title">{c.title}</h1>
              <p className="b-ph-sub">Designed after you choose a direction. Here’s what it will hold.</p>
            </div>
          </div>
          <ul className="b-ph-lines">
            {c.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="b-ph-preview" aria-hidden="true">
            {kind === 'calendar' && <CalPreview />}
            {kind === 'household' && <HouseholdPreview />}
            {kind === 'meals' && <MealsPreview />}
          </div>
        </div>
      </div>
    </>
  );
}

function CalPreview() {
  const H0 = 7 * 60;
  return (
    <div className="b-phcal">
      {restOfWeek.map((d) => (
        <div key={d} className="b-phcal-day">
          <div className="b-phcal-head">
            {weekday(d)} <span className="mono">{dayNum(d)}</span>
          </div>
          <div className="b-phcal-body">
            {eventsOn(d).map((e) => {
              const lead = leadOf(e);
              return (
                <span
                  key={e.id}
                  className="b-phcal-ev"
                  style={{
                    top: ((toMin(e.start) - H0) / 60) * 14,
                    height: Math.max(10, ((toMin(e.end) - toMin(e.start)) / 60) * 14 - 2),
                    background: lead ? people[lead].tint : '#F4F4F5',
                    borderColor: lead ? people[lead].color : '#A1A1AA',
                  }}
                >
                  <span className="clock">{clock(e.start)}</span> {e.title}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function HouseholdPreview() {
  return (
    <div className="b-phlist">
      {household.members.map((id: PersonId) => (
        <div key={id} className="b-phlist-row">
          <Avatar id={id} size={20} />
          <span>{people[id].name}</span>
          <span className="b-faint">{people[id].note ?? (id === 'maya' ? 'You' : 'Partner')}</span>
        </div>
      ))}
    </div>
  );
}

function MealsPreview() {
  return (
    <div className="b-phlist">
      {thisWeekMeals.map((m) => (
        <div key={m.date} className="b-phlist-row">
          <span className="mono b-faint">{m.day}</span>
          <span>{m.title}</span>
          {m.cook ? <Avatar id={m.cook} size={16} /> : <span />}
        </div>
      ))}
    </div>
  );
}
