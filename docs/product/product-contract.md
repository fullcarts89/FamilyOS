# FamilyOS product contract

**Date:** 2026-11-07
**Revision:** 2. FamilyOS is a personal-use project for the founder's own household, not a startup in commercial validation. Aligned with PRD v0.2 (commit `58a5435`), which adds Weekly Reset (WF-06) as P0.

## 1. What FamilyOS is

FamilyOS is a **shared AI chief of staff for one household's responsibilities**. It is built first for two adults managing a family together. In the PRD's words: "Tell FamilyOS what needs handling. It remembers, coordinates and moves it forward."

**Immediate objective:** a genuinely useful system that our household uses every day.

**Commercialization** is a possible later outcome, considered only if the product proves valuable through sustained real use. It is not a requirement now, and nothing is built for it.

## 2. Three core experiences

| Experience | Question it answers | PRD |
|---|---|---|
| **Today** | "What needs me now, and what's handled?" | §3, §4 |
| **Weekly Reset** | "What did we decide this week, and who owns what?" A guided 15–20-minute session for both adults: Look Back → Look Ahead → Decide → Assign → Delegate → Commit, then a midweek progress view | WF-06 |
| **Delegate** | "Can FamilyOS move this forward for us?" Research, drafts and outreach, with every external step approved | WF-03 |

Weekly Reset is a core entry point, not a calendar view. It works without any calendar connection or AI. It is a view over the canonical Work, recurrence, calendar and agent records, never a second task list. Decisions become WorkItems, handoffs stay pending until accepted, and unfinished items carry forward by reference.

## 3. The integrated vision (all in scope)

| Area | What it means for us | PRD reference |
|---|---|---|
| Capture and triage | Text, photos and documents become structured work in seconds | WF-01 |
| Weekly planning | The Weekly Reset session and saved, versioned weekly plan | WF-06 |
| Chores and routines | Recurring responsibilities with owners, rotation, skip, swap and pause | WF-02 |
| Schedules | Both adults' calendars and the household's commitments in one week view | §4 Family |
| Family coordination | Splitting, handing off and tracking work between two adults, plus a limited caregiver | WF-05 |
| Home management | Rooms, assets, vendors, warranties and maintenance history | §4 Home |
| Ongoing projects | Multi-step work that spans weeks: subtasks, notes, photos, vendors and costs | §4 Work |
| Household memory | Cited answers about our own past ("who fixed the dishwasher?") | WF-04 |
| AI delegation | Research, drafting, contractor outreach and follow-up, each external step approved by us | WF-03 |

These ship in an order set by what our household needs most (implementation plan §2). None of them is dropped. Today and Weekly Reset are in the first alpha; Delegate follows once its safety gate passes.

## 4. Invariants (hold in every release)

- **Shared and permissioned:** every object has a household, an owner, a visibility and an audit history.
- **Deterministic control plane:** state, schedules, permissions and approvals are software rules, never model judgments.
- **Approval-gated external actions:** nothing leaves the household (an email, a booking, a shared detail) without an explicit approval of the exact content.
- **Durable workflow state:** a restart, deploy or crash never loses or duplicates work.
- **Evidence-backed completion:** nothing is "complete" without a receipt or a confirmation from one of us.
- **Privacy and minimal data:** collect only what a workflow needs; children have no accounts; data can be exported and deleted.
- **Auditability:** every change and every agent step is recorded and visible to the adults.

## 5. Scope boundaries

**Optimise for:** one household, two adults, one limited caregiver.

**Keep extensible to more households later, at low cost:**
- `household_id` on every row, with row-level security.
- Invite-based membership and roles.
- Export and delete per household.
- A provider-neutral model interface.

**Do not build now:**
- Billing, subscriptions or pricing.
- Customer onboarding, self-serve sign-up or a marketing site.
- SaaS administration (admin console, support tooling, usage analytics).
- App Store listing.

## 6. How success is measured

Success is sustained use by our own household. Market demand and willingness to pay are not measures now.

| Measure | How it is collected | Target after 30 days of real use |
|---|---|---|
| Sustained adoption | Days per week each adult opens FamilyOS and acts on something (event log) | Both adults on 5 or more days a week for 4 weeks running |
| Coverage | Weekly self-estimate: share of household tasks that went through FamilyOS | 80% or more |
| Reliable completion | Routines completed on time; items marked missed (event log) | On-time rate rising, missed items falling, from the week-1 baseline |
| Reduced mental load | Weekly two-question check-in per adult, 1–5: "How much did you have to keep in your head?" and "How fair did the split feel?" | Both trending better than week 1 |
| Time saved | For delegated tasks: our active minutes (logged) against our own estimate of doing it by hand | A positive saving on most delegated tasks |
| Weekly Reset | After four consecutive sessions (WF-06 criterion 10): both adults return voluntarily; assignments made in the session are acted on; fewer forgotten follow-ups | Both adults attend 4 of 4; most session assignments done or consciously deferred; a representative plan takes 15–20 minutes |
| Trust | Unapproved external sends, false completions, cross-household data exposure, lost data | **Zero**, always |

## 7. Phase A research: how it is used now

- **Competitor research** is a design reference: what to copy as UX patterns, what to avoid, and which data terms limit us. Examples include Cozi's lack of restricted access and Ohai's capture flows (`docs/research/competitor-matrix.md`).
- **Technical evaluation** sets the architecture requirements R1–R8 (ADR-001 §3.2).
- **PRD §11 commercial gates** are historical context, per the PRD's own personal-household override.
- **Market findings** (pricing, demand, willingness to pay) are kept for a possible later commercial decision. They are not gates.
- The Gate 0 interview and concierge kit is archived for that same later decision.
