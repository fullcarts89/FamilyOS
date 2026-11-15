import { addDays, dayOfWeek } from './dates';

/**
 * Reads quick-capture shorthand as you type: "Call the plumber tomorrow @sam #bathroom !".
 * Deterministic and local (no AI): people by first name after @ or "for", a day word, a project
 * by a word of its title after #, and "!" for important. What it finds is removed from the title.
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
  projectId: string | null;
  important: boolean;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    projectId,
    important,
  };
}
