# FamilyOS implementation plan (Phases B–D)

**Date:** 2026-11-07
**Status:** Proposed. Nothing below starts until the founder approves Gate 0 (`docs/decisions/founder-gate-0.md`).
**Architecture:** ADR-001.
**Threat IDs:** T-xx refer to `docs/security/threat-model.md`.

## 0. Sequencing principle

The engineering phases run **in parallel with** the founder-led demand gates, and never ahead of them:

```
Founder track:  Gate 0 interviews (12–15) ──▶ Gate 1 concierge (5–10 households, manual) ──▶ Gate 3 alpha
Build track:          Phase B prototype ──▶ [review] ──▶ Phase C spike ──▶ [GO/NO-GO] ──▶ Phase D alpha
                       (also used as the                (starts only if Gate 0 passes)   (only if Gates 1+2 pass)
                        interview prop)
```

The clickable prototype doubles as the interview and concierge prop. Phase C waits for Gate 0 evidence, because its spike design (channel, workflow) depends on what interviews reveal.

## 1. Phase B — clickable prototype (fake data, no backend, no agent)

| PR | Content | Tests and checks | Estimate |
|---|---|---|---|
| B1 | Repo scaffold: pnpm workspace, `apps/mobile` (Expo SDK, TS strict), `packages/domain` (types and state enums from ADR §5), CI (typecheck, lint, unit, gitleaks), CODEOWNERS, proprietary LICENSE notice, `docs/` moved under review | CI green; secret scan; no network calls in tests | 0.5 day |
| B2 | Design tokens (calm palette, dynamic type, dark mode, reduced motion); synthetic fixtures for the household from J1–J5 (no real people or child data) | Snapshot tests; contrast check (WCAG AA) | 1 day |
| B3 | Today (Needs you / In progress / This week / Handled), Capture (text + photo picker; a fake "extraction" with an editable review), Work Item detail + timeline | Capture flow timed in a scripted test; all statuses render distinctly | 1.5 days |
| B4 | Delegation Plan, **Approval screen showing the exact payload** (recipients, sender identity, full body, consequences), Execution Timeline with all run states, including `delivery_unknown`, unverified reply and `done_unverified` | Every ADR §5 state has a fixture and a screen; snapshot of the approval payload | 1.5 days |
| B5 | Family roles (owner, adult, limited caregiver) with visibility differences; the 3 demo paths (routine, home repair, vendor coordination); usability checklist | Checklist: capture ≤ 30 s, payload visible, statuses unambiguous, one-handed reach (bottom-anchored actions) | 1 day |

**Phase B total:** about 5–6 working days of build plus founder review.
**Cost:** $0 (Expo Go or the simulator; EAS Free if a device build is wanted).
**Deliverable:** a runnable app (iOS simulator and web) plus a short walkthrough recording.
**STOP for founder feedback.**

## 2. Phase C — technical spike (local only, mocked externals)

Runs on local Postgres (Supabase CLI or Docker). There is no hosted environment, no real email and no real accounts.

| PR | Content | Tests (permanent) | Estimate |
|---|---|---|---|
| C1 | Schema + migrations: household, membership, work_item, work_event (append-only trigger), source, vendor, asset. RLS via `app.household_id`. API skeleton (Hono/Fastify) with per-request `set_config` | **Cross-household matrix:** every endpoint × a foreign ID → 404 and no write (T-01). Worker scoping (T-02). Anon/authenticated grants empty (T-05). CI rule: no query without a household predicate | 2 days |
| C2 | Work-item lifecycle: transition allow-list, optimistic concurrency (`version`), assignment, comments, notifications outbox | Illegal transitions rejected; two-member concurrent edit converges or reports a conflict; event idempotency by `event_id` | 1.5 days |
| C3 | Recurrence engine on `temporal-polyfill`: constrained rule subset, exceptions (skip), pause, reassign, interval-after-completion, missed → needs attention | **Property tests** across all US zones, DST forward and back (02:30 policy), month-end (31st → short months), skip and pause invariants; 10k random schedules vs a reference expander | 2 days |
| C4 | Graphile Worker integration: run-step jobs, `wake_at` timers, leases, crash recovery, a global kill switch | Kill the worker mid-step → resumes once; timers survive a restart; stuck-lease reaper; time-travel clock for 21-day waits | 1.5 days |
| C5 | Approval service + outbox + **sender** against a mock provider: canonical payload hash, role check when sending, expiry, invalidation on edit or revoke, `delivery_unknown` | T-11, T-12, T-13, T-15, T-16; duplicate approval; approval by a revoked member; crash at each of 4 points around the send | 2 days |
| C6 | Inbound pipeline against a mock Postmark webhook: thread tokens, SPF/DKIM result fields, sender matching, quarantined reader, evidence levels E0–E4, completion rules | T-06, T-07, T-10; spoofed or forwarded or replayed replies; injection corpus (≥ 30 cases); E0 never moves state | 2 days |
| C7 | `ModelPort` with (a) a deterministic mock and (b) recorded fixtures. Prompt and schema files for capture, plan, draft, extract and summarize. Per-step token and cost accounting | Schema validation; unknown-not-guess; fabricated-deadline detector; budget overrun → blocked (T-28) | 1.5 days |
| C8 | **Scenario suite (≥ 20, target 30)** wired end to end, plus a reliability, latency and cost report | See §2.1 | 1.5 days |

**Optional C9 (separate approval, real-LLM eval):** run the C7 eval set (about 150 cases) against 2 or 3 candidate models to pick the provider. Expected cost under $25 at the listed prices. This is the only paid usage in Phase C.

**Phase C total:** about 14–16 working days. **Cost:** $0 without C9.
**STOP for founder GO / NO-GO.**

### 2.1 Phase C scenario suite (each a permanent automated test)

1. Happy path, 2 vendors, booking confirmed, invoice → `verified_complete`
2. Process restart while `awaiting_approval`
3. Restart while `awaiting_reply` (21-day simulated wait)
4. Crash after the provider accepted, before the DB commit → `delivery_unknown`, one send
5. Duplicate approval event
6. Approval expired
7. Payload edited after approval
8. Approver revoked before send
9. Caregiver attempts approval
10. Foreign-household approval attempt
11. Provider timeout ×2, then success (bounded retry)
12. Provider permanent failure → that vendor `failed`, run continues
13. No vendor reply → nudge proposal → closed after the cap
14. Spoofed "confirmed" reply
15. Forwarded reply from an unknown address → `unverified_inbound`
16. Reply containing an injection payload
17. Ambiguous reply ("maybe next week?") → `awaiting_user_decision`, no booking
18. Model returns schema-invalid output → retry once → `blocked`
19. Model "claims" success with no tool result → no state change
20. Budget exhausted mid-run
21. Kill switch on
22. Deploy (code version bump) while 5 runs are paused at different states
23. User marks done without evidence → `done_unverified`
24. Concurrent edits by both adults during approval
25. Recurrence: skip, then reassign across a DST weekend

**Report contents:**
- Pass/fail for each scenario.
- Measured p50/p95 step latency (mock model).
- Count of approvals bypassed (must be 0).
- False completions (must be 0).
- Modelled per-run cost (§5).

Simulated actions are labelled `SIMULATED` everywhere in the UI and the logs.

## 3. Phase D — limited alpha (separately authorized; outline only)

Phase D needs approval of the provider accounts, budget, legal review (threat model §5) and the data protections.

- **Scope:** one workflow (home-service coordination), 10 households, real Postmark with a FamilyOS domain, Google Places live rendering, Expo builds via TestFlight, Supabase Pro in a US region.
- **Not included:** SMS, voice, Gmail OAuth, browser automation, payments, child logins.
- **Cost estimate:** about $64–100/month infrastructure; Apple Developer $99/year; counsel review (unknown; get quotes); LLM about $0.15–0.25 per hero run.

## 4. Explicit exclusions (until a later gate approves them)

- Real personal accounts, real emails, orders, bookings, payments.
- Public deployment.
- Paid usage beyond the optional C9.
- AI voice calls, SMS, browser automation, Gmail or Outlook mailbox reading.
- Child logins.
- Medical or caregiving workflows.
- Grocery, meals, recipes, full calendar.
- Purchasing or booking without approval.
- Any code derived from nanoMuse or AGPL household apps.
- Reverse engineering competitor apps.

## 5. Per-run cost model (hero workflow; prices from commodity notes, re-verify before Phase D)

| Step | Model tier | Tokens in/out (est.) | Cost |
|---|---|---|---|
| Capture | small | 2k / 0.3k | $0.0004 |
| Plan parameters | small | 2k / 0.5k | $0.0005 |
| Rank and explain 3 options | mid | 6k / 0.8k | $0.020 |
| Draft 2 emails | mid | 6k / 1.2k | $0.024 |
| Extract 3 replies (quarantined) | small | 9k / 0.9k | $0.0014 |
| Summarize decision | mid | 4k / 0.5k | $0.013 |
| **LLM subtotal** | | | **≈ $0.06** |
| Places: 1 Text Search + 3 Details (past the free tier) | | | ≈ $0.095 |
| Postmark: about 6 messages | | | ≈ $0.01 |
| **Marginal total** | | | **≈ $0.15–0.25** |

Unit economics are dominated by support and human intervention, not inference. Gate 1 must measure minutes of human help per completed task.
