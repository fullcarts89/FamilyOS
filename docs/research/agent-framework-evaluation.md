# Agent framework and durable-execution evaluation

**Date:** 2026-11-07
**Inputs:**
- Local bench of 32 scenarios, mocked tools, no LLM, no network: `evidence/framework-bench/`.
- Licence audit of resolved dependency trees.
- Primary-source research notes: [`agent_infrastructure.md`](../../research_notes/FamilyOS%20Phase%20A%20research/agent_infrastructure.md) and [`constraints_legal_security.md`](../../research_notes/FamilyOS%20Phase%20A%20research/constraints_legal_security.md).

**Bottom line:** The PRD frames this as LangGraph vs the OpenAI Agents SDK, which is a false choice for FamilyOS.

- Neither is a durable workflow engine. Both leave persistence, idempotency, tenancy and approval binding to the application.
- The bench reproduced the gaps that matter: duplicate sends after a crash, a duplicate approval consumed as a vendor reply, a changed payload sent after approval, and a model claiming success after the tool failed.
- **Recommendation:** FamilyOS owns the control plane in Postgres, waits are queue rows, and LLM calls are stateless validated functions. The MVP does not depend on an agent framework, and one can be adopted later. See ADR-001 §3.
- **Read the results as requirements, not as a verdict on frameworks.** The control-plane baseline was written with safeguards that the framework examples lacked (§1.3). The findings define what any runtime must guarantee (ADR-001 §3.2, R1–R8).

## 1. What was tested locally

**Versions (installed 2026-11-07 with `uv`, Python 3.12):**
- `langgraph` 1.2.20, `langgraph-checkpoint` 4.3.1, `langgraph-checkpoint-sqlite` 3.1.3, `langchain-core` 1.7.6.
- `openai-agents` 0.24.0, `openai` 3.46.0.

**Harness:** [`harness/`](evidence/framework-bench/harness/). The workflow is plan → research → draft → **approval** → send → **await vendor reply** → verify. Every step runs as a separate OS process so restarts are real.

- `mockprovider.py` is a file-backed fake email provider that counts deliveries.
- Crashes are injected with `os._exit(137)` after the provider accepts the message but before the framework persists.
- The OpenAI SDK run uses a deliberately overconfident fake `Model` that always claims success. It tests whether the *framework* stops a false completion; it does not model LLM behaviour.
- `cp_bench.py` is a ~60-line control-plane baseline that I wrote. Its passes show what our own code must do, not that it beats a neutral competitor.

**Limits:**
- SQLite, not Postgres.
- No concurrency or load test.
- No real LLM, so no token cost or latency data. Those belong in M13 (AI assist).

### 1.1 Results ([`results.json`](evidence/framework-bench/results.json))

| # | Scenario | LangGraph 1.2.20 | OpenAI Agents SDK 0.24.0 | Control-plane baseline |
|---|---|---|---|---|
| 1 | Pause for approval, kill process, approve in a new process | ✅ 1 send, resumes to `await_reply` | ✅ 1 send (caller saved `RunState` JSON, 9.4 KB) | ✅ 1 send |
| 2 | Reject | ✅ 0 sends | ✅ 0 sends, **but the fake model's final output still says "Done"** | n/a |
| 3 | Re-invoke with no approval | ✅ 0 sends, re-interrupts | n/a | n/a |
| 4 | Code before `interrupt()` on resume | ⚠️ **re-executed** (notify counter 1 → 3) | n/a | n/a |
| 5 | Crash after provider ack, before checkpoint; recover | ❌ **2 sends** (`durability=sync` and `async`). With `exit` the run rolled back to approval, so re-approving would send twice | ❌ **2 sends** when re-approved from the saved state | ✅ 1 send; run → `blocked: delivery_unknown` |
| 6 | Same, with provider idempotency key | ✅ 1 send (`external_ref=dedup`) | not tested | ✅ 1 send |
| 7 | **Duplicate approval event** after the send | ❌ **"approved" consumed as the vendor's reply**; the run advanced past `await_reply` | ❌ **2 sends** (same saved state approved twice) | ✅ ignored by `event_id`; new event → `no_pending_approval` |
| 8 | Duplicate approval keyed to a stale interrupt ID | ✅ ignored (keyed resume is a usable mitigation) | n/a | n/a |
| 9 | Payload changed after the approver saw it | ❌ **sent to `attacker@example.test`** (approval not bound to payload) | ✅ fail-closed: `ModelBehaviorError` from the call-ID identity check. This is a consistency check, not a signed approval | ✅ `payload_changed_since_approval` → blocked |
| 10 | Another tenant holding the thread/run ID | ❌ resumable; the API has no identity concept | ❌ same (no identity concept) | ✅ `not_found` |
| 11 | Deploy renames the paused node, agent or tool | ❌ **silent**: rc 0, run ends with status `drafted`, 0 sends, no error | ✅ fail-closed: "agent not found" / "tool not found" | n/a (state is a row) |
| 12 | Transient provider failure, retry policy 3 | ✅ 3 attempts, 1 send | n/a | n/a |
| 13 | Retries exhausted, then recover | ✅ error surfaced, resumable from the checkpoint | n/a | n/a |
| 14 | Tool raised; model output | n/a | ❌ **"Done: the vendor has been emailed." with 0 sends.** The default error handler returns the error text to the model | n/a |
| 15 | Is sensitive data in plaintext in persisted state? | yes (recipient and body in SQLite) | yes (`RunState` JSON) | yes (needs column encryption policy) |

**Framework overhead:** process start plus first step took about 1.4–1.6 s for both frameworks (mostly imports) and about 19 ms for the baseline. A resume took 257 ms (LangGraph) and 516 ms (SDK). These numbers don't matter next to LLM latency.

### 1.2 Interpretation

- **Rows 5 and 7 are the critical ones.** Exactly-once delivery across a crash is impossible without provider idempotency. The honest state is `delivery_unknown`, shown to a human.
  - Neither framework models that state.
  - Both re-run the side effect on recovery or on a duplicate approval.
  - LangGraph's resume value goes to *whatever interrupt is pending*, so a late approval became the vendor's reply. Keyed resume (row 8) fixes this only if the caller always supplies interrupt IDs.
- **Row 14 is the false-completion trap the PRD warns about.** The SDK is working as designed: tool errors go back to the model. So *run completion must never be read from model output.*
- **Row 11:** LangGraph's silent stranding is the worst outcome for weeks-long runs. The SDK fails loudly, which is better but still strands the run. Keeping durable state in FamilyOS rows avoids both.
- Each framework is fine for what it is designed to do. None of these is a bug report against them. The rows show which guarantees FamilyOS must provide itself, and those guarantees are most of the hard part. See §1.3 for why the comparison favours the baseline.

### 1.3 How to read these results (added after founder review)

**The comparison is not like for like.**

- **The baseline had the safeguards built in.** I wrote `cp_bench.py` after designing for exactly these failures: payload-hash approvals, an outbox with `delivery_unknown`, event IDs and a tenant check. It passes because it was built to pass.
- **The framework harnesses were minimal, idiomatic examples.** They used each framework's documented approval and persistence features and added nothing around them. Both frameworks document that idempotency, identity and authorization are the application's job.
- **Several framework failures are fixable with application code.** Row 6 shows a provider idempotency key fixing LangGraph's duplicate send. Row 8 shows keyed resume fixing the duplicate-approval case. Payload hashing (row 9), tenant checks (row 10) and evidence-based completion (row 14) can be added around either framework.
- **What remains structural** is narrower: LangGraph's silent end after a renamed node (row 11) and re-execution before `interrupt()` (row 4) are behaviours to design around, not to patch over.

**What the findings do establish:**

1. Durable state, idempotent sends, payload-bound approvals, event dedupe, tenancy and evidence-based completion are **requirements** (ADR-001 §3.2, R1–R8), whatever runtime is used.
2. Neither framework provides them by default, so FamilyOS writes that code either way.
3. Given (2), the MVP keeps the control plane in FamilyOS code, where those guarantees are easiest to test.

**What they do not establish:**

- That frameworks are unsuitable for FamilyOS. A framework hardened with the same safeguards was not tested.
- Anything about real-LLM behaviour, scale or developer productivity.

**Keeping adoption open.** The scenario suite (plan §1.1, gate G12) is written against the control-plane interface. A fair rerun would wrap LangGraph or the Agents SDK with the same safeguards and run that suite. If a framework-backed version passes with less code, or adds value such as a tool loop or tracing, it can be adopted, inside a step first.

## 2. Comparison across the wider field

Sources are cited in [`agent_infrastructure.md`](../../research_notes/FamilyOS%20Phase%20A%20research/agent_infrastructure.md) unless marked "bench".

| Option | Licence (exact) | Durability model | Human-in-loop | Days-long waits | In-flight deploys | Infra | Fit |
|---|---|---|---|---|---|---|---|
| LangGraph (Py/JS) | MIT. The self-hosted Agent Server needs a commercial licence key | Checkpoint per super-step (`durability` sync/async/exit) | `interrupt()` / `Command(resume)` | Yes, the thread sits in the checkpointer | Breaks or strands if the paused node changes (bench #11) | Postgres checkpointer | Step library at most |
| OpenAI Agents SDK (Py/JS) | MIT; `openai` client Apache-2.0 | None built in. The caller serializes `RunState`. Sessions hold history only (default SQLite in-memory) | `needs_approval` → interruptions → `approve()` | Caller's job | Fails closed on renamed tool or agent (bench #11) | none | Step library. Works with non-OpenAI models via LiteLLM (beta) or a custom `Model` (bench proves the interface) |
| Pydantic AI | MIT | None | Deferred tools | Caller's job | n/a | none | Step library |
| Vercel AI SDK | Apache-2.0 (GitHub shows NOASSERTION; the LICENSE file is Apache-2.0) | None | Tool approval | Caller's job | n/a | none | Step library for TypeScript |
| Mastra | Apache-2.0 core; `ee/` forbids production use without a licence | Workflows with snapshots | Suspend/resume | Partial | Unverified | Postgres optional | Avoid `ee/` |
| Claude Agent SDK (TS) | Anthropic Commercial Terms (not OSS) | Session files | Permission hooks | No | n/a | none | Coding-agent shaped; not a fit |
| **DBOS Transact** (Py 3.4.0, TS v5.4) | MIT; auto-upgrade is a paid tier | Postgres rows; durable sleep/recv | `recv` with idempotency key | Yes | Recovers only matching version (default source hash); pin + patch | Our Postgres | **Fallback** |
| Temporal | MIT | Event history replay (cap 51,200 events / 50 MB) | Signals | Yes | Patch markers or pinned workers for weeks | Cluster | Over-weight |
| Inngest | SDK Apache-2.0; server SSPL (GitHub mislabels inngest-js as GPL) | Step memoisation | waitForEvent | Yes | Undocumented | Hosted/server | Licence risk |
| Trigger.dev | Apache-2.0 | Checkpoints only on Cloud | Wait tokens | Self-host holds a worker | Version-locked runs | Cloud | Not chosen |
| Restate | BSL server | Journal | Awakeables | Advises against days-long handlers | Immutable deployments | Own store, no Postgres | Not chosen |
| Hatchet | MIT (v0.114.2) | Postgres-backed engine | Durable events | Yes | Undocumented | Separate engine | Not chosen |
| **Graphile Worker** | MIT (v0.18.0, 2026-09-08) | Jobs in Postgres, `run_at` | n/a (we own approval) | Yes, a row with `run_at` | n/a, jobs are data | Our Postgres | **Chosen queue** |
| pg-boss | MIT (12.38.1) | Jobs in Postgres | n/a | Watch the 14-day default retention on created/retry jobs | n/a | Our Postgres | Alternative |
| Browser Use / Stagehand / Playwright | MIT / MIT / Apache-2.0 | n/a | n/a | n/a | n/a | Browser infra | **Excluded from MVP** (terms, reliability unproven; the cloud has stealth and CAPTCHA solving on by default) |
| Langfuse / Phoenix / LangSmith | MIT core (+ `ee/`) / ELv2 / commercial (self-host Enterprise-only) | n/a | n/a | n/a | n/a | Langfuse self-host needs ClickHouse, Redis, S3 | Optional after alpha |

## 3. Licence and dependency review

Transitive trees were resolved on 2026-11-07 with `pip-licenses` 5.5.5. The full lists are [`lg-licenses.csv`](evidence/framework-bench/lg-licenses.csv) and [`oa-licenses.csv`](evidence/framework-bench/oa-licenses.csv).

- **LangGraph tree (41 packages):**
  - Permissive: MIT, BSD, Apache-2.0, PSF.
  - Weak copyleft (file-level, fine for our use): **MPL-2.0** in `certifi`, and `orjson` (MPL-2.0 AND (Apache-2.0 OR MIT)).
  - No GPL, LGPL or AGPL.
  - It also pulls in `langsmith` (MIT), which sends traces only if `LANGSMITH_TRACING` is set. Keep it unset.
- **OpenAI Agents SDK tree (38 packages):**
  - Permissive plus `certifi` (MPL-2.0) and one MIT-0.
  - No GPL family.
  - It pulls in `mcp` 2.3.0.
  - Tracing exports to OpenAI unless `set_tracing_disabled(True)` or `OPENAI_AGENTS_DISABLE_TRACING=1`. Without an OpenAI key, export returns 401.
- **Our chosen stack:** Postgres (PostgreSQL licence), Supabase (Apache-2.0), Graphile Worker (MIT), Expo/RN (MIT), temporal-polyfill (MIT), sharp (Apache-2.0; libvips LGPL-3.0 is dynamically linked, which is fine for server use), pgvector (licence file to confirm in PR 1). ClamAV (GPL-2.0) would run as a separate daemon only.
- **Open-source household apps:**
  - AGPL: Donetick, HomeBox, Mealie.
  - AGPL + Commons Clause: Tandoor.
  - Not OSS: Homechart.
  - Treat all of these as **UX reference only. Copy no code.**
  - Grocy (MIT) and Home Assistant (Apache-2.0) are permissive but single-household by design; not a base.
- **nanoMuse:**
  - GPL-3.0-or-later; its phone apps derive from OpenMinis 1.13, licensed "GPL-3.0" with no "or later".
  - Single-user Python runtime, SQLite, in-process policy gate, in-memory approvals with a one-hour timeout (they don't survive a restart).
  - Patterns worth re-implementing **from a written description, not code**: grants bound to tool + target + lifetime; taint that can only escalate a decision; vault placeholders the model never sees; outbox key doubling as the idempotency record; JSONL audit; human hand-over for logins and CAPTCHAs.
  - GPL code in a distributed mobile client would force GPL on that client. **Clean-room rule:** nobody, and no AI coding assistant, works on FamilyOS code with nanoMuse source in context.
- **CVE hygiene:** these apply only if LangGraph is ever adopted. Pin `langgraph-checkpoint` ≥ 4.1.1 and `langchain-core` ≥ 1.2.5. The bench versions (4.3.1 and 1.7.6) are already past every advisory listed in the notes.
  - The serializer has a recurring RCE history (CVE-2025-64439, CVE-2026-27794, CVE-2026-28277, CVE-2026-48775).
  - Store namespaces have leaked across tenants (CVE-2026-71433, CVE-2026-115883).
  - The JS SDK let graph input bypass approval steps (GHSA-wp87-994x-j95x).

## 4. REA (Reverse Engineer Anything)

- **Installed?** No. Neither the skill nor the MCP server is installed in this environment. I read REA's instructions from [morluto/rea](https://github.com/morluto/rea) (MIT, `rea-agents` 6.8.0, released 2026-10-25).
- **Applicability:**
  - Its skill file routes ordinary source-repository analysis to normal repository tools.
  - Its strength is shipped binaries, Electron bundles, APKs and runtime capture.
  - Using it on competitors' apps would be proprietary reverse engineering, which the brief forbids. REA's own disclaimer also says "public availability" does not establish permission.
- **Decision:** I used standard source reading (`gh api`) for open-source repos and did not install REA.
- **Caution:** the GitHub numbers on 2026-11-07 (about 440k stars and 109k forks for a repo created 2026-04-14) are unusual, so don't treat them as a trust signal. The README itself warns about look-alike repositories.

## 5. Costs, deployment, debugging and security

| Dimension | Own control plane + Graphile Worker | LangGraph-centred | Agents SDK-centred |
|---|---|---|---|
| Infra cost | $0 beyond Postgres | $0 (Postgres checkpointer); Agent Server needs a licence | $0 |
| Deploy | One container image, 2 processes (API, worker) | Same plus a checkpointer migration policy | Same plus a RunState storage policy |
| Debugging | SQL over `work_event` / `agent_step`; our run timeline | LangGraph Studio / LangSmith (commercial) | OpenAI traces (vendor export) |
| Tenancy | In our schema plus RLS | Thread ID only; store namespaces had CVEs | None |
| Approval binding | Payload hash checked when sending | Caller's job | Call-ID consistency only |
| Lock-in | Low | Medium (checkpoint format) | Low |
| Engineering we own | Recovery, timers, leases (~300–500 lines + tests) | Idempotency, tenancy, approval binding, versioning | Persistence, idempotency, tenancy, approval binding, versioning |

## 6. What remains uncertain

- Real-LLM reliability and cost per run. M13 measures them with a budget the founder approves.
- How DBOS behaves on a 14-day `recv` across deploys, which matters only if we switch to it.
- Postgres-specific behaviour (row locks, `SKIP LOCKED`, `set_config` under connection pooling). M1 and M12 test on the Supabase local stack.
- Inngest, Hatchet and Cloudflare in-flight versioning is undocumented; moot under this recommendation.
