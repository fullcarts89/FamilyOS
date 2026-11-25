import { isValidDuration } from '@familyos/domain';
import { addDays, dayOfWeek, parseTime } from './dates';

/**
 * Reads quick-capture shorthand as you type: "Call the plumber tomorrow @sam #bathroom !".
 * Deterministic and local (no AI): people by first name after @ or "for", a day word, a time
 * ("at 5:30pm", "at 17:30", "5:30pm") and with it a length ("for 30 min", "for 1 hour", "for 1h"),
 * a project by a word of its title after #, and "!" for important. What it finds is removed from
 * the title.
 */
export interface CapturePerson {
  id: string;
  name: string;
  isMe: boolean;
}
export interface CaptureProject {
  id: string;
  title: string;
}

export interface ParsedCapture {
  title: string;
  /** undefined: nothing typed (keep the chosen target); null: shared ("us", "either"). */
  ownerId: string | null | undefined;
  dueOn: string | null;
  dueLabel: string | null;
  /** A time of day, "HH:MM" (24-hour), or null. */
  time: string | null;
  /** With a time: how long it takes, in minutes (5 to 720, in fives), or null. */
  durationMinutes: number | null;
  /** The words the time was read from ("at 5:30pm"), so a time picked instead can replace them. */
  timeWords: string | null;
  /** The words the length was read from ("for 30 min"). */
  lengthWords: string | null;
  projectId: string | null;
  important: boolean;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "at 5:30pm", "at 17:30", "at 6 pm": "at" as its own word, then a time with minutes or am/pm. */
const AT_TIME = /\sat\s+(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)(?=\s)/i;
/** "5:30pm", "6pm" on their own: only with am or pm, so "3:16" or "route 66" stay words. */
const BARE_TIME = /\s(\d{1,2}(?::\d{2})?\s?(?:am|pm))(?=\s)/i;
/** "for 30 min", "for 45 minutes", "for 1 hour", "for 1.5 hours", "for 2h", "for 1h30". */
const FOR_LENGTH =
  /\sfor\s+(?:(\d{1,3})\s?(?:m|min|mins|minute|minutes)|(\d{1,2}(?:\.5)?)\s?(?:h|hr|hrs|hour|hours)|(\d{1,2})h\s?(\d{1,2})\s?m?|(an?|one)\s+hour|(half an)\s+hour)(?=\s)/i;

/** A length typed after "for", in minutes, or null when it isn't one. */
function lengthOf(m: RegExpExecArray): number | null {
  const [, mins, hours, h, hm, anHour, half] = m;
  const minutes = mins
    ? Number(mins)
    : hours
      ? Number(hours) * 60
      : h
        ? Number(h) * 60 + Number(hm)
        : anHour
          ? 60
          : half
            ? 30
            : NaN;
  return isValidDuration(minutes) ? minutes : null;
}

export function parseCapture(
  raw: string,
  today: string | null,
  people: CapturePerson[],
  projects: CaptureProject[],
): ParsedCapture {
  let text = ` ${raw.trim()} `;
  let ownerId: string | null | undefined;
  let dueOn: string | null = null;
  let dueLabel: string | null = null;
  let time: string | null = null;
  let durationMinutes: number | null = null;
  let timeWords: string | null = null;
  let lengthWords: string | null = null;
  let projectId: string | null = null;
  let important = false;

  const firstNames = people
    .map((p) => p.name.split(/\s+/)[0]?.toLowerCase() ?? '')
    .filter(Boolean)
    .map(escape);
  const who = new RegExp(
    `\\s(?:@|for\\s+)(${[...firstNames, 'me', 'us', 'both', 'shared', 'either', 'anyone'].join('|')})(?=\\s)`,
    'i',
  ).exec(text);
  if (who) {
    const w = (who[1] ?? '').toLowerCase();
    if (w === 'me') ownerId = people.find((p) => p.isMe)?.id;
    else if (['us', 'both', 'shared', 'either', 'anyone'].includes(w)) ownerId = null;
    else ownerId = people.find((p) => p.name.split(/\s+/)[0]?.toLowerCase() === w)?.id;
    text = text.replace(who[0], ' ');
  }

  if (today) {
    const day =
      /\s(today|tonight|tomorrow|this weekend|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=\s)/i.exec(
        text,
      );
    if (day) {
      const d = (day[1] ?? '').toLowerCase();
      const dow = dayOfWeek(today);
      if (d === 'today' || d === 'tonight') {
        dueOn = today;
        dueLabel = d === 'tonight' ? 'Tonight' : 'Today';
      } else if (d === 'tomorrow') {
        dueOn = addDays(today, 1);
        dueLabel = 'Tomorrow';
      } else if (d === 'this weekend') {
        dueOn = dow >= 6 ? today : addDays(today, 6 - dow);
        dueLabel = 'This weekend';
      } else if (d === 'next week') {
        dueOn = addDays(today, 8 - dow);
        dueLabel = 'Next week';
      } else {
        const target = WEEKDAYS.indexOf(d) + 1;
        const diff = (target - dow + 7) % 7 || 7;
        dueOn = addDays(today, diff);
        dueLabel = (d[0] ?? '').toUpperCase() + d.slice(1);
      }
      text = text.replace(day[0], ' ');
    }
  }

  // A time: after "at" (with minutes or am/pm), or on its own with am/pm.
  for (const pattern of [AT_TIME, BARE_TIME]) {
    const found = pattern.exec(text);
    const token = found?.[1] ?? '';
    if (!found || (pattern === AT_TIME && !/:\d{2}|am|pm/i.test(token))) continue;
    const parsed = parseTime(token);
    if (!parsed) continue;
    time = parsed;
    timeWords = found[0].trim();
    text = text.replace(found[0], ' ');
    break;
  }
  // A length only means something with a time; without one, "for 30 min" stays in the words.
  if (time) {
    const found = FOR_LENGTH.exec(text);
    const minutes = found ? lengthOf(found) : null;
    if (found && minutes !== null) {
      durationMinutes = minutes;
      lengthWords = found[0].trim();
      text = text.replace(found[0], ' ');
    }
  }

  const tag = /\s#([\p{L}\p{N}-]+)(?=\s)/iu.exec(text);
  if (tag) {
    const word = (tag[1] ?? '').toLowerCase();
    const match = projects.find((p) =>
      p.title
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .some((w) => w.length > 0 && (w === word || (word.length >= 3 && w.startsWith(word)))),
    );
    if (match) {
      projectId = match.id;
      text = text.replace(tag[0], ' ');
    }
  }

  if (/\s!+(?=\s)/.test(text)) {
    important = true;
    text = text.replace(/\s!+(?=\s)/, ' ');
  }

  const title = text.replace(/\s+/g, ' ').trim();
  return {
    title: title ? (title[0] ?? '').toUpperCase() + title.slice(1) : '',
    ownerId,
    dueOn,
    dueLabel,
    time,
    durationMinutes,
    timeWords,
    lengthWords,
    projectId,
    important,
  };
}

/**
 * The capture text without words the parser read (`timeWords`, `lengthWords`): a time tapped in
 * the sheet replaces a typed one, the way tapping a list replaces a typed @name.
 */
export function withoutWords(raw: string, ...words: (string | null)[]): string {
  let text = ` ${raw} `;
  for (const w of words) {
    if (!w) continue;
    const at = new RegExp(`\\s${escape(w)}(?=\\s)`, 'i').exec(text);
    if (at) text = text.slice(0, at.index) + ' ' + text.slice(at.index + at[0].length);
  }
  return text.replace(/\s+/g, ' ').trim();
}
