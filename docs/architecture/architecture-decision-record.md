# ADR-001: FamilyOS MVP architecture

**Status:** Proposed. Awaiting founder Gate 0.
**Date:** 2026-11-07
**Scope:** Phases B–D (prototype, spike, limited alpha). This is not a scaling architecture.
**Evidence:** `docs/research/agent-framework-evaluation.md`, `docs/research/competitor-matrix.md`, `reports/FamilyOS Phase A research.md`, and the local framework bench at `docs/research/evidence/framework-bench/`.

## 1. Decision in one paragraph

Build one **TypeScript modular monolith** on **Postgres** (Supabase Pro for managed Postgres, Auth and Storage).

FamilyOS code owns the **control plane**: work-item and run state machines, approvals, idempotent outbox, evidence and audit. All of it is plain SQL rows.

Long waits (vendor replies, reminders, recurrence) are **rows with a `wake_at`**, picked up by a Postgres job queue (**Graphile Worker**, MIT). We use no workflow-replay engine.

LLM calls are **stateless, schema-validated functions** behind a `ModelPort` interface, called through the provider SDK. **No agent framework in the MVP.**

The client is **Expo / React Native**. Email to vendors goes through **Postmark** from a FamilyOS domain, with per-thread reply addresses. We use no Gmail OAuth, AI voice calling, SMS or browser automation in MVP.

## 2. Forces and constraints

| Force | Source | Consequence |
|---|---|---|
| Waits last days to weeks (vendor reply, appointment, completion) | PRD WF-03 | Each step must be short and the run must outlive every deploy. Replay engines need old workers kept alive or patch markers ([infra notes Q6](../../research_notes/FamilyOS%20Phase%20A%20research/agent_infrastructure.md)). |
| LLM must stay out of authorization decisions | Brief rule 6 | Approval is a deterministic service that checks a payload hash, role and expiry when the message is sent. |
| Zero false completion | PRD WF-03, Gate 2 | "Complete" is derived from evidence rows, never from model output. The bench showed an agent SDK reporting "Done" when the tool had failed (`oa.tool_failed_but_model_says_done`). |
| The lethal trifecta: private data + untrusted vendor text + outbound messaging | Legal/security notes §9 | Quarantined reader model with no tools. Any outbound action needs human approval. |
| Gmail read scopes are *restricted* (CASA annual assessment, about 6 weeks) | Legal notes §1 | Don't read user mailboxes in MVP. Replies come to a FamilyOS inbound address. |
| Places/Yelp/Brave terms restrict storing and generative use | Commodity notes §7 | Store `place_id` only and render vendor data at display time. Yelp is out. Generative comparison over Places content needs legal review. |
| Small team, low cost | PRD §3 | Managed Postgres, one language, no extra clusters. Stack cost is about $64/month at 10 households and about $577 at 1,000 (commodity notes §13, assumptions stated there). |

## 3. Options considered

### 3.1 Orchestration

| Option | Durable waits | Who owns state | In-flight deploy story | Licence | Verdict |
|---|---|---|---|---|---|
| **A. Own state tables + Graphile Worker** | Rows + `run_at`; no worker held | FamilyOS SQL | A two-week-old run is a row read by current code | MIT | **Chosen** |
| B. DBOS Transact (Postgres library) | Durable sleep/recv in our Postgres | DBOS tables in our DB | Recovers only matching app version; needs pinning/patching | MIT (auto-upgrade is a paid tier) | Strong fallback if recovery code grows |
| C. LangGraph + Postgres checkpointer | Interrupt/resume | Opaque checkpoint blobs | Renamed paused node ended the run silently in our bench | MIT; self-hosted Agent Server needs a commercial key | Reject as control plane |
| D. OpenAI Agents SDK RunState | Caller serializes JSON | Caller | Renamed agent/tool fails to restore (fails closed) | MIT | Reject as control plane; acceptable as a step library |
| E. Temporal | Excellent | Temporal cluster | Patch markers or pinned workers for weeks | MIT | Over-weight for MVP |
| F. Inngest / Trigger.dev / Restate / Hatchet | Varies | External engine | Varies | SSPL server / no self-host checkpoints / BSL / MIT | Not chosen (licence, or a second system) |

Why A over B: every FamilyOS step is short, from milliseconds to tens of seconds. Each step reads a row, does one thing and commits the next state. A replay engine's main benefit is resuming in the middle of a function, and we design that need away.

The cost is roughly 300–500 lines of recovery, timer and lease code. That code needs tests, which the Phase C spike will write. If it grows unwieldy, DBOS can be adopted without leaving Postgres.

### 3.2 Agent runtime

**No framework in MVP.** The MVP's LLM work is five bounded calls:

- capture → structured item
- plan → fixed workflow template + parameters
- draft outreach
- extract vendor reply → typed fields
- summarize options with citations

None of them needs an autonomous tool loop. Each is one request with a JSON Schema and a validator. When a real tool-calling loop is justified (multi-source research in Phase D+), add the OpenAI Agents SDK or Pydantic AI-style loop *inside* one step, with its output still validated and still gated by the control plane. LangGraph's value is graph state and checkpoints, which we deliberately keep in our own tables.

### 3.3 Backend language

TypeScript, so one language spans the Expo client, the API and the workers. Graphile Worker, DBOS-TS, Supabase JS, Postmark and the major LLM SDKs are all first-class in TypeScript.

The cost: Python's `dateutil` is more mature than `rrule.js`, which has had no npm release since 2023-11 and defaults to floating UTC. So recurrence is a **constrained in-house expander** on `temporal-polyfill` (MIT), with a property-tested rule subset: daily, weekly by weekday, monthly by day or nth weekday, and every N days after completion. It is not full RFC 5545.

### 3.4 Data platform

**Supabase Pro** ($25/month): managed Postgres, Auth, Storage and pgvector.

Rules that keep RLS a second line of defense rather than the only one:

- The **client never queries tables directly** through PostgREST. The client calls the FamilyOS API. The API runs each request in a transaction with `set_config('app.household_id', …)` and `set_config('app.user_id', …)`, and RLS policies check those settings.
- The service-role key is used only by workers, and every worker query still passes `household_id` explicitly. A CI test fails on any query that has no household predicate.
- Realtime is off for tenant tables in MVP, because Realtime DELETE events are not RLS-filtered (commodity notes §3).

Alternative: Neon + Better Auth + S3. This means more code to own and similar cost, and it stays viable if Supabase lock-in becomes a concern.

### 3.5 Client

**Expo / React Native.** iOS PWAs still need Add to Home Screen before push works, and capture, share sheet and photos are first-class in native. EAS Free or Starter ($0–19/month) covers the build service.

The Phase B prototype is built in Expo with fake data, so it runs in the iOS simulator and on the web and the code carries forward.

### 3.6 External channels

| Channel | MVP decision | Why |
|---|---|---|
| Email out | Postmark, from `"Sam (via FamilyOS)" <h-x7k2@mail.familyos.app>`. Each outreach thread gets its own `Reply-To` with a thread token (`MailboxHash`). | No OAuth scope review. Replies route deterministically. The provider's acceptable-use policy bans cold mail, so get written confirmation that one-to-one, user-approved vendor inquiries are acceptable **before Phase D**. |
| Email in | Postmark inbound webhook. Match on thread token, then on `In-Reply-To`. Check SPF/DKIM and that the sender matches the expected vendor address. | A reply that is spoofed or forwarded must never advance state (see threat model T-07). |
| Send-as-user Gmail | P1, `gmail.send` only (sensitive scope, no CASA). Never read scopes. | Vendors may trust the user's own address more. That is unproven; measure it in the concierge test. |
| SMS | Deferred | A2P 10DLC registration, TCPA, and opt-out handling. |
| AI voice calls | **Excluded** | Under the FCC's 2024 ruling AI voices count as "artificial", so calling cell numbers needs consent, and many contractors use mobile phones. |
| Manual hand-off | **P0 and primary** | Prefilled text or call script with a "Log what happened" button. Vendors often answer only by phone or text, and Gate 1 must measure this. |
| Browser automation | Excluded | Website terms, CAPTCHAs and stealth defaults clash with "observe website terms" (infra notes, browser section). |

### 3.7 Vendor discovery

MVP order of preference:

1. Vendors the household already has (Vendor table).
2. Vendors the user pastes or shares (link, contact card, neighbour recommendation).
3. Google Places Text Search + Details, rendered live, with only `place_id` persisted.

The LLM may rank and explain options using user-entered and household data. Generating comparisons from Places content needs counsel's reading of Places §3.2.3/§14.3, or Google's Maps agent-tools path, **before Phase D**.

Yelp is excluded: §9.4 of its terms bars Yelp content in generative AI. Contractor licence lookup against official state bulk files (CA, TX, FL) is P1.

### 3.8 Model provider

The ADR stays provider-agnostic behind `ModelPort`. Choose in Phase C on a fixed eval set: capture accuracy, zero fabricated deadlines, reply-extraction accuracy, and injection-resistance cases. Requirements:

- structured outputs;
- vision for photos and PDFs;
- no training on API data;
- a ZDR or short-retention option;
- terms that allow a household app that may contain minors' data, so check age clauses (the Gemini Developer API terms bar apps likely used by under-18s).

Price check, $/Mtok input/output, from the commodity notes. Re-verify before Phase D, since prices change.

| Tier | Anthropic | OpenAI |
|---|---|---|
| Small | Haiku 5.5: $0.10 / $0.50 | gpt-6-luna: $0.10 / $0.50 |
| Mid | Sonnet 5.5: $2 / $10 | gpt-6.1-sol: $2 / $10 |

At those prices a full gutter run costs about $0.06 in tokens, or about $0.15–0.25 including Places and email (plan §5). Price is not the deciding factor; accuracy and data terms are.

### 3.9 Memory and search

Postgres full-text search plus pgvector, both under RLS. Every answer cites `source_id` / `work_event_id` rows, and "unknown" is returned when nothing matches. External memory products (mem0, Zep, Letta) are rejected because they sit outside tenant isolation and make citations harder.

### 3.10 Observability

MVP keeps an own-table `agent_step` record: model, tokens, cost, latency, schema-valid, retries, error class and redaction flags. Add OpenTelemetry spans and Sentry (errors). Langfuse (MIT core, but self-hosting needs ClickHouse) is optional and comes after alpha. Agent SDK default tracing to a vendor is disabled.

## 4. Component view

```
Expo app ──HTTPS──▶ API (Fastify/Hono, TS)
                     │  authn: Supabase Auth JWT → membership lookup → role/scopes
                     │  every request: BEGIN; set app.household_id/app.user_id; ... COMMIT
                     ▼
        ┌──────────── Postgres (Supabase) ─────────────┐
        │ work_item · work_event (append-only)         │
        │ recurrence_rule · occurrence_exception       │
        │ agent_run · agent_step · approval            │
        │ outbox (idempotency_key UNIQUE) · evidence   │
        │ source · asset · vendor · thread · message   │
        │ graphile_worker.jobs (run_at, locks)         │
        └──────────────────────────────────────────────┘
                     ▲
Workers (same codebase, separate process):
  scheduler  – materialise occurrences, wake runs whose wake_at ≤ now
  run-step   – advance one agent_run by exactly one transition
  sender     – the ONLY code holding Postmark send credentials; re-verifies approval
  inbound    – Postmark webhook → verify → store message → reader model → typed fields
  notifier   – push/email digests, quiet hours
ModelPort: capture | plan | draft | extract_reply | summarize   (stateless, schema-validated)
```

**The sender is the security boundary.** It reads an `outbox` row and loads the linked `approval`. It sends only if every check passes:

- the status is `approved`;
- the approval has not expired;
- `sha256(canonical(recipient, sender_identity, subject, body, attachments))` equals the stored `payload_hash`;
- the approver still holds a role with `approve:external_message` in that household;
- the household is not paused.

Otherwise it marks the row `rejected_at_send` and records the reason. No model output reaches the sender except through a payload a human approved.

## 5. State model (refines PRD §7)

The PRD mixes the user-facing status with the run status. Split them:

**WorkItem.status** (what the family sees): `new → ready → in_progress → needs_you → waiting_on_others → scheduled → awaiting_completion → verified_complete`, plus `blocked`, `cancelled` and `done_unverified`.

`done_unverified` covers the case where a user marks an item done without evidence. It stays honest and is shown distinctly.

**AgentRun.state** (machine): `planned → researching → drafting → awaiting_approval → sending → awaiting_reply → awaiting_user_decision → awaiting_booking_approval → booking_requested → booked → awaiting_completion_evidence → closed`, plus `delivery_unknown`, `failed` and `cancelled`.

Rules:

- **Transitions are a table-driven allow-list.** An event that is unexpected for the current state is rejected and logged. The bench case `cp.reply_before_send_rejected` shows the intent.
- **Each event has a unique `event_id`.** Duplicate events are ignored. LangGraph accepted a duplicate approval as the vendor's reply (`lg.duplicate_approval_event`).
- **A send whose result is unknown → `delivery_unknown`**, surfaced to the user. It is never blind-retried unless the provider supports idempotency keys (`cp.crash_after_send_no_provider_idem`).
- **Evidence levels:**

  | Level | Meaning |
  |---|---|
  | E0 | Agent assertion |
  | E1 | Provider receipt (message ID, delivery event) |
  | E2 | Authenticated third-party message (vendor reply that passes T-07 checks) |
  | E3 | Explicit household-member confirmation |
  | E4 | Document (invoice, receipt) |

  `booked` requires E2 (vendor confirmation) or E3. `verified_complete` requires E3 or E4. E0 never changes state.

## 6. Assumptions (each one is tested or revisited)

1. Email reaches enough local vendors to be useful. **Unproven**, and the single largest risk. Gate 1 measures it by channel.
2. A FamilyOS relay address gets replies at an acceptable rate compared with the user's own Gmail. Compare in concierge.
3. Postmark accepts one-to-one, user-approved vendor outreach under its acceptable-use policy. Needs written confirmation.
4. Supabase RLS with `set_config` performs at alpha scale. Supabase's own guidance makes indexed, wrapped policies fast (commodity notes §3).
5. A constrained recurrence subset covers 95% or more of household routines. Validate against interview data.
6. A single region (US) and a single currency cover MVP.

## 7. Consequences

- **Positive:**
  - State is inspectable with SQL.
  - Deploys never strand runs.
  - Approvals and tenancy can be tested without a framework.
  - No second datastore or cluster.
  - The framework choice is deferred until it is needed.
- **Negative:**
  - We own the recovery, lease and timer code, and must test it hard.
  - We don't get LangGraph Studio-style visual debugging; our own run timeline view replaces it.
  - Supabase couples auth and storage to one vendor, mitigated by the API-only data access path.
- **Revisit triggers:**
  - Agent work needs open-ended tool loops.
  - Recovery code exceeds ~1k lines or keeps producing bugs.
  - More than 10k active runs.
  - A first non-email channel is added.
