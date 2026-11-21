# FamilyOS design directions: build briefs

Three directions for the same product and the same synthetic household (`src/data.ts`). Each gets
its own app shell, Home, Weekly Reset and Tasks. Calendar, Household and Meals appear in navigation
and open a styled "designed after you choose" placeholder in that direction's language.

Shared rules for every direction are at the end. Product promise: **FamilyOS reduces the mental load
of running a household and helps both adults operate as a coordinated team.** The viewer is Maya;
her partner is Theo; June is two.

---

## A · Family Workspace

**Idea.** A beautifully made family notebook with the polish of Things 3. Calm, warm, personal,
confident. The household has an identity: its name, its people, its colors. Feels like *our* place.

**Type.** Fraunces (display; optical sizing on; use for the greeting, section titles, day/time numerals,
and big dates) + Figtree (all UI and body). Scale, desktop: greeting 44/48 Fraunces 500; section titles
Fraunces 20/26 500; body Figtree 15/22; meta Figtree 13/18 500; tiny labels 11.5 uppercase +0.06em.
Mobile greeting 30/34.

**Color.** Warm white ground `#FBFAF7`, surface `#FFFFFF`, sidebar `#F3F1EB`, ink `#1E2420`,
muted `#6A6F68`, hairline `#E8E4DB`, primary evergreen `#2C5A49` (actions, focus), attention amber
`#B7791F`, late brick `#B4432F`. People colors from `data.ts` (Maya coral, Theo blue, June marigold)
are used for avatars and ownership only. No terracotta accents, no cream-and-serif cliché: the ground
is white-warm, the accent is evergreen.

**Shell.** Desktop: 256px left sidebar on `#F3F1EB`. Top: household identity (Fraunces "The Riveras",
three overlapping member avatars, small line "Portland · 48° · rain after 2"). Nav: Home, Calendar,
Tasks, Weekly Reset (badge "Sun"), Household. A quieter group "Coming later": Meals & groceries, Home
records, Assistant (muted, small "Later" tag). Bottom of sidebar: a full-width "Capture" button with
`N` hint. Mobile: bottom tab bar with Home, Calendar, a raised center Capture button, Tasks, Reset;
household avatar top-right opens Household.

**Home: "the day page".** Not a dashboard. Reads top to bottom like a well-set page:
1. Greeting "Good morning, Maya" + "Tuesday, November 17" + a one-sentence plain-language summary of
   the day ("Theo has drop-off, you're home for the plumber from 1 to 3, and pickup is yours.").
2. Capture field right under it: "Add something for the household…", with live parse preview chips
   (owner, day, project) and Me / Theo / Either toggles.
3. Desktop two-column body. Left (wider): **Today** as a vertical time rail; times in Fraunces numerals;
   each item shows owner avatars; a NOW marker at 7:42; childcare handoffs read as sentences
   ("Theo drops June at Little Oaks"). Right: **On your plate** (Maya's due/overdue, Things-style
   round checkboxes) and **Theo's handling** (read-at-a-glance, can nudge/reassign), then
   **Needs both of you** (the open decisions with vote buttons), then **Coming up** (next 5 days,
   compact), and the assistant suggestion as an inline note ("A thought", simulated) placed next to
   the Thursday conflict it is about.
4. Mobile: same order, single column; Today rail first after capture.

**Weekly Reset: "Sunday at the table".** A guided ritual with chapters on a left vertical chapter
list (desktop) / top progress (mobile): Look back · The week ahead · Loose ends · Decide together ·
Who's on what · Meals & groceries · Let the assistant help · Our plan. Top: both avatars with
"together on this screen / on our own phones" toggle. Each chapter is composed like a page, with one
clear question and generous, not empty, layout. Ends with a beautifully set "Our week" plan page
(who covers each drop-off/pickup, dinners, the decisions made, what carried over).

**Tasks.** Things 3 quality, adapted for two adults. Left list (desktop): Today, Upcoming, Anytime,
then "Mine", "Theo's", "Shared", then Routines, then Projects (Hall bathroom, Garage) with small
progress pies. Main list: sections with Fraunces headings; rows = round checkbox, title, quiet meta
(due, area), owner avatar on the right. Click a row to expand it in place (Things style): notes,
owner switcher (avatar chips), date chips (Today / Tomorrow / This weekend / No date), project.
Routines show turn order visually ("Theo this week → you next") with "Done" and "Swap turns".
Projects open a project page: summary, budget line, progress, subtasks with owners.

**Icons.** lucide-react, strokeWidth 1.75, 18px.

---

## B · Command Center

**Idea.** Linear-grade desktop app for running a household: fast, dense, keyboard-friendly, precise.
Approachable, not enterprise: plain words, warm people colors, no jargon. Excellent on a big screen,
still good on a phone.

**Type.** Geist for everything, Geist Mono for times, dates, counts and keyboard hints. Desktop base
13.5/20; list rows 13.5; section headers 12 uppercase-free, 600, muted; page titles 16/22 600.
Tight, aligned, tabular numbers everywhere digits stack.

**Color.** Main `#FFFFFF`, sidebar `#F7F7F6`, panel `#FBFBFA`, ink `#18181B`, muted `#71717A`,
faint `#A1A1AA`, hairline `#ECECEE`, accent indigo `#4F55D8` (selection, focus, primary), attention
`#C2410C`, late `#B91C1C`, good `#15803D`. People colors only as small avatars, lane dots and the
ownership column. Selection is a soft indigo row tint `#EEEFFD`.

**Shell.** Desktop: 236px sidebar: household switcher at top ("Rivera household" ▾), a search/command
button showing ⌘K; nav groups: **Home**, **Inbox** (quick captures, count), **Calendar**; group
"Work": Tasks, Routines, Projects (expandable: Hall bathroom, Garage); **Weekly Reset**; group
"People": Maya, Theo, June (each with an open-count); group "Later": Meals, Records, Assistant
(muted). Main area: a 44px header bar (breadcrumb, view tabs, filter/display buttons) and content;
an optional 360px right **inspector** for the selected item. Mobile: compact header + bottom tab bar
(Home, Calendar, Tasks, Reset, More) + floating capture button opening a bottom sheet.

**Command capture.** ⌘K / `C` opens a centered command bar: type "Call plumber tomorrow @theo #reno"
and the parsed owner/day/project appear as chips you can change before Enter. Keyboard hints visible.
Rows support `X` complete and `A` assign when focused (show hints in tooltips).

**Home: "Today".** A working surface, not cards:
- Top strip of **signals** (compact pills that filter/scroll): "1 conflict Thu", "3 overdue",
  "2 decisions", "Plumber 1–3 today".
- Left: a compact **day timeline** (7:00–21:00) with blocks colored by person, a now-line at 7:42,
  handoff markers.
- Center: three columns **You · Theo · Either** of today's and overdue items (checkbox, title, due in
  mono), each with a count. Click a row → right inspector with details, owner, due, history.
- Right inspector default: **Up next** (next 3 events) and the simulated assistant suggestion as an
  "Agent proposal" panel with Approve / Edit / Dismiss.
- **This week** list grouped by day below (or as a tab).

**Weekly Reset: "Planning session".** An agenda with a left rail (each agenda item with status and a
small count) and a session timer ("Reset · 0:00 / ~25 min"). Main panel per agenda item. Triage
mode for loose ends: one item at a time with key hints (K keep, L later, D drop, 1 Maya, 2 Theo).
A **load balance** bar across the top of the "Assign" step shows Maya vs Theo counts updating live.
Meals: a 7-day grid with dinner and cook per day, plus a grocery list grouped by aisle. Decisions:
two-person vote with both avatars. Ends with a dense, scannable **week plan table** (day × person).

**Tasks.** Linear-style list: grouping toggle (Owner / Area / Due), rows: status circle, priority
glyph, title, project label, routine glyph, due (mono, red when late), owner avatar. View tabs:
All · Mine · Theo · Shared · Routines · Projects. Selecting a row opens the inspector with editable
properties (Owner, Due, Project, Repeats) via small menus; quick complete with `X` and checkbox.
Routines view: table with cadence, rotation (avatars in order, next highlighted), last done,
"Done" and "Swap". Projects view: project rows with progress bars and target dates; open shows
subtasks.

**Icons.** lucide-react, strokeWidth 1.5, 16px (14px in dense rows).

---

## C · Family Rhythm

**Idea.** An original model: the household's day as one shared rhythm. Each person has a **lane**
(Maya, Theo, June) running through the day; events sit in lanes; June's lane shows *where she is*
(home, daycare) and **handoffs** are drawn as connectors between lanes (Theo hands June to daycare at
8:15; daycare hands June to Maya at 5:30). Tasks attach to a person's lane. The question "who has
what, and who has June, when?" is answered by looking, not reading. The same visual language zooms
out to the week (Weekly Reset) and to the load each person carries (Tasks).

**Type.** Bricolage Grotesque (display: big times, day names, headings; lean on its optical size and
weight range for an expressive, characterful voice) + Manrope (UI and body). Big "7:42" numerals.

**Color.** Ground `#F6F6F2`, surface `#FFFFFF`, lane fill `#EFEFEA`, ink `#15201B`, muted `#66706A`,
hairline `#E3E3DC`. People colors are *the* color system here: lanes and blocks use each person's
color and tint from `data.ts`. One ink-dark accent for the now-line and primary buttons. Attention
uses a striped/hatched treatment on conflicts rather than another hue. No gradients.

**Shell.** Desktop: a top bar instead of a sidebar: household mark and the three member avatars on
the left (click an avatar to focus/fade lanes), centered primary navigation **Today · Week · Tasks ·
Reset · Household**, a "Later" overflow (Meals, Records, Assistant), and a prominent capture button on
the right. Mobile: a bottom segmented bar (Today, Week, Tasks, Reset) and a floating capture button;
avatars in the header still filter lanes.

**Home: "Today's rhythm".**
- A live headline: "7:42. Theo leaves for drop-off in 33 minutes." with a small secondary line.
- Desktop: a full-width **horizontal timeline** 6:00–22:00 with three lanes (Maya, Theo, June) and a
  now-line; events as blocks; June's lane as segments (Home · Little Oaks · Home); handoff connectors.
  Conflicts (none today) would show hatched.
- Below: **three load columns**, one per adult plus **Up for grabs** (shared): today's tasks as
  beads/rows; "I'll take it" on shared items moves them into Maya's column with motion; completing
  shrinks the item into a filled bead in the lane.
- **The rest of the week** as a compact rhythm strip (7 days × lanes as dots/blocks) with the Thursday
  pickup conflict hatched and the simulated assistant suggestion attached *right there*.
- Capture: "What needs doing?" with person toggles; the new item visibly lands in the right column.
- Mobile: a vertical timeline (time down the left, narrow lanes side by side), then load columns as
  swipeable segments.

**Weekly Reset: "Plan the week together".** A board for next week: 7 day columns × lanes (Maya,
Theo, June's care), plus rows for Dinners and Chores. Maya is in Denver Mon–Tue: those lane cells are
blocked; June's drop-off/pickup slots need a person (tap a slot to cycle Maya/Theo). Guided by a
bottom (desktop: left) sequence of moments: Look back (last week's strip, beads filled per person),
The week ahead, Loose ends, Decide (the three decisions), Cover June, Dinners, Assistant help, Commit.
Committing turns the board into the shared plan.

**Tasks: "Who's carrying what".** Person columns (Maya, Theo, Shared) with a load meter each; tasks
as rows grouped by when (Late, Today, This week, Later); tap avatar to hand an item to the other
person. **Projects** as horizontal tracks to their target date with milestone beads (Hall bathroom to
Dec 18). **Routines** as rotation rings showing turn order and whose turn is next, with Done / Swap.

**Icons.** lucide-react, strokeWidth 2, 18px, used sparingly.

---

## Shared rules for builders

- Read `src/data.ts`, `src/store.tsx`, `src/directions/types.ts`, `src/App.tsx`, `src/proto.css`.
  Do not edit them. All your code lives in `src/directions/<a|b|c>/`. If you need a derived helper,
  write it in your folder. Export `DirectionA` / `DirectionB` / `DirectionC` from `index.tsx`.
- All behaviour goes through `useFamily()` (toggleTask, assign, setDue, capture, routineDone,
  routineSwap, vote, toggleGrocery, addGrocery, suggestion, reset state…). Render `state.toasts`
  in your own style with Undo (`undoToast`) and auto-dismiss after ~4s.
- Layout responds to the **container** `app`, not the window: use `@container app (max-width: 760px)`
  for phone layouts (and other container breakpoints as needed). No `@media` width queries, no
  `vh`/`vw`, no `position: fixed`. Your root element is `height: 100%` with `position: relative`;
  overlays (capture, menus, sheets, toasts) are `position: absolute` inside it.
- Scope all CSS under your root class (`.dir-a`, `.dir-b`, `.dir-c`). Plain CSS files imported by your
  components are fine. No CSS frameworks.
- Fonts available: Fraunces, Figtree, Geist, Geist Mono, Bricolage Grotesque, Manrope (loaded by
  `fonts.css`). Use only your direction's.
- Icons: `lucide-react` only. No emoji as icons. No illustrations unless drawn with purpose.
- Words: user-facing language only ("Theo's handling", "Late", "Up for grabs"), never backend terms
  (no "status: open", "work item", "occurrence"). Times as "8:15", "1–3pm".
- Simulated future features (the assistant) are visibly labelled "Simulated" and only change
  prototype state.
- Every interactive element: hover, visible keyboard focus, ≥ 40px touch targets on phone.
- Avoid: generic SaaS dashboard look, a card around everything, big empty areas, decorative gradients,
  childish illustration, enterprise admin feel, screens that look like database forms.
- Must work and look finished at **1440×900** and **390×844**. No horizontal page scroll at 390.
  Long lists scroll inside their pane.
