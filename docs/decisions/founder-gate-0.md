# Founder decision memo: implementation readiness

**Date:** 2026-11-07
**Revision:** 4. Final scope review before implementation. Aligned with PRD v0.3.
**Founder decision (2026-11-07):** decisions 1, 2, 4 and 5 **approved as recommended**; M0 started.
**Founder decision (2026-11-08):** decision 3 **approved as (a), with changes** (see below); M4 started.

**Recommendation:** **Ready to begin implementation.** Approve decisions 1, 2, 4 and 5 to start M0. Decision 3 (hosting) is needed only by M4, about 8–10 working days in.

FamilyOS is our family's household operating system first; commercialization is optional and deferred. The three core experiences are confirmed: **Today**, **Weekly Reset** and **Delegate**. The goal is a system that reduces the work of running our household, not one that maximises engagement.

## What changed in revision 4

1. **Four capabilities added** to the PRD, as lightweight layers over the existing model:
   - **WF-07 Meals, groceries and shopping:** a meal plan, shared lists, groceries generated from meals, purchased vs outstanding, favorites and preferences, and recurring supplies. No recipe manager, pantry or delivery integration.
   - **WF-08 Reusable templates and checklists:** templates generate ordinary projects and tasks.
   - **WF-09 Calendar writes with approval:** exact-event approval, idempotent creates, conflict handling and per-adult permissions. iCal read stays the first step.
   - **WF-10 Proactive assistance:** rule-based signals that cite records, an auto-prepared Weekly Reset agenda, per-adult low-noise settings. AI ranking comes later and can never act on its own.
2. **Scope re-tiered** into P0 (first usable alpha), P1 (near-term) and P2 (later). The coverage matrix is in `docs/product/product-contract.md` §3 and PRD §6.
3. **M2 split.** The old M2 becomes four milestones: tasks and Today (M2), routines (M3), private deploy (M4) and coordination with notifications (M5). Estimates are re-based for reliability. The P0 alpha grows from about 13–15 to about 20–26 working days, with real use starting earlier, after M4.
4. **Success criteria rewritten:** less work to run the household, easier weekly planning, fewer forgotten commitments, clear ownership, projects moving with less follow-up, delegation that saves real time, and less coordination overhead than today. No daily-usage or retention targets.
5. **Canonical docs updated:**
   - PRD v0.3: jobs 8–10, §4, WF-07 to WF-10, the WF-06 delivery phasing note, and §6, §7, §9, §11, §13, §14 and §15.
   - Product contract.
   - Implementation plan.
   - ADR-001: §3.6 and §5.2.
   - User journeys J9 to J12.
   - Threat model T-33 to T-35.

   WF-06's requirements and acceptance criteria are unchanged. Prior research and architecture decisions are kept.

## Feature coverage (summary)

| Tier | Capabilities | Milestones |
|---|---|---|
| **P0** first usable alpha | Secure household and invites; inbox, capture, tasks, projects, Today; chores and routines; private deploy; handoffs, caregiver, manual events, notifications, attachments; **Weekly Reset (manual)** | M0–M6 |
| **P1** near-term | Calendar read; home records and search; templates; meals and lists; proactive signals and auto-agenda; approval and outbox control plane; AI assist, including Weekly Reset AI follow-through; **Delegate** | M7–M14 |
| **P2** later | Calendar writes; AI-ranked proactivity; recipe import and meal suggestions; email forwarding; more delegation workflows | M15+ |

## Sequence and estimates

| Phase | Milestones | Working days | Stops |
|---|---|---|---|
| P0 | M0 repo 1–1.5 · M1 foundation 3–4 · M2 tasks and Today 3–4 · M3 routines 3–4 · M4 private deploy 1.5–2 · M5 coordination 3–4 · M6 Weekly Reset 5–6 | **20–26** | Approval before deploy (M4); **review after the first real Weekly Reset (M6)** |
| P1 | M7 calendar read 2–3 · M8 home and search 3 · M9 templates 3 · M10 meals and lists 4–5 · M11 proactive 3–4 · M12 control plane 5–6 · M13 AI 4–5 · M14 Delegate 5–6 | **29–35** | Review after M11 and after M14; approval of the first real calendar feed, LLM call and vendor email |
| P2 | M15 calendar writes 4–5 | **4–5** | Approval of each writable calendar |

These are focused build days. Calendar time is longer, because each milestone pauses for your review and real use.

## Architectural changes

The core decisions hold: a TypeScript monolith, Supabase Postgres through our API only, our own state machines, approvals, outbox and evidence, Graphile Worker, and no agent framework needed now. The additions are:

- **New tables:** list and list_item; meal and meal_plan_entry; template and template_instance; signal and signal_preference; calendar_connection.
- **New background work:** the worker gains signal and feed jobs, and the scheduler re-adds recurring supplies.
- **Idempotency keys** for each generator: groceries from meals, template instantiation, recurring list items and plan commits.
- **Calendar writes** use a `CalendarPort` (Google Calendar API or CalDAV adapter) as `ExternalAction` rows through the existing approval, outbox and sender path. Creates use client event IDs; changes are ETag-checked. Provider behaviour gets confirmed in M15.
- **No new libraries** for meals, lists, templates or signals.

## Decisions requiring your approval (5)

### 1. Scope tiers and coverage

**Question:** Do you approve the P0/P1/P2 tiers in the coverage matrix? They include three changes from PRD v0.2:
- Delegate, the approval queue and AI capture move from P0 to P1.
- WF-06 step 5 (AI follow-through) and criterion 7 move to M13; until then the Delegate step offers manual follow-ups.
- Calendar writes are P2 delivery, with the architecture prepared in P1.

- **Recommendation:** Yes. It follows your priority order: a secure app, then core coordination, Weekly Reset, practical workflows, and AI and delegation last.
- **Trade-off:** the first alpha has no AI and no Delegate. In exchange, the full alpha, including Weekly Reset, reaches our hands about three weeks sooner (the 14–17 days of M12–M14), with nothing in it that can act outside the household.

### 2. Sequence and stop points

**Question:** Do you approve building P0 (M0–M6, about 20–26 days) and stopping for review after the first real Weekly Reset? And do you approve the P1 order: calendar read and practical workflows (M7–M11) before the control plane, AI and Delegate (M12–M14)?

- **Recommendation:** Yes, with one option for you: if creating calendar events from Weekly Reset matters more than AI or Delegate, move M15 up to run right after M12. That delays AI and Delegate by about 4–5 days.
- **Trade-off:** more, smaller milestones mean more PRs and reviews. Each one stays independently testable, and nothing is rushed to hit the old 5–6 day M2.

### 3. Hosting and spending (needed by M4)

**Question:** Which hosting do you approve?
- **(a)** Supabase Pro ($25/month, daily backups) plus Railway Hobby ($5/month), about $31–36/month plus a domain.
- **(b)** A $0 home server reached only through Tailscale.

Also: Apple Developer ($99/year) if we're on iPhones, and a $10/month LLM cap from M13.

- **Recommendation:** (a), because managed backups and uptime matter for real household data. You create each paid account yourself; I never enter payment details.
- **Trade-off:** (b) costs nothing, but a dead home machine means a dead household system.

**Decided (2026-11-08):** (a), adjusted to what we already have:
- **Supabase:** a new `familyos` project inside the existing Supabase organisation. The organisation must be on Pro, and only the founder should be a member, because every member can open the database. Expect about $10/month of compute, because Kinship probably uses the included credit already.
- **Railway Hobby:** two small services, the API serving the web app and the worker, for about $5/month.
- **iPhone app:** distributed through TestFlight, with the Apple Developer Program at $99/year unless it is already held.
- **Domain:** a subdomain the founder already owns serves the app and sends sign-in email through Postmark's free tier.
- **Expected added cost:** about $15/month plus Apple.
- **Who sets things up:** the founder creates every account and enters every secret. The first deploy and the merges still need the founder's approval. The runbook is `docs/operations/deploy.md` (PR #6).

### 4. Stack and real-data rules

**Question:** Do you approve the stack (ADR-001 revision 4) and these rules?
- Children are named members without accounts, with names tokenized before LLM calls where possible.
- Calendars are read via private iCal feeds in P1.
- Calendar writes in P2 use each adult's own connection, with exact-event approval.
- Vendor email goes through the Postmark relay, plus a manual hand-off path.

- **Recommendation:** Yes.
- **Trade-off:** iCal polling lags same-day calendar changes by up to about 30 minutes; refresh times are shown. Which calendar provider each of us uses decides the M15 adapter. It can wait until then.

### 5. Clean-room rule

**Question:** Do you approve the clean-room rule? Under it, nobody, and no AI coding assistant, works on FamilyOS with GPL or AGPL source (nanoMuse, Donetick, Mealie, Tandoor, HomeBox) in context.

- **Recommendation:** Yes. It now matters for meal planning too, where Mealie and Tandoor are the closest references.
- **Trade-off:** none material.

## Also needs you (not decisions)

- **Before M2:** a list of our real routines, projects, maintenance, meals and staples, recurring logistics, and how our weekly planning works today.
- **Before M4:** which phones we use (iPhone, Android or both).
- **Before M4:** five minutes each answering the baseline questions (contract §7).
- **Disclosure (unchanged):** during Phase A research, one automated request to the SEC's EDGAR lookup carried your account email address in its User-Agent header. Nothing else personal was sent anywhere.

## Readiness

FamilyOS is ready to begin implementation:
- The scope is tiered.
- Every P0 milestone has a concrete gate.
- The model covers all capabilities without separate apps.
- No P0 work needs paid infrastructure until M4.

On approval, I start M0 as its own PR against `main`. PR #1 stays open, unmerged, for you to merge when you're ready.
