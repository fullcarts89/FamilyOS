# FamilyOS — Competitor Feature Audit
**Research date:** 2026-11-07 | **Evidence level:** Public vendor documentation and repository listings, not hands-on authenticated product testing. “Not verified” is not “absent.”

## Feature audit and build decisions
Legend: **Y** publicly advertised; **P** partial/adjacent; **?** not verified from sources reviewed; **—** not a product focus. FamilyOS column is recommended roadmap, not implemented.

| Capability | Cozi | Ohai | HomeZada | Tody/Sweepy | AnyList | FamilyOS choice |
|---|---|---|---|---|---|---|
| Shared household membership | Y | Y | Y | P | Y | P0 |
| Shared calendar / reminders | Y | Y | P | — | — | P1 read-only integration |
| Shared tasks / to-dos | Y | Y | Y (home) | Y (cleaning) | P | P0 |
| Recurring chores | Y | Y | P (maintenance) | Y | — | P0 |
| Grocery / shopping lists | Y | P | ? | — | Y | Later |
| Recipes / meal planning | Y | Y | — | — | Y | Later |
| Email / flyer -> event extraction | Y (Max) | Y | P (docs) | — | ? | P1 |
| Home assets / inventory | — | ? | Y | — | — | P1 |
| Maintenance / repair history | — | ? | Y | P | — | P1 |
| Contractor / vendor history | — | ? | Y | — | — | P1 |
| Document -> structured action | P (events) | P (events/tasks) | Y (home tasks/projects) | — | — | P1 |
| Multi-step agent research | ? | ? | ? | — | — | P0 narrow workflow |
| External action with explicit approval | ? | ? | ? | — | — | P0 prototype / limited real |
| Durable third-party follow-up state | ? | ? | ? | — | — | **Core wedge; validate** |
| Evidence-backed real-world completion | ? | ? | ? | — | — | **Core wedge; validate** |
| Shared household permissioned agent | ? | ? | ? | — | — | **Core wedge; validate** |

**Important:** The three final rows are not claims that incumbents lack these capabilities. They identify what must be tested by installing products, inspecting help docs, and completing identical tasks.

## Competitor-by-competitor findings

### Cozi — strongest broad feature-parity threat
**Verified public claims:** Shared calendar, per-person chore lists, daily/weekly recurrence, shopping and to-do lists, recipes, meal planner, AI event import from emails/PDFs/photos, AI meal planning and recipe creation. Free / Gold $39/year / Max $79/year. Its own site reports ~399K App Store ratings. Calendar subscriptions are described as read-only.
**Incorporate:** Shared household simplicity; chore assignment; lists; calendar context; meal-to-grocery connection as later phase.
**Do not build now:** Recipe box, shopping-mode polish, full calendar replacement.
**Audit in product:** Task ownership; escalation on missed work; ability to handle external vendor outreach and verification; setup friction.
Sources: https://www.cozi.com/feature-overview/ ; https://www.cozi.com/compare-plans/

### Ohai — closest AI family coordination threat
**Verified public claims:** Shared calendars, email task extraction, chore board, per-member notifications, conflict handling; one public site describes meal planning and Instacart linkage. A public pricing page lists Free, Family $9/mo and Premium $16/mo. Note: getohai.com and ohai.ai are distinct public domains with overlapping branding; **verify entity/product relationship before treating every feature as one SKU**.
**Incorporate:** Low-friction email intake, family Today view, per-person notifications.
**Audit in product:** Autonomous outreach, durable multi-step projects, permissions and approval granularity, evidence of completion.
Sources: https://www.getohai.com/ ; https://www.getohai.com/pricing ; https://www.ohai.ai/en/features/

### HomeZada — strongest home-record competitor
**Verified public claims:** Home inventory, maintenance, projects, documents and finances; Nov 2, 2026 announcement states AI converts estimates to projects, inspections to repair tasks, and invoices to repair history.
**Incorporate:** Persistent asset/vendor/document context and issue timeline, but only after basic delegation works.
**Audit in product:** Onboarding friction; cross-family chores; agent-led external execution and evidence.
Source: https://www.homezada.com/press/homezada-launches-ai-powered-home-document-management-that-turns-paperwork-into-action

### Tody / Sweepy — specialized chores references
**Positioning to verify in hands-on audit:** Cleaning-specific routines, task frequency, household workload and progress. These are pattern references, not evidence that broad FamilyOS capabilities are missing.
**Incorporate:** Clear repeat schedules, workload visibility, lightweight completion; avoid guilt-inducing gamification.
**Audit:** Recurrence edge cases, room-based task templates, workload sharing, notification burden.
Product sites to inspect: https://todyapp.com/ ; https://sweepy.app/

### AnyList — shopping and recipe reference
**Positioning to verify in hands-on audit:** Shared grocery lists, recipe capture, meal planning and ingredients-to-shopping flows.
**Incorporate later:** Shopping list synchronization and low-friction reuse, not recipe import in v1.
Product site: https://www.anylist.com/

### Homer / HomeTend — home workflow overlap
**Public positioning from earlier discovery, requires renewed hands-on verification:** Home records, appliance identification, maintenance suggestions, photo capture and vendor/receipt management. Treat as significant direct overlap with home-memory features.
**Incorporate:** Quick asset capture and persistent service history later.
**Audit:** From issue to vendor selection to verified completion; spouse collaboration; setup burden.

### General-purpose agent platforms
Meta Muse is a proprietary execution competitor, not an open-source codebase to fork. nanoMuse is an independent GPL-3.0-or-later open-source project; treat as reference architecture unless licensing counsel clears proposed use. General agents may execute isolated tasks but must be tested on shared household state, permissions and durable follow-through.
Sources: https://github.com/nano-muse/nanoMuse ; https://github.com/nano-muse/nanoMuse/blob/main/LICENSE

## Open-source infrastructure audit (not product feature clones)
| Framework | Public license | Role | Required spike |
|---|---|---|---|
| LangGraph | MIT | Durable stateful orchestration, human-in-loop | Restart, checkpoint, timeout, approval, retry |
| OpenAI Agents SDK | MIT | Agent/tool runtime | Same benchmark and tracing comparison |
| Browser Use | MIT for library | Browser execution | Cost, reliability, auth handling, website terms |
| nanoMuse | GPL-3.0-or-later | Reference implementation | Architecture and legal review; no direct proprietary fork by default |

Sources: https://github.com/langchain-ai/langgraph ; https://github.com/openai/openai-agents-python/blob/main/LICENSE ; https://github.com/browser-use/browser-use/blob/main/LICENSE ; https://github.com/nano-muse/nanoMuse

## Mandatory hands-on competitor experiment
Use the SAME scripted tasks on Cozi, Ohai, HomeZada, and relevant specialist apps:
1. Add “We need gutters cleaned before the rainy season.” What is created? How much manual work?
2. Assign task to partner; partner edits/finishes; audit visibility and notification.
3. Create repeating HVAC filter task; skip one occurrence; check recurrence.
4. Upload contractor estimate and attach it to an issue; observe extraction and source fidelity.
5. Ask product to research vendors, draft outreach, send after approval, track response and confirm completion. Distinguish unsupported, simulated and real actions.
6. Search “Who fixed the dishwasher last year?” with source documents.
7. Remove caregiver access; verify old sensitive records are inaccessible.
8. Export/delete household data and evaluate setup/offboarding burden.

Record: screenshots you own, exact version/date, clicks, elapsed time, success/failure, friction, pricing/paywall, privacy claims, and whether actions were actually completed. Do not claim missing functionality solely because marketing pages omit it.

## Research gaps
- No authenticated hands-on tests completed.
- No validated customer complaint frequency or paid conversion data.
- No proven distribution channel or retention model.
- Ohai brand/domain relationship and exact feature entitlements need verification.
- Homer/HomeTend, Tody/Sweepy, AnyList require deeper first-party feature and pricing review.
- Agent frameworks require actual integration benchmarks and dependency/license audit.
