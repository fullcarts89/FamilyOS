import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { Temporal } from 'temporal-polyfill';
import { CalendarFetchError } from './fetch';

/**
 * ICS to occurrences (RFC 5545, permissively): every VEVENT that overlaps a window, recurring
 * ones expanded (RRULE, RDATE, EXDATE, RECURRENCE-ID overrides, cancelled instances dropped).
 *
 * Times: UTC stays UTC; a TZID that names an IANA zone is converted with the IANA rules; any
 * other TZID (Outlook's "Pacific Standard Time") uses the file's own VTIMEZONE; floating times
 * and all-day dates are in the household's timezone.
 *
 * Only what the rhythm needs is kept: title, location and times. Descriptions, attendees and
 * organizers are never read.
 */

export interface ImportedOccurrence {
  uid: string;
  /** 'single' for a one-off event, else the occurrence's original start (RECURRENCE-ID). */
  recurrenceId: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

export interface ParseWindow {
  /** Instants, inclusive start and exclusive end. */
  from: Temporal.Instant;
  to: Temporal.Instant;
  /** For floating times and all-day dates: the household's. */
  timeZone: string;
}

export const MAX_OCCURRENCES = 5000;
const MAX_STEPS_PER_EVENT = 20_000;

const ianaZones = new Map<string, boolean>();
function isIanaZone(tzid: string): boolean {
  let known = ianaZones.get(tzid);
  if (known === undefined) {
    try {
      Temporal.Now.zonedDateTimeISO(tzid);
      known = true;
    } catch {
      known = false;
    }
    ianaZones.set(tzid, known);
  }
  return known;
}

/** Plain text, no control characters, trimmed to `max`. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length === 0 ? null : text.slice(0, max);
}

const plain = (t: ICAL.Time) =>
  new Temporal.PlainDateTime(t.year, t.month, t.day, t.hour, t.minute, t.second);

/** An ICAL time as an instant, following the rules above. */
function toInstant(t: ICAL.Time, tzid: string | null, fallbackZone: string): Temporal.Instant {
  if (t.isDate) {
    return Temporal.PlainDate.from({ year: t.year, month: t.month, day: t.day })
      .toZonedDateTime({ timeZone: fallbackZone })
      .toInstant();
  }
  if (t.zone?.tzid === 'UTC') return plain(t).toZonedDateTime('UTC').toInstant();
  if (tzid && isIanaZone(tzid)) {
    return plain(t).toZonedDateTime(tzid, { disambiguation: 'compatible' }).toInstant();
  }
  if (tzid && t.zone && t.zone !== ICAL.Timezone.localTimezone) {
    // Defined by the file's own VTIMEZONE.
    return Temporal.Instant.fromEpochMilliseconds(Math.round(t.toUnixTime() * 1000));
  }
  return plain(t).toZonedDateTime(fallbackZone, { disambiguation: 'compatible' }).toInstant();
}

const tzidOf = (component: ICAL.Component, name: 'dtstart' | 'dtend'): string | null => {
  const value = component.getFirstProperty(name)?.getParameter('tzid');
  return typeof value === 'string' ? value : null;
};

function uidOf(component: ICAL.Component): string {
  const uid = clean(component.getFirstPropertyValue('uid'), 1000);
  if (uid && uid.length <= 500) return uid;
  const basis =
    uid ??
    `${String(component.getFirstPropertyValue('dtstart'))}|${String(component.getFirstPropertyValue('summary'))}`;
  return `sha256:${createHash('sha256').update(basis).digest('hex')}`;
}

const isCancelled = (component: ICAL.Component) =>
  String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

/** Start and end instants of one occurrence of `component`, end never before start. */
function span(
  component: ICAL.Component,
  start: ICAL.Time,
  end: ICAL.Time,
  zone: string,
): { startsAt: Temporal.Instant; endsAt: Temporal.Instant; allDay: boolean } {
  const allDay = start.isDate;
  const startsAt = toInstant(start, tzidOf(component, 'dtstart'), zone);
  let endsAt = toInstant(end, tzidOf(component, 'dtend') ?? tzidOf(component, 'dtstart'), zone);
  if (Temporal.Instant.compare(endsAt, startsAt) <= 0 && allDay) {
    // A date with no end lasts the day.
    endsAt = Temporal.PlainDate.from({ year: start.year, month: start.month, day: start.day })
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: zone })
      .toInstant();
  }
  if (Temporal.Instant.compare(endsAt, startsAt) < 0) endsAt = startsAt;
  return { startsAt, endsAt, allDay };
}

function overlaps(
  o: { startsAt: Temporal.Instant; endsAt: Temporal.Instant },
  window: ParseWindow,
): boolean {
  if (Temporal.Instant.compare(o.startsAt, window.to) >= 0) return false;
  if (Temporal.Instant.compare(o.startsAt, o.endsAt) === 0)
    return Temporal.Instant.compare(o.startsAt, window.from) >= 0;
  return Temporal.Instant.compare(o.endsAt, window.from) > 0;
}

function occurrence(
  component: ICAL.Component,
  uid: string,
  recurrenceId: string,
  times: { startsAt: Temporal.Instant; endsAt: Temporal.Instant; allDay: boolean },
): ImportedOccurrence {
  return {
    uid,
    recurrenceId,
    title: clean(component.getFirstPropertyValue('summary'), 200) ?? 'Busy',
    location: clean(component.getFirstPropertyValue('location'), 200),
    startsAt: times.startsAt.toString(),
    endsAt: times.endsAt.toString(),
    allDay: times.allDay,
  };
}

/** Parses ICS text into occurrences overlapping the window. Throws CalendarFetchError. */
export function parseCalendar(text: string, window: ParseWindow): ImportedOccurrence[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new CalendarFetchError('not_calendar');
  }
  if (root.name !== 'vcalendar') throw new CalendarFetchError('not_calendar');

  const zone = window.timeZone;
  const vevents = root.getAllSubcomponents('vevent');
  // Overrides (RECURRENCE-ID) belong to their series, by UID.
  const overrides = new Map<string, ICAL.Component[]>();
  const masters: ICAL.Component[] = [];
  for (const vevent of vevents) {
    if (!vevent.getFirstProperty('dtstart')) continue;
    if (vevent.getFirstProperty('recurrence-id')) {
      const uid = uidOf(vevent);
      overrides.set(uid, [...(overrides.get(uid) ?? []), vevent]);
    } else {
      masters.push(vevent);
    }
  }

  const out: ImportedOccurrence[] = [];
  const push = (o: ImportedOccurrence) => {
    out.push(o);
    if (out.length > MAX_OCCURRENCES) throw new CalendarFetchError('too_many_events');
  };
  const masterUids = new Set<string>();

  for (const master of masters) {
    const uid = uidOf(master);
    masterUids.add(uid);
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(master);
      for (const override of overrides.get(uid) ?? []) event.relateException(override);
    } catch {
      continue;
    }

    if (!event.isRecurring()) {
      if (isCancelled(master)) continue;
      const times = span(master, event.startDate, event.endDate, zone);
      if (overlaps(times, window)) push(occurrence(master, uid, 'single', times));
      continue;
    }

    const masterTzid = tzidOf(master, 'dtstart');
    // Occurrences moved by an override can land up to a month away from their slot.
    const stopAfter = window.to.add({ hours: 24 * 31 });
    const iterator = event.iterator();
    for (let step = 0; step < MAX_STEPS_PER_EVENT; step++) {
      let next: ICAL.Time | null;
      try {
        next = iterator.next();
      } catch {
        break;
      }
      if (!next) break;
      if (Temporal.Instant.compare(toInstant(next, masterTzid, zone), stopAfter) > 0) break;
      const details = event.getOccurrenceDetails(next);
      const item = details.item.component;
      if (isCancelled(item)) continue;
      const times = span(item, details.startDate, details.endDate, zone);
      if (!overlaps(times, window)) continue;
      const rid = details.recurrenceId.isDate
        ? `${details.recurrenceId.year}-${String(details.recurrenceId.month).padStart(2, '0')}-${String(details.recurrenceId.day).padStart(2, '0')}`
        : toInstant(details.recurrenceId, masterTzid, zone).toString();
      push(occurrence(item, uid, rid, times));
    }
  }

  // Overrides whose series isn't in the file (some servers publish them alone): one-offs.
  for (const [uid, list] of overrides) {
    if (masterUids.has(uid)) continue;
    for (const vevent of list) {
      if (isCancelled(vevent)) continue;
      const event = new ICAL.Event(vevent);
      const times = span(vevent, event.startDate, event.endDate, zone);
      if (!overlaps(times, window)) continue;
      const ridProp = vevent.getFirstPropertyValue('recurrence-id');
      const rid =
        ridProp instanceof ICAL.Time
          ? toInstant(
              ridProp,
              vevent.getFirstProperty('recurrence-id')?.getParameter('tzid') as string | null,
              zone,
            ).toString()
          : times.startsAt.toString();
      push(occurrence(vevent, uid, rid, times));
    }
  }

  // One row per (UID, RECURRENCE-ID): a broken file can repeat itself.
  const seen = new Set<string>();
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.uid.localeCompare(b.uid));
  return out.filter((o) => {
    const key = `${o.uid}\u0000${o.recurrenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
