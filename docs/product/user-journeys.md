# FamilyOS user journeys (v0.1)

**Date:** 2026-11-07
**Cast:** Sam and Alex, dual-income homeowners with two children; Priya, their part-time caregiver.
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

**Success metrics (Gate 1/3):**
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

---

### Paths the Phase B prototype must demonstrate (brief)

- **Routine chore:** J3.
- **Home repair:** J2 → assign → done with photo.
- **Complex vendor coordination:** J1, including the `delivery_unknown`, unverified reply and `done_unverified` states.
