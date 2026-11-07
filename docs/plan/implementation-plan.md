# FamilyOS implementation plan: Phase A to a private household alpha

**Date:** 2026-11-07
**Revision:** 3. Personal-use strategy (`docs/product/product-contract.md`), aligned with PRD v0.2 including Weekly Reset (WF-06).
**Status:** Proposed. Nothing below starts until the founder approves `docs/decisions/founder-gate-0.md`.
**Architecture:** ADR-001.
**Threat IDs:** T-xx refer to `docs/security/threat-model.md`.

## 0. Principles

- **Real use early.** Our household starts using Today, routines and handoffs after M2, about 9–10 working days in. Weekly Reset follows about a week later, so the first real session can happen that weekend. AI and delegation come after that, into an app already in daily use.
- **Three core experiences:** Today, Weekly Reset and Delegate. Today and Weekly Reset make up the first alpha; Delegate arrives once its safety gate passes.
- **No commercial gates.** There are no customer interviews, concierge pilots, pricing tests or market gates (PRD §11 override). Each milestone ends at an **engineering and security gate**: concrete tests that must pass before we rely on that feature.
- **Manual first, AI second.** Every workflow, including saving a weekly plan, works with no AI. AI speeds things up but is never required.
- **Synthetic fixtures for tests, real data for use.** CI never contains our real household data. A second synthetic household is always seeded, to prove isolation.
- **Founder approval at each real-world step.** These each need your explicit approval: the first deploy, connecting a real calendar, the first real LLM call on household data, and the first real email to a vendor.

**Phase names, redefined:**
- **Phase B** is now the private household alpha, M0–M3. It replaces the fake-data-only prototype.
- **Phase C** is M4–M6: schedules, AI assist and delegation.
- **Phase D** (other households, commercial use) is deferred and needs a separate decision.

## 1. Milestones and gates

### Phase B: private household alpha

| M | Content | Gate that must pass | Estimate |
|---|---|---|---|
| **M0** Repo foundation | pnpm workspace: `apps/mobile` (Expo with Router; iOS and web targets), `apps/api` (Hono on Node), `apps/worker`, `packages/domain` (types, state enums, transition tables), `packages/db` (SQL migrations, typed queries). Supabase CLI local stack. CI: typecheck, lint, unit tests, gitleaks. Proprietary LICENSE notice | **G0:** CI green; one-command local stack; secret scan clean; no network calls in tests | 1 day |
| **M1** Household foundation | Schema: household, member (adult, caregiver, child without account), invite, work_item, work_event (append-only), recurrence_rule, occurrence, project, asset, vendor, source, and the PRD's WeeklyPlan, WeeklyAgendaItem, WeeklyDecision and WeeklyPlanEvent. API with Supabase Auth (email one-time code; **public sign-up disabled**; invite only). RLS through `set_config`. Audit events on every write. Export endpoint (JSON plus files). Expo shell with sign-in | **G1 security:** cross-household matrix against a seeded second household returns 404 with no write (T-01, T-02); anon and authenticated table grants empty (T-05); sign-up verified closed; no secrets or item text in logs; export round-trips | 3 days |
| **M2** Today and the daily household core (no AI) | **Today** (Needs you / In progress / This week / Handled); quick capture (text, photo); one-off tasks and **projects** with subtasks; **routines** (calendar-based and after-completion; rotation; skip, swap and pause; missed → needs attention); **handoff requests** (accept, decline, re-route to caregiver); comments; **Home** (rooms, assets, vendors, warranties, maintenance log); manual calendar events; notifications (Expo Push, quiet hours, email digest fallback) | **G2 daily-use alpha:** recurrence property tests across DST and month-ends (10k random schedules vs a reference expander); concurrent-edit conflicts surface; no owner change without acceptance; backup **restore test** passes; app deployed privately (§4) and both adults signed in. **Then daily use starts** | 5–6 days |
| **M3** Weekly Reset | Session per household and local week start, with draft / in_session / committed states and reopen-with-audit. **Look Back:** a deterministic agenda of overdue, blocked and unfinished items, routine occurrences, pending approvals and last week's unresolved decisions, with provenance and refresh time, plus free-text topics from either adult and reordering. **Look Ahead:** seven days of events, deadlines, chores, projects and conflicts, with connected, manual and suggested items labelled differently. **Decide:** decision records (text, linked items, who, when, optional rationale; decided / deferred / unresolved). **Assign:** each decision creates or links exactly one WorkItem; handoffs stay pending acceptance. **Commit:** a versioned plan both adults see. Then a midweek progress view, carry-forward by reference at the next session, and an optional weekly reminder. The Delegate step shows a placeholder until M5 | **G3 Weekly Reset:** deterministic tests for WF-06 acceptance criteria 1–6 and 8: week boundaries, timezone and DST, double commit and double reopen idempotent, conflicting edits, accept and decline, carry-forward without duplication or date changes, and role scoping. A synthetic dry run takes 20 minutes or less. **Then the first real Weekly Reset** | 4–5 days |

**Phase B total:** about 13–15 working days, with daily use from about day 10 and Weekly Reset from about day 15.

### Phase C: schedules, AI and delegation

| M | Content | Gate that must pass | Estimate |
|---|---|---|---|
| **M4** Schedules | Read-only import of each adult's calendar through its private iCal (ICS) feed, feeding Weekly Reset's Look Ahead and Today. Away periods that list affected items (journey J6). Deterministic conflict hints. An outbound ICS feed of FamilyOS items for our calendar apps | **G4:** feed URLs stored encrypted and never logged (they act as passwords); timezone and DST tests on imported events; a feed that fails to fetch shows as "stale", never as wrong data. **Founder approves connecting each real calendar** | 2–3 days |
| **M5** AI assist | `ModelPort` (provider SDK, schema-validated, stateless). Capture from text or photo → an editable suggestion, never auto-saved. Household memory search (Postgres FTS plus pgvector) with citations and an "unknown" answer. **Weekly Reset suggestions** (WF-06 step 5): labelled suggestions such as a grocery list, a draft childcare message or a repair research plan, which the user explicitly selects and which produce drafts only. Per-call token budget and monthly cap. Data minimisation before each call (§3) | **G5 AI:** eval set of at least 60 synthetic cases: zero fabricated dates, events or owners; citations only to returned rows; the unknown path works; injection cases in photos and PDFs have no effect; a model failure never blocks manual planning (WF-06 criterion 7); monthly cost under the approved cap. **Founder approves the first real call on household data** | 4–5 days |
| **M6** Delegate and contractor coordination | Control plane: agent_run, approval (payload hash, role, expiry), outbox, sender (the only holder of send credentials), Postmark inbound webhook, quarantined reader model, evidence levels E0–E4, kill switch. **Manual hand-off** (prefilled text or call script plus "log what happened") as a first-class path. Postmark relay with per-thread reply addresses. Vendors from our Home records or pasted in. Weekly Reset's Delegate step goes live | **G6 external actions:** the scenario suite (§1.1) passes against a mock provider, covering R1–R8; zero bypassed approvals; zero false completions. **Founder approves the first real send**, for one real task | 6–7 days |
| **M7** Four-week review | After four consecutive Weekly Resets, review the success measures (product contract §6) from the event log and the sessions themselves. Fix what hurts; decide what comes next | **G7:** a written review; any trust measure above zero blocks new features until fixed | 1 day |

**Phase C total:** about 13–16 working days. **Build total:** about 26–31 working days.

**Order flexibility:** M4, M5 and M6 can be reordered after Phase B, based on what our household needs most (§2). M6 depends only on M1–M3.

### 1.1 Scenario suite for G6 (each a permanent automated test)

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

Simulated actions are labelled `SIMULATED` everywhere in the UI and the logs.

## 2. Prioritisation by real household workflows

Before M2 starts, the founder lists our real workflows: about 10–20 routines, the current projects, upcoming home maintenance, open contractor jobs and how our weekly planning session runs today. That list sets the shape of the M2–M3 fixtures (synthetic copies, not the real text) and the Phase C order.

| Our workflow | First supported in | Journey |
|---|---|---|
| Weekly planning session | M3 (manual), M4 (calendar in Look Ahead), M5 (AI suggestions), M6 (delegate from the session) | J8 |
| Recurring chores and rotation | M2 | J3, J3b |
| Handoffs when one adult is busy or away | M2 (handoff), M4 (away period from calendar) | J6 |
| Family scheduling | M2 (manual events), M4 (calendar feeds) | J6, J8 |
| Home maintenance (filters, gutters, service intervals) | M2 (routines and Home), M6 (booking a pro) | J3, J1 |
| Home issues from a photo | M2 (by hand), M5 (AI capture) | J2 |
| Ongoing projects | M2 | J7 |
| Contractor coordination | M2 (vendor records), M6 (outreach) | J1 |
| "Who did we use for…?" | M2 (records), M5 (memory search) | J4 |

## 3. Security and privacy rules for real household data

- **Isolation:** RLS plus API-only access from day one, even with one household (ADR-001 §3.4).
- **Children:** named members without accounts. Only what a workflow needs is stored (name, and the items they appear on). Before an LLM call, child names are replaced with role tokens ("Child 1") wherever the task allows.
- **LLM provider:** no training on API data; the shortest available retention; vendor tracing off. Item content never goes into logs, only IDs and counts.
- **Weekly plans:** decisions and agenda notes are household-private by default. A private (single-adult) item never appears on the shared agenda (PRD WF-05).
- **Secrets:** calendar feed URLs, API keys and the Postmark token live in the host's secret store and are encrypted at rest where stored in the database. gitleaks runs in CI.
- **Uploads:** MIME allow-list and re-encoding (EXIF stripped) from M2. Malware scanning before any file is opened by an agent step (M6).
- **Backups:** daily managed backups, with a restore test at G2 and then monthly.
- **Revocation:** removing a member ends their sessions and voids any approval they were party to (T-04).
- **External actions:** only after G6, only through the sender, and the first real send needs your approval.

## 4. Hosting and running costs (single household)

Prices are from the Phase A commodity notes, accessed 2026-11-07. Recheck them before signing up.

| Item | Choice | Cost | Why |
|---|---|---|---|
| Postgres, Auth, Storage | Supabase Pro | $25/month | Free projects pause after 1 week of inactivity and Free lists no backups; Pro includes 7-day daily backups |
| API and worker | Railway Hobby (one service, two processes) | $5/month, including $5 of usage | Always on; no spin-down |
| LLM (from M5) | Small-tier model for capture and extraction; mid-tier for summaries | about $1–5/month (estimate) | Small tier is about $0.10 / $0.50 per Mtok input/output |
| Email relay (from M6) | Postmark | Free (100 emails/month) if its inbound webhook works on Free; otherwise Pro at $16.50/month | Contractor volume for one household is low |
| Domain | One domain for the relay and the app | about $10–20/year (not checked) | Needed for SPF/DKIM/DMARC |
| iPhone install and push | Apple Developer Program | $99/year | Durable installs (TestFlight) and push on iPhone; skip if we use Android or the web app |
| Builds and push | EAS Free, Expo Push | $0 | 15 iOS builds a month is enough |

**Expected total:** about $31–36/month plus the yearly domain and Apple fees, rising to about $48–53/month if Postmark Pro is needed.

**$0 alternative:** run Postgres, the API and the worker in Docker on a home machine, reached only through Tailscale. Nothing is exposed to the internet, but we own backups, uptime and updates.

No account is created and nothing paid is used without your approval (decision 2).

## 5. What we reuse instead of building

| Need | Reuse | Licence | Status |
|---|---|---|---|
| Database, auth, file storage, RLS | Supabase (managed) and the Supabase CLI for local dev | Apache-2.0 stack | Verified in Phase A notes |
| Jobs, timers, retries, weekly reminders | Graphile Worker | MIT | Verified (v0.18.0) |
| Mobile and web client | Expo / React Native, Expo Router, `expo-image-picker`, `expo-notifications` | MIT | Verified (`expo` 58.0.23) |
| Share-sheet capture | `expo-share-intent` | MIT | Verified (9.0.0) |
| Dates, timezones, DST, week boundaries | `temporal-polyfill` | MIT | Verified (1.0.8) |
| Search and memory | Postgres full-text search, pgvector | PostgreSQL licence; pgvector to confirm | Partly verified |
| Image re-encoding | sharp | Apache-2.0 (libvips LGPL, dynamically linked) | Verified |
| Push delivery | Expo Push service | Free service | Verified |
| Inbound and outbound email | Postmark API | Commercial service | Verified pricing |
| API server, validation, typed SQL | Hono, Zod, Kysely | MIT (from memory) | Confirm in M0 |
| Tests | Vitest, fast-check (property tests), Playwright (web end to end) | MIT / MIT / Apache-2.0 (from memory) | Confirm in M0 |
| ICS parsing | `node-ical` or `ical.js` | To confirm (ical.js may be MPL-2.0, which is acceptable) | Confirm in M4 |
| Secret scanning | gitleaks | MIT (from memory) | Confirm in M0 |

**Built by us** (small, and where the guarantees live): the recurrence expander (a constrained subset, property-tested), the work-item and run state machines, the Weekly Reset session and carry-forward logic, the approval service and sender, the notification outbox with quiet hours, and the evidence model.

**Reference only, no code copied:** Donetick, HomeBox and Mealie (AGPL), Tandoor (AGPL plus Commons Clause), nanoMuse (GPL), under the clean-room rule. Grocy (MIT) and Home Assistant (Apache-2.0) are permissive. Home Assistant is a possible later integration, for example reminders tied to devices, but not a base.

**Not used now:** agent frameworks (adoptable later inside a step, ADR §3.2), external memory products, authorization engines and notification SaaS. Phase A found each heavier than our needs.

## 6. Explicit exclusions until a later decision

- Billing, pricing, customer onboarding, self-serve sign-up, admin console, marketing site, App Store listing.
- Customer interviews, concierge pilots and pricing experiments (kept only as archived reference).
- Live collaborative cursors in Weekly Reset (PRD WF-06 says not needed for MVP).
- AI voice calls, SMS, browser automation, and reading Gmail or Outlook mailboxes.
- Child logins.
- Medical and caregiving workflows.
- Purchases, payments, or bookings without approval.
- Public deployment. The alpha is invite-only for our household.
- Any code derived from nanoMuse or AGPL household apps.
- Reverse engineering competitor apps.

## 7. Per-run cost model for contractor coordination (M6)

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
