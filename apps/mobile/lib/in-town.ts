import type { AwayPeriodView, PresenceView, VisitorView } from './api';
import { addDays, daysBetween, relativeDay, shortDate, weekdayName } from './dates';
import type { People } from './people';

/** All these words need: a member's name, and whether it's you. */
type Who = Pick<People, 'byId'>;

/**
 * Who's in town, in the app's words (docs/plan/whos-in-town.md): who's away and when they're
 * back, who's visiting, and what an away period hands over. Short and plain; nothing here
 * counts anyone's work against anyone else's.
 */

/** "Fri" within a week, "tomorrow", else "Nov 30": for the middle of a sentence. */
function soon(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff >= 2 && diff < 7) return weekdayName(date).slice(0, 3);
  return relativeDay(date, today, { late: false });
}

const possessive = (name: string) => `${name}’s`;

/** "Sam’s away, back Fri", "You’re away", "June’s away from Thu". */
export function awayLine(period: AwayPeriodView, people: Who, today: string): string {
  const who = people.byId(period.memberId);
  const subject = who?.isMe ? 'You’re' : possessive(who?.name ?? 'Someone');
  const starting = period.startsOn > today ? ` from ${soon(period.startsOn, today)}` : '';
  const back = period.backOn ? `, back ${soon(period.backOn, today)}` : '';
  return `${subject} away${starting}${back}`;
}

/** "Grandma’s here until Sun", "Grandma arrives Sat". */
export function visitorLine(visitor: VisitorView, today: string): string {
  if (visitor.arrivesOn > today) return `${visitor.name} arrives ${soon(visitor.arrivesOn, today)}`;
  if (visitor.leavesOn === today) return `${visitor.name} leaves today`;
  return `${visitor.name} is here until ${soon(visitor.leavesOn, today)}`;
}

/**
 * Today's one line: everyone away (or leaving within a week), visiting, or arriving within a
 * week, joined with " · ".
 * Null when everyone is home and nobody is coming.
 */
export function townWords(
  presence: PresenceView | null | undefined,
  people: Who,
  today: string,
): string | null {
  if (!presence) return null;
  const parts = [
    ...presence.away.map((p) => awayLine(p, people, today)),
    ...(presence.leaving ?? []).map((p) => awayLine(p, people, today)),
    ...presence.visiting.map((v) => visitorLine(v, today)),
    ...presence.arriving.map((v) => visitorLine(v, today)),
  ];
  return parts.length ? parts.join(' · ') : null;
}

/** "Wed, Nov 18 to Fri, Nov 20", "From Nov 18, no end yet". */
export function awayRange(period: Pick<AwayPeriodView, 'startsOn' | 'endsOn'>, today: string) {
  const day = (d: string) => `${weekdayName(d).slice(0, 3)}, ${shortDate(d, today)}`;
  if (period.endsOn === null) return `From ${day(period.startsOn)}, no end yet`;
  if (period.endsOn === period.startsOn) return day(period.startsOn);
  return `${day(period.startsOn)} to ${day(period.endsOn)}`;
}

/** "Sat, Nov 21 to Tue, Nov 24" for a visit. */
export const visitRange = (visitor: Pick<VisitorView, 'arrivesOn' | 'leavesOn'>, today: string) =>
  awayRange({ startsOn: visitor.arrivesOn, endsOn: visitor.leavesOn }, today);

/** "Theo covers", "You cover", "Nobody covers": who takes what would land on them. */
export function coverLine(period: Pick<AwayPeriodView, 'coverMemberId'>, people: Who) {
  const cover = people.byId(period.coverMemberId);
  if (!cover) return 'Nobody covers';
  return cover.isMe ? 'You cover' : `${cover.name} covers`;
}

/**
 * The Today nudge for an adult: "3 of Sam’s things are due while Sam’s away. They can go to
 * you." Null when there's nothing to review.
 */
export function handoverNudge(
  h: { memberId: string; coverMemberId: string | null; count: number },
  people: Who,
): string | null {
  if (h.count === 0) return null;
  const who = people.byId(h.memberId);
  const cover = people.byId(h.coverMemberId);
  const whose = who?.isMe ? 'your' : possessive(who?.name ?? 'someone');
  const away = who?.isMe ? 'you’re' : possessive(who?.name ?? 'they');
  const to = cover?.isMe ? 'you' : (cover?.name ?? 'the adult at home');
  const verb = h.count === 1 ? 'is' : 'are';
  return `${h.count} of ${whose} things ${verb} due while ${away} away. ${h.count === 1 ? 'It' : 'They'} can go to ${to}.`;
}

/** The toast after a hand-over: "2 things go to Theo while Sam’s away." */
export function handoverDone(
  moved: number,
  period: Pick<AwayPeriodView, 'memberId' | 'coverMemberId'>,
  people: Who,
): string {
  const cover = people.byId(period.coverMemberId);
  const who = people.byId(period.memberId);
  const away = who?.isMe ? 'you’re' : `${who?.name ?? 'they'}’s`;
  if (moved === 0) return 'Kept as they were.';
  const things = moved === 1 ? '1 thing goes' : `${moved} things go`;
  return `${things} to ${cover?.isMe ? 'you' : (cover?.name ?? 'them')} while ${away} away.`;
}

/** The toast after shortening or removing: "2 things went back to Sam." */
export function givenBack(returned: number, memberId: string, people: Who): string | null {
  if (returned === 0) return null;
  const who = people.byId(memberId);
  const to = who?.isMe ? 'you' : (who?.name ?? 'them');
  return `${returned === 1 ? '1 thing went' : `${returned} things went`} back to ${to}.`;
}

/** Away periods and visits for a week: who's away which days, and who's staying. */
export function weekLines(
  presence: PresenceView | null | undefined,
  people: Who,
  weekStart: string,
): string[] {
  if (!presence) return [];
  const weekEnd = addDays(weekStart, 6);
  const span = (from: string, to: string | null) => {
    const a = from < weekStart ? weekStart : from;
    const b = to === null || to > weekEnd ? weekEnd : to;
    const day = (d: string) => weekdayName(d).slice(0, 3);
    if (a === weekStart && b === weekEnd) return 'all week';
    return a === b ? day(a) : `${day(a)}–${day(b)}`;
  };
  return [
    ...presence.away.map((p) => {
      const who = people.byId(p.memberId);
      const name = who?.isMe ? 'You' : (who?.name ?? 'Someone');
      const cover = people.byId(p.coverMemberId);
      const covering = cover ? `; ${cover.isMe ? 'you cover' : `${cover.name} covers`}` : '';
      return `${name} away ${span(p.startsOn, p.endsOn)}${covering}`;
    }),
    ...(presence.leaving ?? []).map((p) => {
      const who = people.byId(p.memberId);
      const name = who?.isMe ? 'You' : (who?.name ?? 'Someone');
      return `${name} away from ${weekdayName(p.startsOn).slice(0, 3)} ${shortDate(p.startsOn)}`;
    }),
    ...presence.visiting.map((v) => `${v.name} visiting ${span(v.arrivesOn, v.leavesOn)}`),
    ...presence.arriving.map(
      (v) => `${v.name} arrives ${weekdayName(v.arrivesOn).slice(0, 3)} ${shortDate(v.arrivesOn)}`,
    ),
  ];
}

/**
 * A routine turn the cover takes is paid back (owner decision 2026-11-24): "Sam takes Theo’s
 * next turn after Sam’s back." With `count`, "next 2 turns".
 */
export function paybackLine(
  period: Pick<AwayPeriodView, 'memberId' | 'coverMemberId'>,
  people: Who,
  count = 1,
): string {
  const who = people.byId(period.memberId);
  const cover = people.byId(period.coverMemberId);
  const takes = who?.isMe ? 'You take' : `${who?.name ?? 'They'} takes`;
  const whose = cover?.isMe ? 'your' : possessive(cover?.name ?? 'their');
  const turns = count === 1 ? 'next turn' : `next ${count} turns`;
  const back = who?.isMe ? 'you’re' : possessive(who?.name ?? 'they');
  return `${takes} ${whose} ${turns} after ${back} back.`;
}
