import { readFileSync } from 'node:fs';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { CalendarFetchError } from './fetch';
import { parseIcs } from './parse-core';
import {
  MAX_OCCURRENCES,
  MAX_TOTAL_STEPS,
  PARSE_DEADLINE_MS,
  parseCalendar,
  type ImportedOccurrence,
} from './parse';

const LA = 'America/Los_Angeles';
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const window = (from: string, to: string) => ({
  from: Temporal.PlainDate.from(from).toZonedDateTime({ timeZone: LA }).toInstant(),
  to: Temporal.PlainDate.from(to).toZonedDateTime({ timeZone: LA }).toInstant(),
  timeZone: LA,
});
const brief = (list: ImportedOccurrence[]) =>
  list.map((o) => [o.uid, o.recurrenceId, o.title, o.startsAt, o.endsAt, o.allDay]);

describe('parsing calendars', () => {
  it('reads a Google calendar: UTC times, recurring with EXDATE, a moved and a cancelled instance, all-day', async () => {
    const got = await parseCalendar(fixture('google.ics'), window('2026-11-16', '2026-11-27'));
    expect(brief(got)).toEqual([
      [
        'standup@google.com',
        '2026-11-16T17:30:00Z',
        'Team standup',
        '2026-11-16T17:30:00Z',
        '2026-11-16T18:00:00Z',
        false,
      ],
      [
        'planning-1@google.com',
        'single',
        'Quarterly planning',
        '2026-11-19T22:00:00Z',
        '2026-11-20T02:00:00Z',
        false,
      ],
      // Nov 18 is excluded; Nov 23 moved to 11:00; Nov 25 cancelled.
      [
        'standup@google.com',
        '2026-11-23T17:30:00Z',
        'Team standup (moved)',
        '2026-11-23T19:00:00Z',
        '2026-11-23T19:30:00Z',
        false,
      ],
      [
        'holiday@google.com',
        'single',
        'Office closed',
        '2026-11-26T08:00:00Z',
        '2026-11-28T08:00:00Z',
        true,
      ],
    ]);
    expect(got[1]?.location).toBe('Room 4B');
    // Descriptions are never read.
    expect(JSON.stringify(got)).not.toContain('agenda');
  });

  it('keeps wall-clock times of recurring events across a DST change', async () => {
    const got = await parseCalendar(fixture('google.ics'), window('2026-10-26', '2026-11-03'));
    expect(got.filter((o) => o.uid === 'standup@google.com').map((o) => o.startsAt)).toEqual([
      '2026-10-26T16:30:00Z', // 09:30 PDT
      '2026-10-28T16:30:00Z',
      '2026-11-02T17:30:00Z', // 09:30 PST
    ]);
  });

  it('reads an iCloud calendar: TZID with VTIMEZONE, a date with no end, floating times', async () => {
    const got = await parseCalendar(fixture('icloud.ics'), window('2026-11-16', '2026-11-22'));
    expect(brief(got)).toEqual(
      [
        [
          '6F1C2A9E-ICLOUD-0001',
          '2026-11-17T09:00:00Z',
          'Call with London office',
          '2026-11-17T09:00:00Z',
          '2026-11-17T10:00:00Z',
          false,
        ],
        [
          '6F1C2A9E-ICLOUD-0002',
          'single',
          'Grandma visiting',
          '2026-11-21T08:00:00Z',
          '2026-11-22T08:00:00Z',
          true,
        ],
        // Floating: the household's timezone.
        [
          '6F1C2A9E-ICLOUD-0003',
          'single',
          'Floating yoga',
          '2026-11-19T23:00:00Z',
          '2026-11-20T00:00:00Z',
          false,
        ],
      ]
        .sort((a, b) => String(a[3]).localeCompare(String(b[3])))
        .sort(() => 0),
    );
  });

  it('uses the file’s own VTIMEZONE for non-IANA TZIDs (Outlook)', async () => {
    const got = await parseCalendar(fixture('outlook.ics'), window('2026-11-16', '2026-11-22'));
    expect(brief(got)).toEqual([
      [
        '040000008200E00074C5B7101A82E0080000000',
        'single',
        'Dentist',
        '2026-11-17T19:00:00Z',
        '2026-11-17T19:45:00Z',
        false,
      ],
    ]);
  });

  it('refuses text that is not a calendar', async () => {
    for (const text of ['<html>Sign in</html>', '', 'BEGIN:VCARD\r\nEND:VCARD\r\n']) {
      await expect(parseCalendar(text, window('2026-11-16', '2026-11-22'))).rejects.toThrow(
        CalendarFetchError,
      );
    }
  });

  it('caps how many occurrences one calendar can produce', async () => {
    const many = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...Array.from({ length: 60 }, (_, i) => [
        'BEGIN:VEVENT',
        `UID:e${i}`,
        'DTSTART:20261101T000000Z',
        'DTEND:20261101T000100Z',
        'RRULE:FREQ=HOURLY',
        'SUMMARY:x',
        'END:VEVENT',
      ]).flat(),
      'END:VCALENDAR',
    ].join('\r\n');
    await expect(parseCalendar(many, window('2026-11-01', '2026-11-30'))).rejects.toThrow(
      expect.objectContaining({ code: 'too_many_events' }),
    );
    expect(MAX_OCCURRENCES).toBe(5000);
  });

  it('gives events without a UID a stable one, and cleans titles', async () => {
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'DTSTART:20261117T100000Z',
      'DTEND:20261117T110000Z',
      'SUMMARY:  Lunch\\n  with   Sam  ',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20261118T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const a = await parseCalendar(text, window('2026-11-16', '2026-11-22'));
    const b = await parseCalendar(text, window('2026-11-16', '2026-11-22'));
    expect(a.map((o) => o.title)).toEqual(['Lunch with Sam', 'Busy']);
    expect(a[0]?.uid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.map((o) => o.uid)).toEqual(b.map((o) => o.uid));
  });

  describe('hostile files', () => {
    // What protects the API is the hard deadline: the parse runs in its own thread and is
    // stopped at PARSE_DEADLINE_MS. On a quiet machine these files are refused by the step budget
    // well before it; on a busy CI runner the wall time varies, so the bound is the deadline plus
    // a second for the thread to stop, and a failure reports the time it took.
    const BOUND_MS = PARSE_DEADLINE_MS + 1000;
    const refusedInTime = async (name: string) => {
      const started = performance.now();
      const outcome = await parseCalendar(fixture(name), window('2026-11-16', '2027-02-15')).then(
        () => 'parsed',
        (error: { code?: string }) => error.code,
      );
      return { name, outcome, ms: Math.round(performance.now() - started) };
    };

    it.each([
      // One impossible rule: ical.js looks for February 30th for ever inside a single step.
      'hostile-impossible-rule.ics',
      // A VTIMEZONE that changes every minute since 1601, expanded on the first time it converts.
      'hostile-minutely-timezone.ics',
      // Twenty every-second series from 2000: each stays within its own step limit.
      'hostile-secondly.ics',
    ])('refuses %s as too complex, before the deadline', async (name) => {
      const { outcome, ms } = await refusedInTime(name);
      expect(outcome).toBe('too_complex');
      expect(ms, `${name} took ${ms} ms`).toBeLessThan(BOUND_MS);
    });

    it('stops a parse that runs past the deadline, and the next one still works', async () => {
      await expect(
        parseCalendar(fixture('hostile-secondly.ics'), window('2026-11-16', '2026-11-22'), {
          deadlineMs: 50,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: 'too_complex' }));
      expect(
        await parseCalendar(fixture('outlook.ics'), window('2026-11-16', '2026-11-22')),
      ).toHaveLength(1);
    });

    it('keeps the step budget inside ical.js, even when parsing in this thread', () => {
      expect(() =>
        parseIcs(fixture('hostile-impossible-rule.ics'), window('2026-11-16', '2027-02-15')),
      ).toThrow(expect.objectContaining({ code: 'too_complex' }));
      expect(MAX_TOTAL_STEPS).toBe(150_000);
    });

    it('still reads a large real-looking calendar well within the budget', async () => {
      // Forty series: ten daily for three years, twenty weekdays for seven, ten monthly for ten.
      const series = (uid: string, start: string, rule: string) => [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART;TZID=America/New_York:${start}`,
        `DTEND;TZID=America/New_York:${start.slice(0, 9)}${String(Number(start.slice(9, 11)) + 1).padStart(2, '0')}0000`,
        `RRULE:${rule}`,
        'SUMMARY:Series',
        'END:VEVENT',
      ];
      const text = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        ...Array.from({ length: 10 }, (_, i) => series(`d${i}`, '20231106T090000', 'FREQ=DAILY')),
        ...Array.from({ length: 20 }, (_, i) =>
          series(`w${i}`, '20191104T100000', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          series(`m${i}`, '20161101T110000', 'FREQ=MONTHLY;BYMONTHDAY=1'),
        ),
      ]
        .flat()
        .concat('END:VCALENDAR')
        .join('\r\n');
      const started = performance.now();
      const got = await parseCalendar(text, window('2026-11-16', '2026-11-23'));
      expect(got).toHaveLength(10 * 7 + 20 * 5 + 0);
      // Parsed in full, so neither the budget nor the deadline stopped it.
      expect(performance.now() - started).toBeLessThan(BOUND_MS);
    });
  });
});
