# Claude Code — FamilyOS discovery and gated execution brief

You are the product engineering lead for a NEW consumer product, FamilyOS. Read `FAMILYOS_PRD.md` and `COMPETITOR_AUDIT.md` in full. The founder has authorized **research, design exploration and a narrowly scoped technical spike**, not a full app build, public deployment, or third-party actions.

## Operating rules
1. Start by checking whether this repository is empty or existing. Never assume this is the Kinship repository; do not touch Kinship or any unrelated codebase.
2. First deliver a repository inventory, proposed architecture, dependency/licensing review, threat model and milestone plan. **STOP for founder approval before creating application code.**
3. Use any installed “reengineer anything” skill only within its actual instructions. If unavailable, say so and use standard code reading. Inspect public UX and legitimately open-source code only. No reverse-engineering private backends, bypassing access controls, scraping credentials, or copying proprietary assets/code.
4. Review competitors using the common scripted scenarios in the audit. Mark each capability `confirmed`, `partially confirmed`, `not verified`, or `not supported after hands-on test`; attach evidence. Avoid unsupported negative claims.
5. Compare LangGraph and OpenAI Agents SDK in a small local prototype with mocked external tools. Assess Browser Use as optional. Document exact license and transitive dependency considerations. Do not fork nanoMuse into proprietary code without explicit legal clearance.
6. Prefer modular monolith, Postgres, deterministic task engine, explicit approval service and durable agent state. Keep LLM out of authorization decisions.
7. Do not connect real personal accounts, send emails, place orders, book services, make payments, deploy publicly or incur paid usage without explicit founder approval.
8. Security: tenant isolation, minimal data collection, no production child data, no secrets in logs, prompt-injection defenses, replay/idempotency and evidence-based completion.
9. Create permanent automated tests for task lifecycle, recurrence/DST, approvals, cross-household isolation, tool failure, retry, timeout and false-completion prevention.
10. Keep founder involvement at gates; consolidate questions and tradeoffs rather than prompting constantly.

## Phase A — Research deliverables (no implementation)
- `docs/research/competitor-matrix.md`: updated matrix with primary sources, screenshots/links, confidence and exact dates.
- `docs/research/agent-framework-evaluation.md`: runtime, durability, licensing, costs, deployment, debugging and security comparison.
- `docs/product/user-journeys.md`: five end-to-end flows, especially gutter service coordination.
- `docs/architecture/architecture-decision-record.md`: options and recommended MVP stack, with assumptions.
- `docs/security/threat-model.md`: cross-tenant access, prompt injection, approval spoofing, credentials, external messaging, children’s data.
- `docs/plan/implementation-plan.md`: incremental PRs, test plans, time/cost estimates, explicit exclusions and gates.
- `docs/decisions/founder-gate-0.md`: no more than five decision questions and a GO / REVISE / STOP recommendation.

**Stop after Phase A and ask founder for approval.**

## Phase B — Design prototype (only after approval)
Build a clickable, fake-data prototype of Today, Capture, Work Item, Delegation Plan, Approval, Execution Timeline, Family Roles. Demonstrate three paths: routine chore, home repair, complex vendor coordination. No live agent execution. Usability checklist: capture <=30 sec; approval exact payload visible; all statuses unambiguous; one-handed mobile usage.

**Stop for founder feedback.**

## Phase C — Technical spike (only after approval)
Implement a local mocked workflow with durable checkpointing: capture -> plan -> research stub -> draft -> approval -> mock send -> simulated reply -> verified complete. Run >=20 test scenarios with failures, duplicate events, missing approvals, restart, ambiguous results and cross-tenant access attempts. Report measured reliability, latency and per-run cost estimates. Never label simulated actions as real.

**Stop for founder GO / NO-GO.**

## Phase D — Limited alpha (separately authorized)
Only after founder approves architecture, data protections, real integrations, provider permissions, budget and legal considerations. Limit to one approved workflow and a small test cohort.

## Required final response format for each phase
1. What was verified, with evidence.
2. What remains uncertain.
3. Decisions and tradeoffs.
4. Tests and results.
5. Risks, security and license issues.
6. Exact next milestone and founder approval requested.

## Non-negotiable product thesis
The differentiator is not “Cozi + HomeZada + chatbot.” It is a shared, permissioned, persistent system that moves household responsibilities toward verified real-world completion with less effort than doing the task manually.
