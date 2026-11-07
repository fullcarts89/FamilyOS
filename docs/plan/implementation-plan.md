# FamilyOS implementation plan: from Phase A to a usable household system

**Date:** 2026-11-07
**Revision:** 4. Personal household use first (`docs/product/product-contract.md`), aligned with PRD v0.3 (WF-06 to WF-10).
**Status:** Proposed. Nothing below starts until the founder approves `docs/decisions/founder-gate-0.md`.
**Architecture:** ADR-001.
**Threat IDs:** T-xx refer to `docs/security/threat-model.md`.

## 0. Principles

- **Priority order (founder, revision 4):**
  1. A stable, secure app both adults can use.
  2. Core tasks, routines and shared coordination.
  3. Weekly Reset with real household data.
  4. Calendar integration and practical household workflows.
  5. AI assistance and safe delegation.
  6. Further features informed by real use.
- **Small, independently testable milestones.** Each one ends at an engineering and security gate, ships as its own PR against `main`, and leaves the app usable.
- **Reliability over schedule.** Estimates are focused working days, including tests. If a gate fails, the milestone takes longer; the gate is never relaxed to hit a date.
- **Manual first, AI second.** Every workflow works without AI. AI speeds things up but is never required.
- **Synthetic fixtures for tests, real data for use.** CI never contains our real household data. A second synthetic household is always seeded, to prove isolation.
- **Founder approval at each real-world step:**
  - the first deploy;
  - connecting each real calendar (read, and later write);
  - the first real LLM call on household data;
  - the first real email to a vendor;
  - the first real calendar write.

## 1. Milestones and gates

### P0: first usable household alpha (M0–M6)

| M | Content | Gate | Estimate |
|---|---|---|---|
| **M0** Repo foundation | pnpm workspace: `apps/mobile` (Expo with Router; iOS and web targets), `apps/api` (Hono on Node), `apps/worker`, `packages/domain` (types, state enums, transition tables), `packages/db` (SQL migrations, typed queries). Supabase CLI local stack. CI: typecheck, lint, unit tests, gitleaks. Proprietary LICENSE notice | **G0:** CI green; one-command local stack; secret scan clean; no network calls in tests; dependency licences confirmed (§5) | 1–1.5 days |
| **M1** Household foundation and security | Schema for household, member (adult, caregiver, child without account), invite, work_item, work_event (append-only), source. API with Supabase Auth: email one-time code, **public sign-up disabled**, invite only. RLS through `set_config`. Audit event on every write. Export (JSON plus files). Expo shell with sign-in | **G1:** cross-household matrix against a seeded second household returns 404 with no write (T-01, T-02); anon and authenticated grants empty (T-05); sign-up verified closed; no secrets or item text in logs; export round-trips | 3–4 days |
| **M2** Tasks, projects, inbox and Today | Inbox (accept, edit, discard); quick capture (structured text, photo attach); tasks and projects with subtasks; owner and due date; work-item state machine; comments; **Today** (Needs you / In progress / This week / Handled); timeline | **G2:** illegal transitions rejected; optimistic concurrency surfaces conflicts; every status renders distinctly; capture of a task in 30 seconds or less in a scripted test; audit on every write | 3–4 days |
| **M3** Routines and chores | Constrained recurrence expander on `temporal-polyfill` (daily, weekly by weekday, monthly by day or nth weekday, every N days after completion); occurrences; rotation between adults; skip, swap and pause; reassign; missed → needs attention | **G3:** property tests across US zones, DST both ways and month-ends; 10k random schedules against a reference expander; rotation and swap over 8 weeks; skip never edits the rule; no AI call anywhere | 3–4 days |
| **M4** Private deploy and hardening | Hosting per decision 3; secrets in the host store; TLS; error reporting that carries IDs only, never content; daily backups; both adults invited; baseline questions recorded (contract §7) | **G4:** backup **restore test** passes; health checks; rollback rehearsed once; founder approves the deploy. **Real use starts** (tasks, projects, routines) | 1.5–2 days |
| **M5** Coordination and notifications | Handoff requests (accept, decline, re-route to caregiver); caregiver role and visibility; manual events; notifications (Expo Push, quiet hours, digest, dedupe); attachments (photo and PDF allow-list, re-encoding) | **G5:** no owner change without acceptance; declines return to the requester; caregiver role matrix (WF-05); notification dedupe and quiet-hours tests; upload allow-list tests | 3–4 days |
| **M6** Weekly Reset (manual) | WF-06 steps 1–4 and 6: session per household and local week; deterministic Look Back agenda with provenance; Look Ahead over manual events, due dates, chores and projects; decisions; assignment with pending handoffs; versioned commit; midweek progress; carry-forward by reference; optional weekly reminder. The Delegate step offers manual follow-ups only (create a task, copy a message) until M13 | **G6:** automated tests for WF-06 criteria 1–6 and 8; a synthetic dry run takes 20 minutes or less; then the **first real Weekly Reset**. **STOP for founder review** | 5–6 days |

**P0 total:** about 20–26 working days. Real use starts after M4, at about day 12–16. The first real Weekly Reset follows M6.

### P1: near-term enhancements (M7–M14)

Stops for founder review come after M11 (practical workflows complete) and after M14 (Delegate live).

| M | Content | Gate | Estimate |
|---|---|---|---|
| **M7** Calendar read | Each adult's private iCal feed, polled about every 15–30 minutes; Look Ahead and Today show imported events; deterministic overlap hints; away periods (J6); an outbound ICS feed of FamilyOS items | **G7:** feed URLs encrypted and never logged (T-31); timezone and DST tests on imported events; a failed fetch shows as "stale", never as wrong data. **Founder approves each real feed** | 2–3 days |
| **M8** Home records and search | Rooms, assets, vendors, warranties, maintenance log and documents, attached to projects; structured and full-text search across all household records, with private items excluded for other members | **G8:** search is household-scoped and visibility-aware (T-32 pattern); unknown queries return "nothing found"; documents follow the upload rules | 3 days |
| **M9** Templates and checklists | WF-08: templates of task specs with relative offsets and owner roles; instantiate with an anchor date into an ordinary project; save any project as a template; starter set (school prep, travel and packing, birthday, hosting, seasonal prep, maintenance project) | **G9:** instantiation idempotent; offsets correct across DST; generated items behave like hand-made ones everywhere | 3 days |
| **M10** Lists, meals and groceries | WF-07: shared lists (groceries, supplies, other) with outstanding and purchased states; recurring supplies through the recurrence engine; favorite meals with ingredients; weekly meal plan; a **Meals step in Weekly Reset**; "add groceries from this week's meals" as a reviewable proposal, merged by normalized name | **G10:** concurrent edits by both adults converge with no lost items; generating twice adds nothing; each recurring supply reappears once per occurrence | 4–5 days |
| **M11** Proactive assistance (rules) | WF-10: deterministic signal engine (preparation needed, unresolved decisions, overlaps, unassigned or overdue items, stalled projects, supplies due, pending handoffs and approvals); **auto-prepared Weekly Reset agenda**; per-adult preferences; digest by default | **G11:** every signal cites its records; none fires from missing data; dismissals respected until the records change; default noise budget of at most 1 digest a day and at most 3 immediate notifications a week per adult. **STOP for founder review** | 3–4 days |
| **M12** Approval and outbox control plane | agent_run, approval (payload hash, role, expiry), outbox, sender (the only holder of send credentials), evidence levels E0–E4, kill switch, `delivery_unknown`, mock email and calendar providers | **G12:** scenario suite (§1.1) items 1–12, 18–24 and 27–30 pass against the mocks, covering R1–R8 | 5–6 days |
| **M13** AI assist | `ModelPort` (provider SDK, schema-validated, stateless). Capture from text or photo → editable suggestion; cited answers over M8 records; **Weekly Reset AI follow-through** (WF-06 step 5, criterion 7): labelled, opt-in drafts. Per-call budget and monthly cap; data minimisation (§3) | **G13:** eval set of at least 60 synthetic cases: zero fabricated dates, events or owners; citations only to returned rows; injection cases in photos and PDFs have no effect; model failure never blocks manual work. **Founder approves the first real call on household data** | 4–5 days |
| **M14** Delegate | Contractor coordination over M12: Postmark relay with per-thread reply addresses, inbound webhook, quarantined reader, **manual hand-off** as a first-class path; vendors from M8 records; the Weekly Reset Delegate step goes live | **G14:** the full scenario suite (§1.1, items 1–27) passes; zero bypassed approvals; zero false completions. **Founder approves the first real send.** **STOP for founder review** | 5–6 days |

**P1 total:** about 29–35 working days. M7–M11 can be reordered after P0 based on our real use, and M12 can start earlier if calendar writes are wanted sooner (decision 2).

### P2: later capabilities

| M | Content | Gate | Estimate |
|---|---|---|---|
| **M15** Calendar writes | WF-09: per-adult write connections (Google Calendar API or CalDAV, per decision); writable-calendar allow-list; an approval card showing the exact event; create, change or delete through the M12 outbox with a client-supplied event ID; re-read the range before writing and show conflicts | **G15:** suite items 28–30 against the real provider's sandbox or a test calendar; zero unapproved writes; one event after a crash and retry; a changed event surfaces a conflict; revoking a connection cancels pending writes. **Founder approves each writable calendar** | 4–5 days |
| Later | AI-ranked proactive recommendations; recipe import and meal suggestions; email forwarding into the inbox; more delegation workflows | Each gets its own gate and founder approval | — |

**Overall:** about 49–61 working days for P0 and P1, plus about 4–5 for calendar writes. Calendar time will be longer, because each milestone pauses for your review and real use.

### 1.1 Scenario suite (permanent automated tests for G12, G14 and G15)

The suite tests requirements R1–R8 (ADR §3.2) through the control-plane interface, not through our internals. That also makes it the conformance test for any agent framework considered later.

1. Happy path, 2 vendors, booking confirmed, invoice → `verified_complete`
2. Process restart while `awaiting_approval`
3. Restart while `awaiting_reply` (21-day simulated wait)
4. Crash after the provider accepted, before the DB commit → `delivery_unknown`, one send
5. Duplicate approval event
6. Approval expired
7. Payload edited after approval
8. Approver revoked before send
9. Caregiver attempts approval
10. Foreign-household approval attempt
11. Provider timeout ×2, then success (bounded retry)
12. Provider permanent failure → that vendor `failed`, run continues
13. No vendor reply → nudge proposal → closed after the cap
14. Spoofed "confirmed" reply
15. Forwarded reply from an unknown address → `unverified_inbound`
16. Reply containing an injection payload
17. Ambiguous reply ("maybe next week?") → `awaiting_user_decision`, no booking
18. Model returns schema-invalid output → retry once → `blocked`
19. Model "claims" success with no tool result → no state change
20. Budget exhausted mid-run
21. Kill switch on
22. Deploy (code version bump) while 5 runs are paused at different states
23. User marks done without evidence → `done_unverified`
24. Concurrent edits by both adults during approval
25. Recurrence: skip, then reassign across a DST weekend
26. Two-adult handoff: request, decline, re-route to a caregiver; no owner change without acceptance
27. Weekly Reset Delegate step: a selected suggestion creates a draft run; nothing sends until the exact-payload approval; committing the plan twice creates one run
28. Calendar create: crash after the provider accepts → retry with the same client event ID creates one event
29. Calendar change: the event was edited elsewhere (version mismatch) → conflict shown, no overwrite
30. Calendar write to a calendar the adult has not enabled, or by a member without access → rejected at send time

Simulated actions are labelled `SIMULATED` everywhere in the UI and the logs.

## 2. Prioritisation by real household workflows

Before M2 starts, the founder lists our real workflows:
- about 10–20 routines;
- current projects;
- upcoming home maintenance;
- open contractor jobs;
- how our weekly planning works today;
- typical meals and staples;
- recurring logistics we'd template.

That list sets the shape of the fixtures (synthetic copies, not the real text) and the order of P1.

| Our workflow | First supported | Grows in | Journey |
|---|---|---|---|
| Weekly planning session | M6 (manual) | M7 calendar, M10 meals, M11 auto-agenda, M13 AI follow-through, M14 delegate, M15 calendar writes | J8 |
| Recurring chores and rotation | M3 | M11 (overdue and unassigned signals) | J3, J3b |
| Handoffs when one adult is busy or away | M5 | M7 (away periods from calendar) | J6 |
| Family scheduling and logistics | M5 (manual events) | M7 (feeds), M15 (writes) | J6, J11 |
| Home maintenance | M3 (routines) | M8 (records), M9 (templates), M14 (booking a pro) | J3, J1 |
| Ongoing projects | M2 | M8 (attachments), M11 (stalled-project signals) | J7 |
| Meals, groceries and supplies | M10 | P2 (recipe import, suggestions) | J9 |
| Recurring logistics (school, travel, birthdays, hosting) | M9 | M11 (preparation signals) | J10 |
| Home issues from a photo | M2 (by hand) | M13 (AI capture) | J2 |
| Contractor coordination | M8 (vendor records) | M14 (outreach) | J1 |
| "Who did we use for…?" | M8 (search) | M13 (cited answers) | J4 |

## 3. Security and privacy rules for real household data

- **Isolation:** RLS plus API-only access from day one, even with one household (ADR-001 §3.4).
- **Children:** named members without accounts. Only what a workflow needs is stored (name, and the items they appear on). Before an LLM call, child names are replaced with role tokens ("Child 1") wherever the task allows.
- **LLM provider:** no training on API data; the shortest available retention; vendor tracing off. Item content never goes into logs, only IDs and counts.
- **Weekly plans, lists and signals** follow item visibility. A private item never appears on a shared agenda, list or digest (T-32).
- **Secrets:** calendar feed URLs, OAuth tokens, API keys and the Postmark token live in the host's secret store or are encrypted at rest in the database. gitleaks runs in CI.
- **Uploads:** MIME allow-list and re-encoding (EXIF stripped) from M5. Malware scanning before any file is opened by an agent step (M13).
- **Backups:** daily managed backups, with a restore test at G4 and then monthly.
- **Revocation:** removing a member ends their sessions, voids any approval they were party to, and cancels pending calendar writes on their connections (T-04).
- **External actions:** only after G12, only through the sender, and each first real action type needs your approval.

## 4. Hosting and running costs (single household)

Prices are from the Phase A commodity notes, accessed 2026-11-07. Recheck them before signing up.

| Item | Choice | Cost | Why |
|---|---|---|---|
| Postgres, Auth, Storage | Supabase Pro | $25/month | Free projects pause after 1 week of inactivity and Free lists no backups; Pro includes 7-day daily backups |
| API and worker | Railway Hobby (one service, two processes) | $5/month, including $5 of usage | Always on; no spin-down |
| LLM (from M13) | Small-tier model for capture and extraction; mid-tier for summaries | about $1–5/month (estimate) | Small tier is about $0.10 / $0.50 per Mtok input/output |
| Email relay (from M14) | Postmark | Free (100 emails/month) if its inbound webhook works on Free; otherwise Pro at $16.50/month | Contractor volume for one household is low |
| Domain | One domain for the relay and the app | about $10–20/year (not checked) | Needed for SPF/DKIM/DMARC |
| iPhone install and push | Apple Developer Program | $99/year | Durable installs (TestFlight) and push on iPhone; skip if we use Android or the web app |
| Builds and push | EAS Free, Expo Push | $0 | 15 iOS builds a month is enough |

**Expected total:** about $31–36/month plus the yearly domain and Apple fees, rising to about $48–53/month if Postmark Pro is needed.

**$0 alternative:** run Postgres, the API and the worker in Docker on a home machine, reached only through Tailscale. Nothing is exposed to the internet, but we own backups, uptime and updates.

No account is created and nothing paid is used without your approval (decision 3).

## 5. What we reuse instead of building

| Need | Reuse | Licence | Status |
|---|---|---|---|
| Database, auth, file storage, RLS | Supabase (managed) and the Supabase CLI for local dev | Apache-2.0 stack | Verified in Phase A notes |
| Jobs, timers, retries, reminders, signal runs | Graphile Worker (including its cron) | MIT | Verified (v0.18.0) |
| Mobile and web client | Expo / React Native, Expo Router, `expo-image-picker`, `expo-notifications` | MIT | Verified (`expo` 58.0.23) |
| Share-sheet capture | `expo-share-intent` | MIT | Verified (9.0.0) |
| Dates, timezones, DST, week boundaries, template offsets | `temporal-polyfill` | MIT | Verified (1.0.8) |
| Search and memory | Postgres full-text search, pgvector | PostgreSQL licence; pgvector to confirm | Partly verified |
| Image re-encoding | sharp | Apache-2.0 (libvips LGPL, dynamically linked) | Verified |
| Push delivery | Expo Push service | Free service | Verified |
| Inbound and outbound email | Postmark API | Commercial service | Verified pricing |
| API server, validation, typed SQL | Hono, Zod, Kysely | MIT (from memory) | Confirm in M0 |
| Tests | Vitest, fast-check (property tests), Playwright (web end to end) | MIT / MIT / Apache-2.0 (from memory) | Confirm in M0 |
| ICS parsing | `node-ical` or `ical.js` | To confirm (ical.js may be MPL-2.0, which is acceptable) | Confirm in M7 |
| Calendar writes | Google Calendar API client or a CalDAV client such as `tsdav` | To confirm | Confirm in M15 |
| Secret scanning | gitleaks | MIT (from memory) | Confirm in M0 |

**Meals, lists, templates and proactive signals need no new libraries.** They are tables and SQL over the existing model, plus Graphile Worker jobs. Ingredient matching is a simple normalized-name merge, not a parser, so no recipe library is needed.

**Built by us** (small, and where the guarantees live):
- the recurrence expander (a constrained subset, property-tested);
- the work-item and run state machines;
- Weekly Reset session and carry-forward logic;
- template instantiation;
- list merge rules;
- the signal engine;
- the approval service and sender;
- the notification outbox with quiet hours;
- the evidence model.

**Reference only, no code copied:** Donetick, HomeBox and Mealie (AGPL), Tandoor (AGPL plus Commons Clause) and nanoMuse (GPL), under the clean-room rule. Mealie and Tandoor are the closest meal-planning references, so the rule matters most for M10. Grocy (MIT) and Home Assistant (Apache-2.0) are permissive. Home Assistant is a possible later integration, for example reminders tied to devices, but not a base.

**Not used now:** agent frameworks (adoptable later inside a step, ADR §3.2), external memory products, authorization engines and notification SaaS. Phase A found each heavier than our needs.

## 6. Explicit exclusions until a later decision

- Billing, pricing, customer onboarding, self-serve sign-up, admin console, marketing site, App Store listing.
- Customer interviews, concierge pilots and pricing experiments (kept only as archived reference).
- A recipe manager, pantry inventory, grocery delivery integration, or a calendar replacement.
- Unconstrained autonomous agents. Proactive features suggest; they never act without approval.
- Live collaborative cursors in Weekly Reset (PRD WF-06 says not needed for MVP).
- AI voice calls, SMS, browser automation, and reading Gmail or Outlook mailboxes.
- Child logins.
- Medical and caregiving workflows.
- Purchases, payments, or bookings without approval.
- Public deployment. The alpha is invite-only for our household.
- Any code derived from nanoMuse or AGPL household apps.
- Reverse engineering competitor apps.

## 7. Per-run cost model for contractor coordination (M14)

| Step | Model tier | Tokens in/out (est.) | Cost |
|---|---|---|---|
| Capture | small | 2k / 0.3k | $0.0004 |
| Plan parameters | small | 2k / 0.5k | $0.0005 |
| Rank and explain 3 options | mid | 6k / 0.8k | $0.020 |
| Draft 2 emails | mid | 6k / 1.2k | $0.024 |
| Extract 3 replies (quarantined) | small | 9k / 0.9k | $0.0014 |
| Summarize decision | mid | 4k / 0.5k | $0.013 |
| **LLM subtotal** | | | **≈ $0.06** |

Places lookups are optional for us, because vendors come from our own records first. Email is covered by the Postmark line in §4.
