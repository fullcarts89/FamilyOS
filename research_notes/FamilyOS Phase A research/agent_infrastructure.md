# Agent runtime and durable-execution infrastructure for FamilyOS

Scope: agent frameworks, durable execution engines, Postgres queues, browser automation, observability/evals, and nanoMuse, judged against the FamilyOS workflow (capture -> plan -> research -> draft -> human approval -> send email -> wait days for a vendor reply -> human decision -> verify completion). The brief asks for a modular monolith, Postgres, a deterministic task engine, an explicit approval service, durable agent state, and no LLM in authorization decisions ([CLAUDE_EXECUTION_BRIEF.md rule 6, local file](../../CLAUDE_EXECUTION_BRIEF.md); [FAMILYOS_PRD.md lines 28, 114-118, 133](../../FAMILYOS_PRD.md)).

Method and conventions:
- Every source below was accessed on 2026-11-07. Each citation is marked "acc. 2026-11-07".
- GitHub figures (stars, forks, open issues, last push, latest release, LICENSE path, published security advisories) come from `gh api repos/<owner>/<repo>`, `/releases/latest`, `/license` and `/security-advisories`, run on 2026-11-07. They are cited as the repo URL.
- "Latest release" is the GitHub `releases/latest` tag. In monorepos that tag can belong to a sub-package, and I note where that happens.
- No third-party code was cloned or run. nanoMuse was read file by file through the GitHub contents API.
- Prompt-injection and agent-directed content seen (treated as data and not followed):
  - nanoMuse ships `AGENTS.md`, plus a `CLAUDE.md` that its own AGENTS.md calls a symlink to AGENTS.md. Both hold contributor instructions for coding agents, such as build commands and "edit AGENTS.md". I read them only as evidence of architecture and policy. [nanoMuse AGENTS.md](https://github.com/nano-muse/nanoMuse/blob/main/AGENTS.md), acc. 2026-11-07.
  - The Browser Use README contains a line addressed to "AI agents and crawlers" telling them to read browser-use.com/llms.txt. I did not act on it. I read the pricing and benchmark pages as part of my own plan. [browser-use README](https://github.com/browser-use/browser-use/blob/main/README.md), acc. 2026-11-07.
  - Claude docs pages open with a "Documentation Index ... fetch llms.txt" banner. I treated it as navigation and did not follow it.

---

## Q1. Is "LangGraph vs OpenAI Agents SDK" a false choice? (the agent-framework landscape)

### Takeaway
Yes, it is a false choice. Neither framework is a durable workflow engine with days-long timers. Both expect you to persist their state somewhere and to resume it yourself, and both now integrate with real durable engines (Temporal, DBOS, Restate, Dapr). The more important decision is where the durable control plane lives: FamilyOS tables plus a Postgres durable-execution library or queue. The agent framework then shrinks to a replaceable "one bounded agent step" component. A plain provider SDK with structured outputs, Pydantic AI, or either named SDK running stateless can fill that slot.

### Cited Findings

**LangGraph (Python)**
- License: MIT, LICENSE file at `LICENSE`. 44,623 stars, 7,688 forks, 461 open issues, last push 2026-11-06. The latest GitHub release tag is `sdk==0.4.14` (2026-11-06), from a monorepo. Recent component tags: `checkpoint==4.3.1` (2026-10-26) and `checkpointpostgres==3.2.0` (2026-10-14). — [GitHub langchain-ai/langgraph](https://github.com/langchain-ai/langgraph), [LICENSE](https://github.com/langchain-ai/langgraph/blob/main/LICENSE), acc. 2026-11-07
- Durability lives in checkpointers. There are three modes: `exit` (persist only when the run ends), `async` (persist in the background while the next step runs, so a crash can lose checkpoints) and `sync` (persist before the next step). — [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), acc. 2026-11-07
- In every mode, a crash before the first durable checkpoint makes the thread look as if it was never invoked. The docs suggest "recording admission in your own store before calling invoke." — [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), acc. 2026-11-07
- Postgres checkpointer: `langgraph-checkpoint-postgres` uses psycopg 3. You must call `.setup()` the first time to create tables, and manual connections need `autocommit=True` and `row_factory=dict_row`. — [checkpoint-postgres README](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/README.md), acc. 2026-11-07
- `thread_id` must stay under 255 characters for PostgresSaver. In-memory savers lose data on restart, and checkpoints accumulate and need pruning. — [LangGraph persistence page](https://docs.langchain.com/oss/python/langgraph/durable-execution), acc. 2026-11-07
- The hosted/self-hosted "Agent Server" is not the MIT library. Standalone self-hosting requires `LANGGRAPH_CLOUD_LICENSE_KEY`, plus your own PostgreSQL and Redis, and the server periodically validates the license and counts runs. — [Self-host standalone servers](https://docs.langchain.com/langsmith/deploy-standalone-server), [Data storage and privacy](https://docs.langchain.com/langsmith/data-storage-and-privacy), acc. 2026-11-07
- The LangSmith pricing page lists self-hosted deployment as Enterprise only. — [LangChain pricing](https://www.langchain.com/pricing), acc. 2026-11-07

**LangGraph (JS)**
- License: MIT (`LICENSE`). 3,410 stars, last push 2026-11-07. Latest core release is `@langchain/langgraph@1.7.2` (2026-11-07). — [GitHub langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs), acc. 2026-11-07

**OpenAI Agents SDK (Python)**
- License: MIT (`LICENSE`). 30,549 stars, 45 open issues, last push 2026-11-07. Latest release v0.24.0 (2026-10-15). The repo's security-advisories endpoint returned no published advisories (this does not prove there are no vulnerabilities). — [GitHub openai/openai-agents-python](https://github.com/openai/openai-agents-python), acc. 2026-11-07
- Its docs list durable-orchestration integrations "when runs may span long waits, retries, or process restarts": Dapr, Temporal, Restate and DBOS. — [Running agents](https://openai.github.io/openai-agents-python/running_agents/), acc. 2026-11-07
- (Details of HITL, sessions and non-OpenAI models are in Q4.)

**OpenAI Agents SDK (JS)**
- License: MIT (`LICENSE`). 3,988 stars. Latest stable is `@openai/agents@0.21.0` (2026-10-20), with `v0.22.0-alpha.1` (2026-11-03). — [GitHub openai/openai-agents-js](https://github.com/openai/openai-agents-js), acc. 2026-11-07
- The JS HITL guide confirms that `RunState` and `RunToolApprovalItem` classes exist. My fetch was truncated, so I could not confirm the JS serialization details. — [JS HITL guide](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/), acc. 2026-11-07

**Pydantic AI (Python)**
- License: MIT (`LICENSE`). 21,078 stars, 1,828 open issues. v2.66.0 released 2026-11-04. — [GitHub pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai), acc. 2026-11-07
- Built-in durable-execution integrations:
  - Temporal (`TemporalDurability`), DBOS (`DBOSDurability`), Prefect, Restate (`RestateAgent`)
  - AWS Lambda, Absurd and pgtask (via `pydantic-ai-harness`)
  - Azure Durable Task and Airflow
  - Each engine journals model requests and wrapped tool calls, and replays completed ones after a restart.
  — [Pydantic AI durable execution overview](https://pydantic.dev/docs/ai/integrations/durable_execution/overview/), acc. 2026-11-07
- HITL works through deferred tools:
  - Mark a tool `requires_approval=True` or raise `ApprovalRequired`, and the run ends with `DeferredToolRequests`.
  - To resume, start a new run with `deferred_tool_results`.
  - The app must persist the full `result.conversation`, because message history alone is not enough.
  - The docs warn that approval "doesn't authenticate the client" and that authorization belongs inside the tool.
  — [Deferred tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/), acc. 2026-11-07
- Recent advisories: 14 were listed through 2026-11-04. Examples are SSRF metadata-guard gaps, credentials reaching traces, and "a client-submitted tool call can execute" in UI adapters (GHSA-5pfm-2g3g-gh85). — [pydantic-ai security advisories](https://github.com/pydantic/pydantic-ai/security/advisories), acc. 2026-11-07

**Vercel AI SDK (TypeScript)**
- License: the root `LICENSE` file is Apache-2.0 text, although GitHub's detector reports NOASSERTION. 27,804 stars, 1,502 open issues. The latest release tag is a provider sub-package, `@ai-sdk/zai@3.0.49` (2026-11-07). — [GitHub vercel/ai](https://github.com/vercel/ai), [LICENSE](https://github.com/vercel/ai/blob/main/LICENSE), acc. 2026-11-07
- Tool approval:
  - `toolApproval` replaces the deprecated `needsApproval`.
  - The call does not pause. It returns `tool-approval-request` parts, and you resume by appending a `tool-approval-response` and calling again.
  - No server-side persistence is described: the pending state lives in the messages you store.
  — [AI SDK tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), acc. 2026-11-07
- Vercel's separate Workflow SDK provides durability:
  - Repo `vercel/workflow`, Apache-2.0 (`LICENSE.md`), `workflow@5.4.0` released 2026-11-04, 2,497 stars. — [GitHub vercel/workflow](https://github.com/vercel/workflow), acc. 2026-11-07
  - It offers `sleep("30d")` "without consuming any resources", `createWebhook()` for approvals, and deterministic replay of workflow code. — [Workflow SDK foundations](https://workflow-sdk.dev/docs/foundations/workflows-and-steps), acc. 2026-11-07
  - "Worlds": Local, Vercel, and a third-party Postgres World (`@workflow/world-postgres`) for self-hosting. The deploying page says nothing about versioning of in-flight runs. — [Workflow SDK deploying](https://workflow-sdk.dev/docs/deploying), acc. 2026-11-07
- Advisories cover the "Harness" components, for example GHSA-4mqq-99j3-3hmv: harness session resume can expose host credentials. — [vercel/ai advisories](https://github.com/vercel/ai/security/advisories), acc. 2026-11-07

**Mastra (TypeScript)**
- License: `LICENSE.md` puts everything under Apache-2.0 except any `ee/` directory. Those directories fall under the "Mastra Enterprise Edition License" v2.0 (effective 2026-09-22): source-available, "not open source", and it "does not permit Production Use." This is a mixed-license trap. — [Mastra LICENSE.md](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md), [ee/LICENSE](https://github.com/mastra-ai/mastra/blob/main/ee/LICENSE), acc. 2026-11-07
- 29,397 stars. `@mastra/core@1.82.0` released 2026-11-04. — [GitHub mastra-ai/mastra](https://github.com/mastra-ai/mastra), acc. 2026-11-07
- Suspend/resume stores snapshots in the configured storage provider. The docs say snapshots persist across deployments and restarts, and that resuming re-runs the suspended step's `execute`. — [Mastra suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume), acc. 2026-11-07
- Advisory GHSA-8982-g8xm-3x5h (high, 2026-10-12): prototype pollution allowing unauthenticated process-wide state changes. — [mastra advisories](https://github.com/mastra-ai/mastra/security/advisories), acc. 2026-11-07

**Claude Agent SDK (Python and TypeScript)**
- Licenses differ between the two SDKs:
  - Python: MIT (`LICENSE`), v0.2.179 released 2026-11-06, 8,461 stars. — [GitHub anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python), acc. 2026-11-07
  - TypeScript: `LICENSE.md` exists but GitHub detects no license. The README states use is governed by Anthropic's Commercial Terms of Service. v0.3.319 released 2026-11-06. — [GitHub anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript), acc. 2026-11-07
  - The overview page states the same Commercial Terms governance for the SDK. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), acc. 2026-11-07
- Runtime: "A library that runs the Claude Code binary," with built-in tools, permissions, sessions and hooks. Anthropic does not allow third-party products to offer claude.ai login; use API keys. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), acc. 2026-11-07
- Sessions:
  - Stored as local JSONL under `~/.claude/projects/<encoded-cwd>/`, and resumable on the same machine only.
  - Cross-host resume needs a `SessionStore` adapter or copying the file.
  - The docs themselves suggest that capturing results as application state "is often more robust."
  — [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions), acc. 2026-11-07
- Critical advisory CVE-2026-96620 (GHSA-h4mw-j7qp-8mwm): an unvalidated `resume` value allowed argument injection, which led to arbitrary command execution and bypassed permission controls. Fixed in 0.2.121. — [claude-agent-sdk-python advisory](https://github.com/anthropics/claude-agent-sdk-python/security/advisories/GHSA-h4mw-j7qp-8mwm), acc. 2026-11-07

**Google ADK (Python and JS)**
- License: Apache-2.0 (`LICENSE`) for both.
  - Python: v2.14.0 released 2026-11-07, 22,137 stars.
  - JS: `adk-v2.4.0` released 2026-10-28.
  — [GitHub google/adk-python](https://github.com/google/adk-python), [google/adk-js](https://github.com/google/adk-js), acc. 2026-11-07
- Resume: tools "are run at least once, and may run more than once when resuming". Modifying a stopped workflow before resuming is unsupported. Resume requires ADK Python 1.16.0 or later. — [ADK resume](https://adk.dev/runtime/resume/), acc. 2026-11-07
- Tool confirmation (HITL) is marked "Experimental" and "not supported" with `DatabaseSessionService` or `VertexAiSessionService`. That rules out durable, database-backed approvals with the built-in feature today. — [ADK tool confirmation](https://adk.dev/tools-custom/confirmation/), acc. 2026-11-07

**Plain provider SDK with structured outputs**
- OpenAI strict `json_schema` guarantees output that conforms to the schema. Refusals may not follow the schema, and truncated (`incomplete`) responses may not match it. — [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), acc. 2026-11-07
- Claude structured outputs (`output_config.format` json_schema, plus `strict: true` tools) are marked stable.
  - Limits: up to 20 strict tools, 24 optional parameters, 16 union-typed parameters, and no recursive schemas.
  - Refusals and `max_tokens` stops may break the schema.
  — [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), acc. 2026-11-07

**Durable engines already integrate the frameworks**
- The Temporal Python SDK's `temporalio/contrib` directory contains `openai_agents`, `langgraph`, `google_adk_agents`, `pydantic`, `strands` and `langsmith` modules. — [temporalio/sdk-python contrib](https://github.com/temporalio/sdk-python/tree/main/temporalio/contrib), acc. 2026-11-07

### Inferences
- The PRD's binary (PRD line 133) mixes two layers. LangGraph and the OpenAI Agents SDK are agent-loop libraries whose persistence is either a checkpoint blob (LangGraph) or serialized `RunState` you must store yourself (OpenAI). The FamilyOS needs (durable timers measured in days, an approval queue, idempotent external actions, `awaiting_external` states) belong to a workflow or control-plane layer that neither library owns.
- A "plain provider SDK + structured outputs" agent step gives the smallest surface. There is no framework state to version, migrate or secure (compare the checkpoint deserialization CVEs in Q3). The cost is writing the tool loop yourself.
- Pydantic AI and the OpenAI Agents SDK both document that approval does not mean authorization, which matches the brief's rule to keep the LLM out of authorization. LangGraph.js GHSA-wp87-994x-j95x shows that approval nodes inside a graph can be bypassed when untrusted input reaches graph control (see Q3).
- Mastra's mixed Apache/EE license and the TypeScript Claude Agent SDK's commercial-terms license need legal review before shipping. The other frameworks are MIT or Apache-2.0.

### Gaps
- I did not read the LangGraph core `langgraph==` release version or the Vercel `ai` core package version, because GitHub's latest-release tag points at sub-packages.
- The OpenAI Agents JS HITL serialization details were not confirmed (truncated fetch).
- I did not find documentation on whether the Claude Agent SDK supports non-Anthropic models. The overview mentions only Anthropic API-key authentication.
- No cross-framework, like-for-like reliability or cost benchmarks were found.

---

## Q2. What is the smallest stack that gives durable waits measured in days, on Postgres only?

### Takeaway
Only two families need nothing but the application process and Postgres:
- **DBOS Transact**, an MIT library in Python and TypeScript, with durable sleep, durable send/recv, queues and workflow tables in Postgres.
- **Your own state machine on Postgres plus a Postgres job queue** (pg-boss or Graphile Worker for TypeScript, Procrastinate for Python, River for Go) for timers and retries.

Hatchet is Postgres-only but runs its own engine and API services. Temporal, Inngest, Trigger.dev and Restate each add a server or cluster, and Restate uses no Postgres at all. Cloudflare Workflows and AWS Step Functions are proprietary hosted services.

### Cited Findings

**DBOS Transact (Python and TypeScript), Postgres-native library**
- License: MIT (`LICENSE`) for both.
  - Python: 3.4.0 released 2026-10-28, 1,669 stars, 13 open issues, 77 commits since 2026-08-09.
  - TypeScript: v5.4 released 2026-10-28, 1,434 stars.
  — [GitHub dbos-inc/dbos-transact-py](https://github.com/dbos-inc/dbos-transact-py), [dbos-transact-ts](https://github.com/dbos-inc/dbos-transact-ts), acc. 2026-11-07
- Architecture: "no separate orchestration server and no infrastructure required besides Postgres." The system database stores checkpoints, step outputs, schedules and queues. — [DBOS architecture](https://docs.dbos.dev/architecture), acc. 2026-11-07
- Guarantees and durable primitives:
  - Workflows resume from the last completed step, and steps are at-least-once: "once a step has completed, it will never be re-executed."
  - Database transactions are exactly-once.
  - `DBOS.sleep()` stores its wakeup time in the database; the docs give day-to-month examples and state no maximum.
  - Workflow timeouts are durable.
  — [DBOS workflow tutorial](https://docs.dbos.dev/python/tutorials/workflow-tutorial), acc. 2026-11-07
- Human-in-the-loop (HITL) primitives:
  - `DBOS.send/recv` messages are persisted to the database. Sends from workflows are exactly-once, and external sends accept an `idempotency_key`.
  - `recv` defaults to a 60-second timeout, with no stated maximum.
  - `set_event/get_event` publishes durable key/value pairs.
  — [DBOS workflow communication](https://docs.dbos.dev/python/tutorials/workflow-communication), acc. 2026-11-07
- Conductor (the hosted control plane) is optional, connects outbound over websocket, has no access to your database, and sits off the execution path. — [DBOS architecture](https://docs.dbos.dev/architecture), acc. 2026-11-07
- Without Conductor, each self-hosted replica needs a unique executor ID, and recovery only reclaims that executor's pending workflows. — [DBOS workflow recovery](https://docs.dbos.dev/production/workflow-recovery), [DBOS Kubernetes guide](https://docs.dbos.dev/production/hosting-with-kubernetes), acc. 2026-11-07
- Pricing:
  - Transact is "free forever."
  - Conductor Pro is $99/month (1M checkpoints, then $50 per million); Teams is $499/month.
  - Self-hosting Conductor is Enterprise-only.
  — [DBOS pricing](https://www.dbos.dev/dbos-pricing), acc. 2026-11-07

**Postgres job queues (timers and retries under your own state machine)**
- pg-boss (Node):
  - MIT (`LICENSE`), 12.38.1 released 2026-11-05, 4,128 stars, 17 open issues. — [GitHub timgit/pg-boss](https://github.com/timgit/pg-boss), acc. 2026-11-07
  - Requires Node 22.12+ and PostgreSQL 13+, uses SKIP LOCKED, and offers cron/RRULE scheduling, deferral, dead-letter queues and retries. — [pg-boss README](https://github.com/timgit/pg-boss/blob/master/README.md), acc. 2026-11-07
  - `retentionSeconds` defaults to 14 days for jobs in the created or retry state, and `startAfter` accepts a delay or a date. — [pg-boss jobs API](https://timgit.github.io/pg-boss/api/jobs), acc. 2026-11-07
- Graphile Worker (Node):
  - MIT (`LICENSE.md`), v0.18.0 released 2026-09-08, 2,435 stars, 56 commits since 2026-08-09. — [GitHub graphile/worker](https://github.com/graphile/worker), acc. 2026-11-07
  - `addJob` supports `runAt` (a future Date), `jobKey` deduplication/replacement and `maxAttempts`. — [Graphile Worker add-job docs](https://github.com/graphile/worker/blob/main/website/docs/library/add-job.md), acc. 2026-11-07
- Procrastinate (Python):
  - MIT (`LICENSE.md`), 3.10.0 released 2026-09-23, 1,445 stars. — [GitHub procrastinate-org/procrastinate](https://github.com/procrastinate-org/procrastinate), acc. 2026-11-07
  - Requires PostgreSQL 13+ and has Django integration. — [Procrastinate README](https://github.com/procrastinate-org/procrastinate/blob/main/README.md), acc. 2026-11-07
- River (Go):
  - MPL-2.0 (`LICENSE`), v0.51.1 released 2026-11-05, 5,870 stars. — [GitHub riverqueue/river](https://github.com/riverqueue/river), acc. 2026-11-07
  - Workflows are a paid "River Pro" feature, with Go, Ruby and Rust clients. — [River Pro workflows](https://riverqueue.com/docs/pro/workflows), acc. 2026-11-07
- pgmq (Postgres extension):
  - PostgreSQL License (`LICENSE`), v1.13.1 released 2026-10-20, 19 commits since 2026-08-09. — [GitHub pgmq/pgmq](https://github.com/pgmq/pgmq), acc. 2026-11-07
  - Advisory GHSA-mwqf-p4r3-798v (high, 2026-11-02): privilege escalation through an unpinned `search_path`. Fixed in 1.13.1. — [pgmq advisory](https://github.com/pgmq/pgmq/security/advisories/GHSA-mwqf-p4r3-798v), acc. 2026-11-07
- Absurd (an Apache-2.0 "experiment in durability" on Postgres, 0.5.1 released 2026-10-20, 2,539 stars) is also a Pydantic AI durability backend. — [GitHub earendil-works/absurd](https://github.com/earendil-works/absurd), [Pydantic AI durable overview](https://pydantic.dev/docs/ai/integrations/durable_execution/overview/), acc. 2026-11-07

**Hatchet (Postgres-only, but a separate engine)**
- License: MIT (`LICENSE`). v0.114.2 released 2026-10-26, 8,239 stars. — [GitHub hatchet-dev/hatchet](https://github.com/hatchet-dev/hatchet), acc. 2026-11-07
- Self-hosting needs PostgreSQL. RabbitMQ is optional. Components are an API server, the engine, the database and a dashboard. "Hatchet Lite" is a single image. — [Hatchet self-hosting](https://docs.hatchet.run/self-hosting), acc. 2026-11-07
- Durable tasks checkpoint to an event log. While a task waits, Hatchet can evict it to free the worker slot, then re-queue and replay it. Determinism rules apply. — [Hatchet durable tasks](https://docs.hatchet.run/home/durable-tasks), acc. 2026-11-07
- Cloud pricing includes 1M runs and 1M events per month, then $30 per million runs. — [Hatchet pricing](https://hatchet.run/pricing), acc. 2026-11-07
- Eight advisories were published 2026-05 to 2026-09, including cross-tenant durable-task event-log disclosure (CVE-2026-63342) and cross-tenant callback payload disclosure (CVE-2026-84298). — [hatchet advisories](https://github.com/hatchet-dev/hatchet/security/advisories), acc. 2026-11-07

**Temporal (separate cluster)**
- License: MIT (`LICENSE`).
  - Server: v1.32.2 released 2026-11-02, 24,252 stars, 1,139 open issues.
  - TypeScript SDK: MIT, v1.25.0 released 2026-10-27.
  - UI: MIT.
  — [GitHub temporalio/temporal](https://github.com/temporalio/temporal), [sdk-typescript](https://github.com/temporalio/sdk-typescript), acc. 2026-11-07
- Self-hosting means "two Go binaries" (server and UI). Services can be deployed separately, schema upgrades are self-managed, and hosts "should not be exposed to the open Internet." — [Temporal self-hosted deployment](https://docs.temporal.io/self-hosted-guide/deployment), acc. 2026-11-07
- Persistence:
  - Datastores are Cassandra, MySQL or Postgres (SQL plugin).
  - Advanced Visibility runs on PostgreSQL 12+ from Server 1.20, so Elasticsearch is no longer required.
  - Tested Postgres versions are 13.18 through 16.6.
  — [Temporal configuration reference](https://docs.temporal.io/references/configuration), [Self-hosted visibility](https://docs.temporal.io/self-hosted-guide/visibility), [Temporal persistence](https://docs.temporal.io/temporal-service/persistence), acc. 2026-11-07
- Event history is capped at 51,200 events or 50 MB. — [Temporal limits](https://docs.temporal.io/workflow-execution/limits), acc. 2026-11-07
- Human input arrives as Signals ("fire and forget" writes) or Updates ("synchronous, tracked write requests" that can be validated). — [Temporal message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing), acc. 2026-11-07
- Temporal Cloud: $50 per million actions on pay-as-you-go with no base fee, active storage at $0.042/GB-hr, and $150 of credits for 90 days. — [Temporal pricing](https://temporal.io/pricing), acc. 2026-11-07

**Inngest (separate server; SSPL)**
- License trap:
  - Server `LICENSE.md` is the Server Side Public License v1, with a "Grant of Future License" to Apache-2.0 "effective on the third anniversary" of each release. — [Inngest LICENSE.md](https://github.com/inngest/inngest/blob/main/LICENSE.md), acc. 2026-11-07
  - The JS SDK package `packages/inngest/LICENSE.md` is Apache-2.0 and its package.json says Apache-2.0. GitHub's repo metadata nonetheless reports GPL-3.0, and the root has no LICENSE file (a discrepancy). — [GitHub inngest/inngest-js](https://github.com/inngest/inngest-js), acc. 2026-11-07
  - The Python SDK is Apache-2.0. — [GitHub inngest/inngest-py](https://github.com/inngest/inngest-py), acc. 2026-11-07
- Server v1.51.0 released 2026-11-06, 6,021 stars. — [GitHub inngest/inngest](https://github.com/inngest/inngest), acc. 2026-11-07
- Self-hosting is a single binary that defaults to SQLite plus in-memory Redis. Postgres is recommended for production and external Redis is optional. Tables are not cleaned up automatically, and there is no guaranteed support. — [Inngest self-hosting](https://www.inngest.com/docs/self-hosting), acc. 2026-11-07
- Limits:
  - `step.sleep` can run up to 1 year.
  - Maximum run length is 30 days on Free, 90 on Pro and 366 on Business, including sleeps and waits.
  - 1,000 steps per function.
  — [Inngest usage limits](https://www.inngest.com/docs/usage-limits/inngest), [Inngest pricing](https://www.inngest.com/pricing), acc. 2026-11-07

**Trigger.dev (separate webapp and worker)**
- License: Apache-2.0 (`LICENSE`). v4.8.3 released 2026-10-30, 16,727 stars. — [GitHub triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev), acc. 2026-11-07
- Self-hosting means a webapp (with Postgres and Redis) plus a worker (a supervisor and runners). Checkpoints ("non-blocking waits") are listed as Cloud-only. — [Trigger.dev self-hosting overview](https://trigger.dev/docs/self-hosting/overview), acc. 2026-11-07
- Wait tokens (`wait.createToken` with an optional timeout such as "4w" and an `idempotencyKey`) are completed by API or by an HTTP POST, which suits approvals. — [Trigger.dev wait for token](https://trigger.dev/docs/wait-for-token), acc. 2026-11-07
- On Cloud, waits longer than 5 seconds are checkpointed and not billed as compute. The Hobby plan is $10/month and Pro is $50/month. — [Trigger.dev pricing](https://trigger.dev/pricing), acc. 2026-11-07
- 14 advisories were published 2026-07 to 2026-10. They include "Missing run authorization allows cross-tenant suspension and resume-data injection" (GHSA-xrp6-5fpv-4fxf) and "Authorize parent runs before attaching batch-created waitpoints" (GHSA-qwrm-2cq8-xfr8). — [trigger.dev advisories](https://github.com/triggerdotdev/trigger.dev/security/advisories), acc. 2026-11-07

**Restate (separate server; BSL; no Postgres)**
- License: the server `LICENSE` is Business Source License 1.1.
  - Additional Use Grant: you may not offer a "Public Restate Platform Service".
  - Change Date: 4 years after release, converting to Apache-2.0.
  - The TypeScript and Python SDKs are MIT.
  — [Restate LICENSE](https://github.com/restatedev/restate/blob/main/LICENSE), [sdk-typescript](https://github.com/restatedev/sdk-typescript), [sdk-python](https://github.com/restatedev/sdk-python), acc. 2026-11-07
- Server v1.8.1 released 2026-10-21. — [GitHub restatedev/restate](https://github.com/restatedev/restate), acc. 2026-11-07
- It runs as a single binary with no external database. It stores an embedded replicated log ("Bifrost") with RocksDB state, and a cluster needs S3 or MinIO snapshots. — [Restate self-hosted overview](https://docs.restate.dev/server/overview), [Restate server config](https://docs.restate.dev/references/server-config), acc. 2026-11-07

**Cloudflare Workflows (proprietary, hosted only)**
- Limits:
  - `step.sleep` up to 365 days.
  - 10,000 steps by default, up to 25,000 on the paid plan.
  - 1 GB of state per instance on paid.
  - Completed instances are retained 7 days by default, configurable up to 30.
  - Waiting instances do not count toward concurrency.
  — [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/), acc. 2026-11-07
- Pricing: waiting is not billed as CPU, but sleeping instances count toward storage ($0.20 per GB-month). Step billing ($0.80 per 100k beyond 500k) started 2026-08-10. — [Cloudflare Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/), acc. 2026-11-07

**AWS Step Functions (proprietary, hosted only)**
- Limits for Standard workflows:
  - Maximum execution time and idle time of 1 year.
  - 25,000-event history cap.
  - 256 KiB input/output.
  - History retained 90 days after close.
  — [Step Functions quotas](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html), acc. 2026-11-07
- Pricing: $0.000025 per state transition, with 4,000 free transitions per month. — [Step Functions pricing](https://aws.amazon.com/step-functions/pricing/), acc. 2026-11-07

### Inferences
- **The smallest Postgres-only stack with days-long waits is either:**
  - **(a) DBOS Transact embedded in the monolith.** Durable sleep, recv with a timeout for a vendor reply or approval, and durable queues give the structure: approval -> send step -> wait up to N days for a reply event -> decision. Or:
  - **(b) A hand-written state machine** in FamilyOS tables (`work_item.state`, `approval`, `external_action.idempotency_key`, `next_wake_at`) driven by pg-boss, Graphile Worker or Procrastinate jobs.
  - Option (b) keeps every state transition in FamilyOS code and SQL, which matches the PRD. Option (a) saves writing replay, recovery and timer logic, but introduces DBOS's version-routing rules (Q6).
- pg-boss's default 14-day `retentionSeconds` on created or retry jobs could silently delete a far-future job unless it is overridden. I have not verified whether the `startAfter` delay counts toward retention. Test this, or use Graphile's `runAt`, which states no such limit, or store `next_wake_at` in your own table and poll.
- Hatchet is the "Postgres-only but separate service" middle ground. Its advisory history shows multi-tenant authorization bugs in the engine itself.
- Trigger.dev self-hosted without checkpoints appears to hold a running worker for the length of a wait. That makes multi-day waits expensive self-hosted. This is inferred from the "Cloud-only" checkpoint row and not tested.
- Inngest's server is SSPL. Using it internally is generally fine, but offering it as a service is restricted, and its maximum run length caps waits by plan on Inngest Cloud.

### Gaps
- None of these pages states a DBOS maximum sleep or recv duration.
- I did not find DBOS's minimum Postgres version.
- I did not determine whether pg-boss retention counts from creation or from `startAfter`.
- The Hatchet maximum durable sleep is not on the fetched pages.
- The Trigger.dev self-host resource cost of long waits was not measured.

---

## Q3. How do LangGraph checkpoint/interrupt semantics handle side effects on resume, and what are the security issues?

### Takeaway
On resume, LangGraph restarts the interrupted node from its first line. Anything before `interrupt()` runs again, so pre-interrupt side effects must be idempotent or moved into a separate node or task. In the Functional API, completed tasks return cached results, but a task that started and did not finish runs again. LangGraph's checkpoint serializer has a recurring deserialization-to-RCE advisory history in both Python and JS. Checkpoint bytes must be treated as untrusted, and versions pinned to the fixed releases.

### Cited Findings
- `interrupt()` raises an exception that the runtime catches, and on resume "the runtime restarts the entire node from the beginning." Code before `interrupt()` runs again on every resume. — [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), acc. 2026-11-07
- The docs' guidance on interrupts:
  - Keep pre-interrupt operations idempotent (upserts), or move them after the interrupt or into a separate node.
  - Never wrap `interrupt()` in a bare try/except.
  - Resume values are matched "strictly index-based" when a node has several interrupts.
  - Payloads must be JSON-serializable.
  - A durable checkpointer and a `thread_id` are required.
  — [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), acc. 2026-11-07
- Functional API:
  - The entrypoint replays from the start, with completed tasks and subgraphs returning saved results.
  - "A task that was started but not finished may run again," so writes need idempotency keys.
  - Non-deterministic values (time, random) must live in tasks.
  — [LangGraph Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api), acc. 2026-11-07
- Durability modes (`exit`/`async`/`sync`) decide whether intermediate checkpoints survive a crash. Only `sync` persists each step before the next. — [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), acc. 2026-11-07
- Serializer options: the default `JsonPlusSerializer` (ormsgpack and JSON), an optional `pickle_fallback=True`, and `EncryptedSerializer` with an AES key from `LANGGRAPH_AES_KEY`. — [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), acc. 2026-11-07

Python advisories (from the langgraph repo's security-advisories endpoint):

| CVE (GHSA) | Severity | Published | Affected / fixed | What it is |
|---|---|---|---|---|
| CVE-2025-64439 (GHSA-wwqv-p2pp-99h5) | high | 2025-11-05 | `langgraph-checkpoint` <3.0, fixed in 3.0 | RCE in "json" mode of JsonPlusSerializer, the default checkpoint serializer |
| CVE-2026-27794 (GHSA-mhr3-j7m5-c7c9) | medium | 2026-02-23 | `langgraph-checkpoint` <4.0.0, fixed in 4.0.0 | `BaseCache` defaulted to `pickle_fallback=True`, so cached values could reach `pickle.loads` (only when caching is enabled) |
| CVE-2026-28277 (GHSA-g48c-2wqr-h844) | medium | 2026-03-05 | `langgraph` <=1.0.9, fixed in 1.0.10 | msgpack checkpoints could reconstruct Python objects. Needs write access to the store; "post-exploitation / defense-in-depth" |
| CVE-2026-48775 (GHSA-fjqc-hq36-qh5p) | medium | 2026-05-22 | `langgraph-checkpoint` <=4.1.0, fixed in 4.1.1 | JSON checkpoint payloads could reconstruct objects, leading to code execution at load. Needs at-rest tampering |
| CVE-2025-67644 (GHSA-9rwj-6rc7-p77c) | high | 2025-12-09 | (SQLite checkpointer) | SQL injection via a metadata filter key in the SQLite checkpointer's `list` |
| CVE-2025-64104 (GHSA-7p73-8jqx-23r8) | high | 2025-10-29 | (SqliteStore) | SQLite filter-key SQL injection |
| CVE-2026-71433 / CVE-2026-115883 | medium | 2026-07-30 / 2026-10-21 | Postgres and SQLite stores | namespace prefix and "." labels crossing into other namespaces |
| CVE-2026-104873 (GHSA-fvww-7h3r-vfhp) | high | 2026-08-28 | LangGraph SDK custom auth | `actions=` silently ignored on resource decorators |

— [langgraph security advisories](https://github.com/langchain-ai/langgraph/security/advisories); details from [GHSA-wwqv-p2pp-99h5](https://github.com/langchain-ai/langgraph/security/advisories/GHSA-wwqv-p2pp-99h5), [GHSA-mhr3-j7m5-c7c9](https://github.com/langchain-ai/langgraph/security/advisories/GHSA-mhr3-j7m5-c7c9), [GHSA-g48c-2wqr-h844](https://github.com/langchain-ai/langgraph/security/advisories/GHSA-g48c-2wqr-h844), [GHSA-fjqc-hq36-qh5p](https://github.com/langchain-ai/langgraph/security/advisories/GHSA-fjqc-hq36-qh5p), acc. 2026-11-07. A secondary write-up of CVE-2025-64439 says the "json" mode was reached as a fallback when msgpack failed on illegal Unicode surrogates — [Checkmarx summary via search](https://devhub.checkmarx.com/?p=152284), acc. 2026-11-07

JS advisories:
- GHSA-j87f-x5h5-gr75 (high, 2026-08-21): insecure deserialization in JsonPlusSerializer, through `lc: 2` constructor records, can lead to code execution. Fixed in `@langchain/langgraph` 0.4.10 / 1.4.12 and `@langchain/langgraph-checkpoint` 0.1.3 / 1.1.4. The advisory says "Checkpoint JSON must be treated as untrusted." — [GHSA-j87f-x5h5-gr75](https://github.com/langchain-ai/langgraphjs/security/advisories/GHSA-j87f-x5h5-gr75), acc. 2026-11-07
- GHSA-wp87-994x-j95x (high, 2026-10-08): plain JSON graph input could be read as a control directive and "bypass application-defined processing nodes, including validation and approval steps." Affects >=0.2.23 and <1.4.21. — [GHSA-wp87-994x-j95x](https://github.com/langchain-ai/langgraphjs/security/advisories/GHSA-wp87-994x-j95x), acc. 2026-11-07
- Also: store namespaces not isolated in the Postgres and Redis stores (GHSA-8p8h-xj5r-m5wf, high), MongoDBSaver cross-tenant state access (CVE-2026-48121), and RediSearch query injection (CVE-2026-27022). — [langgraphjs advisories](https://github.com/langchain-ai/langgraphjs/security/advisories), acc. 2026-11-07

### Inferences
- If FamilyOS used LangGraph for "send email after approval", the send must sit in its own node or task *after* the approval interrupt. It also needs a FamilyOS-owned idempotency key (PRD `ExternalAction.idempotency_key`) checked against your own table, because an unfinished task can run again.
- The JS advisory GHSA-wp87 is a concrete case of an approval step inside an agent graph being bypassable. That supports enforcing approvals in a separate approval service that the send function checks, rather than as a graph node.
- The cross-namespace store advisories in both languages are tenant-isolation bugs. FamilyOS should not rely on LangGraph store namespaces as a household boundary, and should keep Postgres row-level security in its own tables.
- Mitigations for checkpoint deserialization: pin to fixed releases, use `EncryptedSerializer`, avoid `pickle_fallback`, and restrict write access to checkpoint tables.

### Gaps
- I did not check `LANGGRAPH_STRICT_MSGPACK` or an allowed-types configuration; the checkpointer page did not mention them.
- No public exploitation in the wild was reported in the advisories I read (the msgpack advisory says "no evidence of exploita[tion]").

---

## Q4. How do OpenAI Agents SDK sessions and human-in-the-loop work? Do they persist across restarts? Does it work with non-OpenAI models?

### Takeaway
Approvals pause a run and return `interruptions`. You serialize `RunState` (to a string or JSON), store it yourself, and resume later, possibly in another process. Sessions persist only conversation history, and only when backed by a file or external store; the default `SQLiteSession` is in-memory. Restart survival is therefore your responsibility, and long waits are documented as a job for Temporal, DBOS, Restate or Dapr. Non-OpenAI models work through Chat Completions-compatible endpoints, LiteLLM or any-llm (both "best-effort, beta"), with feature losses.

### Cited Findings
- HITL mechanics:
  - Tools declare `needs_approval`, either True or an async callable that fails closed.
  - Interruptions surface as `ToolApprovalItem`s, including from handoffs and nested agents-as-tools.
  - To resume: `result.to_state()`, then `state.approve()` or `state.reject()`, then `Runner.run(agent, state)` with the original top-level agent.
  — [Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- `RunState` serializes with `to_string()`/`from_string()` or `to_json()`/`from_json()`, which allows reloading in another process. The docs say it "is designed to be durable." — [Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- The same page recommends server-controlled storage for state, authenticating reviewers, validating decisions against stored items, and atomic transitions to prevent replay. — [Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- Approval does not guarantee exactly-once execution. The docs recommend stable idempotency keys and storing a version marker for agent definitions or the SDK next to serialized state. — [Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- Sessions:
  - Backends: SQLite (in-memory "lost when process ends" unless given a file path), AsyncSQLite, Redis, SQLAlchemy, MongoDB, Dapr, OpenAI Conversations, a compaction wrapper, and an encryption-with-TTL wrapper.
  - Sessions store conversation items, not run state. An interrupted run resumes from `to_state()` with the same session.
  — [Agents SDK sessions](https://openai.github.io/openai-agents-python/sessions/), acc. 2026-11-07
- Durable-execution integrations listed: Dapr, Temporal, Restate and DBOS, with Temporal for "durable, long-running workflows, including human-in-the-loop tasks." — [Running agents](https://openai.github.io/openai-agents-python/running_agents/), acc. 2026-11-07
- Non-OpenAI models:
  - Connection options: `set_default_openai_client` (a custom base_url), a `ModelProvider` per run, `OpenAIChatCompletionsModel` per agent, `MultiProvider` prefixes (`litellm/`, `any-llm/`), and LiteLLM or any-llm adapters marked "best-effort, beta."
  - Limits: trace upload fails with 401 without an OpenAI key unless you disable tracing or swap the processor. Responses-only features are rejected on Chat Completions, and `previous_response_id` is silently dropped unless strict validation is on. Some providers lack `json_schema`, hosted tools, or audio.
  — [Agents SDK models](https://openai.github.io/openai-agents-python/models/), acc. 2026-11-07
- `conversation_id` and `previous_response_id` apply only to the OpenAI Responses API. — [Running agents](https://openai.github.io/openai-agents-python/running_agents/), acc. 2026-11-07

### Inferences
- Persistence across restarts happens only if FamilyOS writes `RunState` to Postgres when a run hits an interruption, and the vendor-reply wait has no SDK primitive at all. So the SDK's durability for this workflow equals whatever FamilyOS builds around it.
- The "store a version marker" advice is an admission that a weeks-old serialized `RunState` may not load cleanly against new agent code (see Q6).
- Provider portability is real but lossy. Keeping FamilyOS's own structured-output contracts and tracing (OTel) avoids depending on OpenAI-only features.

### Gaps
- I did not verify a `RunState` schema-version field or a cross-SDK-version compatibility guarantee.
- The JS SDK serialization docs were truncated.

---

## Q5. Which option leaves the control plane (states, approvals, idempotency) owned by our code?

### Takeaway
Control is most fully in FamilyOS code with: Postgres tables plus a library-level queue (pg-boss, Graphile Worker, Procrastinate), or DBOS Transact, whose state is rows in your own Postgres and which the docs describe as programmatically queryable. Agent steps are then stateless calls to a provider SDK, Pydantic AI, or either agents SDK. External engines (Temporal, Hatchet, Inngest, Trigger.dev, Restate, Cloudflare, Step Functions) move state transitions and timers into their own store and API, even when self-hosted. LangGraph puts state in opaque checkpoint blobs, and its Agent Server needs a commercial license key.

### Cited Findings
- DBOS: "Your workflows are stored as rows in a Postgres table, so you have full programmatic control over them." — [DBOS README](https://github.com/dbos-inc/dbos-transact-py/blob/main/README.md), acc. 2026-11-07
- DBOS's own comparison: Temporal needs you to "rearchitect" around a worker, server and client. This is a vendor's framing. — [DBOS README](https://github.com/dbos-inc/dbos-transact-py/blob/main/README.md), acc. 2026-11-07
- The OpenAI Agents SDK tells you to keep run state in server-controlled storage and to validate approvals against stored items. — [Agents SDK HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- Pydantic AI says to enforce authorization inside the tool function. — [Pydantic AI deferred tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/), acc. 2026-11-07
- The Vercel AI SDK keeps approval state only in the messages you store. — [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), acc. 2026-11-07
- LangGraph recommends recording admission in your own store before `invoke`, because a crash can make a thread look never-invoked. — [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), acc. 2026-11-07
- The LangGraph Agent Server requires `LANGGRAPH_CLOUD_LICENSE_KEY` and periodically validates it. — [Self-host standalone servers](https://docs.langchain.com/langsmith/deploy-standalone-server), [Data storage and privacy](https://docs.langchain.com/langsmith/data-storage-and-privacy), acc. 2026-11-07
- The PRD already defines its own control-plane entities and states:
  - `Approval(... exact_payload ... status, expires_at)` and `ExternalAction(... idempotency_key ...)`.
  - States `new -> ready -> in_progress -> awaiting_approval / awaiting_external / blocked -> verified_complete`.
  — [FAMILYOS_PRD.md lines 114-118](../../FAMILYOS_PRD.md), acc. 2026-11-07
- External engines have multi-tenant authorization bugs in their own control planes:
  - Trigger.dev: cross-tenant suspension and resume-data injection.
  - Hatchet: cross-tenant durable-task event-log disclosure.
  — [trigger.dev advisories](https://github.com/triggerdotdev/trigger.dev/security/advisories), [hatchet advisories](https://github.com/hatchet-dev/hatchet/security/advisories), acc. 2026-11-07

### Inferences
- Recommended split (inference): FamilyOS's own `work_item`, `approval` and `external_action` tables are the source of truth. Authorization is a deterministic check in the send path: approval row status = approved, payload hash = approved payload hash, not expired, and household matches. Durable timers come from DBOS or a Postgres queue, and LLM calls are side-effect-free steps whose outputs are validated against schemas.
- DBOS is a reasonable accelerator if its tables live in the same Postgres and the team accepts its versioning model. A plain queue keeps everything in FamilyOS code at the cost of writing recovery logic.
- Whatever the engine, an approval that lives in an engine's signal or webhook payload should only carry an approval ID. The decision itself should be re-read from FamilyOS's table.

### Gaps
- I did not test DBOS system-table coexistence with row-level security on application tables.

---

## Q6. In-flight workflow versioning: what happens to a two-week-old run after a code deploy?

### Takeaway
Every replay-based engine (Temporal, DBOS, Hatchet, Workflow SDK, Inngest, LangGraph Functional API) needs one of two things. Either the old code stays deployed until the run drains (pinning, blue-green, immutable deployments), or the new code must stay replay-compatible (patch markers or version branches). For a run that waits weeks for a vendor reply, that means running old workers for weeks or carrying patch branches. Splitting the workflow into short-lived steps between durable FamilyOS states avoids both, because a two-week-old run is then just a row in `awaiting_external` read by current code. Restate's docs recommend this split.

### Cited Findings
- Temporal:
  - `workflow.patched()` puts a marker in history so old executions keep the old path. `deprecate_patch()` follows once old executions drain, and the patch is removed after retention. Changes that are not patched risk nondeterminism errors that fail the workflow task. — [Temporal Python versioning](https://docs.temporal.io/develop/python/versioning), acc. 2026-11-07
  - Worker Versioning: a Pinned workflow is "guaranteed to complete on a single Worker Deployment Version", which needs rainbow deployments of old workers. Auto-Upgrade workflows need patching. Long workflows can be Pinned and upgraded at a Continue-as-New boundary. Rolling deployments are incompatible with Worker Versioning. — [Temporal Worker Versioning](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning), acc. 2026-11-07
- DBOS:
  - Each workflow is tagged with an application version, by default a hash of the workflow source. DBOS recovers only workflows whose version matches the current one.
  - Options: blue-green (old processes drain), pin `application_version` and use `DBOS.patch()` / `deprecate_patch()`, or `auto_upgrade`, where PENDING workflows are re-enqueued on the latest version and recover from the last completed step.
  - The upgrading page labels auto-upgrade an Enterprise feature, while the pricing page lists "automatic workflow version upgrade" under Pro (a conflict).
  — [DBOS upgrading workflows](https://docs.dbos.dev/python/tutorials/upgrading-workflows); contradicted by [DBOS pricing](https://www.dbos.dev/dbos-pricing), acc. 2026-11-07
  - The Kubernetes guide suggests one Deployment per active version, with old deployments kept alive to execute pending workflows. — [DBOS Kubernetes guide](https://docs.dbos.dev/production/hosting-with-kubernetes), acc. 2026-11-07
- Restate:
  - Deployments are immutable, and "requests start and end on the same version". Old deployments must stay registered until their invocations finish.
  - The docs advise against handlers that run for days or months, and recommend splitting work into chunks linked by delayed calls.
  — [Restate versioning](https://docs.restate.dev/services/versioning), acc. 2026-11-07
- Trigger.dev: runs lock to the version current when they start executing and do not change "even if you deploy new versions." Retries stay on the original version. — [Trigger.dev versioning](https://trigger.dev/docs/versioning), acc. 2026-11-07
- LangGraph:
  - For interrupted threads you may change edges and add nodes, but must not rename or remove the node a thread is about to enter.
  - Changing task or interrupt order before the resume point can mismatch cached values.
  - Recommended: add-then-remove renames, and stamp a flow version on state at thread start.
  — [LangGraph backward compatibility](https://docs.langchain.com/oss/python/langgraph/backward-compatibility), [Graph API overview](https://docs.langchain.com/oss/python/langgraph/graph-api), acc. 2026-11-07 (read via search summary of these pages)
- OpenAI Agents SDK: store a version marker alongside serialized `RunState` so deserialization can route to matching code. — [Agents SDK HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/), acc. 2026-11-07
- AWS Step Functions: versions are immutable snapshots, and an execution started without a version uses the most recent revision. — [Step Functions versions](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-state-machine-version.html), acc. 2026-11-07
- Google ADK: modifying a stopped workflow, such as adding or removing agents, before resuming is unsupported. — [ADK resume](https://adk.dev/runtime/resume/), acc. 2026-11-07
- Mastra: snapshots "persist across deployments." — [Mastra suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume), acc. 2026-11-07

### Inferences
- With DBOS's default (version = source hash), a deploy during the two-week wait leaves the old run unrecovered by new processes unless you pin `application_version` and patch, keep old processes running, or use auto-upgrade. This is a concrete trap for a days-long `recv`.
- With Temporal Pinned versioning, a 14-day vendor wait means keeping that worker build alive for 14 or more days per deploy. Auto-Upgrade means patch branches that accumulate until the oldest run closes.
- The FamilyOS-native pattern: each transition, such as `awaiting_external -> reply_received -> awaiting_decision`, is a short job keyed by `work_item_id` plus a transition ID. The "wait" is a row with `next_wake_at` and an inbound-email matcher, not a suspended function. Deploys then need only schema migrations, which FamilyOS already owns.

### Gaps
- I found no documentation on how Inngest handles in-flight runs after a deploy (the `working-with-versions` page returned 404). Hatchet's in-flight versioning is likewise undocumented on the fetched pages.
- I did not find official Cloudflare Workflows documentation on whether a waiting instance resumes on old or new code. The search found only Workers and Durable Objects deployment docs.
- I did not verify whether running Step Functions executions keep their original definition after `UpdateStateMachine` without versions.

---

## Q7. Browser automation (Browser Use, Stagehand, Playwright): per-run cost, reliability evidence, website-terms problems

### Takeaway
All three are permissively licensed. Cloud browsers are cheap per hour: Browser Use at $0.02/browser-hour, Browserbase from $20/month. LLM tokens and residential proxies dominate cost. I found no independent, repeatable reliability benchmark; the headline numbers are self-run. The vendors' "stealth", CAPTCHA solving and residential proxies are anti-bot circumvention features, which conflict with the PRD's "observe website terms." The 2026 Ninth Circuit ruling in Amazon v. Perplexity narrowed CFAA risk for user-directed agents on a preliminary record only, and the case continues.

### Cited Findings
- Browser Use:
  - MIT (`LICENSE`), 0.13.14 released 2026-10-26, 120,259 stars, 637 open issues. — [GitHub browser-use/browser-use](https://github.com/browser-use/browser-use), acc. 2026-11-07
  - Critical advisory CVE-2025-47241 (2025-05-04): `allowed_domains` could be bypassed with a decoy domain in the HTTP auth username. — [browser-use advisories](https://github.com/browser-use/browser-use/security/advisories), acc. 2026-11-07
  - Cloud pricing: $0.02 per browser-hour (billed per minute), home-IP proxy $5/GB, CAPTCHA solving included, "bu-ultrafast" agent at $0.006 per median task, bring-your-own-key models at provider cost plus 0.2x, and a $1 signup credit. — [Browser Use pricing](https://browser-use.com/pricing), acc. 2026-11-07
  - The README demo prompt includes "handle the CAPTCHA" to book a driving test. — [browser-use README](https://github.com/browser-use/browser-use/blob/main/README.md), acc. 2026-11-07
  - Stealth Bench V2 is run by Browser Use on 100 bot-protected sites chosen where Browser Use had previously succeeded. It reports 90.5% for Browser Use versus 78.5% for Browserbase, judged by a model, and names no independent reviewer. — [Browser Use Stealth Bench](https://browser-use.com/benchmarks/browsers), acc. 2026-11-07
  - A search summary reported Browser Use's own Bench v2.1 at 72.9 with about 11 cents of model cost per task (180 tasks, self-graded). I did not open that page directly. — [Browser Use best web agents](https://browser-use.com/best-web-agents), acc. 2026-11-07 (via search summary)
- Stagehand:
  - MIT (`LICENSE`), 25,978 stars. Latest JS library release `@browserbasehq/stagehand@3.7.3` (2026-08-28); latest repo release `stagehand-server-v3/v3.7.7` (2026-10-23). — [GitHub browserbase/stagehand](https://github.com/browserbase/stagehand), acc. 2026-11-07
  - Caching of `act()` results (server-side on Browserbase, or a local `cacheDir`) skips LLM calls on repeat runs. Cache keys depend on instruction, page content and viewport. — [Stagehand caching](https://docs.stagehand.dev/v3/best-practices/caching), acc. 2026-11-07
  - Browserbase pricing: Free (1 browser-hour); Developer $20/month (100 hours, then $0.12/hour, proxies $12/GB, CAPTCHA solving); Startup $99/month; Scale custom with "Verified Agents". — [Browserbase pricing](https://www.browserbase.com/pricing), acc. 2026-11-07
- Playwright: Apache-2.0 (`LICENSE`), v1.65.0 released 2026-11-05, 99,534 stars, 33 open issues. — [GitHub microsoft/playwright](https://github.com/microsoft/playwright), acc. 2026-11-07
- Reliability evidence quality: a search for independent 2026 comparisons returned mostly vendor or blog numbers. One reported LangChain comparison has Stagehand passing 90% of tasks. I did not verify it. — [search results incl. completeaitraining.com summary](https://completeaitraining.com/news/langsmith-finds-browser-agent-tool-design-slashes-cost-and/), acc. 2026-11-07
- Legal (secondary, law-firm sources):
  - On 2026-08-04 the Ninth Circuit vacated the preliminary injunction against Perplexity's Comet. It held, on the record before it, that a user-directed agent running on the user's device does not itself "access" Amazon's computers under the CFAA or CDAFA, and described the ruling as limited to that record.
  - Rehearing was denied on 2026-09-10, and Amazon filed an amended complaint on 2026-09-21.
  — [Jones Day](https://www.jonesday.com/en/insights/2026/09/ninth-circuit-vacates-cfaa-injunction-against-perplexitys-comet-ai-agent), [Troutman Privacy](https://www.troutmanprivacy.com/2026/08/ninth-circuit-holds-human-user-not-developer-of-ai-agent-responsible-for-websites-accessed/), [WSGR](https://www.wsgr.com/en/insights/ninth-circuit-addresses-cfaa-and-agentic-ai-tools-in-groundbreaking-decision.html), acc. 2026-11-07
- The PRD limits browser use to "bounded workflows where API unavailable; observe website terms." — [FAMILYOS_PRD.md line 134](../../FAMILYOS_PRD.md), acc. 2026-11-07
- nanoMuse handles logins, CAPTCHAs and payments with a "hold": the agent hands the browser to the person and waits. — [nanoMuse holds.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/agent/holds.py), acc. 2026-11-07

### Inferences
- Per-run browser cost for a bounded FamilyOS research task (inference): browser time is under 1 cent (minutes at $0.02/hour). Token cost dominates (cents to tens of cents per multi-step task). Residential proxies at $5-12/GB add more.
- Terms risk: using CAPTCHA solving, stealth or residential proxies to evade a site's bot controls is the clearest terms-of-service exposure, and the Perplexity ruling does not address contract (ToS) claims. FamilyOS should turn these features off and use a human takeover for logins and CAPTCHAs (the nanoMuse "hold" pattern).
- For reliability, FamilyOS should run its own fixed task set during the Phase C spike. Repeatable workflows suit Playwright scripts, with Stagehand-style caching or LLM fallback, better than a fully autonomous agent.

### Gaps
- No independent reliability study was found.
- I did not read specific vendor sites' terms (vendor and booking portals) for FamilyOS's target workflows.
- The terms-of-service holdings in Amazon v. Perplexity were not covered by the sources found.

---

## Q8. Observability and evals (Langfuse, Arize Phoenix, LangSmith, OpenTelemetry GenAI, promptfoo)

### Takeaway
- Langfuse: MIT core with `ee/` exceptions. It self-hosts easily but needs four backing services (Postgres, ClickHouse, Redis/Valkey, S3).
- Phoenix: the lightest self-host (one container, SQLite or Postgres 14+), but ELv2, which is source-available and bars offering it as a managed service.
- LangSmith: proprietary SaaS with MIT SDKs; self-hosting is Enterprise only.
- OpenTelemetry GenAI conventions now live in their own repo.
- promptfoo: MIT, and agreed to join OpenAI in March 2026.

### Cited Findings
- Langfuse:
  - License: `LICENSE` copyright "ClickHouse, Inc."; MIT Expat except `ee/`, `web/src/ee/`, `worker/src/ee/` and `packages/shared/src/server/ee/`, which fall under `ee/LICENSE` (commercial). — [Langfuse LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE), [ee/LICENSE](https://github.com/langfuse/langfuse/blob/main/ee/LICENSE), acc. 2026-11-07
  - v4.76.0 released 2026-11-05, 37,130 stars. — [GitHub langfuse/langfuse](https://github.com/langfuse/langfuse), acc. 2026-11-07
  - Self-hosting needs PostgreSQL, ClickHouse, Redis/Valkey and S3, plus Web and Worker containers; some add-ons need a license key. — [Langfuse self-hosting](https://langfuse.com/self-hosting), acc. 2026-11-07
  - Cloud: Hobby free (50k units), Core $29/month, Pro $199/month, Enterprise $2,499/month; overage $8 per 100k units, falling by tier. — [Langfuse pricing](https://langfuse.com/pricing), acc. 2026-11-07
  - Advisories 2025-11 to 2026-04 include SSO account takeover via CSRF (CVE-2025-65107) and cross-org enumeration (CVE-2025-64504). — [langfuse advisories](https://github.com/langfuse/langfuse/security/advisories), acc. 2026-11-07
- Arize Phoenix:
  - License: `LICENSE` is Elastic License 2.0. You "may not provide the software to third parties as a hosted or managed service." — [Phoenix LICENSE](https://github.com/Arize-ai/phoenix/blob/main/LICENSE), acc. 2026-11-07
  - `arize-phoenix-v21.0.0` released 2026-10-30, 12,193 stars. — [GitHub Arize-ai/phoenix](https://github.com/Arize-ai/phoenix), acc. 2026-11-07
  - One container (UI, collector, SQL backend). SQLite by default; PostgreSQL 14+ recommended for production. — [Phoenix architecture](https://arize.com/docs/phoenix/self-hosting/architecture), acc. 2026-11-07
  - "Free to self-host with no feature limitations." — [Phoenix self-hosting](https://arize.com/docs/phoenix/self-hosting), acc. 2026-11-07
- LangSmith:
  - SDK repo `langchain-ai/langsmith-sdk` was archived on 2026-10-16. SDKs moved to `langsmith-python` (MIT, v0.14.17 released 2026-11-02) and `langsmith-javascript` (MIT, v0.11.8 released 2026-11-03). — [langsmith-sdk](https://github.com/langchain-ai/langsmith-sdk), [langsmith-python](https://github.com/langchain-ai/langsmith-python), [langsmith-javascript](https://github.com/langchain-ai/langsmith-javascript), acc. 2026-11-07
  - Developer $0 (5k base traces), Plus $39/seat; base traces kept 14 days, extended 180 days; self-hosted and hybrid only on Enterprise. — [LangChain pricing](https://www.langchain.com/pricing), acc. 2026-11-07
- OpenTelemetry:
  - `semantic-conventions` v1.45.0 released 2026-11-02 (Apache-2.0). — [GitHub open-telemetry/semantic-conventions](https://github.com/open-telemetry/semantic-conventions), acc. 2026-11-07
  - The GenAI page says the conventions "have moved" to `open-telemetry/semantic-conventions-genai`, which was created 2026-05-05 and pushed 2026-11-06. It covers spans, agent spans, events, metrics, MCP and provider-specific conventions. — [OTel GenAI semconv page](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [GitHub semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai), acc. 2026-11-07
- promptfoo:
  - MIT (`LICENSE`), 0.125.1 released 2026-10-25, 26,939 stars. — [GitHub promptfoo/promptfoo](https://github.com/promptfoo/promptfoo), acc. 2026-11-07
  - Agreed to be acquired by OpenAI (announced 2026-03-09), with a stated commitment to stay open source under its current license. The sources are the company blog tag page and press, via search. — [promptfoo company updates](https://www.promptfoo.dev/blog/tags/company-update/), [The Next Web](https://thenextweb.com/news/openai-acquires-promptfoo-ai-security-frontier), acc. 2026-11-07

### Inferences
- For a Postgres-centric monolith, emitting OTel GenAI spans from FamilyOS code keeps the backend swappable. Phoenix (internal use only, ELv2) or Langfuse (MIT core) can then receive them.
- ELv2 is fine for an internal tool but is not open source. Langfuse is the safer license if a hosted observability view is ever exposed to households (inference).
- promptfoo fits the PRD's Gate 2 regression evals (approval gating, false completion). Its governance now sits with OpenAI.

### Gaps
- The stability status of the GenAI conventions (Development or Stable) and the `OTEL_SEMCONV_STABILITY_OPT_IN` behavior were not confirmed; the moved page did not say.
- Langfuse minimum component versions and Enterprise self-host pricing were not fetched.

---

## Q9. nanoMuse: license, architecture from source, patterns worth learning, copyleft implications, Meta claim

### Takeaway
- **License:** the LICENSE file is the verbatim GPLv3 text. NOTICE, pyproject and README choose "version 3 ... or any later version", so the project is GPL-3.0-or-later. GitHub's detector shows only "GPL-3.0". The phone apps derive from OpenMinis 1.13, which is "GPL-3.0" with no "or later" stated.
- **Meta:** it explicitly says it is "not affiliated with, endorsed by, or derived from" Meta or Muse, while openly imitating Muse's design (Sentinel, Muse-style agent).
- **Architecture:** a single-user Python runtime with SQLite stores and an in-process "Sentinel" policy gate. Several good patterns are worth studying as ideas.
- **Copyleft:** plain GPL (not AGPL) lets a closed network service run modified code without releasing source. Distributing a mobile or desktop app that contains it conveys the code, which triggers full GPL obligations for the combined work, and app-store terms have historically conflicted with the GPL.

### Cited Findings

**License and provenance**
- `LICENSE` (35,149 bytes) begins "GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007". GitHub reports SPDX `GPL-3.0`. — [nanoMuse LICENSE](https://github.com/nano-muse/nanoMuse/blob/main/LICENSE), acc. 2026-11-07
- `NOTICE`: "either version 3 of the License, or (at your option) any later version." Also: `android/` is based on OpenMinis 1.13 (tag 1.13, commit 4ef2900), "released under the GNU General Public License version 3", modified since 2026-09-24, with edits marked `// nanoMuse:`. — [nanoMuse NOTICE](https://github.com/nano-muse/nanoMuse/blob/main/NOTICE), acc. 2026-11-07
- Both `pyproject.toml` files declare `license = { text = "GPL-3.0-or-later" }`: the runtime v1.0.9 and the relay `nanomuse-cloud` v0.31.1. — [pyproject.toml](https://github.com/nano-muse/nanoMuse/blob/main/pyproject.toml), [cloud/pyproject.toml](https://github.com/nano-muse/nanoMuse/blob/main/cloud/pyproject.toml), acc. 2026-11-07
- The README says "Earlier versions of the Python line were MIT (tag `pre-openminis`)" and lists OpenMinis as "GPL-3.0". — [nanoMuse README](https://github.com/nano-muse/nanoMuse/blob/main/README.md), acc. 2026-11-07
- THIRD_PARTY_NOTICES.md lists proot (a fork of termux/proot) and the upstream inventory for the phone apps. — [THIRD_PARTY_NOTICES.md](https://github.com/nano-muse/nanoMuse/blob/main/THIRD_PARTY_NOTICES.md), acc. 2026-11-07

**Repo activity**
- Created 2026-09-23. 3,293 stars, 398 forks, 146 open issues, last push 2026-11-07. Latest release v1.0.9 ("Tiller", 2026-10-29).
- Languages: Swift, Kotlin, Python, TypeScript and others.
- Contributors: the top contributor `lgy0404` has 2,158 commits; the next has 98.
- The org lists location China, homepage nanomuse.cn, and 3 public repos.
- No security advisories are published.
— [GitHub nano-muse/nanoMuse](https://github.com/nano-muse/nanoMuse), [org nano-muse](https://github.com/nano-muse), acc. 2026-11-07

**Meta claim**
- NOTICE: "nanoMuse is not affiliated with, endorsed by, or derived from Meta Platforms, Inc. or its Muse product. 'Muse' is a trademark of Meta Platforms, Inc." — [nanoMuse NOTICE](https://github.com/nano-muse/nanoMuse/blob/main/NOTICE), acc. 2026-11-07
- README: an agent "in the style of Meta's Muse", plus a "Compared with Muse and OpenMinis" table (Meta Muse licence "Closed"). The README also says it is "an independent community project, not affiliated with or endorsed by Meta." — [nanoMuse README](https://github.com/nano-muse/nanoMuse/blob/main/README.md), acc. 2026-11-07
- Repo topics include `meta-muse`, `muse` and `openmuse`. — [GitHub API repos/nano-muse/nanoMuse](https://github.com/nano-muse/nanoMuse), acc. 2026-11-07
- AGENTS.md rules: "Never copy Meta's UI text verbatim". Muse's system prompt and anything "decompiled or intercepted from the Muse app" must stay out of the repository. — [nanoMuse AGENTS.md](https://github.com/nano-muse/nanoMuse/blob/main/AGENTS.md), acc. 2026-11-07
- The Sentinel doc: "Meta describes Muse's safety model as a separate *Sentinel* agent ... nanoMuse implements the same split." — [docs/sentinel.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/sentinel.md), acc. 2026-11-07
- Meta's Muse was announced 2026-09-08 (updated 2026-09-30). It runs in a dedicated "Muse Secure VM" per user, with a separate Sentinel agent gating internet access. The announcement does not mention nanoMuse. — [Meta newsroom: Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), acc. 2026-11-07

**Architecture (from source)**
- Components:
  - `nanomuse/` Python runtime: agent loop, Sentinel, tools, phone and computer "hands", FastAPI server.
  - `cloud/` relay: FastAPI plus SQLite.
  - `web/` React console.
  - `harness/` desktop: a DeepSeek Harness plugin in Electron.
  - `android/`: the OpenMinis subtree, containing both the Android and iOS apps.
  — [AGENTS.md](https://github.com/nano-muse/nanoMuse/blob/main/AGENTS.md), [docs/architecture.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/architecture.md), acc. 2026-11-07
- Turn loop: `MuseAgent.run()` sends each model tool call to `Sentinel.guard()`. The policy returns allow, ask or deny; then come approval, vault placeholder resolution, execution, result redaction, taint bookkeeping and the audit log. — [docs/architecture.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/architecture.md), acc. 2026-11-07
- Policy order is `deny_tools`, then explicit rules, then always-allow/always-ask, then risk × mode. Taint tracking comes last and "can only escalate to ASK": after private data has been read, egress to a host outside the allowlist needs approval whatever the mode. — [nanomuse/sentinel/policy.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/sentinel/policy.py), acc. 2026-11-07
- Risk levels are safe, moderate and sensitive (send_email, shell, saving skills). Per-call `assess()` can raise the risk. Subprocesses get a scrubbed environment and run in a bubblewrap sandbox on Linux. — [docs/sentinel.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/sentinel.md), acc. 2026-11-07
- Grants are capabilities "bound to a tool and a target", such as `send_email:alice@example.com`. Scopes are once, conversation, session, 24h and always; the last two are persisted. — [nanomuse/sentinel/grants.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/sentinel/grants.py), acc. 2026-11-07
- Scheduled work uses a SQLite outbox `scheduled_deliveries` with `source_key UNIQUE`. "Completed rows are retained as the idempotency key." — [nanomuse/server/outbox.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/server/outbox.py), acc. 2026-11-07
- Recovery behavior: an interrupted run "is queued again once at the next start", so a routine "should look whether its change already happened". — [docs/app.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/app.md), acc. 2026-11-07
- Approvals are in memory: `pending_approvals: dict[str, asyncio.Future]` with a default `approval_timeout` of 3600 seconds. — [nanomuse/server/webui.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/server/webui.py), acc. 2026-11-07
- Stopping a run makes "pending approval and question cards there expire". Timeline events persist per thread as JSON files. — [docs/app.md](https://github.com/nano-muse/nanoMuse/blob/main/docs/app.md), acc. 2026-11-07
- Holds: the person takes over the browser, screen or phone (sign-in, CAPTCHA, payment), and the agent waits (`HAND_OVER_TIMEOUT_S = 600`) and then re-observes. — [nanomuse/agent/holds.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/agent/holds.py), acc. 2026-11-07
- The audit log is an append-only JSONL trail of everything done or refused. — [nanomuse/sentinel/audit.py](https://github.com/nano-muse/nanoMuse/blob/main/nanomuse/sentinel/audit.py), acc. 2026-11-07
- Its own limits, by its own account: "its Sentinel is a module in the same process". Outside the Linux sandbox, approved commands "can do anything you can", and the vault key sits next to the vault by default. — [docs/sentinel.md, "What this does and does not protect against"](https://github.com/nano-muse/nanoMuse/blob/main/docs/sentinel.md), acc. 2026-11-07

**Copyleft**
- GPL FAQ:
  - A company running modified GPL software on a web site without distributing it "does not have to release the modified sources"; under the AGPL it must. — [GNU GPL FAQ #UnreleasedMods](https://www.gnu.org/licenses/gpl-faq.html#UnreleasedMods), acc. 2026-11-07
  - "You cannot incorporate GPL-covered software in a proprietary system." — [GPL FAQ #GPLInProprietarySystem](https://www.gnu.org/licenses/gpl-faq.html#GPLInProprietarySystem), acc. 2026-11-07
  - Plug-ins that exchange complex data with the main program form a single combined program. Separate programs using pipes or sockets are usually an aggregate, unless the exchange is intimate. — [GPL FAQ #GPLPlugins, #MereAggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation), acc. 2026-11-07
  - A permissive wrapper does not escape the GPL. — [GPL FAQ #GPLWrapper](https://www.gnu.org/licenses/gpl-faq.html#GPLWrapper), acc. 2026-11-07
- FSF (2010-05-26): Apple's App Store Terms impose "further restrictions" (usage rules, device limits) that are incompatible with the GPL, and GNU Go was removed from the store. — [FSF: More about the App Store GPL enforcement](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement), acc. 2026-11-07
- The brief: "Do not fork nanoMuse into proprietary code without explicit legal clearance." — [CLAUDE_EXECUTION_BRIEF.md rule 5](../../CLAUDE_EXECUTION_BRIEF.md), acc. 2026-11-07

### Inferences
- **License precision:** the Python runtime, relay, web and desktop code are GPL-3.0-or-later. The phone-app subtree includes OpenMinis code licensed "GPL-3.0" (no "or later" stated), so a combined phone app is effectively bound to GPLv3 terms. Reusing anything from `android/` binds you to version 3.
- **Closed-source network service:** under plain GPL, FamilyOS could legally run modified nanoMuse server code without publishing it, because it is not AGPL. But the brief requires legal clearance, the PRD wants a clean proprietary codebase, and any later distribution (self-host kits, desktop agents, on-device code) would trigger GPL. The low-risk path is to treat nanoMuse as reference reading only.
- **Distributed mobile app:** embedding nanoMuse or OpenMinis code in a FamilyOS iOS or Android app would require offering Corresponding Source for the whole combined app under GPLv3. For iOS, the App Store terms conflict that the FSF describes would be an extra obstacle for a third party, who cannot grant additional permissions on code they do not own. This is not legal advice; get counsel.
- **Patterns worth learning, as ideas only, re-implemented independently:**
  1. Approvals as capability grants bound to tool + target + lifetime, rather than a conversational "yes".
  2. A policy pipeline where later stages can only escalate (taint-based egress escalation after private data is read).
  3. The LLM never sees secrets: placeholders are resolved after approval, and results are redacted.
  4. An outbox with a unique source key as an idempotency record, and the at-least-once caveat stated plainly.
  5. An append-only audit trail of allowed and refused calls.
  6. Human "hold/takeover" for logins, CAPTCHAs and payments instead of automated circumvention.
  7. Per-tool static risk with per-call reassessment.
- **What not to copy:**
  - In-memory approval futures. A pending approval is lost on restart, while FamilyOS needs approvals that survive days.
  - SQLite, single-user, and a Sentinel in the same process. FamilyOS needs multi-tenant Postgres with row-level security and an approval service the agent process cannot bypass.
- **Project risk signals:** it is young (created 2026-09-23) with one dominant committer, and its branding draws on Meta's Muse. The repo's careful non-affiliation and no-copying rules reduce, but do not remove, trademark and confusion risk for anyone borrowing its names. FamilyOS should not borrow names like "Sentinel" or "Muse".

### Gaps
- I did not examine the OpenMinis repository's own LICENSE text to confirm "GPLv3 only" versus "or later". The determination rests on nanoMuse's NOTICE and README wording.
- I found no evidence about how nanoMuse distributes its iOS build beyond the AGENTS.md mention of TestFlight; the App Store status was not checked.
- I found no statement from Meta about nanoMuse, and absence of a statement is not evidence of a position.
