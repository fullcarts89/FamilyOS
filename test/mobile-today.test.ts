import { describe, expect, it } from 'vitest';
import type { NextEntry } from '../apps/mobile/components/rhythm/NextUp';
import type { Activity, Occurrence } from '../apps/mobile/lib/api';
import {
  allDayOn,
  awayRails,
  awayWords,
  byStart,
  clashes,
  contrast,
  lateWords,
  railRows,
  readableOn,
  shortTitle,
  solidFill,
  splitTonight,
  textOn,
  textShade,
  verticalDay,
} from '../apps/mobile/components/rhythm/today-model';
import { choosablePalette, color, tint } from '../apps/mobile/design/tokens';
import type { Person } from '../apps/mobile/lib/people';

// A synthetic household day in Los Angeles (UTC-8 in November).
const TZ = 'America/Los_Angeles';
const DATE = '2026-11-19';
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 19, h + 8, m)).toISOString();

const person = (id: string, name: string, color: string, caredFor = false): Person => ({
  id,
  name,
  initial: name[0] ?? '?',
  color,
  tint: color,
  role: caredFor ? 'child' : 'adult',
  isMe: name === 'Maya',
  assignable: !caredFor,
  caredFor,
  species: null,
  note: null,
  version: 1,
});
const MAYA = person('m', 'Maya', '#D2553F');
const THEO = person('t', 'Theo', '#2F6FB3');
const JUNE = person('j', 'June', '#D99A1C', true);

const entry = (
  key: string,
  start: [number, number],
  end: [number, number],
  people: Person[],
  kind: NextEntry['kind'] = 'event',
): NextEntry => ({
  key,
  startsAt: at(...start),
  endsAt: at(...end),
  title: key,
  sub: '',
  people,
  kind,
});

const DAY: NextEntry[] = [
  entry('Breakfast', [7, 15], [7, 45], [MAYA, THEO, JUNE]),
  entry('Drop-off', [8, 15], [8, 35], [THEO, JUNE], 'care'),
  entry('Design review', [9, 30], [10, 30], [MAYA]),
  entry('Dentist', [11, 0], [11, 45], [THEO]),
  entry('Quarterly planning', [14, 0], [18, 0], [MAYA]),
  entry('Pickup', [17, 30], [17, 50], [MAYA, JUNE], 'care'),
  entry('Dinner', [18, 15], [19, 0], [MAYA, THEO, JUNE]),
  entry('Bath and bedtime', [19, 15], [19, 15], [THEO], 'task'),
];

describe('Tonight', () => {
  it('groups what starts at or after 5pm household time; what is under way stays with now', () => {
    const { soon, tonight } = splitTonight(DAY, new Date(at(16, 30)), TZ);
    expect(soon.map((e) => e.key)).toEqual(['Quarterly planning']);
    expect(tonight.map((e) => e.key)).toEqual(['Pickup', 'Dinner', 'Bath and bedtime']);
  });

  it('after 5pm the whole rest of the day is tonight, including a pickup under way', () => {
    const { soon, tonight } = splitTonight(DAY, new Date(at(17, 40)), TZ);
    expect(soon.map((e) => e.key)).toEqual(['Quarterly planning']);
    expect(tonight.map((e) => e.key)).toEqual(['Pickup', 'Dinner', 'Bath and bedtime']);
    expect(splitTonight(DAY, new Date(at(18, 5)), TZ).soon).toEqual([]);
  });

  it('a tomorrow-morning entry is never tonight', () => {
    const early = entry('Tomorrow early', [24 + 7, 0], [24 + 8, 0], [MAYA]);
    const { soon, tonight } = splitTonight([early], new Date(at(16, 30)), TZ);
    expect(soon).toEqual([]);
    expect(tonight).toEqual([]);
  });
});

describe('the phone’s vertical day', () => {
  const rows = verticalDay({ entries: DAY, date: DATE, timeZone: TZ, now: new Date(at(16, 30)) });

  it('lists items, hours and the now-line in time order', () => {
    const minutes = rows.map((r) => r.minutes);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    const now = rows.findIndex((r) => r.kind === 'now');
    const pickup = rows.findIndex((r) => r.key === 'Pickup');
    const planning = rows.findIndex((r) => r.key === 'Quarterly planning');
    expect(planning).toBeLessThan(now);
    expect(now).toBeLessThan(pickup);
  });

  it('marks the 5pm hour as the start of tonight and skips an hour an item already shows', () => {
    expect(rows.find((r) => r.kind === 'hour' && r.minutes === 17 * 60)).toMatchObject({
      tonight: true,
    });
    // The dentist is at 11am: no separate "11am" hour mark above it.
    expect(rows.some((r) => r.kind === 'hour' && r.minutes === 11 * 60)).toBe(false);
    expect(rows.some((r) => r.kind === 'hour' && r.minutes === 9 * 60)).toBe(true);
  });

  it('knows what is past and what is under way', () => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('Design review')).toMatchObject({ past: true, ongoing: false });
    expect(byKey.get('Quarterly planning')).toMatchObject({ past: false, ongoing: true });
    expect(byKey.get('Dinner')).toMatchObject({ past: false, ongoing: false });
  });

  it('runs a child’s daycare rail from the drop-off row to the pickup row', () => {
    const lanes = [
      {
        memberId: JUNE.id,
        caredFor: true,
        segments: [
          {
            startsAt: at(0),
            endsAt: at(8, 15),
            location: { kind: 'home' as const },
            withMemberIds: [THEO.id],
          },
          {
            startsAt: at(8, 15),
            endsAt: at(17, 30),
            location: { kind: 'away' as const, place: 'Little Oaks' },
            withMemberIds: [],
          },
        ],
      },
    ];
    const rails = awayRails(lanes, DATE, TZ);
    expect(rails).toEqual([
      { memberId: JUNE.id, start: 8 * 60 + 15, end: 17 * 60 + 30, place: 'Little Oaks' },
    ]);
    const [daycare] = rails;
    if (!daycare) throw new Error('expected a daycare rail');
    const span = railRows(rows, daycare);
    expect(span && rows[span.first]?.key).toBe('Drop-off');
    expect(span && rows[span.last]?.key).toBe('Pickup');
  });
});

describe('the night the clocks go back', () => {
  // 2026-11-01 in Los Angeles: 1:00–1:59am happens twice (PDT, then PST).
  const date = '2026-11-01';
  const firstOneThirty = entry('Feed, first 1:30am', [0, 0], [0, 0], [MAYA]);
  firstOneThirty.startsAt = firstOneThirty.endsAt = '2026-11-01T08:30:00.000Z'; // 1:30am PDT
  const secondOneFifteen = entry('Feed, second 1:15am', [0, 0], [0, 0], [THEO]);
  secondOneFifteen.startsAt = secondOneFifteen.endsAt = '2026-11-01T09:15:00.000Z'; // 1:15am PST
  const breakfast = entry('Breakfast', [0, 0], [0, 0], [MAYA, THEO]);
  breakfast.startsAt = '2026-11-01T15:00:00.000Z'; // 7am PST
  breakfast.endsAt = '2026-11-01T15:30:00.000Z';

  it('keeps the repeated hour in the order it happened', () => {
    const rows = verticalDay({
      entries: [breakfast, secondOneFifteen, firstOneThirty],
      date,
      timeZone: TZ,
      now: new Date('2026-11-01T16:00:00.000Z'),
    });
    const items = rows.filter((r) => r.kind === 'item').map((r) => r.key);
    expect(items).toEqual(['Feed, first 1:30am', 'Feed, second 1:15am', 'Breakfast']);
    // The 1am mark (the first one) comes before both feeds; the now-line after breakfast.
    const keys = rows.map((r) => r.key);
    expect(keys.indexOf('h60')).toBeLessThan(keys.indexOf('Feed, first 1:30am'));
    expect(keys.indexOf('Breakfast')).toBeLessThan(keys.indexOf('now'));
  });

  it('sorts day entries by instant', () => {
    expect([breakfast, secondOneFifteen, firstOneThirty].sort(byStart).map((e) => e.key)).toEqual([
      'Feed, first 1:30am',
      'Feed, second 1:15am',
      'Breakfast',
    ]);
  });
});

describe('readable color', () => {
  it('every color a member can choose carries 4.5:1 text when it is a fill', () => {
    expect(choosablePalette).toHaveLength(12);
    for (const hex of choosablePalette) {
      const fill = solidFill(hex);
      expect(contrast(textOn(fill), fill), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps a member’s own color as the fill whenever white or ink already reads on it', () => {
    expect(solidFill('#D99A1C')).toBe('#D99A1C');
    expect(textOn('#D99A1C')).toBe('#17201B');
    expect(solidFill('#2F6FB3')).toBe('#2F6FB3');
    expect(textOn('#2F6FB3')).toBe('#FFFFFF');
    // Coral sits between the two: deepened just enough for white text.
    expect(solidFill('#D2553F')).not.toBe('#D2553F');
    expect(textOn(solidFill('#D2553F'))).toBe('#FFFFFF');
  });

  it('every member color reads as text on white and on its own tint', () => {
    for (const hex of choosablePalette) {
      expect(contrast(readableOn(hex), '#FFFFFF'), hex).toBeGreaterThanOrEqual(4.5);
      const tinted = tint(hex, 0.1);
      expect(contrast(readableOn(hex, tinted), tinted), hex).toBeGreaterThanOrEqual(4.5);
    }
    // Dark enough already: left alone.
    expect(readableOn('#2F6FB3')).toBe('#2F6FB3');
  });

  it('muted text on a lane or a tint keeps its coarser shade (5.01:1 on the lane)', () => {
    const onLane = textShade(color.muted, color.lane);
    expect(contrast(onLane, color.lane)).toBeCloseTo(5.01, 2);
    for (const hex of choosablePalette) {
      const bg = tint(hex, 0.16);
      expect(contrast(textShade(color.muted, bg), bg), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shortens a title to the part before a colon or bracket', () => {
    expect(shortTitle('Dinner: sheet-pan salmon')).toBe('Dinner');
    expect(shortTitle('Quarterly planning (runs late)')).toBe('Quarterly planning');
    expect(shortTitle('Laundry')).toBe('Laundry');
  });
});

describe('the headline’s late count', () => {
  it('counts yours first, then each other adult and the shared list', () => {
    expect(lateWords({ mine: 1, others: [{ name: 'Theo', count: 2 }], shared: 0 })).toBe(
      '1 of yours is running late · Theo has 2',
    );
    expect(lateWords({ mine: 3, others: [{ name: 'Theo', count: 0 }], shared: 1 })).toBe(
      '3 of yours are running late · 1 shared',
    );
    expect(lateWords({ mine: 0, others: [{ name: 'Theo', count: 2 }], shared: 0 })).toBe(
      'Nothing of yours is late · Theo has 2',
    );
    expect(lateWords({ mine: 0, others: [{ name: 'Theo', count: 0 }], shared: 0 })).toBeNull();
  });
});

describe('back after days away', () => {
  const people = {
    byId: (id: string | null | undefined) => (id === 't' ? THEO : id === 'm' ? MAYA : null),
  };
  const did = (n: number, action: Activity['action'] = 'task.completed', actor = 't'): Activity[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${action}${i}`,
      at: '2026-11-19T18:00:00Z',
      actorMemberId: actor,
      action,
      entityType: 'work_item',
      entityId: `w${i}`,
      title: `Thing ${i}`,
      memberId: null,
    }));
  const base = { today: DATE, timeZone: TZ, people };

  it('one line after two or more days: what Theo handled, and what needs you', () => {
    expect(
      awayWords({
        ...base,
        since: '2026-11-15T17:00:00Z',
        activity: [...did(5), ...did(1, 'routine.done'), ...did(2, 'task.assigned')],
        needYou: 3,
      }),
    ).toBe('While you were away: Theo handled 6 things; 3 need you.');
    expect(awayWords({ ...base, since: '2026-11-16T17:00:00Z', activity: [], needYou: 1 })).toBe(
      'While you were away: 1 needs you.',
    );
  });

  it('nothing on an ordinary day, or before the activity has loaded', () => {
    expect(
      awayWords({ ...base, since: '2026-11-18T17:00:00Z', activity: did(3), needYou: 3 }),
    ).toBeNull();
    expect(awayWords({ ...base, since: null, activity: did(3), needYou: 3 })).toBeNull();
    expect(
      awayWords({ ...base, since: '2026-11-10T17:00:00Z', activity: null, needYou: 3 }),
    ).toBeNull();
  });

  it('never counts your own activity', () => {
    expect(
      awayWords({
        ...base,
        since: '2026-11-15T17:00:00Z',
        activity: did(4, 'task.completed', 'm'),
        needYou: 0,
      }),
    ).toBe('While you were away: nothing needs you.');
  });
});

describe('all-day events', () => {
  const allDay = (
    key: string,
    title: string,
    from: string,
    to: string,
    extra: Partial<Occurrence> = {},
  ) =>
    ({
      key,
      title,
      allDay: true,
      skipped: false,
      startsAt: from,
      endsAt: to,
      memberIds: [],
      ...extra,
    }) as Occurrence;
  // Local midnights in Los Angeles (UTC-8).
  const day = (d: string) => `${d}T08:00:00.000Z`;

  it('lists today’s all-day events once each, including one that spans several days', () => {
    const closed = allDay('closed', 'School closed', day('2026-11-19'), day('2026-11-20'));
    const trip = allDay('trip', 'Grandma visits', day('2026-11-18'), day('2026-11-22'));
    const tomorrow = allDay('tmrw', 'Tomorrow thing', day('2026-11-20'), day('2026-11-21'));
    const skipped = allDay('skip', 'Skipped', day('2026-11-19'), day('2026-11-20'), {
      skipped: true,
    });
    const timed = { ...closed, key: 'timed', allDay: false };
    expect(
      allDayOn([closed, trip, tomorrow, skipped, timed, closed], DATE, TZ).map((o) => o.title),
    ).toEqual(['Grandma visits', 'School closed']);
  });
});

describe('a clashing handoff', () => {
  it('names what it clashes with, on the handoff and on the other event', () => {
    const map = clashes(
      [
        {
          id: 'c1',
          type: 'handoff_conflict',
          memberId: MAYA.id,
          occurrenceKey: 'Pickup',
          eventId: 'e1',
          conflictingOccurrenceKey: 'Quarterly planning',
          conflictingEventId: 'e2',
          time: at(17, 30),
          text: '',
        },
        { id: 'd', type: 'decision_due', decisionId: 'x', dueOn: DATE, text: '' },
      ],
      DAY,
    );
    expect(map.get('Pickup')).toEqual({ with: 'Quarterly planning', handoff: true });
    expect(map.get('Quarterly planning')).toEqual({ with: 'Pickup', handoff: false });
    expect(map.size).toBe(2);
  });
});
