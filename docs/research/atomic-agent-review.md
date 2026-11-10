# Review: Atomic Agent ("Fusion" planner + local workers)

**Date:** 2026-11-10
**Source:** an Instagram reel claiming that a frontier model planning for a local Qwen 27B worker was 5x cheaper and 2x faster than the frontier model alone. The reel shows `github.com/AtomicBot-ai/atomic-agent`. Reviewed at commit `1b4e641` (2026-11-10), version 0.7.0.
**Question:** can FamilyOS use this repository for its agent work?
**Answer:** not as a dependency or a service. FamilyOS should adopt three of its ideas in its own control plane when delegation is built. This needs a founder decision (brief rule 5: the agent framework is chosen after a measured spike).

## What it is

- A local-first, single-user operator agent: a terminal app, a desktop app, and an HTTP and Tauri sidecar for embedding. It drives a browser, edits files, runs shell commands, keeps memory across sessions, and calls MCP tools.
- State lives on the user's disk (`~/.atomic-agent`, SQLite through `better-sqlite3`). It uses `llama.cpp` for local models and supports cloud providers.
- **Fusion mode:** one model (the orchestrator) plans and hands independent subtasks to a pool of workers through a `fusion.delegate` tool. The orchestrator does not run mutating tools itself. Options, all off by default:
  - a per-turn spend and time cap (`turnBudgetUsd`, `turnTimeBudgetMs`);
  - a judge that checks each task against an acceptance checklist, where deterministic checks fail whatever a model says;
  - automatic replanning and escalation to a stronger model;
  - a checkpoint after every task and wave, so a run can resume after a crash.
- **License:** MIT, copyright 2026 Atomic Bot. Its direct dependencies include `posthog-node` (analytics), `playwright-core`, `grammy` (Telegram), `exceljs`, `pdfjs-dist` and others. Their licenses have not been audited.
- **Status:** "Developer preview. APIs, commands, config, and behavior are still moving." Requires Node 25.7 or later.

## Why it does not fit as a component

| FamilyOS requirement | Atomic Agent |
|---|---|
| Multi-household, row-level isolation in Postgres (PRD §9, brief rule 8) | Single user; state in local SQLite and files. It has no idea of a household or a member |
| Deterministic control plane: approvals and state are software rules (PRD §3, brief rule 6) | The agent loop owns its own approvals and task state. FamilyOS would end up with two sources of truth for `AgentRun` and `Approval` |
| Least-privilege tools; external actions only through connected channels (PRD §8) | Built around broad machine access: shell, file system, browser, git, email and Telegram sends. Approval is per-category policy on one person's machine |
| No household content leaves our infrastructure unless needed | Anonymous analytics (PostHog) and crash reports (Sentry) are **on by default**. They send model names, token counts and costs, but not message content |
| Runs on Railway Hobby (Node 24.16 images) | Needs Node 25.7 or later. The reel's local Qwen 27B worker needs a GPU machine. Railway Hobby has none, so "local" means a new GPU host and a new cost |
| Stable integration point | Developer preview, with moving APIs |

**About the reel's numbers:** they come from the vendor's own post, on one long generation task (building an interactive pop-up book, 11 vs 21 minutes). FamilyOS's hero workflow (research gutter cleaners, draft one message, wait for approval) is short and mostly waiting. Its model cost per run is likely cents, so a 5x saving is small in absolute terms. The GPU host it requires would probably cost more than the tokens it saves. Gate 2 should measure this rather than assume it.

## What to take from it

These are patterns, written in our own code; nothing is copied. They fit the `AgentRun` model already in `packages/domain/src/agent-run.ts` and PRD §7 (`budget`, `checkpoint`, `retry_count`).

1. **Model tiers by role.** A stronger model plans and makes the decision-ready comparison. A cheaper model does bulk work: summarising vendor pages, extracting prices and hours, first drafts. This works with two hosted models from one provider (no GPU, no local model). Record each step's model and cost on its `WorkEvent` so Gate 2 can measure the saving.
2. **A hard budget per run.** Set a spend and time cap on `AgentRun.budget`. When it is reached, no new step starts, and the run moves to a person-facing state that says plainly what was and was not done. It never claims completion.
3. **Checks before closing.** A step closes only when deterministic checks pass: required fields present, sources recorded, no unverified prices. A model's opinion cannot turn a failed check green. This is the PRD's "evidence, not assertion" rule.

Checkpointing after each step is already planned (PRD §9, brief Phase C). Fusion's resume flow is a useful reference: it reports finished tasks from the checkpoint, and asks a person before re-running a task that had already acted. That is the same as our rule for `delivery_unknown`: surface it, never retry blindly.

## Not recommended

- Running Atomic Agent as a sidecar or service behind the API.
- Giving any agent shell, file-system or general browser access in the household product.
- Self-hosting a 27B model before Gate 2 shows that model cost matters.

## Founder decision requested

1. **Adopt the three patterns above as requirements for the delegation spike?** Recommended: yes. This adds no dependency and no cost now.
2. **Add a "two hosted models by role" arm to the Gate 2 spike, measuring cost and quality against one model?** Recommended: yes. It needs approval for paid model usage when the spike runs (brief rule 7).
