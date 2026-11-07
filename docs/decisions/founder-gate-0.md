# Founder Gate 0: Phase A decision

**Date:** 2026-11-07
**Revision:** 2, after founder review of PR #1 (three corrections, listed below)
**Recommendation:** **REVISE, then GO on Phase B only.**

The north-star product is unchanged: a shared AI chief of staff for household responsibilities, covering chores, routines, calendars, family coordination, home management, memory and agentic execution (`docs/product/product-contract.md`).

What Phase A changes is the **launch plan**: the competitive set for the execution part, the hero workflow, pricing and channels. Approve the five decisions below. With those approved, the next step is the Phase B fake-data prototype, built while you run Gate 0 interviews.

Phase C waits for the Gate 0 results.

**Why not GO as written:**
- The PRD benchmarks the wrong competitors for the execution part.
- Its hero task is low-frequency.
- Its pricing sits at the top of the app market with no evidence behind it.
- It assumes that email to vendors works, and nobody has measured that.

**Why not STOP:**
- No public source documents the full combination: several adults approving the agent's vendor messages and bookings under roles, threads that last days, and a household-owned evidence record.
- Families' stated discomfort with autonomous agents favours the approval-gated design (trust surveys in the demand notes).

## Changes in revision 2 (founder corrections)

1. **North star and launch wedge are now separate.** The new `docs/product/product-contract.md` holds both. Home-service coordination is one of four candidate wedges, tested against shared chores, two-adult coordination and a unified system.
2. **Phase B covers the unified household.** A new PR adds recurring chores, a two-adult chore rotation and a shared-week handoff workflow (journeys J3b and J6). The interview kit gains wedge questions and a decision rule.
3. **The framework benchmark is qualified.** The baseline was built with safeguards that the framework examples lacked. The findings are now stated as architecture requirements R1–R8, and framework adoption stays open (evaluation §1.3; ADR-001 §3.2).

## Repository inventory (brief rule 1–2)

- `/Users/thoroxnard/FamilyOS` was not a git repository. It held only the three brief files. It is **not** Kinship, and nothing outside this folder was touched.
- GitHub `fullcarts89/FamilyOS` existed, empty and **public**. On 2026-11-07 the founder approved making it **private**, which was done before the first push (decision 5, part 1). Part 2, the clean-room rule, is still open.
- This phase added:
  - `docs/` (Phase A deliverables plus `evidence/framework-bench`);
  - `research_notes/FamilyOS Phase A research/`, holding 7 primary-source note files;
  - `reports/`, holding the synthesized research report.
- No application code was written. The bench harnesses are throwaway evaluation scripts using mocked tools.

## Decisions requiring your approval (5)

### 1. North star, launch wedge and how the wedge is chosen

**Question:** Do you approve the product contract? It keeps the north star as written and treats the launch wedge as a hypothesis. The candidates are A, home-service coordination; B, shared chores and routines; C, two-adult coordination; and D, a unified system. Gate 0 picks among them using the wedge decision rule in the interview kit.

- **Recommendation:** Yes.
- **Phase A's lean, not a decision:** A as the differentiating hero inside D, with B and C providing frequency. Within A, pick the service by concierge measurement across a basket (gutters, appliance repair, handyman, cleaning, lawn), not gutters alone.
- **Trade-off:** testing four candidates makes the interviews longer (45 minutes, up from 30). In exchange, the launch choice rests on evidence, and the product is never reduced to a contractor concierge.
- **Positioning:** approval before sending is now standard (Gemini, Duet, Muse, Copilot). Position on the shared household system, its vendor-neutral home record and multi-adult roles, not on "safe agent".
- **Adjust if you want:** the decision-rule thresholds (50% / 35% / 40%) are proposals.

### 2. Gate order and Phase B scope

**Question:** Do you approve this order? You run the Gate 0 interviews and the Gate 1 concierge, using `docs/research/gate0-interview-and-concierge-kit.md`. Engineering builds only the Phase B prototype in that time, with five demo paths: routine chore, chore rotation, home repair, shared week and vendor coordination. The prototype is the interview prop. Phase C starts only after Gate 0 passes.

- **Recommendation:** Yes.
- **Trade-off:** Phase B grows from about 5–6 to about 7 working days (six PRs, B1–B6), still at $0. Phase C slips by about 2–3 weeks. In exchange, we avoid building on channel, wedge and pricing assumptions with no evidence behind them. The PRD's own Gate 0 already requires this.

### 3. Architecture (ADR-001)

**Question:** Do you approve this stack?
- A TypeScript modular monolith.
- Expo for the client.
- Supabase Postgres, with access through our API only and RLS as defense in depth.
- FamilyOS-owned state machines, approvals, outbox and evidence, meeting requirements R1–R8.
- Graphile Worker for timers and jobs.
- The MVP does not depend on an agent framework. The LLM sits behind a provider-agnostic `ModelPort` and a framework-neutral step interface, so a framework can be adopted later.
- The model provider chosen by an eval in Phase C.

- **Recommendation:** Yes.
- **What the benchmark supports:** that durable state, idempotent sends, payload-bound approvals, tenancy and evidence-based completion are requirements, and that neither framework provides them by default.
- **What it does not support:** that frameworks should never be used. The baseline was built with those safeguards; the framework examples were not given them.
- **Trade-off:** we own about 300–500 lines of recovery and timer code, and we give up LangGraph Studio-style tooling for now. In return, no deploy can strand a run, approvals are bound to the payload hash, and tenancy is in our schema.
- **Adoption path:** a framework can come in inside a step at any time, or more broadly if it passes the Phase C requirement suite.

### 4. External channels for alpha

**Question:** Do you approve these channel rules?
- Email goes from a FamilyOS domain through Postmark, with per-thread reply addresses.
- A manual hand-off (prefilled text or call script) is a first-class path.
- Excluded in MVP: Gmail or Outlook mailbox reading, AI voice calls, SMS, browser automation and child logins.
- Optional P1: send-as-user via `gmail.send`.

- **Recommendation:** Yes.
- **Trade-off:** Some vendors may answer the user's own address or phone more readily, so reply rates may be lower. In return we avoid Gmail's restricted-scope verification (about 6 weeks plus an annual CASA assessment), TCPA artificial-voice exposure and 10DLC registration. The concierge measures the actual difference.
- These rules apply to the execution part only. Chores and coordination between household members need no external channel.

### 5. IP hygiene (repository visibility done)

**Question:** Do you approve a clean-room rule? Under it, nobody, and no AI coding assistant, works on FamilyOS with GPL or AGPL source (nanoMuse, Donetick, Mealie, HomeBox) in context. Those projects are used only through written pattern descriptions.

- **Recommendation:** Yes.
- **Already done:** the repo was made private before the first push, on your approval.
- **Trade-off:** none material. It mainly matters for the chores and home-record areas, where the closest open-source references are AGPL.

## Also needs you (not a decision, about 5 minutes)

- Open getohai.com in a browser and note the legal entity in its footer or privacy policy. The research tooling could not reach the site. Until then, every audit claim sourced only to getohai.com is `not verified`.
- **Disclosure:** during demand research, one automated request to the SEC's EDGAR company lookup carried your account email address in its User-Agent header. Every later request used a generic header. Nothing else personal was sent anywhere.

## What happens on approval

- Merge PR #1, or keep it open as the record; either works.
- Then PRs B1–B6, about 7 working days, at $0 cost.
- Then stop for your feedback on the prototype.
