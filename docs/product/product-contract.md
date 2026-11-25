# FamilyOS product contract

**Date:** 2026-11-07
**Revision:** 3. Personal household operating system for our family first; commercialization optional and deferred. Aligned with PRD v0.3 (Weekly Reset WF-06; meals WF-07; templates WF-08; calendar writes WF-09; proactive assistance WF-10).

## 1. What FamilyOS is

FamilyOS is a **shared AI chief of staff for one household's responsibilities**. It is built first for two adults managing a family together. In the PRD's words: "Tell FamilyOS what needs handling. It remembers, coordinates and moves it forward."

**Objective:** reduce the work it takes to run our household. FamilyOS is not meant to maximise app engagement. If it quietly handles responsibilities and we rarely need to open it, it is succeeding.

**Commercialization** is a possible later outcome, considered only if the product proves valuable in sustained real use. Nothing is built for it now.

## 2. Three core experiences

| Experience | Question it answers | PRD |
|---|---|---|
| **Today** | "What needs me now, and what's handled?" Daily coordination and execution | §3, §4 |
| **Weekly Reset** | "What did we decide this week, and who owns what?" A guided 15–20-minute session for both adults: Look Back → Look Ahead → Decide → Assign → Delegate → Commit, then a midweek progress view | WF-06 |
| **Delegate** | "Can FamilyOS move this forward for us?" Research, drafts and outreach, with every external step approved | WF-03 |

Weekly Reset is a core entry point, not a calendar view. It works without any calendar connection or AI. It is a view over canonical records, never a second task list.

Meals, lists, templates and proactive suggestions surface **inside** Today and Weekly Reset. They are not separate apps.

## 3. Feature coverage

**P0** is required for the first usable household alpha. **P1** is a near-term enhancement. **P2** is a later capability. Milestones are defined in `docs/plan/implementation-plan.md` §1.

| Capability | Priority | Milestone | Notes |
|---|---|---|---|
| Household, two adults, invites, roles, tenant isolation | P0 | M1 | Public sign-up disabled |
| Audit log, export, backups, private deploy | P0 | M1, M4 | Restore tested before real use |
| Inbox and quick capture (manual text and photo) | P0 | M2 | AI extraction arrives in M13 |
| Tasks and projects with subtasks | P0 | M2 | One canonical WorkItem model |
| Today | P0 | M2 | Each later milestone adds to it |
| Chores and routines: rotation, skip, swap, pause, after-completion | P0 | M3 | Includes home-maintenance routines |
| Assignment | P0 | M2 | Owner on every item |
| Handoffs, caregiver scope, comments | P0 | M5 | No owner change without acceptance |
| Manual events (family logistics without a calendar) | P0 | M5 | Feeds Look Ahead |
| Notifications: push, digest, quiet hours | P0 | M5 | Low-noise defaults |
| Attachments (photo, PDF) | P0 | M5 | Allow-list and re-encoding |
| **Weekly Reset, manual** (WF-06 steps 1–4 and 6) | P0 | M6 | Criteria 1–6 and 8–10 |
| Calendar read (iCal feeds) | P1 | M7 | Read-only, per adult |
| Home records: assets, vendors, warranties, maintenance log, documents | P1 | M8 | Attached to projects |
| Household memory: structured and full-text search | P1 | M8 | Cited AI answers in M13 |
| Reusable templates and checklists | P1 | M9 | Generate ordinary projects and tasks |
| Meals, grocery and supplies lists | P1 | M10 | Adds a Meals step to Weekly Reset |
| Proactive assistance, rule-based: signals, auto-prepared agenda, digest | P1 | M11 | Every signal cites records |
| Approval, outbox and sender control plane | P1 | M12 | Requirements R1–R8; reused by M14 and M15 |
| AI assist: capture, cited memory answers, Weekly Reset AI follow-through | P1 | M13 | WF-06 step 5 and criterion 7 |
| **Delegate**: contractor coordination plus manual hand-off | P1 | M14 | Relay email; first real send needs approval |
| Calendar writes with approval | P2 | M15 | Architecture ready from M12 |
| AI-ranked proactive recommendations | P2 | later | Over the M11 signals |
| Recipe import, meal suggestions | P2 | later | Editable proposals only |
| Email forwarding into the inbox | P2 | later | Opt-in, narrow |
| More delegation workflows (childcare outreach, appliance service) | P2 | later | Each needs its own template and tests |
| Child logins, pantry inventory, grocery delivery, purchases, payments | Not planned | — | Needs a separate safety decision |

## 4. One coherent model

Every capability is a view or a thin layer over the same household records.

| Record | Used by |
|---|---|
| `WorkItem` (task, project, routine occurrence, issue) | Today, Weekly Reset, templates, Delegate, proactive signals |
| `RecurrenceRule` | Chores, maintenance, recurring supplies on lists |
| `HandoffRequest` | Today, Weekly Reset assignments |
| `WeeklyPlan`, `WeeklyDecision` | Weekly Reset; decisions create or link WorkItems |
| `List`, `ListItem` | Shopping and supplies; meal-generated groceries |
| `Meal`, `MealPlanEntry` | Weekly Reset Meals step; feeds list proposals |
| `Template`, `TemplateInstance` | Generates projects and WorkItems |
| `Event` (manual or imported) | Look Ahead, conflicts, signals |
| `Asset`, `Vendor`, `Source` | Home, memory, Delegate |
| `Signal` | Proactive suggestions; each cites the records above |
| `AgentRun`, `Approval`, `ExternalAction`, `Evidence` | Delegate, calendar writes, any external action |

No capability keeps its own copy of another's status. Search, audit, export and permissions work the same way across all of them.

## 5. Invariants (hold in every release)

- **Shared and permissioned:** every object has a household, an owner, a visibility and an audit history.
- **Deterministic control plane:** state, schedules, permissions and approvals are software rules, never model judgments.
- **Approval-gated external actions:** nothing leaves the household (an email, a calendar event, a booking, a shared detail) without an explicit approval of the exact content.
- **Durable workflow state:** a restart, deploy or crash never loses or duplicates work.
- **Evidence-backed completion:** nothing is "complete" without a receipt or a confirmation from one of us.
- **Grounded proactivity:** a suggestion always cites the records it came from. AI never acts on its own.
- **Privacy and minimal data:** collect only what a workflow needs; children have no accounts; data can be exported and deleted.
- **Auditability:** every change and every agent step is recorded and visible to the adults.

## 6. Scope boundaries

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
- A recipe manager, pantry inventory, grocery delivery or a calendar replacement.

## 7. How success is judged

FamilyOS succeeds when running our household takes less work. **Daily usage is not a goal.** We record no daily-active or streak targets.

| Criterion | How we observe it |
|---|---|
| Both adults find it useful and return voluntarily | Monthly two-minute review: each adult rates usefulness 1–5 and names what they'd miss |
| Weekly planning becomes easier | Weekly Reset duration and a one-tap "easier / same / harder" after each session (WF-06 criteria 9–10) |
| Fewer commitments are forgotten | Items that went overdue unnoticed, compared with a baseline we record before real use starts |
| Responsibilities are clearly owned | Open items without an owner, and handoffs left pending more than 2 days |
| Projects progress with less manual follow-up | Stalled projects (no activity in 14 days); follow-ups prompted by FamilyOS rather than by us |
| AI delegation saves meaningful time | For delegated tasks: our active minutes (logged) against our own estimate of doing it by hand |
| Less coordination overhead than our current methods | Monthly self-rating against the pre-FamilyOS baseline |
| Trust | Unapproved external actions, false completions, data exposure, data loss: **zero**, always |

**Baseline:** before real use starts (at M4), each adult spends five minutes answering the same questions about how things work today.

**Reviews:** after four Weekly Resets (WF-06 criterion 10), then monthly. A review that shows more overhead than before blocks new features until it is fixed.

## 8. Phase A research: how it is used now

- **Competitor research** is a design reference: UX patterns worth adopting, gaps to avoid, and the data terms that constrain us (`docs/research/competitor-matrix.md`).
- **Technical evaluation** sets the architecture requirements R1–R8 (ADR-001 §3.2).
- **PRD §11 commercial gates** are historical context, per the PRD's personal-household override.
- **Market findings** (pricing, demand, willingness to pay) are kept for a possible later commercial decision. They are not gates.
- The interview and concierge kit is archived for that same later decision.
