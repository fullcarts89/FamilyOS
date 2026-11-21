import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { expandEvents, type EventException, type EventSeries } from './events';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  afterQuietHours,
  inQuietHours,
  localInstant,
  partnerBatchCursor,
  planNotifications,
  type NotificationPlanInput,
  type NotificationSettings,
  type NotifierAuditRow,
  type PartnerContext,
} from './notifications';
import type { RhythmMember, RhythmTask } from './rhythm';

const LA = 'America/Los_Angeles';
// Monday 2026-11-16 in Los Angeles (PST, UTC−8).
const DATE = '2026-11-16';
const pst = (time: string, date = DATE) =>
  Temporal.Instant.from(`${date}T${time}:00-08:00`).toString();

const members: RhythmMember[] = [
  { id: 'maya', role: 'owner', displayName: 'Maya' },
  { id: 'theo', role: 'adult', displayName: 'Theo' },
  { id: 'sam', role: 'caregiver', displayName: 'Sam' },
  { id: 'june', role: 'child', displayName: 'June' },
];
const caredFor = (id: string) => id === 'june';

function dropOff(exceptions: EventException[] = [], memberIds = ['maya', 'june']): EventSeries {
  return {
    id: 'dropoff',
    title: 'Daycare drop-off',
    kind: 'childcare',
    startsAt: pst('08:15', '2026-11-09'),
    endsAt: pst('08:35', '2026-11-09'),
    allDay: false,
    timezone: LA,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] },
    recursUntil: null,
    memberIds,
    careMemberId: 'june',
    careAction: 'drop_off',
    carePlace: 'Little Oaks',
    exceptions,
  };
}

const occurrencesFor = (series: EventSeries[], date = DATE) =>
  expandEvents(
    series,
    { from: date, to: Temporal.PlainDate.from(date).add({ days: 1 }).toString(), timeZone: LA },
    caredFor,
  );

const task = (id: string, overrides: Partial<RhythmTask> = {}): RhythmTask => ({
  id,
  title: id,
  status: 'ready',
  ownerMemberId: 'maya',
  subjectMemberId: null,
  dueOn: DATE,
  dueAt: null,
  recurrenceRuleId: null,
  ...overrides,
});

const emptyContext: PartnerContext = {
  items: new Map(),
  decisions: new Map(),
  careEvents: new Map(),
};

/**
 * Most cases check the wording and the timing, so they show details and have no quiet hours
 * (by default details are hidden and quiet hours are 22:00–06:00).
 */
const DETAILED: NotificationSettings = {
  ...DEFAULT_NOTIFICATION_SETTINGS,
  hideDetails: false,
  quietHours: null,
};

function input(overrides: Partial<NotificationPlanInput> = {}): NotificationPlanInput {
  return {
    memberId: 'maya',
    now: pst('07:30'),
    timeZone: LA,
    settings: DETAILED,
    members,
    occurrences: occurrencesFor([dropOff()]),
    tasks: [task('pay-daycare'), task('book-dentist')],
    dinner: { title: 'salmon', cookMemberId: 'theo' },
    committedWeeks: [],
    audit: [],
    partnerContext: emptyContext,
    log: [],
    ...overrides,
  };
}
const settings = (changes: Partial<NotificationSettings>): NotificationSettings => ({
  ...DETAILED,
  ...changes,
});
const kinds = (i: NotificationPlanInput) => planNotifications(i).map((p) => p.kind);
const only = (i: NotificationPlanInput, kind: string) =>
  planNotifications(i).filter((p) => p.kind === kind);

describe('local times across daylight saving', () => {
  it('keeps the wall-clock time; a time in the spring gap moves forward, a repeated one takes the first', () => {
    expect(localInstant('2026-03-07', '07:30', LA).toString()).toBe('2026-03-07T15:30:00Z');
    expect(localInstant('2026-03-08', '07:30', LA).toString()).toBe('2026-03-08T14:30:00Z');
    expect(localInstant('2026-03-08', '02:30', LA).toString()).toBe('2026-03-08T10:30:00Z');
    expect(localInstant('2026-11-01', '01:30', LA).toString()).toBe('2026-11-01T08:30:00Z');
    expect(localInstant('2026-11-02', '07:30', LA).toString()).toBe('2026-11-02T15:30:00Z');
  });

  it('sends the morning check-in at 07:30 local on the day the clocks change', () => {
    const day = '2026-03-08'; // Sunday, clocks spring forward at 02:00.
    const at = (iso: string) =>
      only(
        input({
          now: iso,
          occurrences: [],
          tasks: [task('x', { dueOn: day })],
          dinner: null,
        }),
        'morning_checkin',
      );
    expect(at('2026-03-08T14:29:00Z')).toEqual([]);
    expect(at('2026-03-08T14:30:00Z')).toMatchObject([
      { dedupeKey: `morning_checkin:${day}`, send: true },
    ]);
  });
});

describe('quiet hours', () => {
  const night = { start: '22:00', end: '07:00' };

  it('span midnight: start inclusive, end exclusive', () => {
    expect(inQuietHours(pst('21:59'), LA, night)).toBe(false);
    expect(inQuietHours(pst('22:00'), LA, night)).toBe(true);
    expect(inQuietHours(pst('02:00'), LA, night)).toBe(true);
    expect(inQuietHours(pst('06:59'), LA, night)).toBe(true);
    expect(inQuietHours(pst('07:00'), LA, night)).toBe(false);
    expect(inQuietHours(pst('13:30'), LA, { start: '13:00', end: '15:00' })).toBe(true);
    expect(inQuietHours(pst('15:00'), LA, { start: '13:00', end: '15:00' })).toBe(false);
    expect(inQuietHours(pst('03:00'), LA, { start: '07:00', end: '07:00' })).toBe(false);
    expect(inQuietHours(pst('03:00'), LA, null)).toBe(false);
  });

  it('end the next morning when they began the evening before, across a clock change too', () => {
    expect(afterQuietHours(pst('23:30'), LA, night).toString()).toBe(pst('07:00', '2026-11-17'));
    expect(afterQuietHours(pst('05:00'), LA, night).toString()).toBe(pst('07:00'));
    expect(afterQuietHours(pst('12:00'), LA, night).toString()).toBe(pst('12:00'));
    // Saturday 23:00 PST → Sunday 07:00 PDT (UTC−7).
    expect(afterQuietHours('2026-03-08T07:00:00Z', LA, night).toString()).toBe(
      '2026-03-08T14:00:00Z',
    );
  });

  it('defer the morning check-in to their end, the same day', () => {
    const quiet = settings({ quietHours: { start: '22:00', end: '08:00' } });
    expect(only(input({ settings: quiet }), 'morning_checkin')).toEqual([]);
    const at8 = only(input({ settings: quiet, now: pst('08:00') }), 'morning_checkin');
    expect(at8).toMatchObject([{ send: true }]);
    // The drop-off is still ahead at 08:00, so it is in the line.
    expect(at8[0]?.message?.body).toContain('drop-off 8:15 AM (you)');
    // Quiet until the next day: no morning check-in at all.
    const allDay = settings({ quietHours: { start: '00:00', end: '23:59' } });
    for (const time of ['07:30', '12:00', '23:58']) {
      expect(only(input({ settings: allDay, now: pst(time) }), 'morning_checkin')).toEqual([]);
    }
  });
});

describe('morning check-in', () => {
  it('says what today holds for the member, from the data only', () => {
    expect(only(input(), 'morning_checkin')).toEqual([
      {
        kind: 'morning_checkin',
        dedupeKey: `morning_checkin:${DATE}`,
        send: true,
        urgent: false,
        message: {
          title: 'Good morning',
          body: 'Today: drop-off 8:15 AM (you), 2 things due, dinner: salmon (Theo)',
        },
      },
    ]);
  });

  it("counts only the member's own tasks, and names care nobody is down for to adults", () => {
    const uncovered = dropOff([], ['june']);
    const theo = only(
      input({
        memberId: 'theo',
        occurrences: occurrencesFor([uncovered]),
        tasks: [
          task('mine', { ownerMemberId: 'theo' }),
          task('hers'),
          task('late', {
            ownerMemberId: 'theo',
            dueOn: '2026-11-12',
          }),
        ],
        dinner: { title: 'salmon', cookMemberId: 'theo' },
      }),
      'morning_checkin',
    );
    expect(theo[0]?.message?.body).toBe(
      'Today: drop-off 8:15 AM (nobody yet), 1 thing due, 1 overdue, dinner: salmon (you)',
    );
  });

  it('is skipped (recorded, not sent) when nothing concerns the member', () => {
    // Sam has no handoffs or tasks, and someone else cooks: dinner alone is no reason.
    expect(only(input({ memberId: 'sam' }), 'morning_checkin')).toEqual([
      {
        kind: 'morning_checkin',
        dedupeKey: `morning_checkin:${DATE}`,
        send: false,
        urgent: false,
        message: null,
      },
    ]);
  });

  it('is sent once a day, within its window, only when switched on', () => {
    const log = [
      {
        kind: 'morning_checkin' as const,
        dedupeKey: `morning_checkin:${DATE}`,
        sentAt: pst('07:30'),
      },
    ];
    expect(only(input({ log }), 'morning_checkin')).toEqual([]);
    expect(only(input({ now: pst('07:29') }), 'morning_checkin')).toEqual([]);
    expect(only(input({ now: pst('09:29') }), 'morning_checkin')).toHaveLength(1);
    expect(only(input({ now: pst('09:30') }), 'morning_checkin')).toEqual([]);
    expect(
      only(input({ settings: settings({ morningCheckin: false }) }), 'morning_checkin'),
    ).toEqual([]);
    expect(
      only(
        input({ settings: settings({ morningTime: '06:45' }), now: pst('06:45') }),
        'morning_checkin',
      ),
    ).toHaveLength(1);
  });

  it('says nothing specific when details are hidden on the lock screen', () => {
    const [hidden] = only(input({ settings: settings({ hideDetails: true }) }), 'morning_checkin');
    expect(hidden?.message).toEqual({
      title: 'Good morning',
      body: 'Your morning check-in is ready.',
    });
  });

  it('never goes to a child or pet, or to someone not in the household', () => {
    expect(kinds(input({ memberId: 'june' }))).toEqual([]);
    expect(kinds(input({ memberId: 'stranger' }))).toEqual([]);
  });
});

describe('handoff reminders', () => {
  const reminders = (overrides: Partial<NotificationPlanInput>) =>
    only(input({ dinner: null, tasks: [], ...overrides }), 'handoff_reminder');

  it('come 30 minutes before a handoff the member covers, and not after it', () => {
    expect(reminders({ now: pst('07:44') })).toEqual([]);
    expect(reminders({ now: pst('07:45') })).toEqual([
      {
        kind: 'handoff_reminder',
        dedupeKey: `handoff_reminder:dropoff:${DATE}`,
        send: true,
        urgent: true,
        message: { title: 'June’s drop-off at 8:15 AM', body: 'In 30 minutes, at Little Oaks.' },
      },
    ]);
    expect(reminders({ now: pst('08:05') })[0]?.message?.body).toBe(
      'In 10 minutes, at Little Oaks.',
    );
    expect(reminders({ now: pst('08:15') })).toEqual([]);
    expect(reminders({ now: pst('07:45'), memberId: 'theo' })).toEqual([]);
  });

  it('follow covers and skips', () => {
    const covered = occurrencesFor([
      dropOff([{ date: DATE, kind: 'cover', coverMemberId: 'theo' }]),
    ]);
    expect(reminders({ now: pst('07:45'), occurrences: covered })).toEqual([]);
    expect(reminders({ now: pst('07:45'), occurrences: covered, memberId: 'theo' })).toHaveLength(
      1,
    );
    const skipped = occurrencesFor([dropOff([{ date: DATE, kind: 'skip', coverMemberId: null }])]);
    expect(reminders({ now: pst('07:45'), occurrences: skipped })).toEqual([]);
  });

  it('wait for quiet hours to end, and are dropped when that leaves under 5 minutes', () => {
    const quiet = settings({ quietHours: { start: '22:00', end: '08:00' } });
    expect(reminders({ now: pst('07:45'), settings: quiet })).toEqual([]);
    expect(reminders({ now: pst('08:00'), settings: quiet })[0]?.message?.body).toBe(
      'In 15 minutes, at Little Oaks.',
    );
    const late = settings({ quietHours: { start: '22:00', end: '08:30' } });
    for (const time of ['07:45', '08:10', '08:30']) {
      expect(reminders({ now: pst(time), settings: late })).toEqual([]);
    }
  });

  it('are sent once, only when switched on, and generic when details are hidden', () => {
    const log = [
      {
        kind: 'handoff_reminder' as const,
        dedupeKey: `handoff_reminder:dropoff:${DATE}`,
        sentAt: pst('07:45'),
      },
    ];
    expect(reminders({ now: pst('07:50'), log })).toEqual([]);
    expect(
      reminders({ now: pst('07:45'), settings: settings({ handoffReminders: false }) }),
    ).toEqual([]);
    expect(
      reminders({ now: pst('07:45'), settings: settings({ hideDetails: true }) })[0]?.message,
    ).toEqual({ title: 'Handoff soon', body: 'You have a handoff in 30 minutes.' });
  });

  it('find a handoff just after midnight from the evening before', () => {
    const early: EventSeries = {
      ...dropOff(),
      id: 'early',
      recurrence: null,
      startsAt: pst('00:15', '2026-11-17'),
      endsAt: pst('00:30', '2026-11-17'),
    };
    expect(
      reminders({ now: pst('23:50'), occurrences: occurrencesFor([early]) }).map(
        (r) => r.dedupeKey,
      ),
    ).toEqual(['handoff_reminder:early:2026-11-17']);
  });
});

describe('partner changes', () => {
  const on = settings({ partnerChanges: true });
  const row = (id: number, overrides: Partial<NotifierAuditRow>): NotifierAuditRow => ({
    id: String(id),
    actorMemberId: 'theo',
    action: 'work_item.updated',
    entityType: 'work_item',
    entityId: 'item',
    payload: {},
    createdAt: pst('07:00'),
    ...overrides,
  });
  const context: PartnerContext = {
    items: new Map([
      [
        'car',
        {
          id: 'car',
          title: 'Car registration',
          ownerMemberId: 'theo',
          createdByMemberId: 'maya',
          visibility: 'household',
        },
      ],
      [
        'plumber',
        {
          id: 'plumber',
          title: 'Call plumber',
          ownerMemberId: 'maya',
          createdByMemberId: 'maya',
          visibility: 'household',
        },
      ],
      [
        'gift',
        {
          id: 'gift',
          title: 'Surprise gift',
          ownerMemberId: 'theo',
          createdByMemberId: 'theo',
          visibility: 'private',
        },
      ],
      [
        'trash',
        {
          id: 'trash',
          title: 'Trash',
          ownerMemberId: 'maya',
          createdByMemberId: 'maya',
          visibility: 'household',
        },
      ],
      [
        'bills',
        {
          id: 'bills',
          title: 'Bills',
          ownerMemberId: 'maya',
          createdByMemberId: 'maya',
          visibility: 'household',
        },
      ],
    ]),
    decisions: new Map([
      ['camp', { question: 'Summer camp', voterIds: ['maya', 'theo'] }],
      ['paint', { question: 'Paint colour', voterIds: ['theo'] }],
    ]),
    careEvents: new Map([
      [
        'dropoff',
        { memberIds: ['maya', 'june'], careMemberId: 'june', careAction: 'drop_off' as const },
      ],
    ]),
  };
  const took = (id: number, entityId: string) =>
    row(id, {
      entityId,
      payload: { fields: ['owner_member_id'], fromOwnerMemberId: 'maya', ownerMemberId: 'theo' },
    });
  const done = (id: number, entityId: string) =>
    row(id, { entityId, payload: { fields: ['status'], toStatus: 'verified_complete' } });
  const audit = [
    took(10, 'car'),
    done(11, 'plumber'),
    row(12, {
      entityType: 'decision',
      entityId: 'camp',
      action: 'decision.decided',
      payload: { via: 'call' },
    }),
    row(13, { entityType: 'decision', entityId: 'paint', action: 'decision.decided' }),
    // Maya's own change, and the system's: not news to her.
    { ...done(14, 'bills'), actorMemberId: 'maya' },
    { ...done(15, 'bills'), actorMemberId: null },
    // Completed, then undone.
    done(16, 'trash'),
    row(17, { entityId: 'trash', action: 'work_item.completion_undone' }),
    // Theo reassigning his own item or someone else's isn't off her plate.
    row(18, {
      entityId: 'gift',
      payload: { fields: ['owner_member_id'], fromOwnerMemberId: 'theo', ownerMemberId: 'theo' },
    }),
  ];
  const plan = (overrides: Partial<NotificationPlanInput> = {}) =>
    only(
      input({ now: pst('07:40'), settings: on, audit, partnerContext: context, ...overrides }),
      'partner_changes',
    );

  it('are off unless the member turns them on', () => {
    expect(
      only(input({ now: pst('07:40'), audit, partnerContext: context }), 'partner_changes'),
    ).toEqual([]);
  });

  it('batch only meaningful changes by someone else, keyed by the last one', () => {
    expect(plan()).toEqual([
      {
        kind: 'partner_changes',
        dedupeKey: 'partner_changes:12',
        send: true,
        urgent: false,
        message: {
          title: 'From Theo',
          body: 'Took “Car registration” off your plate. Completed “Call plumber”. Settled “Summer camp”, which you voted on.',
        },
      },
    ]);
  });

  it('go out at most hourly, picking up after the last batch', () => {
    const last = {
      kind: 'partner_changes' as const,
      dedupeKey: 'partner_changes:11',
      sentAt: pst('07:00'),
    };
    expect(plan({ log: [last] })).toEqual([]);
    const next = plan({ log: [last], now: pst('08:00') });
    expect(next.map((p) => [p.dedupeKey, p.message?.body])).toEqual([
      ['partner_changes:12', 'Settled “Summer camp”, which you voted on.'],
    ]);
    expect(
      plan({ log: [{ ...last, dedupeKey: 'partner_changes:12' }], now: pst('09:00') }),
    ).toEqual([]);
  });

  it('wait out quiet hours, then include what happened during them', () => {
    const quiet = settings({ partnerChanges: true, quietHours: { start: '22:00', end: '07:30' } });
    const night = [took(30, 'car'), done(31, 'plumber')].map((r) => ({
      ...r,
      createdAt: pst('23:00', '2026-11-15'),
    }));
    const last = {
      kind: 'partner_changes' as const,
      dedupeKey: 'partner_changes:20',
      sentAt: pst('21:00', '2026-11-15'),
    };
    expect(plan({ settings: quiet, audit: night, log: [last], now: pst('07:00') })).toEqual([]);
    expect(
      plan({ settings: quiet, audit: night, log: [last], now: pst('07:30') }).map(
        (p) => p.dedupeKey,
      ),
    ).toEqual(['partner_changes:31']);
  });

  it("hide titles the member can't see, and everything when details are hidden", () => {
    const privateItem = new Map(context.items);
    privateItem.set('car', {
      id: 'car',
      title: 'Car registration',
      ownerMemberId: 'theo',
      createdByMemberId: 'theo',
      visibility: 'private',
    });
    expect(
      plan({ audit: [took(10, 'car')], partnerContext: { ...context, items: privateItem } })[0]
        ?.message?.body,
    ).toBe('Took something off your plate.');
    expect(
      plan({ settings: settings({ partnerChanges: true, hideDetails: true }) })[0]?.message,
    ).toEqual({
      title: 'FamilyOS',
      body: 'There are changes that affect you.',
    });
  });

  it('name a covered handoff', () => {
    const covered = row(40, {
      entityType: 'event',
      entityId: 'dropoff',
      action: 'event.occurrence_covered',
      payload: { date: '2026-11-17', coverMemberId: 'theo' },
    });
    expect(plan({ audit: [covered] })[0]?.message?.body).toBe(
      'Covered June’s drop-off on Tue, Nov 17.',
    );
  });

  it('read the cursor from the dedupe key', () => {
    expect(partnerBatchCursor('partner_changes:9007199254740993')).toBe(9007199254740993n);
    expect(partnerBatchCursor('morning_checkin:2026-11-16')).toBeNull();
  });
});

describe('Weekly Reset reminder', () => {
  // Sunday 2026-11-22, 19:00 PST; the Reset that evening plans the week of Monday Nov 23.
  const SUNDAY = '2026-11-22';
  const reset = (overrides: Partial<NotificationPlanInput>) =>
    only(
      input({ now: pst('19:00', SUNDAY), occurrences: [], tasks: [], dinner: null, ...overrides }),
      'weekly_reset_reminder',
    );

  it('comes at the chosen time while the week is not planned', () => {
    expect(reset({})).toEqual([
      {
        kind: 'weekly_reset_reminder',
        dedupeKey: `weekly_reset_reminder:${SUNDAY}`,
        send: true,
        urgent: false,
        message: {
          title: 'Weekly Reset',
          body: 'The week of Mon, Nov 23 doesn’t have a plan yet. Ready when you are.',
        },
      },
    ]);
    expect(reset({ now: pst('18:59', SUNDAY) })).toEqual([]);
    expect(reset({ now: pst('19:00', '2026-11-21') })).toEqual([]);
    expect(reset({ memberId: 'sam' })).toEqual([]);
  });

  it('is recorded but not sent when the week is already planned', () => {
    expect(reset({ committedWeeks: ['2026-11-23'] })).toMatchObject([
      { send: false, message: null },
    ]);
  });

  it('follows the chosen weekday and time, and waits out quiet hours', () => {
    const friday = settings({ weeklyReset: { weekday: 5, time: '20:30' } });
    expect(reset({ settings: friday, now: pst('20:30', '2026-11-20') })).toMatchObject([
      { dedupeKey: 'weekly_reset_reminder:2026-11-20', send: true },
    ]);
    const quiet = settings({ quietHours: { start: '18:00', end: '20:00' } });
    expect(reset({ settings: quiet })).toEqual([]);
    expect(reset({ settings: quiet, now: pst('20:00', SUNDAY) })).toHaveLength(1);
    expect(reset({ settings: settings({ weeklyResetReminder: false }) })).toEqual([]);
    expect(
      reset({
        log: [
          {
            kind: 'weekly_reset_reminder',
            dedupeKey: `weekly_reset_reminder:${SUNDAY}`,
            sentAt: pst('19:00', SUNDAY),
          },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps 19:00 local across the spring clock change', () => {
    // Sunday 2026-03-08 19:00 PDT is 02:00 UTC on Monday.
    expect(reset({ now: '2026-03-09T01:59:00Z' })).toEqual([]);
    expect(reset({ now: '2026-03-09T02:00:00Z' })).toMatchObject([
      { dedupeKey: 'weekly_reset_reminder:2026-03-08' },
    ]);
  });
});

describe('with default settings', () => {
  it('puts no name, place or title on the lock screen', () => {
    // Partner changes are opt-in; switched on here, details left at their default.
    const defaults: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      partnerChanges: true,
    };
    expect(DEFAULT_NOTIFICATION_SETTINGS.hideDetails).toBe(true);
    const context: PartnerContext = {
      ...emptyContext,
      items: new Map([
        [
          'car',
          {
            id: 'car',
            title: 'Car registration',
            ownerMemberId: 'theo',
            createdByMemberId: 'maya',
            visibility: 'household',
          },
        ],
      ]),
    };
    const audit: NotifierAuditRow[] = [
      {
        id: '10',
        actorMemberId: 'theo',
        action: 'work_item.updated',
        entityType: 'work_item',
        entityId: 'car',
        payload: { fields: ['owner_member_id'], fromOwnerMemberId: 'maya', ownerMemberId: 'theo' },
        createdAt: pst('07:00'),
      },
    ];
    const planned = [
      ...planNotifications(
        input({ now: pst('07:30'), settings: defaults, audit, partnerContext: context }),
      ),
      ...planNotifications(input({ now: pst('07:50'), settings: defaults })),
      ...planNotifications(input({ now: pst('19:05', '2026-11-15'), settings: defaults })),
    ];
    expect([...new Set(planned.map((p) => p.kind))].sort()).toEqual([
      'handoff_reminder',
      'morning_checkin',
      'partner_changes',
      'weekly_reset_reminder',
    ]);
    const text = planned.flatMap((p) => (p.message ? [p.message.title, p.message.body] : []));
    expect(text.length).toBeGreaterThanOrEqual(8);
    for (const word of [
      'June',
      'Maya',
      'Theo',
      'Sam',
      'Little Oaks',
      'drop-off',
      'salmon',
      'pay-daycare',
      'Car registration',
    ]) {
      expect({ word, found: text.filter((t) => t.includes(word)) }).toEqual({ word, found: [] });
    }
    expect(text).toContain('You have a handoff in 25 minutes.');
  });
});

describe('quiet-hours defaults and handoffs at night', () => {
  const reminders = (overrides: Partial<NotificationPlanInput>) =>
    only(input({ dinner: null, tasks: [], ...overrides }), 'handoff_reminder');
  const handoffAt = (start: string, date = DATE): EventSeries => ({
    ...dropOff(),
    id: `h-${date}-${start}`,
    recurrence: null,
    startsAt: start,
    endsAt: start,
  });
  const defaults = settings({ quietHours: DEFAULT_NOTIFICATION_SETTINGS.quietHours });

  it('default to 22:00–06:00', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.quietHours).toEqual({ start: '22:00', end: '06:00' });
  });

  it('deliver a reminder that falls in them when they end, with the minutes left', () => {
    const early = occurrencesFor([handoffAt(pst('06:20'))]);
    expect(reminders({ now: pst('05:50'), settings: defaults, occurrences: early })).toEqual([]);
    const at6 = reminders({ now: pst('06:00'), settings: defaults, occurrences: early });
    expect(at6.map((r) => r.message?.body)).toEqual(['In 20 minutes, at Little Oaks.']);
    // Exactly five minutes left at 06:00 is still enough; less is not.
    const five = occurrencesFor([handoffAt(pst('06:05'))]);
    expect(reminders({ now: pst('06:00'), settings: defaults, occurrences: five })).toHaveLength(1);
    const three = occurrencesFor([handoffAt(pst('06:03'))]);
    for (const time of ['06:00', '06:01', '06:02']) {
      expect(reminders({ now: pst(time), settings: defaults, occurrences: three })).toEqual([]);
    }
  });

  it('cross midnight: a 00:20 handoff falls in quiet hours that end after it, so none', () => {
    const night = occurrencesFor([handoffAt(pst('00:20', '2026-11-17'))], DATE);
    for (const time of ['21:50', '23:50']) {
      expect(reminders({ now: pst(time), settings: defaults, occurrences: night })).toEqual([]);
    }
    // Before quiet hours begin, an evening handoff is reminded as usual.
    const evening = occurrencesFor([handoffAt(pst('22:10'))]);
    expect(reminders({ now: pst('21:40'), settings: defaults, occurrences: evening })).toHaveLength(
      1,
    );
    expect(reminders({ now: pst('22:00'), settings: defaults, occurrences: evening })).toEqual([]);
  });

  it('end at 06:00 local on the days the clocks change', () => {
    // Spring forward (Sunday 2026-03-08): 06:20 PDT is 13:20Z; quiet hours end 06:00 PDT, 13:00Z.
    const spring = occurrencesFor([handoffAt('2026-03-08T13:20:00Z')], '2026-03-08');
    const at = (now: string, occurrences: typeof spring) =>
      reminders({ now, settings: defaults, occurrences }).map((r) => r.message?.body);
    expect(at('2026-03-08T12:55:00Z', spring)).toEqual([]);
    expect(at('2026-03-08T13:00:00Z', spring)).toEqual(['In 20 minutes, at Little Oaks.']);
    // Fall back (Sunday 2026-11-01): 06:20 PST is 14:20Z; quiet hours end 06:00 PST, 14:00Z.
    const fall = occurrencesFor([handoffAt('2026-11-01T14:20:00Z')], '2026-11-01');
    expect(at('2026-11-01T13:55:00Z', fall)).toEqual([]);
    expect(at('2026-11-01T14:00:00Z', fall)).toEqual(['In 20 minutes, at Little Oaks.']);
  });
});

describe('the first partner batch', () => {
  const on = settings({ partnerChanges: true });
  const context: PartnerContext = {
    ...emptyContext,
    items: new Map([
      [
        'car',
        {
          id: 'car',
          title: 'Car registration',
          ownerMemberId: 'theo',
          createdByMemberId: 'maya',
          visibility: 'household',
        },
      ],
    ]),
  };
  const took = (createdAt: string): NotifierAuditRow => ({
    id: '50',
    actorMemberId: 'theo',
    action: 'work_item.updated',
    entityType: 'work_item',
    entityId: 'car',
    payload: { fields: ['owner_member_id'], fromOwnerMemberId: 'maya', ownerMemberId: 'theo' },
    createdAt,
  });
  const batch = (createdAt: string, lastSeenAt: string | null) =>
    only(
      input({
        now: pst('09:00'),
        settings: on,
        audit: [took(createdAt)],
        partnerContext: context,
        lastSeenAt,
      }),
      'partner_changes',
    ).map((p) => p.dedupeKey);

  it('looks back to when the member last looked, or a day', () => {
    // Three hours ago, before an hour's lookback but after they last looked: still news.
    expect(batch(pst('06:00'), pst('21:00', '2026-11-15'))).toEqual(['partner_changes:50']);
    // Already seen in the app.
    expect(batch(pst('06:00'), pst('07:00'))).toEqual([]);
    // Never looked: a day back, no further.
    expect(batch(pst('10:00', '2026-11-15'), null)).toEqual(['partner_changes:50']);
    expect(batch(pst('08:00', '2026-11-15'), null)).toEqual([]);
    expect(batch(pst('08:00', '2026-11-15'), pst('08:00', '2026-11-14'))).toEqual([]);
  });
});
