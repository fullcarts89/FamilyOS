# FamilyOS — Product Requirements Document
**Version:** 0.2 | **Date:** 2026-11-07 | **Status:** Personal-household-first; build requires founder approval. Commercialization optional and deferred.

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

**Non-goals for v1:** Replace all calendars; build a grocery delivery network; autonomous purchases; autonomous booking without approval; generalized web agent; financial management; children’s social network; proprietary competitor code replication.

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

## 6. MVP scope — P0 / P1 / Later
| Priority | Capability | Notes |
|---|---|---|
| P0 | Household accounts + two adults | Secure invite and tenant isolation |
| P0 | Shared inbox and task/project model | Status, owner, due date, source, timeline |
| P0 | Natural-language quick capture | Structured output, editable before save |
| P0 | Recurring chores | Deterministic scheduler |
| P0 | Weekly Reset shared planning | Review/look ahead, decisions, assignments, plan commit, carry-forward and approval-gated AI follow-through; WF-06 |
| P0 | Agent research + prepared action | One service-coordination workflow |
| P0 | Approval queue + execution audit | Explicit authorization, receipts, retries |
| P0 | Push/email notifications | Actionable, low-noise |
| P0 | Basic attachment upload | Photos, PDF, notes; security scanning |
| P0 | Manual external action fallback | Copy message, log completion when integration unavailable |
| P1 | Email forwarding and extraction | Opt-in, narrow ingestion, source provenance |
| P1 | Calendar read integration | Start read-only; no surprise writes |
| P1 | Home assets, contractors, warranties | Attach to project history |
| P1 | Multiple agent workflows | Childcare outreach, appliance service, etc. |
| Later | Grocery/meal modules | Do not rebuild AnyList/Cozi in MVP |
| Later | School paperwork automation | Strong consent and data protections |
| Later | Purchases, payments, automatic booking | Only after separate safety/economic gates |

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
- **Integrations:** start with manual handoff, then explicit email/calendar OAuth. Never scrape proprietary competitor internals.
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

## 14. Initial implementation milestones
M0 Research artifacts + competitor matrix + licensing assessment + interview script. STOP for founder review.
M1 Clickable prototype for Today, Capture, Work, Approval, Timeline. STOP for usability review.
M2 Foundation: auth, household membership, task/project model, recurrence, audit, test fixtures.
M3 Delegation spike: research -> draft -> approval -> mock external action -> verified status, with failure injection.
M4 Private alpha: one real supported service workflow, monitoring, cost controls, consent and data controls.
M5 Expansion proposal based on measured alpha behavior; no automatic broad roadmap execution.

## 15. Explicit open decisions
- Brand and name (FamilyOS is a placeholder).
- iOS-first vs responsive web first.
- First supported agent workflow: gutter cleaning / appliance repair / childcare coordination.
- Calendar integration read-only vs none for MVP.
- Whether user wants a paid concierge experiment before engineering.
- Exact roles for caregivers/children.
- Hosting, model provider, and agent framework after spike.
