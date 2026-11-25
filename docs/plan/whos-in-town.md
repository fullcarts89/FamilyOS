# Who's in town: away periods and visitors

Asked for on 2026-11-24: "note when people are in town, or are not in town … family/friends
visiting (to plan ahead), or someone from the household is out of town, which means tasks are
routed to the individual at home."

**Owner decisions (2026-11-24):** things that already exist are **suggested, then confirmed**
(nothing moves until an adult says so); what's due **the day they're back stays theirs**; a
routine turn the adult at home takes is **paid back** with that adult's next turn; **children and
pets** can be marked away too, and their handoffs get a **nudge** to skip.

Two small records, both household-scoped like everything else, and one routing rule built on what
already exists (owner changes, covers, routine turns and turn swaps). No model call anywhere.
Rules: `packages/domain/src/presence.ts`. API: `apps/api/src/routes/presence.ts`. Tables:
`supabase/migrations/20261124000100_whos_in_town.sql`.

## Away periods

A member is away from a first day through a last day (inclusive, local dates in the household's
timezone), or from a first day with no end yet ("open-ended"). The day after the last day is the
day they're back. Owners and adults add, change and remove away periods for anyone in the
household, themselves included; caregivers see them and change nothing. One member's away periods
never share a day.

An account holder's away period names **who covers**: an owner or adult (the roles that work on
tasks), never the member themselves. It defaults to the other adult when there's exactly one;
"Nobody" is a choice. Covers never chain: on a day the cover is away too, nothing routes to them.

### What moves, and when

| Work | Rule | How |
|---|---|---|
| Tasks and issues they own, due on a day they're away | **Suggested.** The sheet lists them, ticked; an adult unticks what stays and confirms. Unticked ones are kept and not suggested again | Owner change, versioned and audited (`work_item.handed_over`), recorded as a hand-over of that period |
| Routine turns of theirs that already exist, on a day they're away | Suggested the same way | The same hand-over; paid back (below) |
| Routine turns created later, on a day they're away | **Go to the cover as the scheduler creates them**; the Weekly Reset shows them that way already | The same hand-over record (created by the scheduler); paid back |
| Care handoffs they're down for, on a day they're away | **The cover is down for them, on read**; another adult already on it just keeps it | Like a cover, computed from the away period and never stored, so it follows every edit. A cover or skip someone set on the occurrence wins |

- **Day they're back:** what's due on the day after the last day away stays theirs.
- **Open-ended:** everything they own with a due date from the first day on is suggested; turns
  and handoffs go to the cover until the away period gets an end.
- **Never moved:** private items (moving one would show it to someone who can't see it); items
  without a due date; inbox items; projects (their tasks move one by one); anything done or
  cancelled; anything already late; and anything due on a day the cover is away too. When both
  adults are away nothing moves, and a handoff nobody is down for shows "nobody has it yet" on
  Today as it always has.
- **Assigning while away:** allowed, and it isn't routed again.

### Paying a turn back

When the cover takes a routine turn of the away member's (confirmed, or created by the scheduler),
the away member takes the cover's first turn on or after the day they're back that isn't skipped
and falls on a day they're home: an owner override, like a turn swap. Two turns taken, two turns
paid back. It applies to routines both of them take turns in; while open-ended there's nothing to
pay back with yet, and setting an end places the paybacks. "N days after it's done" routines have
no dates ahead, so nothing is paid back there.

### Undo

Each hand-over is recorded with its away period. Moving the last day earlier, changing the first
day or the cover, or removing the away period gives back what it moved that is still open, still
with the cover, and due from today on, on a day it no longer covers; their paybacks are withdrawn
too. Anything the cover finished, reassigned or that is already late stays where it is. Covers on
handoffs follow the away period's dates on their own.

### What each adult sees

- **The adult covering:** the moved items in their own lists (the rhythm says which ones they
  cover, and for whom); Today's "who's in town" line; and one notification per away period when
  someone else handed things to them ("Theo is away, back Fri, Nov 20 · 3 things moved to you"),
  behind the handoff reminders switch, waiting out quiet hours, generic text when details are
  hidden (`packages/domain/src/notifications.ts`). Handoff reminders for covered handoffs go to
  them, not to the adult away.
- **The adult away:** Today says they're away and when they're back; their lane on Today is marked
  away; private items stay with them.
- **Any adult:** Today offers "3 of Theo's things are due while Theo's away. They can go to you.
  Review" until the list is decided.

### Children and pets

They can be marked away (no cover). On days they're away, each of their drop-offs and pickups
that's still on gets a heads-up on Today, in the week and in the Weekly Reset: "June's away, but
the drop-off at 8:15am is still on", with "Skip it" (the existing skip, with undo). It replaces
"nobody has it yet" for that handoff.

## Visitors

A visitor is a name, an arrival day, a leaving day and an optional note (where they're staying,
flight times). Not an account, no access, never a task owner. Owners and adults add, change and
remove them; caregivers see them. Visitors show on Today on the days they're here and in the seven
days before they arrive, and in the Weekly Reset for the week planned (and the week after it).

## Where it shows

- **Today:** one line under the greeting when anyone is away or a visitor is here or arriving
  within a week ("Theo's away, back Fri · Grandma arrives Sat"), opening the screen below; and the
  hand-over nudge for adults.
- **Weekly Reset:** the week board says who's around ("Theo away Mon–Thu; you cover · Grandma
  visiting Sat–Sun"), marks each away day in that person's lane, and adds a Visiting lane while
  anyone is staying.
- **Who's in town screen** (`/in-town`, from Household → "Away and visiting" and from the Today
  line): away periods and visitors from today on; add, change and remove each in a sheet; review a
  hand-over.
- **Export:** away periods, hand-overs (as the member can see their items) and visitors are in the
  household export.
