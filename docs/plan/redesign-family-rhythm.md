# FamilyOS redesign: Family Rhythm (plan)

**Decided 2026-11-15 by the founder:** direction **C · Family Rhythm**, with the **warmth of A** in
the details; add **pets**, **recurring care tasks** (e.g. monthly flea meds), an **iPhone widget**
to complete tasks without opening the app, **key contacts**, and **Monarch budgets**.
Everything lands **at the end**, in one switch-over the founder approves; nothing reaches `main`
or production before then. Branch: `redesign/family-rhythm`.

Canonical design reference: `design/prototype` (direction C, with A's typography and pacing
borrowed as described below). Open `design/prototype/dist/index.html` or run `npm run dev` there.

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
