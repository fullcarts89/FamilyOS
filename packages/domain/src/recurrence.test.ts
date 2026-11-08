import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  describeSchedule,
  dueAfterCompletion,
  isValidRule,
  localDateOf,
  nextOccurrenceAfter,
  occurrenceDate,
  occurrenceDue,
  occurrencesBetween,
  planSwap,
  plannedOwner,
  upcomingOccurrences,
  SwapError,
  type CalendarRule,
  type NthWeek,
  type Occurrence,
  type OccurrenceException,
  type Weekday,
} from './recurrence';

// Gate G3: recurrence is deterministic, matches a naive reference, and handles DST and month-ends.

const D = Temporal.PlainDate;

/**
 * Reference expander: walks every day from the start and asks "does the rule fire today?".
 * Written independently of the jumping expander so the two can check each other.
 */
function referenceExpand(rule: CalendarRule, startOn: string, from: string, to: string) {
  const start = D.from(startOn);
  const monday = start.subtract({ days: start.dayOfWeek - 1 });
  const end = D.from(to);
  const lower = D.from(from);
  const out: Occurrence[] = [];
  let index = 0;
  for (let d = start; D.compare(d, end) <= 0; d = d.add({ days: 1 })) {
    const months = (d.year - start.year) * 12 + (d.month - start.month);
    let fires: boolean;
    switch (rule.freq) {
      case 'daily':
        fires = start.until(d).days % rule.interval === 0;
        break;
      case 'weekly':
        fires =
          rule.weekdays.includes(d.dayOfWeek as Weekday) &&
          Math.floor(monday.until(d).days / 7) % rule.interval === 0;
        break;
      case 'monthly':
        fires = months % rule.interval === 0 && d.day === Math.min(rule.dayOfMonth, d.daysInMonth);
        break;
      case 'monthly_weekday':
        fires =
          months % rule.interval === 0 &&
          d.dayOfWeek === rule.weekday &&
          (rule.nth === -1 ? d.day + 7 > d.daysInMonth : Math.ceil(d.day / 7) === rule.nth);
        break;
    }
    if (!fires) continue;
    if (D.compare(d, lower) >= 0) out.push({ index, date: d.toString() });
    index++;
  }
  return out;
}

const weekday = fc.integer({ min: 1, max: 7 }) as fc.Arbitrary<Weekday>;
const calendarRule: fc.Arbitrary<CalendarRule> = fc.oneof(
  fc.record({ freq: fc.constant('daily' as const), interval: fc.integer({ min: 1, max: 30 }) }),
  fc.record({
    freq: fc.constant('weekly' as const),
    interval: fc.integer({ min: 1, max: 6 }),
    weekdays: fc.uniqueArray(weekday, { minLength: 1, maxLength: 7 }),
  }),
  fc.record({
    freq: fc.constant('monthly' as const),
    interval: fc.integer({ min: 1, max: 12 }),
    dayOfMonth: fc.integer({ min: 1, max: 31 }),
  }),
  fc.record({
    freq: fc.constant('monthly_weekday' as const),
    interval: fc.integer({ min: 1, max: 12 }),
    nth: fc.constantFrom<NthWeek>(1, 2, 3, 4, -1),
    weekday,
  }),
);
const dateIn = (fromYear: number, toYear: number) =>
  fc
    .date({
      min: new Date(Date.UTC(fromYear, 0, 1)),
      max: new Date(Date.UTC(toYear, 11, 31)),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString().slice(0, 10));

describe('calendar expansion', () => {
  it('matches the reference expander on 10,000 random schedules', () => {
    fc.assert(
      fc.property(
        calendarRule,
        dateIn(2024, 2028),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 200 }),
        (rule, startOn, offset, span) => {
          const from = D.from(startOn)
            .add({ days: offset - 30 })
            .toString();
          const to = D.from(from).add({ days: span }).toString();
          expect(occurrencesBetween(rule, startOn, from, to)).toEqual(
            referenceExpand(rule, startOn, from, to),
          );
        },
      ),
      { numRuns: 10_000 },
    );
  }, 60_000);

  it('finds every date again from its index', () => {
    fc.assert(
      fc.property(calendarRule, dateIn(2024, 2028), (rule, startOn) => {
        const to = D.from(startOn).add({ days: 500 }).toString();
        for (const { index, date } of occurrencesBetween(rule, startOn, startOn, to)) {
          expect(occurrenceDate(rule, startOn, index)).toBe(date);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it('never yields a date before the start, and indexes count up from 0 without gaps', () => {
    fc.assert(
      fc.property(calendarRule, dateIn(2024, 2028), (rule, startOn) => {
        const list = occurrencesBetween(rule, startOn, '2020-01-01', '2030-12-31');
        expect(list[0]?.index).toBe(0);
        expect(D.compare(D.from(list[0]?.date ?? startOn), D.from(startOn))).toBeGreaterThanOrEqual(
          0,
        );
        list.forEach((o, i) => expect(o.index).toBe(i));
      }),
      { numRuns: 300 },
    );
  });

  it('puts the 31st on the last day of shorter months without drifting', () => {
    const rule: CalendarRule = { freq: 'monthly', interval: 1, dayOfMonth: 31 };
    expect(
      occurrencesBetween(rule, '2027-01-01', '2027-01-01', '2027-05-31').map((o) => o.date),
    ).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    expect(occurrenceDate({ freq: 'monthly', interval: 1, dayOfMonth: 29 }, '2028-01-01', 1)).toBe(
      '2028-02-29',
    );
  });

  it('follows J3: every 3 months on the 1st', () => {
    const rule: CalendarRule = { freq: 'monthly', interval: 3, dayOfMonth: 1 };
    expect(occurrencesBetween(rule, '2026-11-01', '2026-11-01', '2027-08-01')).toEqual([
      { index: 0, date: '2026-11-01' },
      { index: 1, date: '2027-02-01' },
      { index: 2, date: '2027-05-01' },
      { index: 3, date: '2027-08-01' },
    ]);
    expect(nextOccurrenceAfter(rule, '2026-11-01', '2026-11-01')).toEqual({
      index: 1,
      date: '2027-02-01',
    });
  });

  it('finds the last and the nth weekday of a month', () => {
    const lastFriday: CalendarRule = { freq: 'monthly_weekday', interval: 1, nth: -1, weekday: 5 };
    expect(
      occurrencesBetween(lastFriday, '2026-11-01', '2026-11-01', '2027-01-31').map((o) => o.date),
    ).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
    const secondTuesday: CalendarRule = {
      freq: 'monthly_weekday',
      interval: 1,
      nth: 2,
      weekday: 2,
    };
    expect(occurrenceDate(secondTuesday, '2026-11-01', 0)).toBe('2026-11-10');
  });
});

describe('due instants across US timezones and DST', () => {
  const US_ZONES = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ];
  const time = fc
    .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
    .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

  it('keeps the local date and the wall-clock time, except inside a DST gap', () => {
    fc.assert(
      fc.property(fc.constantFrom(...US_ZONES), dateIn(2026, 2030), time, (zone, date, hhmm) => {
        const due = occurrenceDue(date, hhmm, zone);
        expect(due.dueOn).toBeNull();
        const local = Temporal.Instant.from(due.dueAt ?? '').toZonedDateTimeISO(zone);
        expect(local.toPlainDate().toString()).toBe(date);
        const asked = Temporal.PlainTime.from(hhmm);
        const got = local.toPlainTime();
        if (Temporal.PlainTime.compare(got, asked) !== 0) {
          // Only a spring-forward gap may move it, and only later, by the gap (one hour in the US).
          expect(got.since(asked).total('minutes')).toBe(60);
        }
      }),
      { numRuns: 5_000 },
    );
  });

  it('moves 02:30 on spring-forward day to 03:30 (J3 policy)', () => {
    const due = occurrenceDue('2027-03-14', '02:30', 'America/Los_Angeles');
    expect(due.dueAt).toBe('2027-03-14T10:30:00Z');
    expect(
      Temporal.Instant.from(due.dueAt ?? '')
        .toZonedDateTimeISO('America/Los_Angeles')
        .toPlainTime()
        .toString(),
    ).toBe('03:30:00');
  });

  it('uses the first 01:30 on fall-back day', () => {
    // 2026-11-01 01:30 happens at -07:00 (PDT) and again at -08:00 (PST).
    expect(occurrenceDue('2026-11-01', '01:30', 'America/Los_Angeles').dueAt).toBe(
      '2026-11-01T08:30:00Z',
    );
  });

  it('keeps 19:00 at 19:00 local across both transitions', () => {
    const rule: CalendarRule = { freq: 'weekly', interval: 1, weekdays: [7] };
    const sundays = occurrencesBetween(rule, '2027-03-07', '2027-03-07', '2027-11-14');
    for (const { date } of sundays) {
      const due = occurrenceDue(date, '19:00', 'America/New_York');
      const local = Temporal.Instant.from(due.dueAt ?? '').toZonedDateTimeISO('America/New_York');
      expect(local.toPlainTime().toString()).toBe('19:00:00');
    }
  });

  it('gives an all-day date when there is no time', () => {
    expect(occurrenceDue('2026-11-15', null, 'America/Chicago')).toEqual({
      dueOn: '2026-11-15',
      dueAt: null,
    });
  });

  it('reads the local date of an instant in the household zone', () => {
    // 06:00 UTC on Nov 9 is still Nov 8 in Los Angeles.
    expect(localDateOf(new Date('2026-11-09T06:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-08');
    expect(localDateOf(new Date('2026-11-09T06:00:00Z'), 'America/New_York')).toBe('2026-11-09');
  });
});

describe('rotation, skip and swap', () => {
  const SAM = 'sam';
  const ALEX = 'alex';
  const trash: CalendarRule = { freq: 'weekly', interval: 1, weekdays: [7] };
  const schedule = { rule: trash, startOn: '2026-11-08' };
  const rotation = { rotation: [SAM, ALEX], ownerMemberId: null };

  const owners = (exceptions: OccurrenceException[]) =>
    upcomingOccurrences(schedule, rotation, exceptions, '2026-11-08', 8).map((o) =>
      o.skipped ? `${o.ownerMemberId}(skip)` : o.ownerMemberId,
    );

  it('alternates turns over 8 weeks (J3b)', () => {
    expect(owners([])).toEqual([SAM, ALEX, SAM, ALEX, SAM, ALEX, SAM, ALEX]);
  });

  it('swaps one turn and then carries on in order', () => {
    const swap = planSwap(rotation, [], 2, ALEX);
    expect(swap).toEqual([
      { index: 2, ownerMemberId: ALEX },
      { index: 3, ownerMemberId: SAM },
    ]);
    const exceptions = swap.map((s) => ({ ...s, kind: 'owner' as const }));
    expect(owners(exceptions)).toEqual([SAM, ALEX, ALEX, SAM, SAM, ALEX, SAM, ALEX]);
  });

  it('skips a turn without moving anyone else’s', () => {
    const exceptions: OccurrenceException[] = [{ index: 1, kind: 'skip' }];
    expect(owners(exceptions)).toEqual([SAM, `${ALEX}(skip)`, SAM, ALEX, SAM, ALEX, SAM, ALEX]);
  });

  it('swaps past a skipped turn', () => {
    const exceptions: OccurrenceException[] = [{ index: 1, kind: 'skip' }];
    expect(planSwap(rotation, exceptions, 0, ALEX)).toEqual([
      { index: 0, ownerMemberId: ALEX },
      { index: 3, ownerMemberId: SAM },
    ]);
  });

  it('refuses to swap with the person who already has the turn', () => {
    expect(() => planSwap(rotation, [], 0, SAM)).toThrow(SwapError);
    expect(() => planSwap({ rotation: [], ownerMemberId: SAM }, [], 0, ALEX)).toThrow(
      new SwapError('no_turn_found'),
    );
  });

  it('uses the routine owner when nobody rotates', () => {
    expect(plannedOwner({ rotation: [], ownerMemberId: SAM }, 5, [])).toBe(SAM);
    expect(
      plannedOwner({ rotation: [], ownerMemberId: SAM }, 5, [
        { index: 5, kind: 'owner', ownerMemberId: ALEX },
      ]),
    ).toBe(ALEX);
  });
});

describe('rules and summaries', () => {
  it('accepts only the supported subset', () => {
    expect(isValidRule({ freq: 'weekly', interval: 1, weekdays: [7] })).toBe(true);
    expect(isValidRule({ freq: 'weekly', interval: 1, weekdays: [] })).toBe(false);
    expect(isValidRule({ freq: 'weekly', interval: 1, weekdays: [1, 1] })).toBe(false);
    expect(isValidRule({ freq: 'monthly', interval: 1, dayOfMonth: 32 })).toBe(false);
    expect(isValidRule({ freq: 'monthly_weekday', interval: 1, nth: 5, weekday: 1 })).toBe(false);
    expect(isValidRule({ freq: 'daily', interval: 0 })).toBe(false);
    expect(isValidRule({ freq: 'yearly', interval: 1 })).toBe(false);
    expect(isValidRule({ freq: 'after_completion', intervalDays: 3 })).toBe(true);
  });

  it('describes schedules in plain language', () => {
    expect(describeSchedule({ freq: 'weekly', interval: 1, weekdays: [7] }, '19:00:00')).toBe(
      'Every Sunday at 19:00',
    );
    expect(describeSchedule({ freq: 'weekly', interval: 2, weekdays: [5, 1, 3] })).toBe(
      'Every 2 weeks on Mon, Wed and Fri',
    );
    expect(describeSchedule({ freq: 'monthly', interval: 3, dayOfMonth: 1 }, '09:00')).toBe(
      'Every 3 months on the 1st at 09:00',
    );
    expect(describeSchedule({ freq: 'monthly', interval: 1, dayOfMonth: 31 })).toBe(
      'Monthly on the 31st (or the last day)',
    );
    expect(describeSchedule({ freq: 'monthly_weekday', interval: 1, nth: -1, weekday: 5 })).toBe(
      'Monthly on the last Friday',
    );
    expect(describeSchedule({ freq: 'daily', interval: 1 })).toBe('Every day');
    expect(describeSchedule({ freq: 'after_completion', intervalDays: 3 })).toBe(
      '3 days after each time it’s done',
    );
  });

  it('schedules after-completion routines from the day it was closed', () => {
    expect(dueAfterCompletion({ freq: 'after_completion', intervalDays: 3 }, '2026-11-30')).toBe(
      '2026-12-03',
    );
  });
});
