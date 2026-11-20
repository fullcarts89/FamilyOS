import { describe, expect, it } from 'vitest';
import type { NextEntry } from '../apps/mobile/components/rhythm/NextUp';
import {
  awayRails,
  contrast,
  railRows,
  readableOn,
  shortTitle,
  splitTonight,
  textShade,
  verticalDay,
} from '../apps/mobile/components/rhythm/today-model';
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

describe('readable color', () => {
  it('puts ink on marigold and white on blue', () => {
    expect(readableOn('#D99A1C')).toBe('#17201B');
    expect(readableOn('#2F6FB3')).toBe('#FFFFFF');
  });

  it('deepens a member color for text until it passes 4.5:1, and leaves dark ones alone', () => {
    const coral = textShade('#D2553F');
    expect(coral).not.toBe('#D2553F');
    expect(contrast(coral, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(textShade('#2F6FB3')).toBe('#2F6FB3');
    expect(contrast(textShade('#676E68', '#EFECE5'), '#EFECE5')).toBeGreaterThanOrEqual(4.5);
  });

  it('shortens a title to the part before a colon or bracket', () => {
    expect(shortTitle('Dinner: sheet-pan salmon')).toBe('Dinner');
    expect(shortTitle('Quarterly planning (runs late)')).toBe('Quarterly planning');
    expect(shortTitle('Laundry')).toBe('Laundry');
  });
});
