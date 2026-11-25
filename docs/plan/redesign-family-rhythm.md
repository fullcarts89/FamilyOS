# FamilyOS redesign: Family Rhythm (plan)

**Decided 2026-11-15 by the founder:** direction **C · Family Rhythm**, with the **warmth of A** in
the details; add **pets**, **recurring care tasks** (e.g. monthly flea meds), an **iPhone widget**
to complete tasks without opening the app, **key contacts**, and **Monarch budgets**.
Everything lands **at the end**, in one switch-over the founder approves; nothing reaches `main`
or production before then. Branch: `redesign/family-rhythm`.

Canonical design reference: `design/prototype` (direction C, with A's typography and pacing
borrowed as described below). Open `design/prototype/dist/index.html` or run `npm run dev` there.

## Founder adjustments (2026-11-15, second brief)

- **Core first:** Home/Today and the family timeline, calendar, tasks, projects, routines, Weekly
  Reset, household members, pets, contacts, meals and groceries come before the iPhone app,
  widgets and Monarch, which proceed in parallel without delaying the core.
- **Read-only calendar integration early.** No manual duplication of existing calendars. Approach:
  each adult adds the private iCal (ICS) address of each calendar they want shown (Google "secret
  address in iCal format", iCloud shared/public calendar link, Outlook published ICS), and assigns
  it to a person. FamilyOS fetches and expands them server-side (read-only; FamilyOS never writes
  to them). Addresses are encrypted at rest, never shown again after saving, fetched only over
  https with size, time and private-network limits. Imported events appear in the lanes and the
  week, marked with their calendar; FamilyOS's own events (care handoffs etc.) stay editable.
- **Design refinements:** a compact phone timeline (today's responsibilities visible without
  long scrolling); A's warmth, typography and refinement throughout; **no implication that
  equal task counts mean equal workload** (no load meters, no count comparisons or "who did more"
  scores; show what each person has, not a score); the shared weekly planning board stays central
  in Weekly Reset; quick capture reachable from every screen (button + keyboard shortcut).
- **No simulated functionality in production.** Real data only; synthetic data for development,
  tests and screenshots.
- **For this family only.** Optimize for the household's real use, not scale or customers.
- **Monarch:** CSV upload (Monarch's terms forbid automated access by other apps; see the session
  notes). Optional later: a scheduled Claude task, a client Monarch supports, posting a summary.
  **Done 2026-11-25:** that scheduled task syncs the budget both ways through Monarch's official
  connector; see `docs/operations/monarch-sync.md`.

## Emotional design and interaction quality (2026-11-15, third brief)

Promise: FamilyOS helps us feel organized, appreciated, coordinated, less overwhelmed, accomplished,
and confident nothing is slipping. Motivation comes from real utility, never engagement mechanics:
no points, leaderboards, punitive streaks, rewards for opening the app, or partner comparisons.

**Motion and feedback system** (part of the design system, `apps/mobile/design/motion`):
- *Routine feedback* (every completion): instant optimistic state change, an animated check
  (≈250 ms spring), the row settles into its done state, optional light haptic, undo toast.
  Never blocks rapid completion of the next item.
- *Acknowledgment* (contextual, a line, not a modal): taking a shared item ("Yours now. One less
  thing for both of you."), taking something off your partner ("Taken off Theo's plate"),
  partner progress on Home ("Theo handled the car registration").
- *Milestones* (rarer, warmer): all of today's important items done, a project milestone or
  project complete, a decision resolved together, a conflict resolved / childcare covered for the
  week, Weekly Reset completed. A short tasteful animation (no confetti storms) + medium haptic.
- *Truthfulness:* celebrate only after the server confirms; a failed write rolls back with a
  friendly, actionable message and no success feedback. Milestones are acknowledged once per
  person (stored server-side), so refreshes and other devices never replay them.
- Screen/sheet transitions, skeleton loading, optimistic updates with rollback, undo, haptics
  (expo-haptics, user setting) and sound (off by default); `prefers-reduced-motion` /
  Reduce Motion replace motion with fades or nothing; everything works with motion unavailable.
- Copy: overdue items say what's late and offer the next step ("Renew car registration · 3 days
  late · Do it now / Move to tomorrow / Hand to Theo"), urgent but never guilt-inducing.

**Approachable complexity:** guided, small contextual actions over big forms (rotation, handoffs,
recurring care, projects, decisions, conflicts, meals, budgets); sensible defaults; progressive
disclosure; plain-language errors with a way forward.

**Weekly Reset as the signature ritual:** warm personalized opening; reflection on what was
accomplished together (highlights: completed responsibilities that mattered, projects, decisions,
coverage), with appreciation for each adult's contributions described in words, never counted
against each other; visible progress through chapters; the shared weekly board updates live as
decisions, owners and coverage are resolved; a distinct completion ("Your week has a plan. You're
ready to take it on together.") showing the plan, decisions, coverage, commitments,
responsibilities, meals/groceries, and anything unresolved, clearly marked. Never claims
everything is handled while something important is open. The plan then drives Home, Calendar and
Tasks during the week.

**First 60 seconds and daily return:** polished sign-in, invite acceptance, first-time household
setup and personalization (members, pets, colors, calendars), first Home, skeletons, empty states,
first capture/completion, first Weekly Reset. Home on return answers: what matters today, what my
partner is handling, June's and the pets' day, what changed since I last looked (partner activity
from the audit trail), what needs me, and what I can do next. Morning/evening lines are derived
from real data only; nothing invented.

**Healthy reasons to return:** morning check-in, upcoming handoffs, genuinely due items, an
end-of-day sense of closure, the weekly Reset, meaningful partner changes. Notifications (with the
iPhone app) are timely, actionable, controllable, respect quiet hours; none exist to drive
engagement. Widgets follow the same rule.

**Backend support:** `member_state` (last seen per member for "since you last looked"; notification
preferences and quiet hours), `member_acknowledgment` (milestone keys acknowledged once),
an activity endpoint over `audit_event` joined to titles the household wrote.

**Acceptance additions:** short recordings (GIF/video of the real app) of: completing a task;
completing a recurring pet-care task; taking something off the partner's plate; resolving a
childcare conflict; completing a project milestone; the full Weekly Reset; returning to Home after
the plan changed.

## Design system: C with A's warmth

- **Structure from C:** a lane per person through the day; June's (and pets') care shown as
  segments with handoffs; "Who's on what" load columns; the week as a board; top navigation on
  desktop, bottom bar + capture button on phone.
- **Warmth from A:** warm ground (`#F7F5F0`), Fraunces for greetings and Weekly Reset chapter
  titles, Figtree for all UI text (replaces Manrope), calmer list rows and spacing, chapter pacing
  in the reflective Reset steps (Look back, Decide).
- **Type:** Bricolage Grotesque for big numerals, day names and section headings (tracking
  ≥ −0.02em; −0.035em only for the clock); Fraunces for greetings/chapter titles; Figtree for UI.
- **Color:** each member's own color (stored on the member) is the color system for lanes,
  avatars and ownership; one ink accent for primary actions and the now-line; hatching for
  conflicts. No gradients.
- **Responsive:** phone < 760px (bottom bar, vertical timeline), tablet 760–1099, desktop ≥ 1100
  (top bar, horizontal timeline, multi-column). Layout by window width (`useWindowDimensions`).
- **Icons:** lucide (react-native-svg). **Graphics:** react-native-svg for lanes and hatching.
- **No simulated features in production.** The prototype's assistant cards become deterministic
  **heads-ups** computed from data (a pickup that overlaps a meeting, an overdue routine, a
  decision due tomorrow). Intelligent assistance stays a later milestone.

## Data additions (all additive migrations, RLS like the existing tables, audited)

| Area | Tables / changes | Notes |
|---|---|---|
| Members | `member_role` += `pet`; `member.color`, `member.species`, `member.note` | Pets have no account, like children. Children and pets are "cared for" members. |
| Events | `event` (title, starts/ends, all-day, location, notes, kind, optional recurrence rule), `event_member`, `event_exception` (skip / one-off cover) | Care handoffs: `care_member_id`, `care_action` (drop-off / pick-up), `care_place`. Recurring events expand on read with the existing recurrence engine. |
| Contacts | `contact` (name, category, role, organization, phone, email, address, notes, `for_member_id`) | `work_item.contact_id` (optional) links a task or project to a contact. |
| Decisions | `decision`, `decision_option`, `decision_vote` | Both adults vote; decided when they agree or the owner closes it. |
| Weekly Reset | `weekly_plan` (week start, committed at/by, notes) | Carry-forward, coverage and assignments write to tasks/events directly. |
| Meals | `meal` (date, title, cook), `grocery_item` (name, detail, aisle, checked at/by) | |
| Monarch | `integration` (provider, status, scopes, last sync; tokens in Supabase Vault), `budget_snapshot` (month, category, group, budgeted, spent) | Official Monarch MCP, **read-only**, after confirming Monarch's terms allow an app to connect; CSV upload as the fallback. |

Recurring care tasks need no new tables: routines already support monthly-by-day, nth weekday
and "N days after completion", with rotation. What's new is the setup UI and pets as owners/subjects.

## Milestones (one branch, reviewed by screenshots at each step, merged once at the end)

1. **Foundation:** design system (tokens, type, components), app shell (desktop top bar, phone
   bottom bar, capture), sign-in and invite rebuilt. Migrations + API for pets and member colors.
2. **Events and Today:** events API (incl. recurrence, handoffs, exceptions); Today rhythm
   (lanes, now-line, handoffs, load columns, capture, week strip, heads-ups); Week/Calendar
   (week board, create and edit events).
3. **Tasks:** Who's carrying what; task detail; projects with tracks; routines with rotation
   rings; recurring setup with pets ("Biscuit's flea meds, monthly on the 1st").
4. **Weekly Reset:** decisions API and voting; look back (from completion history); loose ends
   triage; cover June (event exceptions); dinners and groceries; commit the plan.
5. **Household and Contacts:** members incl. pets, invites, settings; contacts by category,
   linked to people and tasks.
6. **iPhone app and widget:** EAS build; WidgetKit extension (home and lock screen) with
   tap-to-complete (App Intents, iOS 17+), sharing the session through the app group keychain.
   Founder signs and uploads with their Apple Developer account (exact steps provided).
7. **Monarch budgets:** terms check, then read-only MCP connection and daily sync of budget
   snapshots shown in Today (a line) and Weekly Reset (a step); CSV upload fallback.
8. **Switch-over:** full E2E journeys against a local stack, visual QA (1440 / 390), founder
   review, then merge, apply migrations, deploy, and verify production.

## Acceptance (from the founder's brief)

Every current feature works in the new UI; design matches the reference; desktop and phone
polished; backend tests pass; E2E journeys (sign-in, invite, capture, complete, reassign,
routines incl. pets, events and handoffs, Weekly Reset, contacts) pass against a real local
stack; no household isolation or privacy regression (security tests extended to every new
endpoint); rendered screenshots reviewed; founder approves before the switch-over.
