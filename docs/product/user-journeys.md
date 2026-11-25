# FamilyOS user journeys (v0.1)

**Date:** 2026-11-07
**Cast:** Sam and Alex, dual-income homeowners with two children; Priya, their part-time caregiver. They are synthetic stand-ins for our own household: tests and fixtures use them, never our real data.
**Notation:** `[S]` system (deterministic), `[M]` model step (stateless, schema-validated), `[H]` human action, `⛔` approval gate.

States follow ADR-001 §5. Labels in "quotes" are what the user sees.

---

## J1. Gutter service coordination (hero)

**Trigger:** On Tuesday evening Sam types: "Find someone to clean our gutters before the rains and help schedule it."

| # | Actor | What happens | State and UI | Failure branches |
|---|---|---|---|---|
| 1 | [M] capture | Extracts the title "Gutter cleaning", category home service, a due window of "before the rains" (left fuzzy; **no invented date**) and owner Sam. Keeps the source text | WorkItem `new` → card "Review 1 suggestion" | Low confidence → asks one question ("Rough deadline?"), and Sam can skip it |
| 2 | [H] Sam | Edits nothing and taps **Delegate**. The plan is shown before any work starts | "Plan: find 3 options → draft emails → **you approve each** → track replies → **you approve booking**" | — |
| 3 | [S] | Creates `agent_run` from the fixed template `home_service_v1` with its budget (tokens $0.25, 10 messages, 21 days) | Run `planned` → "Researching" | Budget or kill switch off → `blocked` with the reason |
| 4 | [S] + [M] | Collects candidates: the household's known vendors first (none), then any Sam pasted, then Places results rendered live (only `place_id` stored). [M] ranks them using reviews Sam can see, distance and whether an email or web form exists | "3 options found. 2 accept email, 1 phone only" | Fewer than 2 with email → offers a **manual hand-off** for the phone-only vendors (prefilled text or call script) |
| 5 | [M] draft | Drafts 2 emails from the template: address, scope (single-storey, 140 ft), "request a quote and earliest availability". **Does not** include phone numbers, children or schedule | Run `awaiting_approval`; Today → **Needs you: "2 emails ready to send"** | — |
| 6 | ⛔ [H] Sam | Sees the exact payload: every recipient, sender identity "Sam Lee via FamilyOS", the full body and "replies come back here". Approves one and edits the other | Approval `approved`, `payload_hash` stored. The edited one gets a fresh approval | If Alex edits the draft at the same time, the earlier approval is invalidated by the hash mismatch and a new one is requested |
| 7 | [S] sender | Re-verifies the approval (hash, role, expiry), writes the outbox, sends, and stores the Postmark `MessageID` (evidence E1) | Run `awaiting_reply`; "Waiting on 2 vendors · sent Tue 8:14pm" | Crash after send → `delivery_unknown` → "We couldn't confirm the email to Acme was sent. Check or resend?" Provider bounce → `failed` for that vendor, others continue |
| 8 | [S] timers | Wake at +48 h with no reply → suggests a follow-up draft (which needs approval again) or the manual call path | "No reply from Acme in 2 days. Send a nudge or call?" | 3 unanswered nudges → that vendor is closed |
| 9 | Vendor → [S] inbound | Reply arrives at `r+<thread>@…`. Checks: thread token, SPF/DKIM, sender matches the recipient. [M] *quarantined reader* (no tools) extracts typed fields (`$180`, `Thu 10/15 or Sat 10/17`, `needs gate code`) | Run `awaiting_user_decision`; **Needs you: "Acme quoted $180, Thu or Sat"** with the vendor's own text one tap away | Sender mismatch or failed auth → "Unverified reply — is this Acme?". An injection attempt has no effect because the reader has no tools |
| 10 | [H] Sam or Alex | Picks Sat 10/17. FamilyOS drafts the acceptance. **The gate code is never auto-included**; the user adds it if they choose | ⛔ `approve:booking` with the exact payload | Alex lacks `approve:booking` (if configured) → the request goes to Sam |
| 11 | [S] | Sends after approval (E1). The vendor's confirmation reply passes the inbound checks (E2) | Run `booked` → WorkItem `scheduled`: "Booking confirmed by Acme (email, Wed 9:02am)" | A vendor reply that doesn't confirm → stays `booking_requested`, and the user is asked |
| 12 | [S] | Calendar hold (P1, read-only integration means only an internal reminder in MVP). Morning-of reminder | "Gutters today, 10–12" | — |
| 13 | [H] Sam | Next day: "Did Acme finish?" → Yes, plus a photo of the invoice (E3 + E4) | WorkItem `verified_complete`: "Verified: you confirmed + invoice". The vendor is saved to Home with the price and date | "Not yet" → `awaiting_completion`. User taps "done" with no evidence → `done_unverified`, shown honestly |
| 14 | [S] | Offers a recurrence: "Remind you next October?" | New routine (no AI needed) | — |

**Success measures (our own use; product contract §6):**
- Sam's total active time is 3 minutes or less, against a manual baseline we must measure.
- Every external message was approved.
- Elapsed time to booking.
- Vendor response rate **by channel**.
- Zero false "complete".

## J2. Quick capture from a photo (leak under the sink)

1. [H] Alex shares a photo from the camera roll to FamilyOS and adds "dripping again".
2. [S] re-encodes the image (EXIF stripped) and stores it as a Source.
3. [M] extracts "Kitchen sink leak", category home issue, and finds a possible duplicate: "Kitchen sink drip (March)".
4. UI: "Looks like the March issue — merge?" Alex chooses **Keep separate**. It is never merged silently.
5. Alex taps **Assign to Sam**. Sam gets a push notification, and the timeline records `assigned by Alex`.
6. Acceptance: capture-to-saved in 30 seconds or less; no fabricated due date; the duplicate is offered, not forced.

## J3. Recurring HVAC filter, skip, reassign, DST

1. [H] Sam creates "Replace HVAC filter, every 3 months on the 1st, 9:00 local". No model call.
2. [S] stores the rule with `America/Los_Angeles` and a local 09:00 start, and materialises the next occurrence.
3. [H] On Nov 1 Sam taps **Skip this one** ("just replaced"). [S] writes an `occurrence_exception`; the rule is unchanged; the next occurrence is Feb 1.
4. [H] Alex reassigns the routine to themself. Both phones converge: the version check rejects Sam's stale edit with "Alex changed this — reload".
5. DST edge: a routine at 02:30 local on the spring-forward day follows the documented policy (shift to 03:30). It is tested.
6. Missed: Feb 1 passes unfinished → **Needs attention**, never auto-complete.
7. Acceptance: property tests across DST transitions and timezones (brief rule 9).

## J3b. Weekly chore rotation between two adults

1. [H] Alex sets up "Trash and recycling out, every Sunday 19:00, rotate Sam ↔ Alex". No model call.
2. [S] materialises occurrences with alternating owners. Both adults see the next four weeks and whose turn it is.
3. [H] Sam is away one Sunday and taps **Swap with Alex**. [S] records the swap as an exception for that one occurrence; the rotation order continues afterwards.
4. [H] Alex completes it with one tap. Today moves it to **Handled**, attributed to Alex.
5. [S] A fairness view shows completed chores per adult over 30 days, as counts, not judgments.
6. Acceptance: rotation, swap and completion work offline-first in the prototype, with no AI call; the fairness view matches the event log.

## J4. Household memory: "Who fixed the dishwasher last year?"

1. [H] Alex asks in the search box.
2. [S] searches with FTS + pgvector **within the household (RLS)** over WorkItems, Vendors, Sources and Events.
3. [M] summarises with **citations only to returned rows**: "Bay Appliance, 14 Mar 2026, $240 — invoice photo; Sam marked complete."
4. If nothing matches: "I couldn't find a record of a dishwasher repair." No guessing.
5. Acceptance: every claim links to a record; the unknown path is tested; a cross-household seed returns zero hits.

## J5. Caregiver access granted, limited and revoked; then export and delete

1. [H] Sam invites Priya as **limited caregiver**. Her scopes: view and complete assigned chores and see the "Kids pickup" list. **No** access to documents, vendors, approvals or the Assistant.
2. Priya completes "Pack lunches". The timeline records it, and her view shows no house documents.
3. Priya tries a deep link to an invoice → `not_found`.
4. Months later Sam removes Priya. [S] revokes sessions, invalidates any approval she was party to, and keeps her past completions attributed as "former caregiver".
5. Sam requests an **export** and receives a zip with JSON plus original files. Then Sam deletes the household: a 14-day soft delete is shown clearly, then hard delete, including files and vector rows; provider-side retention is disclosed.
6. Acceptance: role-matrix tests (WF-05), revocation tests (T-04), and a deletion test that counts zero rows per table afterwards.

## J6. Shared week: one adult travels, the other picks up

**Trigger:** On Sunday evening Alex types: "I'm in Denver Wed–Fri."

| # | Actor | What happens | State and UI |
|---|---|---|---|
| 1 | [M] capture | Extracts an away period, Wed–Fri, for Alex. Confirms the dates; no invented times | Card "Alex away Wed–Fri — review what's affected" |
| 2 | [S] | Lists Alex's items in that window, deterministically: the rotation chore, "Pick up dry cleaning", "Call the plumber back" (from J2) and Thursday's "Kids pickup 15:30" | "4 things are yours while you're away" |
| 3 | [H] Alex | Proposes a handoff per item: three to Sam, one deferred to Monday. Adds a note on pickup: "gate code is in the usual place" | Each item gets a pending handoff request (a separate record, not a WorkItem status); the owner is unchanged until accepted |
| 4 | [H] Sam | Gets **Needs you: "Alex asked you to take 3 things Wed–Fri"**. Accepts two and declines dry cleaning ("can't, late meeting") | Accepted items move to Sam. The declined item goes back to Alex as **Needs you** |
| 5 | [H] Alex | Asks Priya (limited caregiver) to take dry cleaning. Priya sees only that item | Priya accepts; Sam and Alex both see it |
| 6 | [S] | Thursday 15:00 reminder to Sam for pickup. Sam marks it done | Both adults see "Kids pickup — done by Sam, 15:41" |
| 7 | [S] | Monday: "Alex is back. 1 deferred item: Call the plumber back" | Deferred item returns to Alex's Today |

**Failure branches:**
- Sam ignores the request for 12 hours → one reminder to Sam, and Alex sees "Sam hasn't answered".
- Sam and Alex edit the same item at once → the version check rejects the stale edit (as in J3).
- Children appear only as names on items; they have no accounts (PRD challenge B5).

**Acceptance:** every handoff is explicit and visible to both adults; no item changes owner without acceptance; nothing is lost when a request is declined.

## J7. Ongoing project: basement refresh

1. [H] Sam creates a project "Basement refresh" with subtasks: clear storage, get two quotes for drywall repair, pick paint, book the dump run.
2. [H] Alex attaches photos and a budget note ($1,500). Each subtask has its own owner and due date.
3. [S] The project shows progress (2 of 4 done), its vendors, costs logged so far and a timeline of every change.
4. [H] "Get two quotes" later becomes a delegated run (J1 pattern, after M6). Until then it is a normal task with vendor records attached.
5. Acceptance: subtasks appear in Today for their owners; the project never shows "complete" while a subtask is open; costs come only from entered records.

## J8. Weekly Reset (Sunday evening, 15–20 minutes)

| # | Step | What happens | Acceptance |
|---|---|---|---|
| 1 | Start | Sam opens **Weekly Reset** from Today. [S] creates or resumes the session for the household's local week (Mon 2026-11-09). Alex joins from their own phone | One session per household and week; either adult can start or resume |
| 2 | Look Back | [S] assembles the agenda: 2 overdue items, 1 blocked ("plumber hasn't called back"), this week's routine occurrences, 1 pending approval, and last week's unresolved decision ("Holiday travel dates?"). Each shows its source and the refresh time. Alex adds a topic: "Swim lessons — who drives?" | Agenda matches the records exactly; no calendar connected → "No calendar connected — showing manual events only" |
| 3 | Look Ahead | Seven days of known items: manual events, due dates, chores, project subtasks. A deterministic hint flags Thursday: two pickups at 15:30 | Manual, connected and suggested items are visually distinct; nothing invented |
| 4 | Decide | They record: "Alex drives swim on Tuesdays" (decided), "Holiday travel" (deferred again), "Call a second plumber" (decided, with rationale "no reply in 5 days") | Each decision is attributed and timestamped; deferred and unresolved items stay visible |
| 5 | Assign | "Alex drives swim" creates a routine owned by Alex. "Call a second plumber" is assigned by Sam to Alex → **pending acceptance**. Alex declines ("travelling Wed") and it returns to Sam, who takes it | One WorkItem per decision; no owner change without acceptance; a decline returns the item for replanning |
| 6 | Delegate (from M5/M6) | [M] suggests "Draft a message to the backup plumber" and "Make a grocery list for Thursday's dinner". Sam selects only the plumber draft. It becomes a draft run that still needs exact-payload approval to send | Suggestions are labelled and opt-in; nothing sends from the session; model failure leaves planning unaffected |
| 7 | Commit | They commit. [S] saves version 1 of the plan: decisions, owners, due dates, open questions and linked actions. Today shows the new items immediately | Committing twice is idempotent; both adults see the same state after refresh |
| 8 | Midweek | On Wednesday either adult opens the plan's progress view: 4 of 7 actions done, 1 waiting on the plumber | Status is read from the canonical items, not copied |
| 9 | Next week | The next session carries forward the deferred holiday decision and the unfinished items **by reference**. Completed work stays in last week's review. No due date changes on its own | No duplicates; no silent rescheduling |

**Failure branches:** Sam and Alex edit the same decision at once → the version check keeps both visible and asks which to keep. The app restarts mid-session → the draft resumes where it was. A week boundary falls across a DST change → the week still starts at local midnight Monday.

**Acceptance:** WF-06 criteria 1–10. Criterion 9 (15–20 minutes) and criterion 10 (four-week personal-utility review) are measured in our own use, not with fixtures.

**How J8 grows after the P0 alpha (M6):**
- M7: Look Ahead adds both adults' imported calendar events.
- M10: a **Meals** step between Assign and Delegate (J9).
- M11: the agenda arrives **pre-prepared** from signals (J12), so the session starts from a draft instead of a blank page.
- M13: step 6 shows AI suggestions.
- M14: those suggestions can be delegated.
- M15: a decision can create a calendar event (J11).

## J9. Meals and groceries in Weekly Reset (P1, M10)

1. [H] In the Meals step, Alex drags three favorites onto Mon, Wed and Thu and types "leftovers" for Tue. A household note shows: "Sam: no mushrooms".
2. [S] Tapping **Add groceries from meals** proposes 11 items from the favorites' ingredients. 2 are already outstanding on the Groceries list, so they are merged and shown as "already on list".
3. [H] Sam removes "rice" ("we have plenty") and accepts. 8 new items are added, attributed to the plan.
4. [S] "Dishwasher tablets" (recurring every 3 weeks) reappears on Household supplies this week, once.
5. [H] At the store, Sam checks items off; Alex sees them move to Purchased on their phone. Alex adds "birthday candles" mid-trip; it appears for Sam.
6. **Acceptance:** tapping "Add groceries" again adds nothing; concurrent check-offs lose nothing; the meal plan appears in next week's Look Back as "last week's meals" for reuse.

## J10. Template: weekend trip (P1, M9)

1. [H] Sam picks the **Travel and packing** template and sets the anchor date Fri 11/20 and owners Sam and Alex.
2. [S] Creates one project, "Trip — 11/20", with tasks at offsets: book pet sitter (−10 days, Alex), hold mail (−3 days, Sam), packing checklist for each child (−1 day, either adult), set the thermostat (day 0, Sam).
3. [S] Tasks show in Today on their dates and in Weekly Reset's Look Ahead. A signal (M11) flags "pet sitter not booked, trip in 7 days".
4. [H] After the trip, Alex edits the project ("add: charge the tablets") and taps **Save as template**, creating version 2. The finished trip project is unchanged.
5. **Acceptance:** retrying the instantiation creates one project; offsets stay correct across a DST weekend; generated tasks are ordinary tasks everywhere.

## J11. Decision → calendar event, with approval (P2, M15)

1. [H] In Weekly Reset, they decide: "Swim lessons start Tue 11/17, 16:00–16:45, Alex drives."
2. [S] Alex has connected their Google Calendar and enabled "Family" for writes. FamilyOS shows an approval card: calendar "Family", title "Swim — Alex drives", Tue 11/17 16:00–16:45 America/Los_Angeles, no attendees, no notes.
3. [S] Before writing, the sender re-reads that range and finds "Dentist 15:30–16:30". The card shows the **conflict**. Alex moves swim to 16:45 and approves the changed card; the earlier approval is void because the payload hash changed.
4. [S] The event is created with a client-chosen ID. A crash after the provider accepts → the retry with the same ID creates nothing new, and the run records the existing event.
5. [H] Sam, who has not enabled writes to Alex's calendar, cannot approve writes to it.
6. **Acceptance:** suite items 28–30; zero writes without approval; the event links back to the decision and the WorkItem.

## J12. Proactive preparation, low-noise (P1, M11)

1. [S] Friday evening, the signal engine finds: a birthday party Sunday with no gift task (from a template anchor); "Call a second plumber" assigned 9 days ago with no activity; Thursday's two 15:30 pickups; and dishwasher tablets due.
2. [S] Nothing is sent immediately. All four land in Saturday's digest (Sam's preference) and on the pre-prepared Weekly Reset agenda, each with links to its source records.
3. [H] Sam dismisses the tablets signal ("bought already"). It stays dismissed until the item's records change.
4. [S] A pending approval that expires tonight is the one immediate notification.
5. **Acceptance:** every signal links to its records; no signal appears for data that doesn't exist; the weekly count stays within the noise budget; no external action happens without approval.

---

### Paths the first usable alpha (P0, M0–M6) must support

- **Routine chore:** J3, plus the two-adult rotation in J3b.
- **Home repair, by hand:** J2 → assign → done with photo.
- **Shared two-adult coordination:** J6, without calendar-derived away periods (those arrive in M7).
- **Ongoing project:** J7, without vendor records (M8).
- **Weekly Reset, manual:** J8 steps 1–5 and 7–9; step 6 offers manual follow-ups only.
- **Unified Today:** chores, projects, handoff requests and weekly-plan actions in one view.

**P1:** J9 meals (M10), J10 templates (M9), J12 proactive (M11), J4 memory (M8, M13), J1 vendor coordination (M14), with its `delivery_unknown`, unverified-reply and `done_unverified` states. **P2:** J11 calendar writes (M15).
