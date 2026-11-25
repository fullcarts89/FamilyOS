# FamilyOS — Product Requirements Document
**Version:** 0.3 | **Date:** 2026-11-07 | **Status:** Personal-household-first; build requires founder approval. Commercialization optional and deferred.

## 1. Executive summary
FamilyOS is a shared, action-oriented household operating system for busy families. It captures responsibilities from natural language, messages, photos and documents; coordinates people, routines and projects; and delegates appropriate multi-step work to an AI assistant with explicit permissions, durable state, and verified outcomes.

**Promise:** “Tell FamilyOS what needs handling. It remembers, coordinates and moves it forward.”

**Product thesis:** A shared system can turn household planning decisions into owned, trackable work and safe agent follow-through. Build first for the founder's own two-adult household; sustained personal utility is the immediate test. Commercial demand is an optional future hypothesis.

## 2. Target customer and jobs to be done
**Initial users:** The founder's household: two adults coordinating family schedules, chores, home projects and delegated work. Support future households architecturally without commercial onboarding or billing in the first release.

**Jobs:**
1. Capture a responsibility in seconds without maintaining a separate task database.
2. Know what needs a decision, who owns it, and what is blocked.
3. Coordinate chores, schedules, errands, home issues, and family logistics.
4. Delegate research, preparation, outreach and follow-up safely.
5. Preserve household context: equipment, vendors, documents, preferences and past decisions.
6. See evidence that something was actually completed.
7. Hold a weekly planning session together, turn decisions into clear assignments, and review follow-through during the week.
8. Plan the week's meals and keep one shared grocery and supplies list that either adult can update.
9. Reuse proven checklists for recurring logistics (school prep, travel, birthdays, hosting, seasonal and maintenance projects).
10. Get ahead of the week: be told, without asking, what needs preparation, deciding or assigning, grounded in our own records.

**Non-goals for v1:** Replace all calendars; build a full recipe manager, pantry inventory or grocery delivery integration; build a grocery delivery network; autonomous purchases; autonomous booking without approval; generalized web agent; financial management; children’s social network; proprietary competitor code replication.

## 3. Product principles
- **Outcomes over lists:** Home emphasizes Needs Approval, In Progress, Blocked, and Completed, not an infinite task feed.
- **Capture once:** Natural language or photo creates structured work, with minimal follow-up questions.
- **Shared but permissioned:** Every object has household, creator, visibility, owner and audit history.
- **Deterministic control plane:** Scheduling, permissions, approvals, task state and idempotency are software rules, not LLM judgments.
- **Human control:** External messages, bookings, purchases, sensitive data sharing require explicit, scoped approval. No silent delegation.
- **Evidence, not assertion:** Agent actions have receipts, tool results, timestamps and an explicit verification status.
- **Graceful failure:** An interrupted or blocked agent surfaces the blocker and never falsely marks work done.
- **Affordable:** Model/browser costs tracked per workflow; avoid agent calls for simple recurring chores.

## 4. Information architecture
1. **Today:** Needs You; In Progress; This Week; Handled; quick capture.
2. **Inbox:** Untriaged inputs and suggested tasks; accept/edit/discard.
3. **Work:** Routine chores, one-off tasks, multi-step projects; ownership and timelines.
4. **Home:** Rooms, assets, vendors, warranties, maintenance and issue history (progressively added).
5. **Family:** Members, shared calendar, roles, preferences, notifications.
6. **Assistant:** Delegation, execution plans, approvals, evidence, errors and history.
7. **Weekly Reset (core P0 experience):** A guided shared planning session and saved weekly plan, surfaced prominently from Today and Family. It is a view over canonical Work, recurrence, calendar and agent objects—not a parallel task database.
8. **Lists and meals (P1):** Shared shopping and supplies lists and a lightweight weekly meal plan, reachable from Today and Weekly Reset. Lists are household records, not a separate app.
9. **Templates (P1):** Reusable checklists that generate ordinary WorkItems and projects.

Avoid six disconnected modules. Calendar events, documents, household assets and vendors attach to canonical Work objects.

## 5. Primary workflows and acceptance criteria
### WF-01: Capture and triage
Input: “Get someone to clean our gutters before the rains,” photo of a leak, forwarded school notice.
- Extract task title, context, due date if stated, likely category and suggested owner; retain source.
- Show confidence and allow editing before committing consequential inferences.
- If deadline or owner is ambiguous, leave unknown; do not invent.
- Detect potential duplicates and offer merge, never silently merge.
- **Acceptance:** first task created in <=30 seconds in moderated tests; 90%+ correct capture of title/category across test set; zero fabricated deadlines.

### WF-02: Recurring household responsibilities
- Assign recurring chores to adults; optional child-visible chores with guardian-controlled access.
- Support daily/weekly/monthly/interval schedules, pause, skip, reassign and completion history.
- No AI needed for recurrence; missed tasks move to Needs Attention, not false completion.
- **Acceptance:** deterministic recurrence tests across timezone/DST; two-member updates converge correctly.

### WF-03: Complex task delegation (hero workflow)
Input: “Find someone to clean our gutters and help schedule it.”
1. Create a durable project with state `new`.
2. Generate a bounded execution plan, show expected steps and what needs approval.
3. Research options using approved sources; record URLs, availability/pricing only if actually verified.
4. Produce a decision-ready comparison and draft outreach.
5. Request explicit approval for each external message or an appropriately narrow batch.
6. Send only through a connected, authorized channel; persist external message ID and delivery status.
7. Track replies, surface options, request booking approval.
8. Mark booked only on actual confirmation; mark completed only with user confirmation or reliable evidence.
9. Attach receipt/invoice and optionally suggest a future reminder.
- **Acceptance:** 100% of external communications gated; 0 unapproved purchases/bookings; agent restart preserves task state; failures surfaced; every completion includes evidence type.

### WF-04: Household memory
- Attach files/photos, vendor details, equipment records and notes to Work objects.
- Search by natural language and structured fields; cite the specific source in answers.
- Support delete/export; no model-training use without explicit consent.
- **Acceptance:** answers reference underlying record; missing information results in “unknown,” not guesses.

### WF-05: Shared coordination
- Invite second adult; assign/accept/reassign work; comment and notify.
- Role types: adult owner/admin, adult member, limited caregiver, child (deferred).
- Separate personal/private tasks from household-visible tasks.
- **Acceptance:** unauthorized role cannot access private docs, approve payments, or invoke privileged tools.

### WF-06: Weekly Reset — shared household planning (core P0)
**Purpose:** Support the two adults' existing weekly planning ritual, typically a 15–20-minute session. Weekly Reset is a first-class entry point alongside Today and Delegate, not merely a calendar view.

**Session workflow:**
1. **Prepare / look back:** For the selected household-local week, assemble a reviewable agenda from incomplete tasks, overdue or blocked work, routine occurrences, pending approvals, prior weekly-plan decisions and confirmed upcoming commitments. Show provenance and last refresh time; do not invent calendar events when no calendar connection exists. Both adults can add free-text topics.
2. **Look ahead:** Display a seven-day view of known events, deadlines, chores, home projects, family logistics and scheduling conflicts. Distinguish connected-calendar events from manually entered items and suggestions.
3. **Decide together:** Discuss agenda items and record decisions as explicit, editable records: decision text, linked item(s), decision maker(s), timestamp and optional rationale. Mark topics decided, deferred or unresolved; unresolved topics remain visible next week.
4. **Assign and confirm:** Turn decisions into canonical WorkItems or update existing ones; set owner, due date, priority and next action. A proposed handoff to the other adult stays **pending acceptance** until accepted; declines return to the requester. Do not silently change ownership.
5. **AI follow-through:** Offer clearly labelled suggestions such as preparing a grocery list, drafting a childcare message, researching a repair or preparing a vendor follow-up. Show the proposed steps and expected permissions. The user explicitly selects which suggestions to delegate; external communication, bookings, purchases and sensitive sharing still require the existing exact-payload approval gate. No AI is required to save a plan or schedule chores.
6. **Commit and revisit:** Save a versioned weekly plan visible to both adults, with an agenda summary, decisions, ownership, outstanding questions and linked actions. Show a lightweight midweek progress view. At the next Weekly Reset, carry forward unresolved items and unfinished actions **by reference**, without duplicating tasks or silently rescheduling due dates.

**Functional requirements:**
- A session is keyed by household and week start in the household timezone; it supports draft, in-session and committed states, plus reopening with an audit trail.
- Either adult can start or resume a session; both can view and contribute. Edits use version checks or conflict handling; no silent overwrite. No need for simultaneous live cursors in MVP.
- Calendar is optional in MVP: manual events and existing due dates work without OAuth. Missing data is labelled, not guessed.
- The plan references canonical WorkItem, RecurrenceRule, source, approval and AgentRun IDs; updates appear in Today and Work immediately. There is one authoritative owner/status per task.
- Weekly planning must not auto-send, auto-book, auto-purchase or mark work complete. Every proposed agent action shows a reviewable preview and remains separately approvable.
- Default notifications are low-noise: an optional weekly reminder and actionable pending-handoff/approval notifications, configurable by each adult.

**MVP acceptance criteria (real household alpha):**
1. Both adults can open the same week's session, add/reorder agenda topics, record a decision and see the saved result after app restart; edits are attributed and preserved.
2. Agenda correctly surfaces known overdue, unfinished, upcoming and blocked items, with explicit empty/missing-calendar states; no fabricated events or deadlines.
3. A decision creates or links exactly one canonical task, and that task appears in Today/Work without duplication. Reopening or committing the session twice is idempotent.
4. An assignment to the other adult remains pending until accepted; rejection leaves the prior owner unchanged and returns the decision for replanning.
5. A committed plan summarizes owners, due dates, unresolved decisions and suggested follow-ups. Both adults see consistent state after refresh.
6. Next week's session carries forward unfinished work and unresolved decisions by reference; completed work remains in the prior week's review, and no existing due date is changed automatically.
7. At least one AI suggestion can become a reviewable draft or bounded research plan; no external side effect occurs without the existing explicit approval flow, and model failure does not block manual planning.
8. Deterministic tests cover week boundaries, timezone/DST, duplicate commits, conflicting edits, owner acceptance/decline and carry-forward; privacy/role tests ensure household scoping.
9. Usability target: the two adults can complete a representative weekly plan in 15–20 minutes without assistance, and can capture a new decision/action in 30 seconds or less. Measure in actual household use rather than claiming success from fixtures.
10. After four consecutive weekly sessions, review whether both adults voluntarily return, whether assignments are acted on, and whether planning reduces forgotten follow-ups. This is a personal-utility gate, not a commercial conversion target.

**Delivery phasing (v0.3, pending founder approval):** the first household alpha delivers steps 1–4 and 6 with manual planning, and criteria 1–6 and 8–9. Step 5 (AI follow-through) and criterion 7 ship with AI assist in P1; until then the Delegate step offers manual follow-up actions only. Criterion 10 runs from the first real session. Later phases add meals (WF-07), calendar writes (WF-09) and an auto-prepared agenda (WF-10) to the session.

### WF-07: Meals, groceries and shopping (P1)
**Purpose:** Lightweight weekly meal planning and one shared list for groceries and household supplies. Not a recipe manager, pantry system or delivery integration.
- Plan meals per day for the upcoming week, inside Weekly Reset or on their own; a meal can be a favorite (reusable) or one-off free text.
- Favorites hold a name, an optional ingredient list and an optional link or note; household preferences (dislikes, allergies, "no meat Mondays") are free-text notes shown while planning.
- One or more shared lists (Groceries, Household supplies, Hardware). Either adult adds, edits, checks off and un-checks items; outstanding vs purchased is always visible; purchased items clear after a configurable period but stay in history.
- "Add groceries from this week's meals" proposes items from planned favorites' ingredients; the user reviews the proposal; duplicates against outstanding items are merged by normalized name, never silently dropped.
- Recurring supplies (paper towels, filters, dishwasher tablets) use the existing recurrence engine to re-add an item to a list on schedule or after it is checked off.
- No AI is required. AI may later suggest meals or parse pasted recipes into ingredients (P2), always as an editable proposal.
- **Acceptance:** concurrent edits by both adults converge without lost items; generating groceries twice for the same week creates no duplicates; a recurring supply reappears exactly once per occurrence; list items are household-scoped and private items stay private.

### WF-08: Reusable family workflows and checklists (P1)
**Purpose:** Turn recurring logistics into one-tap plans: daycare or school prep, travel and packing, birthdays, hosting, seasonal household prep, home maintenance projects.
- A template is a named list of task specs: title, optional owner role ("either adult", "Sam"), optional relative due offset ("3 days before the anchor date"), optional checklist items and notes.
- Instantiating a template asks for an anchor date and owners, then creates one ordinary project with ordinary WorkItems (and checklist items) in the canonical model. Instances do not stay linked to template edits; they record which template version created them.
- Any project can be saved as a template. A small starter set ships with the app; the household edits its own copies.
- **Acceptance:** instantiation is idempotent (retrying creates one project); relative dates are computed in the household timezone across DST; generated tasks behave exactly like hand-made ones in Today, Weekly Reset and search.

### WF-09: Calendar writes with approval (P1 architecture, P2 delivery)
**Purpose:** When a Weekly Reset decision schedules something, FamilyOS can create or change the event in our existing calendar. Read-only iCal remains the first step.
- Each adult connects their own calendar account and chooses which calendars FamilyOS may write to; FamilyOS never writes to a calendar the adult has not enabled.
- Every create, change or delete shows the exact event (calendar, title, time, timezone, attendees, notes) and requires explicit approval by an adult with access to that calendar. No attendee invitations are sent unless the approval shows them.
- Writes go through the same approval, outbox and sender path as other external actions, with a client-supplied event identifier so a retry never creates a duplicate; an unknown result becomes `delivery_unknown`.
- Before writing, FamilyOS re-reads the target time range; an overlap or a changed event (version mismatch) is shown as a conflict for the user to resolve. No silent overwrite.
- FamilyOS is not a calendar replacement: no calendar UI beyond the week view and the approval card.
- **Acceptance:** zero unapproved writes; retry after a crash produces one event; edits to an event changed elsewhere surface a conflict; revoking a connection stops all pending writes.

### WF-10: Proactive household assistance (P1 rules, P2 AI)
**Purpose:** Help us prepare for the week without constant prompting, grounded in actual records.
- A deterministic signal engine runs on a schedule and on changes, over canonical records: upcoming commitments with preparation needs (a template anchor, a birthday, travel), unresolved decisions, schedule overlaps, unassigned or overdue responsibilities, stalled projects (no activity in N days), recurring supplies due, and pending handoffs and approvals.
- Each signal cites the records it came from and offers one practical next action (assign, schedule, add to agenda, start a template, draft a follow-up). Accepting an action uses the normal flows; external actions keep the exact-payload approval gate.
- Signals feed the auto-prepared Weekly Reset agenda and an optional digest; urgent items (a pending approval that expires, a same-day conflict) may notify immediately.
- Low noise by default: each adult chooses which signal types they get, quiet hours, and digest-only vs immediate. A dismissed signal does not return unless its underlying records change.
- AI may later rank signals and phrase recommendations (P2), but may not create signals without a cited record or take any action on its own. No unconstrained autonomous agent.
- **Acceptance:** every signal links to its source records; no signal fires from missing data; dismissals are respected; the weekly digest stays within a configured length; nothing external happens without approval.

## 6. Scope — P0 / P1 / P2
Re-tiered in v0.3 (pending founder approval). **P0** = required for the first usable household alpha. **P1** = near-term enhancements. **P2** = later capabilities. Milestones are in `docs/plan/implementation-plan.md`.

| Priority | Capability | Notes |
|---|---|---|
| P0 | Household accounts + two adults | Secure invite, tenant isolation, no public sign-up |
| P0 | Shared inbox and task/project model | Status, owner, due date, source, timeline; untriaged inbox with accept/edit/discard |
| P0 | Quick capture (manual, structured) | Text and photo, editable before save; AI extraction is P1 |
| P0 | Recurring chores and routines | Deterministic scheduler, rotation, skip/swap/pause |
| P0 | Two-adult coordination | Assignment, pending-acceptance handoffs, comments, caregiver scope |
| P0 | Push/email notifications | Actionable, low-noise, quiet hours |
| P0 | Basic attachment upload | Photos, PDF, notes; type allow-list and re-encoding; malware scanning before any agent step reads a file (P1) |
| P0 | Weekly Reset shared planning (manual) | WF-06 steps 1–4 and 6; see delivery phasing |
| P0 | Audit, export, backups | Every write audited; restore tested |
| P1 | Calendar read integration | iCal feeds, read-only |
| P1 | Home assets, vendors, warranties, maintenance log | Attach to project history; searchable records |
| P1 | Reusable templates and checklists | WF-08 |
| P1 | Meals, groceries and shopping lists | WF-07 |
| P1 | Proactive assistance (rule-based) | WF-10 signals, auto-prepared agenda, digest |
| P1 | Approval queue + execution audit + outbox | Explicit authorization, receipts, idempotent retries; first used for calendar writes or delegation |
| P1 | AI capture, household memory search, Weekly Reset AI follow-through | Schema-validated, cited, never required |
| P1 | Agent research + prepared action (Delegate) | One service-coordination workflow |
| P1 | Manual external action fallback | Copy message, log completion when integration unavailable |
| P2 | Calendar writes with approval | WF-09; architecture prepared in P1 |
| P2 | AI-ranked proactive recommendations | WF-10 AI layer |
| P2 | Email forwarding and extraction | Opt-in, narrow ingestion, source provenance |
| P2 | Multiple agent workflows | Childcare outreach, appliance service, etc. |
| P2 | Recipe import, meal suggestions | Editable proposals only; no recipe manager |
| P2 | School paperwork automation | Strong consent and data protections |
| Not planned | Pantry inventory, grocery delivery, purchases, payments, automatic booking | Only after separate safety decisions |

## 7. Canonical domain model
- `Household(id, timezone, settings)`
- `Membership(user_id, household_id, role, status, scopes)`
- `WorkItem(id, household_id, type[routine|task|project|issue], title, description, status, owner_id?, due_at?, priority?, visibility, created_by, source_id?, version)`
- `WorkEvent(id, work_item_id, actor, event_type, timestamp, payload, evidence_id?)` append-only audit
- `RecurrenceRule(id, work_item_id, rule, timezone, next_due_at, paused)`
- `Source(id, kind[text|photo|email|document], provenance, storage_ref, extracted_fields, confidence)`
- `Asset(id, household_id, room?, model?, serial?, warranty?, metadata)`
- `Vendor(id, household_id, contact, service_type, notes)`
- `AgentRun(id, work_item_id, state, budget, plan, checkpoint, retry_count, last_error)`
- `Approval(id, run_id, action_type, exact_payload, requested_by, authorized_by?, status, expires_at)`
- `ExternalAction(id, approval_id, provider, idempotency_key, status, external_ref?, receipt_ref?)`
- `Evidence(id, type, source_ref, verification_level, timestamp)`
- `WeeklyPlan(id, household_id, week_start_local, timezone, status[draft|in_session|committed], version, created_by, committed_at?)`
- `WeeklyAgendaItem(id, weekly_plan_id, kind, source_ref?, position, state[open|decided|deferred], notes)`
- `WeeklyDecision(id, weekly_plan_id, agenda_item_id?, text, actor_id, state[decided|unresolved|deferred], linked_work_item_id?, created_at)`
- `WeeklyPlanEvent(id, weekly_plan_id, actor_id, event_type, timestamp, payload)` append-only history; reference existing WorkItem/AgentRun/Approval records instead of copying their status.
- `List(id, household_id, kind[grocery|supplies|other], name, visibility)` and `ListItem(id, list_id, text, normalized_name, quantity?, state[outstanding|purchased], added_by, source_ref?, recurrence_rule_id?, version)`
- `Meal(id, household_id, name, ingredients[], notes, favorite)` and `MealPlanEntry(id, household_id, date_local, slot?, meal_id?, free_text?, weekly_plan_id?)`
- `Template(id, household_id, name, version, items[])` and `TemplateInstance(id, template_id, template_version, anchor_date, project_work_item_id, idempotency_key)`
- `CalendarConnection(id, member_id, provider, mode[ics_read|api_write], writable_calendars[], secret_ref, status)` and calendar writes as `ExternalAction(provider=calendar, idempotency_key=client event id)`
- `Signal(id, household_id, kind, source_refs[], suggested_action, state[open|accepted|dismissed], fingerprint, created_at)` with per-member signal preferences

Work states: `new -> ready -> in_progress -> awaiting_approval / awaiting_external / blocked -> verified_complete` (or `cancelled`). Distinguish `agent_finished_step` from `real_world_complete`.

## 8. Agent policy / autonomy
- **Assist:** advise and draft; user performs external action.
- **Prepare:** research and assemble an action; explicit approval before sending/booking.
- **Bounded automate (future):** only previously authorized, reversible, low-risk actions within clear limits.
- Never auto-send messages to third parties, spend money, sign contracts, disclose private data, or book appointments in v1.
- Agent tools use least-privilege tokens and household-scoped credentials; protect against prompt injection in webpages/emails/documents.
- Every execution step records inputs, output, timestamps, cost, source, and authorization decision. Redact secrets and sensitive content from logs.
- Retry safely with idempotency; cap attempts, browser minutes and token budgets; stop on ambiguity.

## 9. Technical architecture (proposed, subject to spike)
- **Client:** mobile-first React Native/Expo or responsive web PWA for fastest validation; decide after usability test.
- **Backend:** Postgres with tenant-scoped row-level controls; object storage for documents; job queue + durable workflow state.
- **Core services:** identity, work/recurrence, notifications, ingestion, approval/audit, memory retrieval, agent orchestration.
- **Agent:** evaluate LangGraph (MIT) vs OpenAI Agents SDK (MIT) using a measured spike; do not lock in prematurely.
- **Browser:** Browser Use (MIT) only for bounded workflows where API unavailable; observe website terms, authentication and reliability.
- **Integrations:** start with manual handoff and read-only iCal; calendar writes (WF-09) and email go through the approval/outbox path with per-adult connections and scoped credentials. Never scrape proprietary competitor internals.
- **Observability:** task lifecycle trace, per-run cost, error classes, user corrections, human intervention, completion verification.
- **Security:** tenant isolation, encryption at rest/in transit, scoped OAuth, key rotation, deletion/export, audit logs, threat model, rate limits, prompt-injection defense, backups.

## 10. Design requirements
- Calm, practical, warm; no gamified guilt, streaks or artificial urgency.
- Home screen prioritizes decisions and exceptions; completion feed demonstrates value.
- Weekly Reset is a prominent guided session with Look Back → Look Ahead → Decide → Assign → Delegate → Commit; show clear shared ownership and unresolved items, with easy pause/resume.
- One-tap voice/photo/text capture; clear review of extracted information.
- Approvals show exactly what will be sent, to whom, by which account, and what may happen afterward.
- Progress shows `Researching`, `Draft ready`, `Waiting on vendor`, `Booking confirmed`, `Verified complete`—never generic “Done” without evidence.
- Accessibility: dynamic type, contrast, screen reader, reduced motion; household privacy labels.

## 11. Metrics and validation gates
**Personal-household-first override:** The commercial Gate 0/1/3/4 language below is retained as historical research context, not a prerequisite for building or using FamilyOS at home. Immediate success is repeat use by both adults, fewer forgotten commitments, useful weekly planning, and safe execution. Pricing and external-family pilots are deferred. Weekly Reset has its own four-week personal-utility criteria in WF-06.

**Success criteria (v0.3):** FamilyOS succeeds when it reduces the work of running our household, not when it maximizes engagement. Daily usage is not required; a system that quietly handles responsibilities with little interaction is succeeding.
- Both adults find it useful and return voluntarily.
- Weekly planning becomes easier.
- Fewer commitments are forgotten.
- Responsibilities are clearly owned.
- Household projects progress with less manual follow-up.
- AI delegation saves meaningful time.
- It requires less coordination overhead than our current methods.
- Trust failures (unapproved external actions, false completions, data exposure, data loss) stay at zero.

**Gate 0 — Competitive and demand discovery (before build):** 12–15 target-household interviews; at least 8 describe a recurring coordination/follow-up pain; at least 5 commit to testing; collect evidence of willingness to pay (deposit or paid concierge preferred). Record incumbent apps used and specific unmet jobs.

**Gate 1 — Concierge test:** 5–10 households delegate one real service/coordination task; measure time saved, completion, interventions, willingness to delegate again. Do not represent manual work as autonomous.

**Gate 2 — Technical spike:** 20 realistic workflow runs with injected failures; target >=80% reach a useful, verified next state, 100% correct approval gating, zero false completion, acceptable median cost and runtime. Targets are proposed thresholds, not observed results.

**Gate 3 — Private alpha:** 10 households for four weeks; >=60% delegate a second distinct task, >=50% invite another adult, median capture <=30s, zero critical privacy/authorization incidents. Evaluate paid conversion and willingness to pay $12–$25/mo.

**Gate 4 — Build expansion:** only add new modules after reliable repeat usage, healthy unit economics and clear retention signal. Explicit founder approval required at each gate.

## 12. Economics hypotheses
Test $9–$15/mo for shared organization and $19–$29/mo for bounded agent assistance, with included usage allowance. Benchmark against Cozi Max $79/year and Ohai Family $9/month (public list prices as of research date). Pricing is unvalidated. Track gross margin per household after inference, browser time, email, storage, support, payment fees and failures. Avoid unlimited execution plans.

## 13. Risks / mitigations
- **Feature parity with Cozi/Ohai:** wedge on execution + follow-through, not feature breadth.
- **Agent brittleness:** narrow supported tasks, human approvals, checkpoints and fallback.
- **Privacy / child data:** collect minimal child data, caregiver roles deferred, review legal obligations before launch.
- **Household onboarding burden:** first value from one captured responsibility, no mandatory home inventory.
- **Low frequency of complex tasks:** combine lightweight recurring chores with high-value delegation; validate actual retention.
- **Expensive support:** limit workflow scope, transparent failure states, usage caps.
- **Competitor licensing/IP:** copy general patterns only; no proprietary code/assets, no bypassing access controls.
- **Scope creep from new modules (meals, templates, proactivity):** each is a thin layer over the canonical model, sequenced after the P0 alpha, with its own gate; none may delay the first usable version.
- **Notification noise from proactivity:** rule-based, cited, per-adult preferences, digest by default.

## 14. Implementation milestones
Superseded by `docs/plan/implementation-plan.md` (revision 4): P0 household alpha in milestones M0–M6, then P1 milestones M7–M14, each ending at an engineering and security gate with a founder stop. The original v0.1 milestone list (research, clickable prototype, spike, multi-household alpha) is retained in git history.

## 15. Explicit open decisions
- Brand and name (FamilyOS is a placeholder).
- Phones in use (iPhone, Android or both); iOS app vs web first for the alpha.
- Calendar provider(s) for each adult, which decides the WF-09 write path (Google Calendar API or CalDAV).
- Exact roles for caregivers/children.
- Hosting and model provider (see `docs/decisions/founder-gate-0.md`). Agent framework: none needed now; adoption kept open (ADR-001 §3.2).
- Resolved in v0.2–v0.3: personal-household-first; calendar read-only via iCal for the alpha; no paid concierge experiment; first agent workflow chosen from our own household's jobs.
