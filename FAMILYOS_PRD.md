# FamilyOS — Product Requirements Document
**Version:** 0.1 | **Date:** 2026-11-07 | **Status:** Discovery / validation, NOT authorization for full build

## 1. Executive summary
FamilyOS is a shared, action-oriented household operating system for busy families. It captures responsibilities from natural language, messages, photos and documents; coordinates people, routines and projects; and delegates appropriate multi-step work to an AI assistant with explicit permissions, durable state, and verified outcomes.

**Promise:** “Tell FamilyOS what needs handling. It remembers, coordinates and moves it forward.”

**Critical differentiation hypothesis:** Existing family organizers are strong at calendars/lists and some AI extraction; general-purpose agents can perform isolated tasks. Families may pay for a trustworthy, persistent shared system that owns follow-through across household members and external parties. This is a hypothesis, not a demonstrated market gap.

## 2. Target customer and jobs to be done
**Beachhead:** US dual-income homeowner households with children, 2+ adults sharing responsibilities, high task volume, existing calendar/email use, willingness to pay for saved time. Do not require homeownership for the underlying platform, but use it as a launch focus.

**Jobs:**
1. Capture a responsibility in seconds without maintaining a separate task database.
2. Know what needs a decision, who owns it, and what is blocked.
3. Coordinate chores, schedules, errands, home issues, and family logistics.
4. Delegate research, preparation, outreach and follow-up safely.
5. Preserve household context: equipment, vendors, documents, preferences and past decisions.
6. See evidence that something was actually completed.

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

## 6. MVP scope — P0 / P1 / Later
| Priority | Capability | Notes |
|---|---|---|
| P0 | Household accounts + two adults | Secure invite and tenant isolation |
| P0 | Shared inbox and task/project model | Status, owner, due date, source, timeline |
| P0 | Natural-language quick capture | Structured output, editable before save |
| P0 | Recurring chores | Deterministic scheduler |
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
- One-tap voice/photo/text capture; clear review of extracted information.
- Approvals show exactly what will be sent, to whom, by which account, and what may happen afterward.
- Progress shows `Researching`, `Draft ready`, `Waiting on vendor`, `Booking confirmed`, `Verified complete`—never generic “Done” without evidence.
- Accessibility: dynamic type, contrast, screen reader, reduced motion; household privacy labels.

## 11. Metrics and validation gates
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
