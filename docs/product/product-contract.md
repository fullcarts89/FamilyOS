# FamilyOS product contract: north star vs launch wedge

**Date:** 2026-11-07 (added after founder review of PR #1)
**Status:** The north star is the founder's product definition and is not up for Gate 0. The launch wedge is a hypothesis that Gate 0 and Gate 1 test.

Phase A research narrowed **where FamilyOS launches**. It did not narrow **what FamilyOS is**. This document keeps the two apart so that a launch choice is never read as a product redefinition.

## 1. North-star product contract (long-term, stable)

FamilyOS is a **shared AI chief of staff for household responsibilities**. In the PRD's words: "Tell FamilyOS what needs handling. It remembers, coordinates and moves it forward."

The long-term product covers all of the following (PRD §2 jobs, §4 IA, WF-01 to WF-05):

| Area | What it means | PRD reference |
|---|---|---|
| Capture and triage | Natural language, photos and documents become structured work | WF-01 |
| Chores and routines | Recurring responsibilities with owners, rotation, skip and pause | WF-02 |
| Calendars and schedules | Shared view of who is doing what, when | §4 Family |
| Family coordination | Two or more adults (and limited caregivers) splitting, handing off and tracking work | WF-05 |
| Home management | Rooms, assets, vendors, warranties, maintenance history | §4 Home |
| Household memory | Cited answers about the household's own past | WF-04 |
| Agentic execution | Research, outreach and follow-up with third parties, under explicit approval | WF-03 |

**Invariants that hold for every area and every release:**

- One shared household, with roles and permissions on every object.
- A deterministic control plane: state, schedules, permissions and approvals are software rules, never model judgments.
- Human approval for anything external or consequential.
- Evidence, not assertion: nothing is "complete" without a receipt or a human confirmation.
- Household-owned data: exportable, deletable, isolated per household.

## 2. Launch wedge (short-term, a hypothesis to test)

The wedge is the **first workflow** FamilyOS has to be clearly better at, so that households adopt it, keep using it and invite their partner. It is chosen by evidence and can change without changing the north star.

**Candidate wedges for Gate 0 and Gate 1:**

| Candidate | Strength in the research | Weakness in the research |
|---|---|---|
| **A. Home-service coordination** (find, contact, follow up, verify) | The clearest gap no competitor documents end to end: multi-adult approval plus durable vendor threads plus a verified home record | Low frequency (a few hires a year); crowded at each single step; email reply rates unknown |
| **B. Shared chores and routines** | High frequency; habit-forming; no agent cost | Crowded with free and cheap apps (Cozi, OurHome, Tody, Sweepy); differentiation is weaker |
| **C. Two-adult weekly coordination** (handoffs, who-owns-what, "Needs you") | Addresses the mental-load imbalance in the demand research; drives partner invites | Unproven willingness to pay; overlaps with calendars |
| **D. Unified household system** (A + B + C in one place) | Matches the north star; frequency from B and C, differentiation from A | Larger build; harder to explain in one sentence |

**Phase A's evidence-based lean** is A as the differentiating hero inside D, with B and C providing frequency. That lean is not a decision. Phase B tests all four (implementation plan §1). Gate 0 interviews ask which one households would use weekly and pay for (interview kit, wedge questions).

## 3. What the wedge choice does and does not change

**It changes:**
- Which workflow gets polish, onboarding and marketing first.
- Which workflow the Gate 1 concierge runs end to end.
- Which integrations are built first (for A: email relay and vendor discovery).

**It does not change:**
- The data model. `work_item`, `recurrence_rule`, membership, roles, evidence and memory are household-wide from day one (ADR-001 §1). Home-service coordination is one workflow template (`home_service_v1`), not the schema.
- The roadmap. Chores, calendars, coordination, home records and memory stay in scope. They may ship in a different order.
- The positioning. FamilyOS is never positioned as a contractor concierge only.

## 4. How the wedge gets decided

- **Gate 0 (interviews with the Phase B prototype):** the rule in the interview kit compares candidates A to D on weekly use, pain and pilot commitment.
- **Gate 1 (concierge):** run the winning candidate, or two if Gate 0 is split.
- **Record the decision** in a new founder decision memo. Update this document's §2 then; §1 changes only by founder decision.
