# Founder Gate 0: Phase A decision

**Date:** 2026-11-07
**Recommendation:** **REVISE, then GO on Phase B only.**

The product thesis survives, but narrower than written. The competitive set and the hero workflow change, and so does the technical plan. Approve the five decisions below. With those approved, the next step is the Phase B fake-data prototype, built while you run Gate 0 interviews.

Phase C waits for the Gate 0 results.

**Why not GO as written:**
- The PRD benchmarks the wrong competitors.
- Its hero task is low-frequency.
- Its pricing sits at the top of the app market with no evidence behind it.
- It assumes that email to vendors works, and nobody has measured that.

**Why not STOP:**
- No public source documents the full combination: several adults approving the agent's vendor messages and bookings under roles, threads that last days, and a household-owned evidence record.
- Families' stated discomfort with autonomous agents favours the approval-gated design (trust surveys in the demand notes).

## Repository inventory (brief rule 1–2)

- `/Users/thoroxnard/FamilyOS` was not a git repository. It held only the three brief files. It is **not** Kinship, and nothing outside this folder was touched.
- GitHub `fullcarts89/FamilyOS` existed, empty and **public**. On 2026-11-07 the founder approved making it **private**, which was done before the first push (decision 5, part 1). Part 2, the clean-room rule, is still open.
- This phase added:
  - `docs/` (Phase A deliverables plus `evidence/framework-bench`);
  - `research_notes/FamilyOS Phase A research/`, holding 7 primary-source note files;
  - `reports/`, holding the synthesized research report.
- No application code was written. The bench harnesses are throwaway evaluation scripts using mocked tools.

## Decisions requiring your approval (5)

### 1. Wedge and hero workflow

**Question:** Do you approve narrowing the wedge to *household-owned, multi-adult, approval-gated home-service coordination with a verified home record*? And do you approve choosing the hero by concierge measurement across a basket of services (gutters, appliance repair, handyman, cleaning, lawn) instead of fixing on gutters now?

- **Recommendation:** Yes.
- **Trade-off:** Gutters is a clean demo, but a typical household hires a pro for it once a year at most, and many never do. The basket adds no build cost, because the workflow template is the same.
- **Positioning:** approval before sending is now standard (Gemini, Duet, Muse, Copilot). Position on the shared, vendor-neutral home record and the multi-adult roles, not on "safe agent".

### 2. Gate order

**Question:** Do you approve this order? You run the Gate 0 interviews and the Gate 1 concierge, using the kit in `docs/research/gate0-interview-and-concierge-kit.md`. Engineering builds only the Phase B prototype in that time, and uses it as the interview prop. Phase C starts only after Gate 0 passes.

- **Recommendation:** Yes.
- **Trade-off:** Phase C slips by about 2–3 weeks. In exchange, we avoid building on channel and pricing assumptions with no evidence behind them. The PRD's own Gate 0 already requires this.

### 3. Architecture (ADR-001)

**Question:** Do you approve this stack?
- A TypeScript modular monolith.
- Expo for the client.
- Supabase Postgres, with access through our API only and RLS as defense in depth.
- FamilyOS-owned state machines, approvals, outbox and evidence.
- Graphile Worker for timers and jobs.
- No agent framework in MVP; the LLM sits behind a provider-agnostic `ModelPort`.
- The model provider chosen by an eval in Phase C.

- **Recommendation:** Yes.
- **Trade-off:** We own about 300–500 lines of recovery and timer code, and we give up LangGraph Studio-style tooling. In return, no deploy can strand a run, approvals are bound to the payload hash, and tenancy is in our schema. The bench shows both frameworks need these properties added by us anyway.

### 4. External channels for alpha

**Question:** Do you approve these channel rules?
- Email goes from a FamilyOS domain through Postmark, with per-thread reply addresses.
- A manual hand-off (prefilled text or call script) is a first-class path.
- Excluded in MVP: Gmail or Outlook mailbox reading, AI voice calls, SMS, browser automation and child logins.
- Optional P1: send-as-user via `gmail.send`.

- **Recommendation:** Yes.
- **Trade-off:** Some vendors may answer the user's own address or phone more readily, so reply rates may be lower. In return we avoid Gmail's restricted-scope verification (about 6 weeks plus an annual CASA assessment), TCPA artificial-voice exposure and 10DLC registration. The concierge measures the actual difference.

### 5. Repository visibility and IP hygiene

**Question:**
1. Should `fullcarts89/FamilyOS` be made **private** before I push the Phase A docs as a PR?
2. Do you approve a clean-room rule? Under it, nobody, and no AI coding assistant, works on FamilyOS with GPL or AGPL source (nanoMuse, Donetick, Mealie, HomeBox) in context. Those projects are used only through written pattern descriptions.

- **Recommendation:** Private: yes. Clean-room: yes.
- **Trade-off:** None material. Keeping the repo public exposes the strategy, the threat model and the competitor research.

## Also needs you (not a decision, about 5 minutes)

- Open getohai.com in a browser and note the legal entity in its footer or privacy policy. The research tooling could not reach the site. Until then, every audit claim sourced only to getohai.com is `not verified`.
- **Disclosure:** during demand research, one automated request to the SEC's EDGAR company lookup carried your account email address in its User-Agent header. Every later request used a generic header. Nothing else personal was sent anywhere.

## What happens on approval

- Make the repo private, if you approve that in decision 5.
- Open PR #1 with the Phase A docs.
- Then PRs B1–B5, about 5–6 working days, at $0 cost.
- Then stop for your feedback on the prototype.
