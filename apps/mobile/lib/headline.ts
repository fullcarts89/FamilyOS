import type { NextEntry } from '../components/rhythm/NextUp';
import { lateWords, type LateCounts } from '../components/rhythm/today-model';
import type { Occurrence, RhythmResponse } from './api';
import { addDays } from './dates';
import type { People, Person } from './people';
import { CARE_VERB, localParts, timeOf, whenFromNow } from './rhythm';

export interface Phrase {
  text: string;
  /** A person's name in their own color. */
  color?: string;
}

const name = (p: Person | null, capital = true) =>
  p ? (p.isMe ? (capital ? 'You' : 'you') : p.name) : capital ? 'Someone' : 'someone';

/**
 * Today's headline and one supporting line, derived only from the day's real data: the next
 * handoff, else the next thing on the calendar, else a plain "that's the day". Nothing invented.
 * `late` counts what's late the way Today's lists show it, yours first ("1 of yours is running
 * late · Theo has 2"); without it, the household's total.
 */
export function headline({
  rhythm,
  entries,
  week,
  people,
  now,
  timeZone,
  late: lateCounts,
}: {
  rhythm: RhythmResponse;
  entries: NextEntry[];
  week: Occurrence[];
  people: People;
  now: Date;
  timeZone: string;
  late?: LateCounts;
}): { title: Phrase[]; line: string } {
  const overdue = rhythm.summary.overdue;
  const lateLine = lateCounts
    ? lateWords(lateCounts)
    : overdue > 0
      ? `${overdue === 1 ? 'one thing is' : `${overdue} things are`} running late`
      : null;
  const title: Phrase[] = [];
  let lateInTitle = false;
  const next = rhythm.summary.nextHandoff;
  const isToday = rhythm.date === rhythm.today;
  const t = now.getTime();

  if (isToday && next && new Date(next.time).getTime() > t) {
    const who = people.byId(next.byMemberIds[0]);
    const child = people.byId(next.careMemberId);
    const what = `${child?.name ?? 'the'}’s ${CARE_VERB[next.action]}`;
    if (who) {
      title.push({ text: name(who), color: who.color });
      title.push({
        text: ` ${who.isMe ? 'have' : 'has'} ${what} ${whenFromNow(next.time, now, timeZone)}.`,
      });
    } else {
      title.push({ text: `Nobody has ${what} ${whenFromNow(next.time, now, timeZone)} yet.` });
    }
  } else {
    const upcoming = entries.find((e) => new Date(e.startsAt).getTime() > t && e.kind !== 'task');
    if (isToday && upcoming) {
      const lead = upcoming.people.filter((p) => !p.caredFor);
      if (lead.length === 1 && lead[0]) {
        const p = lead[0];
        title.push({ text: p.isMe ? 'Your' : `${p.name}’s`, color: p.color });
        title.push({
          text: ` next: ${upcoming.title} ${whenFromNow(upcoming.startsAt, now, timeZone)}.`,
        });
      } else {
        title.push({
          text: `Next: ${upcoming.title} ${whenFromNow(upcoming.startsAt, now, timeZone)}.`,
        });
      }
    } else {
      // Never "all done" while something is late: say what's still open instead.
      const lateText = lateLine ? ` ${lateLine.charAt(0).toUpperCase()}${lateLine.slice(1)}.` : '';
      lateInTitle = !!lateLine;
      if (entries.length > 0) {
        title.push({
          text: lateLine ? `No more plans today.${lateText}` : 'That’s the day’s plans done.',
        });
      } else {
        title.push({ text: `A quiet day on the calendar.${lateText}` });
      }
    }
  }

  // The supporting line: where the children are, what's yours today, and tomorrow's first handoff.
  const facts: string[] = [];
  const nowMin = localParts(now, timeZone).minutes;
  for (const lane of rhythm.lanes) {
    if (!lane.caredFor) continue;
    const p = people.byId(lane.memberId);
    const seg = lane.segments.find(
      (s) => new Date(s.startsAt).getTime() <= t && new Date(s.endsAt).getTime() > t,
    );
    if (!p || !seg || !isToday) continue;
    const until = localParts(seg.endsAt, timeZone).minutes;
    const endsToday = until > nowMin && localParts(seg.endsAt, timeZone).date === rhythm.date;
    if (seg.location.kind === 'away') {
      facts.push(
        `${p.name}’s at ${seg.location.place ?? 'their place'}${endsToday ? ` until ${timeOf(seg.endsAt, timeZone)}` : ''}`,
      );
    } else if (seg.withMemberIds.length > 0 && endsToday) {
      const by = seg.withMemberIds.map((id) => people.byId(id)).filter((x): x is Person => !!x);
      facts.push(
        `${p.name}’s home with ${by.length > 1 ? 'you both' : name(by[0] ?? null, false)} until ${timeOf(seg.endsAt, timeZone)}`,
      );
    }
  }
  const me = people.me;
  const mine = rhythm.lanes.find((l) => l.memberId === me?.id);
  if (mine) {
    const open = [...mine.tasks.timed, ...mine.tasks.dueToday].filter(
      (x) => !['verified_complete', 'done_unverified', 'cancelled'].includes(x.status),
    ).length;
    if (open > 0) facts.push(`you have ${open === 1 ? 'one thing' : `${open} things`} due today`);
  }
  if (lateLine && !lateInTitle) facts.push(lateLine);
  if (isToday && nowMin >= 17 * 60) {
    const tomorrow = addDays(rhythm.date, 1);
    const first = week
      .filter((o) => o.date === tomorrow && !o.skipped && o.careAction && !o.allDay)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    if (first && first.careAction) {
      const who = people.byId(first.memberIds.find((id) => !people.byId(id)?.caredFor));
      const child = people.byId(first.careMemberId);
      facts.push(
        `tomorrow, ${who ? (who.isMe ? 'you have' : `${who.name} has`) : 'nobody has'} ${child?.name ?? 'the'}’s ${CARE_VERB[first.careAction]} at ${timeOf(first.startsAt, timeZone)}`,
      );
    }
  }
  const line = facts.length
    ? `${facts
        .map((f, i) => (i === 0 ? f.charAt(0).toUpperCase() + f.slice(1) : f))
        .join('. ')
        .replace(/\. ([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)}.`
    : '';
  return { title, line };
}
