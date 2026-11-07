# Founder decision memo: Phase A to household alpha

**Date:** 2026-11-07
**Revision:** 3. Personal-use strategy, aligned with PRD v0.2 (commit `58a5435`, Weekly Reset as P0).
**Recommendation:** **GO on Phase B, the private household alpha (M0–M3)**, then stop for your review before Phase C.

FamilyOS is a personal project for our two-adult household first. Commercialization is optional and later. The goal now is a working private alpha in our hands: Today and the daily household core after about 10 working days, and Weekly Reset about a week after that.

The full vision is kept: chores, routines, schedules, family coordination, home management, projects, household memory and AI delegation (`docs/product/product-contract.md`).

## What changed in revision 3

1. **No commercial gates.** Customer interviews, concierge pilots, pricing experiments and market gates are removed as prerequisites. The interview kit is archived as reference, and PRD §11 now marks those gates as historical context.
2. **Three core experiences: Today, Weekly Reset and Delegate.** Weekly Reset (PRD WF-06) is its own milestone, M3, in the first alpha. It works with no calendar and no AI. AI suggestions in the session arrive in M5; delegating from the session arrives in M6.
3. **A working app replaces the fake-data prototype.** Phase B is now the private household alpha. Synthetic fixtures remain for tests only.
4. **Engineering and security gates replace market gates** (G0–G7 in the plan). Each real-world step (first deploy, first real calendar, first real LLM call, first real vendor email) still needs your approval.
5. **Success is measured by our own use:** sustained use by both adults, coverage, on-time completion, a weekly mental-load check-in, time saved, the WF-06 four-week Weekly Reset review, and zero trust failures.
6. **Single household first.** No billing, onboarding, sign-up or SaaS admin. `household_id`, row-level security, invites and export keep later expansion cheap.
7. **Kept as references:** the competitor research (for UX patterns and data-terms limits), the technical evaluation (requirements R1–R8) and the framework stance (no framework needed now, adoption kept open).

## Repository state

- `fullcarts89/FamilyOS` is **private**. It was made private before the first push, on your approval.
- `main` holds the three input files. PR #1 (`phase-a/research`) holds Phase A plus these revisions, on top of your PRD commit `58a5435`. The PRD is not modified by any of my commits.
- No application code has been written.

## Decisions requiring your approval (5)

### 1. Product contract and success measures

**Question:** Do you approve the revised product contract?
- Personal-use first.
- The full integrated vision.
- Three core experiences: Today, Weekly Reset and Delegate.
- Success measured by our household's sustained use (contract §6), including the WF-06 four-week review.

- **Recommendation:** Yes.
- **Trade-off:** dropping market validation means we learn nothing yet about other families. That evidence is only needed if commercialization comes up, and the Phase A market research is kept for that moment.

### 2. Build plan and stop points

**Question:** Do you approve Phase B as M0–M3?
- M0: repo foundation.
- M1: household foundation and security.
- M2: Today and the daily core.
- M3: Weekly Reset.

It takes about 13–15 working days. Daily use starts at G2; the first real Weekly Reset follows G3. Then I stop for your review before Phase C (M4 schedules, M5 AI assist, M6 Delegate, about 13–16 more days).

- **Recommendation:** Yes.
- **Trade-off:** Delegate, the most distinctive part, comes after Weekly Reset rather than first. Delegate needs the full approval-and-outbox safety suite (G6) before any real send. Today and Weekly Reset give daily value without that risk. M4–M6 can be reordered after Phase B if our household needs Delegate sooner.
- **Before M2:** you list our real routines, projects, maintenance and how our weekly planning works today, so the build follows real workflows (plan §2).

### 3. Hosting and spending

**Question:** Which hosting do you approve?
- **(a)** Supabase Pro ($25/month, daily backups) plus Railway Hobby ($5/month). About $31–36/month, plus a domain (about $10–20/year).
- **(b)** A $0 home-server setup reached only through Tailscale, where we own backups and uptime.

Also: do you approve Apple Developer ($99/year) if we're on iPhones, and a monthly LLM cap (I propose $10) from M5?

- **Recommendation:** (a), because managed backups and uptime matter for real household data. Apple Developer only if we use iPhones. You create each paid account yourself; I never enter payment details.
- **Trade-off:** (b) costs nothing, but a dead home machine means a dead household system.

### 4. Stack and real-data rules

**Question:** Do you approve the stack and these data rules?

**Stack** (ADR-001, unchanged):
- TypeScript monolith, Expo, Supabase Postgres through our API only.
- Our own state machines, approvals, outbox and evidence.
- Graphile Worker.
- No agent framework needed now, with adoption kept open.

**Data rules:**
- **Children:** our children appear as named members without accounts. Only what a workflow needs is stored, and names are replaced with tokens before LLM calls where possible. This replaces the brief's "no production child data" rule, which assumed a commercial pilot.
- **Calendars:** read through each adult's private iCal feed, with no Google OAuth. OAuth testing mode would expire tokens every 7 days.
- **External channels:** Postmark relay email with per-thread reply addresses, plus a manual hand-off path. No mailbox reading, AI voice, SMS or browser automation.

- **Recommendation:** Yes.
- **Trade-off:** iCal feeds are read-only, and FamilyOS polls them on a schedule (about every 15–30 minutes). Look Ahead can therefore lag a same-day calendar change, so each feed's refresh time is shown. Calendar apps that subscribe to FamilyOS's outbound feed set their own refresh rate, which we don't control. Feed availability for each of our calendar accounts gets confirmed in M4.

### 5. Clean-room rule

**Question:** Do you approve the clean-room rule? Under it, nobody, and no AI coding assistant, works on FamilyOS with GPL or AGPL source (nanoMuse, Donetick, Mealie, HomeBox) in context. Those projects are used only through written pattern descriptions.

- **Recommendation:** Yes.
- **Trade-off:** none material. It matters most for chores and home records, where the closest open-source references are AGPL.

## Also needs you (not decisions)

- Which phones we use: iPhone, Android or both. This affects decision 3.
- The workflow list before M2 (decision 2).
- Optional: the getohai.com footer check is now only relevant to the archived market research.
- **Disclosure (unchanged):** during Phase A demand research, one automated request to the SEC's EDGAR company lookup carried your account email address in its User-Agent header. Nothing else personal was sent anywhere.

## What happens on approval

- Build M0–M3 as one PR per milestone against `main`, each with its gate tests.
- Ask your approval at G2 before the first private deploy.
- Stop after G3, once the first real Weekly Reset has happened, for your review before Phase C.
