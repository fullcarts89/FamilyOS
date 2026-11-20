import { describe, expect, it } from 'vitest';
import {
  contrast,
  dayRows,
  fitLabel,
  hourLabel,
  readableOn,
  solidFill,
  splitTonight,
  textOn,
} from '../apps/mobile/components/rhythm/day-model';

// Synthetic day in the household's zone (Los Angeles, UTC-8 in November).
const TZ = 'America/Los_Angeles';
const DATE = '2026-11-19';
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00-08:00`).toISOString();
const entry = (key: string, start: string, end: string = start) => ({
  key,
  startsAt: at(start),
  endsAt: at(end),
});

const day = [
  entry('breakfast', '07:15', '07:45'),
  entry('dropoff', '08:15', '08:35'),
  entry('planning', '14:00', '18:00'),
  entry('call', '15:30', '16:15'),
  entry('pickup', '17:30', '17:50'),
  entry('dinner', '18:15', '19:00'),
  entry('bath', '19:15'),
];

describe('Tonight', () => {
  it('splits what is still to come at 5:00pm household time', () => {
    const { next, tonight } = splitTonight(day, new Date(at('16:30')), TZ);
    // Under way (planning runs to 6pm) stays with what's next; it started before 5pm.
    expect(next.map((e) => e.key)).toEqual(['planning']);
    expect(tonight.map((e) => e.key)).toEqual(['pickup', 'dinner', 'bath']);
  });

  it('starts at exactly 5:00pm', () => {
    const { next, tonight } = splitTonight(
      [entry('a', '16:59', '17:10'), entry('b', '17:00', '17:10')],
      new Date(at('09:00')),
      TZ,
    );
    expect(next.map((e) => e.key)).toEqual(['a']);
    expect(tonight.map((e) => e.key)).toEqual(['b']);
  });

  it('keeps the next few short, and is all evening once it is evening', () => {
    expect(splitTonight(day, new Date(at('06:00')), TZ, { limit: 2 }).next).toHaveLength(2);
    const evening = splitTonight(day, new Date(at('18:30')), TZ);
    expect(evening.next).toEqual([]);
    expect(evening.tonight.map((e) => e.key)).toEqual(['dinner', 'bath']);
  });
});

describe('the phone’s vertical day', () => {
  const rows = dayRows(day, {
    from: 6 * 60,
    to: 22 * 60,
    timeZone: TZ,
    date: DATE,
    now: new Date(at('16:30')),
    away: [{ memberId: 'june', start: 8 * 60 + 15, end: 17 * 60 + 30 }],
  });

  it('puts each entry in its hour, in order, with the now-line among them', () => {
    const hours = rows.filter((r) => r.kind === 'hour');
    const items = hours.flatMap((r) => (r.kind === 'hour' ? r.items.map((e) => e.key) : []));
    expect(items).toEqual(day.map((e) => e.key));
    const four = hours.find((r) => r.kind === 'hour' && r.hour === 16);
    expect(four).toMatchObject({ nowAt: 0, items: [] });
  });

  it('marks the hours a child is away', () => {
    const eight = rows.find((r) => r.kind === 'hour' && r.hour === 8);
    const seven = rows.find((r) => r.kind === 'hour' && r.hour === 7);
    expect(eight?.away).toEqual(['june']);
    expect(seven?.away).toEqual([]);
  });

  it('folds three or more empty hours into one quiet row', () => {
    const quiet = rows.filter((r) => r.kind === 'quiet');
    // 9am–2pm are empty here: one quiet row from 9am to 2pm, with June away the whole time.
    expect(quiet).toEqual([{ kind: 'quiet', from: 9, to: 14, away: ['june'] }]);
    // Two empty hours (8pm, 9pm) stay as hours.
    expect(rows.filter((r) => r.kind === 'hour' && r.hour >= 20)).toHaveLength(2);
  });

  it('labels the ruler', () => {
    expect([0, 6, 12, 13, 18, 24].map(hourLabel)).toEqual([
      'midnight',
      '6am',
      'noon',
      '1pm',
      '6pm',
      'midnight',
    ]);
  });
});

describe('labels that fit', () => {
  it('drops the time, then shortens to the part before a colon, never cutting mid-word', () => {
    expect(fitLabel('Design review', '9:30am', 200)).toEqual({
      text: 'Design review',
      time: '9:30am',
    });
    expect(fitLabel('Design review', '9:30am', 110)).toEqual({
      text: 'Design review',
      time: null,
    });
    expect(fitLabel('Plumber: bathroom rough-in', '1pm', 90)).toEqual({
      text: 'Plumber',
      time: '1pm',
    });
    expect(fitLabel('Plumber: bathroom rough-in', '1pm', 20)).toBeNull();
  });
});

describe('readable color', () => {
  const memberPalette = ['#D2553F', '#2F6FB3', '#D99A1C', '#5E8A4E', '#8A5A9E', '#2E8A86'];

  it('puts readable text on every member color', () => {
    for (const c of memberPalette) {
      const fill = solidFill(c);
      expect(contrast(textOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
    }
    // Blue already reads with white text, so it stays as it is.
    expect(solidFill('#2F6FB3')).toBe('#2F6FB3');
    // Marigold is too light for white text.
    expect(textOn('#D99A1C')).toBe('#17201B');
  });

  it('deepens a member color until it reads as small text', () => {
    for (const c of memberPalette) {
      expect(contrast(readableOn(c), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(readableOn(c, '#F7F5F0'), '#F7F5F0')).toBeGreaterThanOrEqual(4.5);
    }
    // Already readable colors stay as they are.
    expect(readableOn('#2F6FB3')).toBe('#2f6fb3');
  });
});
