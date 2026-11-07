# FamilyOS — Competitor Matrix (replaces COMPETITOR_AUDIT.md feature audit)

| | |
|---|---|
| **Research / access date** | 2026-11-07 (every source below) |
| **Evidence level** | Public first-party docs (vendor sites, help centres, legal pages, press releases), app-store listings, and press. **No authenticated hands-on testing, no accounts, no sign-ins, no form submissions, no screenshots.** Pages were read through a fetch tool that returns summaries, so check exact wording against the live page before quoting publicly. |
| **Compiled from** | `research_notes/FamilyOS Phase A research/` — `family_organizers.md`, `home_and_chores.md`, `execution_competitors.md` — plus the original `COMPETITOR_AUDIT.md`. No new web research. |
| **Hero workflow** | "Find someone to clean our gutters and help schedule it." |

## Grading legend (CLAUDE_EXECUTION_BRIEF.md rule 4)

| Grade | Meaning here |
|---|---|
| `confirmed` | A first-party document states it. For products with no readable first-party page (e.g. Meta Muse), two or more independent reputable outlets agree; those cells say "(press)". |
| `partially confirmed` | Part of the capability, or an adjacent one, is documented; or the only source is a single secondary outlet, an ambiguous first-party page, or a page with low trust. |
| `not verified` | No public first-party statement found. **Never means absent.** Search-snippet-only claims also land here or are flagged "snippet". |
| `not supported after hands-on test` | **Unused in this document.** No hands-on tests ran, so nothing can carry this grade. |
| **vendor states not offered** | The vendor itself explicitly says the capability does not exist (e.g. Cozi FAQ: no restricted-access option [1]; Claude Duet help: cannot call or text [83]; Google Search Help: pricing calls do not book [87]). This is different from silence and is not a hands-on result. |

**Grade harmonisation.** The three note files used slightly different rules. Where `execution_competitors.md` graded a claim `confirmed` from a single secondary outlet or a search snippet (Copilot Tasks via Thurrott; Honey Homes via SF Standard; Yelp adoption via snippet of a shareholder letter; Claude Gmail connector via snippet), this matrix **lowers** it to `partially confirmed` or flags "snippet". No grade has been raised above what the notes support.

**Pages with text possibly aimed at AI agents (ignored).**
- Duckbill homepage [77]: contained a leftover authoring-style instruction about generating another grid example. Ignored; no finding depends on it.
- Tody FAQ [55]: the first fetch reported a line asking AI agents to report certain content; a second fetch said no such line exists. Unconfirmed, possibly a summariser artifact. Ignored.
- (Also logged in the notes: a Local Falcon page title carried an llms.txt pointer "for AI assistants"; treated as data only. Not cited here.)

---

## 1. Summary — biggest changes vs the original audit

1. **The competitor set shifts from family organizers to execution players.** For the gutter workflow the real competition is Duckbill, Meta Muse, Claude Duet, Google AI pricing calls / Gemini Call for Me, Alexa+, Pine AI, Yelp Assistant and Thumbtack (incl. its Claude/ChatGPT apps), not Cozi or Ohai [76][79][83][87][90][94][98][100][69]. Vendor discovery and quote-gathering are already free or near-free via Google, Yelp, Thumbtack and Angi (`partially confirmed`, no hands-on test).
2. **Ohai entity is still unresolved.** getohai.com could not be loaded by any route available to the research tooling [32]; ohai.ai is operated by Ohai.ai, Inc., Pembroke, MA [14][15][17]. All "Ohai" grades below refer to Ohai.ai, Inc. only.
3. **Ohai prices differ from the audit.** The audit's Free / Family $9 / Premium $16 (attributed to getohai.com) is `not verified`. Ohai.ai, Inc. lists $9.99 / $19.99 / $29.99 per month on the web [19] and $14.99 / $24.99 / $39.99 in the App Store [17].
4. **Ohai has `partially confirmed` third-party outreach — medical only, via a human partner.** For doctor's appointments, Ferry Health's human team calls providers, the user picks from returned options, and a dashboard tracks requested/pending/confirmed/reschedule/cancel states (post dated 2026-08-01; beta status inconsistent) [26]. No home-vendor outreach is documented. The audit's "?" cells for Ohai research/outreach/follow-up move to `partially confirmed` (scoped).
5. **Cozi figures corrected.** Max is $79/yr on Compare Plans [3] but $79.99/yr on the Max page and App Store [5][6]; App Store shows 4.8 from 403K ratings vs 399K on Cozi's site [6][4]; all AI features are Max-only and mobile-only [7]; one account holds up to 12 people [1]. **Vendor states not offered:** restricted-access roles — every member can view, add, edit and delete all data [1]. Cozi's own legal pages disagree on operating entity and deletion timing [11][12].
6. **Ollie shut down on 2026-11-06**, weeks after a $7.5M Khosla-led seed; its CEO cited competition from Muse and others plus fundraising difficulty [34]. It moves from "competitor" to "precedent".
7. **Durable follow-up is contested.** Duckbill (humans call and follow up) [76], Pine (call-outcome tracking) [98], Claude Duet (follows up on quiet email threads; waitlisted preview) [83] and Meta Muse (persistent per-user VM) [79] each claim a piece. Confidence this leg stays open on its own: **low**.
8. **Platforms gate actions with approval already.** Gemini Call for Me (tap to approve) [90], Duet (shows exactly what it will send) [83], Muse (Sentinel pauses before consequential actions) [79], Copilot Tasks (consent before sending/spending) [108]. Approval-before-send is not a differentiator.
9. **Marketplace AI hands off for the hire.** Thumbtack in Claude, TaskRabbit in Claude and Angi in ChatGPT send the user back to the marketplace to book [71][109][111]; Google pricing calls do not book (vendor states) [87]. Airtasker in ChatGPT (AU-reported) is the exception [112].
10. **What looks uncontested — and how confident.** No public documentation found, in any product, of the **combination**: (a) multi-adult household with per-member roles governing who may approve an agent's external action, (b) channel-agnostic vendor threads (email/SMS/phone) durable over days, (c) completion recorded with evidence into a household-owned, vendor-neutral home/vendor record. Confidence the combination is unclaimed: **low to moderate**, because Duckbill Household, Alexa+, Orbits (and the now-closed Ollie) have undocumented sharing models. The narrower "vendor-agnostic household project record for home services" is the most defensible residual wedge (**moderate**).
11. **Home-record apps are now named precisely and HomeZada's AI is real.** HomeZada's 2026-11-02 release is verified on its own site, with a homeowner-review step before saving [37][38]; new pricing from 2026-11-01 [39]. "Homer" = Home Owner AB (App Store id1250049341); "HomeTend" splits into two unrelated apps — HomeTend A (hometend.co, id6797340061) is the relevant one [46][51].
12. **The audit's last three wedge rows are narrowed to home-service vendors.** A general "no incumbent has outreach" claim would be wrong (Ohai medical, Duckbill, Pine, Google, Gemini).

---

## 2. Matrix A — family organizers and home-record / chore / list apps

Footnote numbers refer to §9. Thumbtack is included for its AI intake and project hub.

| Capability | Cozi | Ohai.ai, Inc. | HomeZada | Homer | HomeTend A | Tody | Sweepy | AnyList | Thumbtack AI intake |
|---|---|---|---|---|---|---|---|---|---|
| Shared household membership | `confirmed` — 1 account, ≤12 people, shared password [1] | `confirmed` — Circles [21] | `confirmed` — unlimited free invites, own logins [39] | `partially confirmed` — share documents; family FAQ unanswered [46][47] | `confirmed` — invite partner/household by link, free [51][52] | `confirmed` — Premium+ only [54][55] | `confirmed` — paid tier per 3P, conflicting [57][59][60] | `confirmed` — share by email; household plan [63][64] | `not verified` — shares pros, not household [70] |
| Roles / scoped access | **vendor states not offered** — no restricted access [1] | `partially confirmed` — Circle Lead; Basic view vs Premium edit; no caretaker scope [21][22] | `partially confirmed` — owner-only cancel; 2016 post shows no levels [39][40] | `not verified` | `not verified` | `not verified` | `partially confirmed` — parents approve kids' tasks [57] | `not verified` — per-list sharing only [64][65] | `not verified` |
| Shared tasks | `confirmed` [2][1] | `confirmed` — multi-assignee, Member View [23] | `partially confirmed` — shared property; no assignment docs [39] | `not verified` | `confirmed` [51] | `confirmed` — assign/rotate; anyone checks off [54][55] | `confirmed` — per-member schedules [57][58] | `partially confirmed` — shared lists, no due dates [66] | `not verified` |
| Recurring chores with skip/pause | `partially confirmed` — daily/weekly; skip/pause undocumented [9] | `partially confirmed` — repeat rules; skip undocumented [23][22] | `partially confirmed` — recurring checklists (Premium) [42] | `partially confirmed` — item-driven schedules [48] | `partially confirmed` — next occurrence on completion [51] | `partially confirmed` — **pause** seasonal tasks; single skip undocumented [56] | `partially confirmed` — holiday mode only per 3P [58][61] | `not verified` | `partially confirmed` — recurring reminders [70] |
| Email / document → structured action | `partially confirmed` — email/PDF/photo → calendar event only; Max; needs a date [8] | `confirmed` — docs → events, tasks, reminders, notes (estimates not specifically) [19] | `confirmed` — estimate→project, inspection→tasks, invoice→history; review before save [37][38] | `partially confirmed` — manuals auto-found; PDF scan [46] | `partially confirmed` — photo→task draft; receipt extraction (Plus) [51][52] | `not verified` | `not verified` | `partially confirmed` — recipe web import → list [62][66] | `not verified` (docs); NL/photo/voice → project summary `confirmed` [69] |
| Assets / maintenance / vendor history | `not verified` (not a documented focus) | `partially confirmed` — contacts can hold plumbers etc. [28] | `confirmed` — inventory, maintenance history, contacts, invoice contractor info [39][42][38] | `confirmed` — inventory, Timeline; vendor contacts partial [46][47][49] | `confirmed` — repair records, contact book linked to jobs; inventory not verified [51][52] | `partially confirmed` — completion reports [56] | `partially confirmed` — task history [57] | `not verified` | `confirmed` (vendors only) — "Your Team", rebooking [70] |
| Multi-step agent research | `not verified` [3] | `partially confirmed` — Explore; Assign to O scheduled lookups [24][25] | `not verified` — "help finding local service pros" unspecified [43] | `not verified` | `not verified` | `not verified` | `not verified` | `not verified` | `partially confirmed` — follow-ups, pros recommended with reasons [69] |
| External action with approval | `not verified` | `partially confirmed` — **medical only**, Ferry Health humans call; user picks [15][26] | `not verified` | `not verified` — "call a plumber?" FAQ unanswered [50] | `not verified` — user-initiated WhatsApp only [52] | `not verified` | `not verified` | `not verified` | `partially confirmed` — user confirms summary, user contacts pros, books in app [69] |
| Durable third-party follow-up | `not verified` | `partially confirmed` — **medical only**, status dashboard [26] | `not verified` — estimate-vs-invoice cost tracking only [38] | `not verified` | `partially confirmed` — "needs booking" state [52] | `not verified` | `not verified` | `not verified` | `partially confirmed` — project hub, messaging, AI summaries [69] |
| Evidence-backed completion | `not verified` — check-off only [2] | `not verified` — booking confirmed / "done" message; no proof artifact [26][23] | `partially confirmed` — receipts/photos/docs saved with completed tasks [43] | `partially confirmed` — photos, receipts on timeline [49] | `partially confirmed` — photos, receipts, costs, who did it [51] | `partially confirmed` — check-off credit only [54] | `partially confirmed` — parent approval of kids' tasks [57] | `not verified` | `not verified` |
| Export / delete | `partially confirmed` — self-serve household delete, 2-week grace; export thin [1][11][12] | `partially confirmed` — rights by emailing support; no self-serve [14] | `partially confirmed` — inventory Excel/zip/PDF; deletion undocumented [45][41] | `partially confirmed` — AI data deletable; export undocumented [50] | `confirmed` — PDF/CSV export (Plus); in-app/web delete ~24h [52][53] | `not verified` | `not verified` | `partially confirmed` — delete documented; export undocumented [67][68] | `not verified` |
| Revoke member access | `confirmed` — remove member + reset shared password; nothing on data already seen [1] | `not verified` [21] | `partially confirmed` — 2016 post: access can be removed [40] | `not verified` | `not verified` | `not verified` | `not verified` | `not verified` | `not verified` |

**Matrix A notes**
- Ohai Smart Ohai Sync (inbox / school-app scanning with preview-and-approve) is **waitlist/pilot**, not counted [29][24]. Instacart grocery ordering is Ohai's other documented external integration [18].
- A third-party three-week Ohai review (3.5/5) reports setup burden and a recurring automation that a human at Ohai had to build — the only hands-on account in the notes, independence unconfirmed [33].
- Cozi Chores' plan placement is ambiguous (Free per feature overview [2]; not stated in Chores post [9]).
- HomeZada sharing evidence (roles, revoke) is a **2016** post [40]; no current help article was found. HomeZada iOS app last updated 2022-05-27 [41] — likely web-first.
- Tody: free plan described as one person yet assignment/rotation listed on all plans [54][55] — unresolved.
- Thumbtack AI experience: **testing nationwide, full launch planned for 2026** [69].

---

## 3. Matrix B — execution competitors

Status key: **LIVE**, **PREVIEW**, **WAITLIST**, **BETA**, **ANNOUNCED** (not confirmed live), **SHUT DOWN**.

### B1

| Capability | Duckbill | Meta Muse | Claude Duet | Google — AI pricing calls (Search) / Gemini Call for Me | Alexa+ | Pine AI |
|---|---|---|---|---|---|---|
| Status (2026-11-07) | LIVE — plans on sale [76] | LIVE — launched 2026-09-08 (press) [79][81] | **PREVIEW + WAITLIST**, US [83] | Search: LIVE for listed categories; home repair **ANNOUNCED** (I/O 2026-05-19, "this summer"), completion not verified [87][88]. Gemini: **BETA / experiment**, gradual [90][91] | LIVE (US) [94]; Angi/Yelp integrations **ANNOUNCED** "coming in 2026" [95] | LIVE per vendor pages [98][99] |
| Contacts third parties for the user | `confirmed` — 200+ human operators call, negotiate, follow up [76] | `confirmed` (press) — "negotiates on your behalf", fills forms [79][80][81] | `confirmed` — sends email from connected accounts [83] | `confirmed` — Search calls multiple providers [87]; Gemini calls businesses for quotes/availability [90] | `partially confirmed` — "schedule services such as home repairs"; mechanics undocumented [94][95] | `partially confirmed` — calls contractors; batch outreach to 5/10/20 providers [98][99] |
| Approval before send/book | `not verified` [76][77] | `confirmed` (press) — Sentinel pauses before consequential actions [79] | `confirmed` — shows exactly what before send/pay/sign/delete [83] | Gemini `confirmed` — summary + tap to approve [90]; Search `not verified` | `not verified` | `partially confirmed` — plan preview; approve/edit/pause/take over [98] |
| Tracks replies over days | `confirmed` — follow-up + real-time updates [76]; statuses In progress/Scheduled/Snoozed/Completed `partially confirmed` (2024) [78] | `partially confirmed` — persistent VM keeps working after close; vendor-reply tracking not stated [79] | `confirmed` — follows up on quiet threads; checks every few hours [83][84] | `not verified` — Search emails quotes in ~30 min (one-shot) [87]; "information agents" background updates for AI Pro/Ultra `partially confirmed` [88] | `partially confirmed` — keeps context over days (not vendor threads) [94] | `partially confirmed` — tracks call outcomes, schedules follow-up calls [98] |
| Channel | Phone (humans); intake by app/text/email [76] | Web/forms/email; WhatsApp as interface; phone `not verified` [79] | Email only — **vendor states not offered**: phone, text [83] | Phone; results by email (Search) / transcript (Gemini) [87][90] | Voice/app via partners; `not verified` | Phone [98] |
| Books | `partially confirmed` — "Scheduled" state; can buy with stored card (2024) [78] | `partially confirmed` (press) — books travel; home services not stated [79] | `not verified` | Search: **vendor states not offered** — you contact provider [87]. Gemini: `confirmed` — books/confirms/manages appointments [90] | **ANNOUNCED** — Yelp booking "coming in 2026" [95]; Thumbtack end-to-end booking snippet only [97] | `not verified` |
| Completion evidence | `not verified` — "Completed" status only (2024) [78] | `partially confirmed` (press) — audit trail for every action [79] | `partially confirmed` — only the user can mark a task complete [83] | Gemini `partially confirmed` — transcript + recording in Phone history [90] | `not verified` | `not verified` |
| Household / multi-user with roles | Household = **2 member accounts** `confirmed`; roles `not verified` [76] | Per-user isolated VMs, agents can't reach each other (press, stated design); no household feature described [79] | `not verified` (no multi-user described) [83] | `not verified` | Whole household covered, family calendar `confirmed`; per-member permissions `not verified` [94] | No household plan on pricing page [99]; roles `not verified` |
| Price | $49 / $99 / $169 / $350 per mo [76] | Free / $20 / $100 per mo (Axios) [81] | No extra cost during preview; needs Pro/Max/Ultra [83] | Search: no price stated [87]; Gemini: paid Google AI plan required [90] | Free with Prime; $19.99/mo without [94] | $99.9 / $174.9 / $291.6 per mo, billed annually [99] |
| Availability / geography | Not stated; testimonials Chicago, SF, Denver, NYC [76] | US, 18+, iOS/Android/web/WhatsApp [79] | US [83] | US, 18+, signed in [87]; Gemini: Pixel 11, US SIM, Phone by Google beta, English [90] | US, everyone; free-for-Prime from Feb 2026 [94] | Not stated; English-only per developer listing (`not verified`) |

### B2

| Capability | Yelp Assistant | Thumbtack (own AI + Claude/ChatGPT apps) | Honey Homes / Casa | Orbits ("Bit") / Ollie | Microsoft Copilot Tasks |
|---|---|---|---|---|---|
| Status (2026-11-07) | LIVE (US) [100]; "Check for Me" calling **ANNOUNCED** 2026-10-20, restaurants only, iOS [103] | Own AI: **testing nationwide**, full launch planned 2026 [69]. Claude app: LIVE, US [71]. ChatGPT app: **ANNOUNCED** 2025-10-06, live status `not verified` [73] | LIVE in listed metros [104][106] | Orbits: LIVE per press release only [107]. Ollie: **SHUT DOWN 2026-11-06** [34] | **PREVIEW + WAITLIST** as of 2026-02; current status `not verified` [108] |
| Contacts third parties for the user | `partially confirmed` — Request-a-Quote broadcast to several businesses in-platform (not agent email/calls) [100] | `not verified` on user's behalf — user contacts pros [69]; Operator (2025) could contact/hire `partially confirmed` [74] | Own labor; Casa "manages the logistics" for extra jobs `partially confirmed` [104][105] | Orbits: requests home-service quotes, coordinates providers `partially confirmed` [107]. Ollie: appointments, payments `partially confirmed` [36] | `partially confirmed` — sends email, contacts businesses (single outlet) [108] |
| Approval before send/book | `not verified` | `partially confirmed` — user confirms summary; user chooses whom to contact [69] | `not verified` | `not verified` | `partially confirmed` — consent before sending or spending [108] |
| Tracks replies over days | `partially confirmed` — replies land in Yelp inbox; consumer tracking not stated [100] | `partially confirmed` — project hub with AI conversation summaries [69] | `not verified` | `not verified` | `not verified` |
| Channel | In-platform messaging [100] | In-platform messaging; private phone number [69] | n/a (own technicians) | Orbits: browser, texts family [107]. Ollie: group chats, cloud-browser links [36] | Email, cloud browser [108] |
| Books | `partially confirmed` — restaurants, Vagaro, Zocdoc, RepairPal; Calendly for pros "later in the summer" [100] | `partially confirmed` — user books in app [69]; Claude app hands off to Thumbtack to hire [71] | `not verified` (mechanics undescribed) | Orbits: books reservations, reschedules `partially confirmed` [107] | `partially confirmed` — books showings [108] |
| Completion evidence | `partially confirmed` — business-side labels up to "completed" [100] | `not verified` | `not verified`; Yahoo questions whether Casa can prove quality [105] | `not verified` | `not verified` |
| Household / multi-user with roles | `not verified` | `not verified` [70] | `not verified` | Orbits: "shared layer", texts family; roles `not verified` [107]. Ollie: data shared among authorised family members; roles `not verified` [36] | `not verified` |
| Price | Not stated in notes | Not stated in notes | Honey Homes $2,000–$4,750/yr prepaid; Casa $199/mo incl. 1.5 h [104][105] | Not stated | Not announced [108] |
| Availability / geography | US, iOS/Android [100]; Assistant ≈10% of RAQ projects Q2 2026, down from ≈15% Q1 (snippet of shareholder letters) [101][102] | US (Claude app: Free/Pro/Max) [71] | Honey Homes: 5 markets, mostly Bay Area [104]. Casa: Bay Area, LA, Austin from late Sep 2026 [106] | Orbits: iOS/Android; orbits.ai is a for-sale page [107]. Ollie: n/a | Not stated |

**Matrix B notes**
- Meta Muse cells are press-only (no first-party Meta page in the notes). A competitor's breakdown says untrusted content "taints" a run and revokes autonomous egress — `partially confirmed`, 3P-rival [82].
- Field data on Google AI pricing calls (call-analytics vendor, Jul–Nov 2025 data): 26% unanswered; 49% of answered calls gave no price; home services worst because pros need a site visit [92]. This suggests home-service quotes rarely resolve in one call (inference).
- Also reachable from Claude: TaskRabbit (US, 2026-04-23; hands off for booking) [109] and Duckbill via MCP [77]. Angi app in ChatGPT live 2026-03-04 (press mirror) [111]. Airtasker: end-to-end booking inside ChatGPT, AU-reported [112]. TaskRabbit has proof-of-completion forms for IKEA tasks only [110].
- A third-party hands-on test (PCWorld, 2026-04-29) found Claude's Resy flow needed raw tool-call approval and a hand-off, and ChatGPT Agent picked the wrong party size on OpenTable [86]. Not a FamilyOS test.

---

## 4. Scripted scenario table (8 audit scenarios)

Public-documentation grade only. **Every cell needs a hands-on test**; the right-hand column gives priority.

### 4a. Organizer and home-record products

| # | Scenario | Cozi | Ohai.ai | HomeZada | Homer | HomeTend A | Tody | Sweepy | AnyList | Thumbtack | Needs hands-on test |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Capture "gutters cleaned before rainy season" | `partially confirmed` — manual to-do [2] | `partially confirmed` — text/voice → to-do; fuzzy deadlines unaddressed [19][22] | `not verified` — checklist plan at sign-up; typed capture undocumented [42] | `not verified` | `partially confirmed` — short title + AI drafting [52] | `not verified` | `partially confirmed` — manual custom task [57] | `not verified` | `partially confirmed` — NL → project summary; "Gutter Cleaning" in upkeep guide [69][70] | Yes — high |
| 2 | Assign to partner; partner edits/finishes; audit visibility | `partially confirmed` — assignable; no change log; notifications events-only [1][10] | `partially confirmed` — assignees, Member View; no edit history [23] | `not verified` | `not verified` | `partially confirmed` — shared tasks [51] | `partially confirmed` — assign/rotate (Premium+) [55] | `partially confirmed` — shared chores; 3P says can't assign to a person [57] | `not verified` | `not verified` | Yes — high |
| 3 | Repeating HVAC filter; skip one | `partially confirmed` — chores daily/weekly; event "this date only" on a test host (snippet) [9][13] | `partially confirmed` [23] | `partially confirmed` [42] | `partially confirmed` [48][50] | `partially confirmed` [51] | `partially confirmed` — pause only [56] | `partially confirmed` — holiday mode per 3P [61] | `not verified` | `partially confirmed` — reminders [70] | Yes — **no product documents single-occurrence skip** |
| 4 | Upload contractor estimate; attach to issue; source fidelity | `partially confirmed` — → calendar event only [8] | `partially confirmed` — → events/tasks/notes [19] | `confirmed` — estimate → project, review first [37][38] | `partially confirmed` — scans contracts [46] | `partially confirmed` — receipts only [52] | `not verified` | `not verified` | `not verified` | `not verified` | Yes — source fidelity undocumented everywhere |
| 5 | Research vendors → draft → send after approval → track → confirm | `not verified` | `partially confirmed` — research yes; send/track **medical only** [24][26][27] | `not verified` [43] | `not verified` [50] | `partially confirmed` — "needs booking" only [52] | `not verified` | `not verified` | `not verified` | `partially confirmed` — research + hub; user sends [69] | Yes — **highest** (wedge) |
| 6 | "Who fixed the dishwasher last year?" with sources | `not verified` — event search only [3] | `not verified` — memory, contacts, appointments [24][28] | `partially confirmed` — invoice → repair history; doc Q&A (exact query not shown) [38] | `partially confirmed` — searchable Timeline; AI uses service history [49][50] | `partially confirmed` — "who did the work"; search undocumented [51] | `not verified` | `not verified` | `not verified` | `not verified` (adjacent: "Your Team") [70] | Yes — high |
| 7 | Remove caregiver; old sensitive records inaccessible | `partially confirmed` — remove + password reset [1] | `not verified` [21] | `partially confirmed` — removal (2016) [40] | `not verified` | `not verified` | `not verified` | `not verified` | `not verified` | `not verified` | Yes — **no product documents post-removal record access** |
| 8 | Export / delete household data | `partially confirmed` [1][11] | `partially confirmed` — by email [14] | `partially confirmed` — export yes, delete undocumented [45] | `partially confirmed` [50] | `confirmed` [53] | `not verified` | `not verified` | `partially confirmed` — delete only [67] | `not verified` | Yes — medium |

### 4b. Scenario 5 by step — execution players

| Step | Duckbill | Meta Muse | Claude Duet | Google Search calls | Gemini Call for Me | Alexa+ | Pine AI | Yelp Assistant | Thumbtack | Copilot Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| Research vendors | `confirmed` — AI research + compare contractors [76][77] | `not verified` for home vendors | `not verified` | `confirmed` — calls multiple providers [87] | `confirmed` — quotes, availability [90] | `not verified` | `partially confirmed` — batch comparison [98] | `partially confirmed` [100] | `partially confirmed` [69] | `not verified` |
| Draft + send after approval | `not verified` (approval) [76] | `partially confirmed` (press) [79] | `confirmed` (email) [83] | `not verified` (approval) | `confirmed` [90] | `not verified` | `partially confirmed` [98] | `not verified` (approval) | user sends [69] | `partially confirmed` [108] |
| Track replies over days | `confirmed` [76] | `partially confirmed` [79] | `confirmed` [83] | `not verified` (one-shot) [87] | `not verified` | `not verified` | `partially confirmed` [98] | `partially confirmed` [100] | `partially confirmed` [69] | `not verified` |
| Book | `partially confirmed` [78] | `not verified` for home services | `not verified` | **vendor states not offered** [87] | `confirmed` [90] | **ANNOUNCED** [95] | `not verified` | `partially confirmed` (not pros yet) [100] | `partially confirmed` (user) [69] | `partially confirmed` [108] |
| Confirm completion with evidence | `not verified` | `partially confirmed` (audit trail) [79] | `partially confirmed` (user marks) [83] | `not verified` | `partially confirmed` (call record) [90] | `not verified` | `not verified` | `partially confirmed` (business-side label) [100] | `not verified` | `not verified` |

Needs hands-on test: **yes, every cell.** Distinguish unsupported, simulated and real actions.

---

## 5. Pricing (all read 2026-11-07)

| Product | Tier | Price | Billing | Source | Discrepancy / note |
|---|---|---|---|---|---|
| Cozi | Free / Gold / Max | $0 / $39 / $79 | per year | Compare Plans, homepage [3][4] | Max page shows **$79.99/yr** [5] |
| Cozi (App Store) | Max; Gold | $79.99; Gold entries $39.00, $42.00, $49.99, $59.99; 1-yr Gold $29.99 | IAP | [6] | Multiple Gold prices unexplained |
| Ohai.ai, Inc. (web) | Individual Premium / Premium Plus (Duo) / Premium Group | $9.99 / $19.99 / $29.99 | per month, no annual [31] | How Ohai works [19] | Free tier: reminders, meals, lists; shared calendars and family tasks paid [20] |
| Ohai.ai, Inc. (App Store) | same tiers | $14.99 / $24.99 / $39.99 | IAP | [17] | **$5–$10/mo above web** |
| getohai.com (per old audit) | Free / Family / Premium | $0 / $9 / $16 | per month | [32] — unreachable | `not verified`; do not merge with Ohai.ai |
| HomeZada | Essentials / Premium / Deluxe | $0 / $118 or $21.98 / $218 | yr; Premium also mo | Pricing [39] | From 2026-11-01; was $99 / $15.95 / $189 [38]; HomeLight blog still shows $99 (stale) |
| HomeZada add-ons | extra property / 300 AI credits / Zada File / buyer transfer | $98 / $25 / $75 / $99 | yr / one-off | [39] | Non-refundable; only owner cancels |
| Homer | IAPs | $4.99, $6.99, $9.99, $36.99, $49.99, $69.99; "One more home" $9.99 | **periods not shown** | App Store [46] | $179 lifetime (snippet); $5/mo (AlternativeTo, 3P) |
| HomeTend A | Plus / Plus Annual | $5.99 / **$49** (web) vs **$49.95** (App Store) | mo (inferred) / yr | [52][51] | Web vs App Store conflict |
| Tody | Premium / Premium+ Duo / Family (6) / Team (12) | $9.99 / $25 / $40 / $80 (web) vs $9.99 / $24.99 / $39.99 / $79.99 (App Store) | per year | FAQ [55]; App Store [56] | Rounding difference; 30-day trial |
| Sweepy | Premium | $3.99 / $19.99 | mo / yr | App Store [58] | Common Sense lists $2.49 / $12.99 (stale, 2020) [60]; free-tier household limits conflict [59][60] |
| AnyList | Complete individual / household | $9.99 / $14.99 | per year | [62] | — |
| Duckbill | Essentials / Individual / Household / Household Plus | $49 / $99 / $169 / $350 | per month | Pricing [76] | Team unlisted; credits reset monthly; "70 credits ≈ 8–12 tasks" snippet only |
| Meta Muse | Free / two paid | $0 / $20 / $100 | per month | Axios [81] (3P) | No first-party price page in notes |
| Claude Duet | Preview | no extra cost; needs Pro, Max or Ultra | — | [83] | Counts against usage limits |
| Alexa+ | with / without Prime | $0 / $19.99 | per month | About Amazon [94] | Covers whole household |
| Pine AI | Plus / Max / Team | $99.9 / $174.9 / $291.6 | per month, **billed annually** | [99] | No household plan |
| Honey Homes | Starter–Plus | $2,000–$4,750; Busy Home $3,500 / 35 h | per year, prepaid | SF Standard [104] (3P) | ≈$100/h effective; materials extra |
| Casa | Membership | $199 incl. 1.5 handyman h | per month | [104][105] (3P) | Extra jobs billed separately |
| Gemini Call for Me | — | paid Google AI plan required | — | [90] | Plan price not in notes |
| Google Search pricing calls / Copilot Tasks / Orbits / Yelp / Thumbtack consumer | — | not stated / not announced | — | [87][108][107] | — |

Derived (arithmetic, not vendor-stated): Ohai Duo on web = $239.88/yr, about 3× Cozi Max ($79/yr).

---

## 6. Precedents — failed or pivoted

| Company | Outcome | Cited reason | Grade / source |
|---|---|---|---|
| Fin | Consumer human+ML assistant (~$1/min) pivoted to B2B workplace analytics ~late 2018 | Human labor capital-intensive and hard to scale; nothing raised after $30.75M Series A (2016) | `confirmed`, >12 mo [113]; price `partially confirmed` snippet [114] |
| Hello Alfred | W-2 home-manager concierge → building services → property management (RKW 2022; Quarterra merger Jun 2025; Arqline 2026, 50k+ homes) | Moved to owning operations; no consumer unit economics disclosed | `confirmed` [115][116] |
| Yohana (Panasonic Well) | US family concierge (2021) shut 2026-01-30 | "Review of the business environment"; report carries a may-include-rumor warning; domain no longer resolves | `partially confirmed` [117][119]; Panasonic Well dissolution `not verified` snippet [118] |
| Zirtual | Collapsed 2015; ~400 employed assistants laid off by email | Funding round failed | `partially confirmed`, snippet, >12 mo [120] |
| Homejoy | Shut 2015 | 25% take rate kept wages low; platform leakage (clients took cleaners offline); worker-classification suits; early international expansion | `confirmed` as analysis, >12 mo [121] |
| Ollie | Launched 2026-06-02, $7.5M Khosla seed (Sep 2026), stopped 2026-11-06; export + refunds offered | CEO cited competition from Muse, Instinct and others, and difficulty raising capital | `partially confirmed` (3P republishing TechCrunch) [34]; launch date snippet [35] |

Implication carried from the notes (inference): avoid humans in the default loop; keep vendor-quality liability with the vendor/marketplace; platform leakage favours a vendor-agnostic, household-owned record.

---

## 7. Hands-on audit protocol (founder or contractor task)

FamilyOS research tooling **must not create accounts or sign in**, so upgrading any grade is a human task: the founder or a contractor, on their own devices and accounts, **about 1–2 days**. Paid tiers (e.g. Duckbill Household $169/mo, Pine billed annually) and any real outreach need founder approval first (brief rule 7).

**Setup**
- Two adult accounts on two physical devices (tests roles, assignment, revoke). Fake household data only; no real children's data.
- Spreadsheet log, one row per product × scenario × attempt.
- First 2 minutes: open getohai.com in a normal browser and read its footer, privacy policy and terms (resolves the Ohai entity gap).

**Record for every attempt**

| Field | Example |
|---|---|
| Product, plan tier, platform/OS | Cozi Max, iOS 27.x |
| App version and test date/time | 2026.11.02, 2026-11-10 14:05 |
| Clicks/taps to finish | 11 |
| Elapsed time | 3 min 40 s |
| Paywall hit? where, price | Yes — at email import, $79.99/yr |
| Action type | **real** / **simulated** / **unsupported** / **stopped at approval screen** |
| Outcome | success / partial / fail, with friction notes |
| Evidence | Screenshots or screen recording **owned by the tester**, file names in log |
| Privacy/permission prompts seen | e.g. "grants Gmail send" |
| Proposed grade change | `not verified` → `confirmed` / `not supported after hands-on test` |

**Rules for changing a grade**
- `confirmed` only when observed working in-product.
- `not supported after hands-on test` only after trying the obvious path **and** searching the in-app help, with app version and date recorded. Silence on a marketing page is never enough.
- For scenario 5, stop at the final send/book screen unless the founder actually wants gutter service; if anything is sent, tell the vendor honestly and log it as **real**.
- Scenario 7: after removing the second adult, sign in on their device and check whether previously viewed records, documents and agent history remain visible.

**Suggested order (threat to the wedge first):** Duckbill Household → Ohai.ai → Thumbtack AI → Claude Duet (if off waitlist) → Meta Muse → Google Search calls / Gemini (if eligible) → Alexa+ → Cozi Max → HomeZada → HomeTend A → Tody/Sweepy.

---

## 8. Open gaps

- **No hands-on tests** of any product; all grades are public-document grades.
- **Ohai entity:** getohai.com legal entity, footer, pricing not read; WHOIS/DNS not run; LinkedIn returned 403; Massachusetts registry not checked [32].
- **Ohai:** member removal, export steps, Circle-member limits per tier; whether the medical outreach model extends to home vendors [26].
- **Cozi:** to-do recurrence (Getting Started guides unread); Chores plan placement; conflicting entity (OurFamilyWizard, LLC vs Cozi, Inc./In Tandem) and deletion timing (14 days vs 2 weeks vs 28 days) [11][12]; Google Play prices unread.
- **Duckbill:** approval step, how 2-member Household accounts share state and roles, geography, credits-per-task [76].
- **Alexa+:** per-member profiles/permissions; real end-to-end home-repair booking; whether Angi/Yelp integrations are live [94][95].
- **Google:** whether US-wide home-repair calling completed and whether gutter cleaning is in scope [87][88]; contractor-blog claim of rollout is snippet-only [93].
- **Thumbtack:** ChatGPT app live status [73]; project-hub status states; household sharing; Claude release date conflict (2026-04-23 per Thumbtack press [71][72] vs a 2026-04-30 BusinessWire item seen only as a 403/snippet [75]).
- **Meta Muse:** phone calling; any household feature; first-party pricing.
- **Copilot Tasks:** general availability since Feb 2026. **Gemini Spark:** email/booking status.
- **Pine, Orbits:** geography; Orbits approval model, price and real domain.
- **Homer:** legal entity beyond "Home Owner AB", billing periods, family-sharing answer. **HomeTend A:** murky entity (individual seller; © iTime Marketing Inc.; policies name no entity).
- **Sweepy:** free-tier household limits (sources conflict); holiday mode first-party docs. **Tody:** skip/snooze/export docs.
- **AnyList, Tody, Sweepy, HomeZada:** export/deletion docs incomplete.
- No first-party Google Play ratings for any app; complaint themes are anecdotal, not frequencies.
- No consumer willingness-to-pay data for a software-only Duckbill-like service; no Duckbill or Yohana unit economics.
- Magic, Athena, Handy current status: no reliable 2025–26 sources.

---

## 9. Sources

Grade key: **FP** first-party (vendor site, help, legal, press release); **FP-store** vendor's app-store listing (feature text first-party, ratings/prices are store metadata); **FP-mirror** first-party release read via a third-party mirror; **3P** press or independent; **3P-rival** a competitor's content; **3P-agg** aggregator/review site. **snippet** = seen only in a search-result summary, page not opened — weaker. Access date for all: **2026-11-07**. "pub n/a" = no publication date known.

**Cozi**
1. Cozi FAQ — https://www.cozi.com/faq/ — FP — pub n/a
2. Cozi feature overview — https://www.cozi.com/feature-overview/ — FP — pub n/a
3. Cozi Compare plans — https://www.cozi.com/compare-plans/ — FP — pub n/a
4. Cozi homepage — https://www.cozi.com/ — FP — pub n/a
5. Cozi Max page — https://www.cozi.com/cozi-max/ — FP — pub n/a
6. App Store: Cozi Family Organizer — https://apps.apple.com/us/app/cozi-family-organizer/id407108860 — FP-store — v2026.11.02
7. Cozi blog, why families upgrade to Max — https://www.cozi.com/blog/why-more-families-are-upgrading-to-cozi-max/ — FP — pub n/a
8. Cozi blog, Introducing Cozi Max — https://www.cozi.com/blog/introducing-cozi-max/ — FP — pub n/a
9. Cozi blog, Cozi Chores — https://www.cozi.com/blog/cozi-chores/ — FP — pub 2025-04-14
10. Cozi notifications help — https://www.cozi.com/how-to-manage-cozi-notifications/ — FP — pub n/a
11. Cozi terms of use — https://www.cozi.com/terms-of-use/ — FP — updated 2026-10-13
12. Cozi privacy policy — https://www.cozi.com/privacy-policy/ — FP — updated 2026-06-11
13. Cozi test-host support page — https://test-www.cozi.com/support/ — FP, **snippet**, test host (weak)

**Ohai**
14. Ohai privacy policy — https://www.ohai.ai/privacy-policy/ — FP — effective 2025-12-01
15. Ohai terms of service — https://www.ohai.ai/terms-of-service/ — FP — effective 2025-12-01
16. Ohai support — https://www.ohai.ai/support/ — FP — pub n/a
17. App Store: Ohai.ai Household Assistant — https://apps.apple.com/us/app/ohai-ai-household-assistant/id6477802468 — FP-store — v3.4.1
18. Ohai features — https://www.ohai.ai/en/features/ — FP — pub n/a
19. How Ohai works — https://www.ohai.ai/how-it-works/ — FP — pub n/a
20. Ohai homepage — https://ohai.ai/ — FP — pub n/a
21. Ohai collaboration tools — https://www.ohai.ai/features/ai-household-collaboration-tools — FP — pub n/a
22. Ohai blog, Reminders and To-Dos — https://www.ohai.ai/blog/reminders-and-to-dos/ — FP — pub 2026-07-14
23. Ohai blog, new To-Dos — https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/ — FP — pub 2026-04-29
24. Ohai blog, Meet the New O — https://www.ohai.ai/blog/meet-the-new-ohai/ — FP — pub 2026-04-17
25. Ohai blog, Assign to O — https://www.ohai.ai/blog/the-hidden-ohai-feature-that-does-your-to-dos-for-you/ — FP — pub 2026-05-05
26. Ohai blog, doctor appointment scheduling — https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/ — FP — pub 2026-08-01
27. Ohai blog, home maintenance checklist — https://www.ohai.ai/blog/how-to-create-a-home-maintenance-checklist/ — FP — pub Aug 2025 (per notes)
28. Ohai blog, family home management — https://www.ohai.ai/blog/family-home-management/ — FP — pub n/a
29. Ohai Smart Ohai Sync — https://www.ohai.ai/features/unified-family-organizer/ — FP — pub n/a (waitlist/pilot)
30. Wikipedia: Ohai.ai — https://en.wikipedia.org/wiki/Ohai.ai — 3P — pub n/a
31. Sense vs Ohai — https://getsense.ai/blog/posts/sense-vs-ohai-2026 — 3P-rival — site checked 2026-09-24
32. getohai.com (and /pricing, /privacy) — https://www.getohai.com/ — **not reachable from research tooling**; cited only as the old audit's source

**Ollie / market**
33. GBRLIFE, Ohai.ai three-week review — https://www.gbrlife.com/blog/ohai-ai-review — 3P (independence unconfirmed) — pub n/a
34. AI Weekly, republishing TechCrunch, Ollie shutdown — https://aiweekly.co/alerts/ollie-to-shut-down-nov-6-weeks-after-75m-khosla-seed — 3P — pub ~2026-11
35. American Bazaar, Ollie seed — https://americanbazaaronline.com/2026/09/08/san-diego-ai-startup-ollie-secures-7-5-million-in-seed-funding-487752/ — 3P, **snippet** — pub 2026-09-08
36. Dealroom, Ollie seed — https://dealroom.co/news/149015-ollie-lands-7-5m-seed-to-build-a-privacy-first-family-ai-assistant/ — 3P — pub 2026-09-05

**HomeZada**
37. HomeZada press, AI document management — https://www.homezada.com/press/homezada-launches-ai-powered-home-document-management-that-turns-paperwork-into-action — FP — pub 2026-11-02
38. Zen of Zada, how AI turns documents into data — https://zen.homezada.com/2026/10/27/how-ai-turns-home-documents-into-data/ — FP — pub 2026-10-27
39. HomeZada homeowner pricing — https://www.homezada.com/homeowners/pricing — FP — pub n/a
40. Zen of Zada, sharing your account with family — https://zen.homezada.com/2016/02/17/homezada-tip-sharing-your-homezada-account-with-family/ — FP — pub 2016-02-17 (old)
41. App Store: HomeZada Mobile — https://apps.apple.com/app/id473722482 — FP-store — last update 2022-05-27
42. HomeZada press, automates maintenance schedule — https://www.homezada.com/press/homezada-automates-home-maintenance-schedule — FP — undated
43. HomeZada home maintenance — https://www.homezada.com/homeowners/home-maintenance — FP — pub n/a
44. HomeZada Homeowner AI — https://www.homezada.com/homeowners/homeowner-ai — FP — pub n/a
45. HomeZada security — https://www.homezada.com/security — FP — pub n/a

**Homer (Home Owner AB)**
46. App Store: Homer — https://apps.apple.com/us/app/homer-the-home-management-app/id1250049341 — FP-store — v3.11.0 (Oct 1, year not shown)
47. homer.co — https://homer.co — FP — pub n/a
48. homer.co Home Tasks — https://homer.co/home-tasks — FP — pub n/a
49. homer.co Home Timeline — https://homer.co/home-timeline — FP — pub n/a
50. homer.co AI copilot — https://homer.co/ai-copilot — FP — pub n/a

**HomeTend A (hometend.co)**
51. App Store: HomeTend — https://apps.apple.com/us/app/hometend-ai-home-maintenance/id6797340061 — FP-store — v3.2.4 (Oct 24, 2026 assumed)
52. hometend.co — https://www.hometend.co/ — FP — pub n/a
53. HomeTend privacy — https://www.hometend.co/privacy — FP — updated 2026-08-24

**Tody**
54. todyapp.com — https://todyapp.com/ — FP — pub n/a
55. Tody FAQ — https://todyapp.com/faq — FP — pub n/a (possible agent-directed line reported, unconfirmed, ignored)
56. App Store: Tody — https://apps.apple.com/us/app/tody/id595339588 — FP-store — v6.7.0

**Sweepy**
57. sweepy.com — https://sweepy.com/ — FP — pub n/a
58. App Store: Sweepy — https://apps.apple.com/us/app/sweepy-home-cleaning-schedule/id1498897320 — FP-store — v6.2.0 (Feb 4, 2026 assumed)
59. Cubby review — https://www.cubbyathome.com/sweepy-cleaning-app-review-80044734 — 3P, **snippet**
60. Common Sense Media, Sweepy — https://www.commonsensemedia.org/app-reviews/sweepy-home-cleaning-schedule — 3P-agg — listing updated 2020-05-21 (stale)
61. AlternativeTo, Sweepy — https://alternativeto.net/software/sweepy/about — 3P-agg — user report 2024-10-28

**AnyList (Purple Cover, Inc.)**
62. AnyList Premium — https://www.anylist.com/premium (also https://anylist.com/features) — FP — pub n/a
63. AnyList help, individual vs household — https://help.anylist.com/articles/individual-household-upgrade — FP — pub n/a
64. AnyList help, share list — https://help.anylist.com/articles/share-list — FP, **snippet**-level wording
65. AnyList help, share recipe — https://help.anylist.com/articles/share-recipe — FP — pub n/a
66. App Store: AnyList — https://apps.apple.com/us/app/anylist-grocery-shopping-list/id522167641 — FP-store — v7.1
67. AnyList help, delete account — https://help.anylist.com/articles/delete-account — FP — pub n/a
68. Trustpilot, AnyList — https://www.trustpilot.com/review/anylist.com — 3P-agg — review 2025-10-08

**Thumbtack**
69. Thumbtack guide, first look at AI experience — https://www.thumbtack.com/guide/content/a-first-look-at-our-new-ai-powered-experience — FP — updated 2026-04-30
70. Thumbtack guide, biggest product update — https://www.thumbtack.com/guide/content/the-biggest-product-update-in-our-history — FP — pub 2024-04-02
71. Thumbtack press, home services in Claude — https://press.thumbtack.com/announcements/thumbtack-delivers-home-services-experience-in-anthropics-claude/ — FP — pub ~2026-04-23
72. BriefGlance, Thumbtack in Claude — https://briefglance.com/articles/thumbtack-brings-home-services-marketplace-to-anthropics-claude-ai — 3P — pub 2026-04-23
73. StreetInsider mirror of Business Wire, Thumbtack × OpenAI — https://www.streetinsider.com/Business+Wire/Thumbtack+Partners+with+OpenAI+to+Power+Home+Services+in+ChatGPT/25424234.html — FP-mirror — pub 2025-10-06
74. FinancialContent mirror, Thumbtack × Operator — https://markets.financialcontent.com/winslow/article/bizwire-2025-1-23-thumbtack-launches-as-home-services-collaborator-for-openais-new-operator — FP-mirror — pub 2025-01-23 (>12 mo)
75. BusinessWire item — https://www.businesswire.com/news/home/20260430186888/en/ — **HTTP 403, snippet only** — pub 2026-04-30 (reported)

**Duckbill**
76. Duckbill pricing — https://www.getduckbill.com/pricing — FP — pub n/a
77. Duckbill homepage — https://www.getduckbill.com/ — FP — pub n/a (contained possible agent-directed text, ignored)
78. Bustle, Duckbill review — https://www.bustle.com/life/duckbill-ai-personal-assistant-app-review-price-features — 3P (hands-on by press) — pub 2024-12-03 (>12 mo)

**Meta Muse**
79. The Next Web, Meta Muse launch — https://thenextweb.com/news/meta-muse-personal-ai-agent-launch — 3P — pub 2026-09-09
80. The Rundown, Meta Muse — https://www.therundown.ai/news/meta-muse-personal-ai-agent — 3P — pub 2026-09-09
81. Axios, Meta debuts Muse — https://axios.com/2026/09/08/meta-debuts-muse-personal-ai-agent — 3P — pub 2026-09-08
82. Vellum, Muse breakdown — https://www.vellum.ai/blog/official-muse-breakdown — 3P-rival — pub 2026-09-09

**Anthropic Claude**
83. Claude Help, get started with Claude Duet — https://support.claude.com/en/articles/17631495-get-started-with-claude-duet — FP — pub n/a
84. Claude article, Claude Duet — https://claude.com/resources/articles/claude-duet — FP — pub 2026-10-21
85. Claude Help, Google Workspace connectors — https://support.claude.com/en/articles/10166901-use-google-workspace-connectors — FP, **snippet**
86. PCWorld, AI booking dinner test — https://www.pcworld.com/article/3123989/i-asked-ai-to-book-dinner-it-made-me-want-to-use-the-app-instead.html — 3P (hands-on by press) — pub 2026-04-29

**Google**
87. Google Search Help, have AI check pricing — https://support.google.com/websearch/answer/16421135?hl=en — FP — undated
88. Google blog, Search at I/O 2026 — https://blog.google/products-and-platforms/products/search/search-io-2026/ — FP — pub 2026-05-19
89. Google blog, agentic calling — https://blog.google/products-and-platforms/products/shopping/how-to-agentic-calling-let-google-call/ — FP — pub 2025-11-25, updated 2026-07-24
90. Gemini Help, Call for Me — https://support.google.com/gemini/answer/18336420 — FP — ©2026
91. TechCrunch, Gemini phone calls test — https://techcrunch.com/2026/09/24/google-tests-letting-gemini-make-phone-calls-initially-for-us-pixel-owners/ — 3P — pub 2026-09-24
92. Invoca, Google AI pricing calls study — https://www.invoca.com/blog/google-ai-pricing-calls-study — 3P (interested vendor) — pub 2025-12-10
93. The Roofer's Helper, Google calling contractors — https://www.theroofershelper.com/business-tips/googles-ai-is-starting-to-call-contractors-on-homeowners-behalf-heres-what-that-means-for-you — 3P, **snippet**

**Amazon Alexa+**
94. About Amazon, Alexa+ free for Prime — https://www.aboutamazon.com/news/devices/alexa-plus-available-free-prime-members-us — FP — updated 2026-09-01
95. About Amazon, Alexa+ booking integrations — https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations — FP — pub ~2025-12-23
96. TechCrunch, Alexa+ works with Angi, Expedia, Square, Yelp — https://techcrunch.com/2025/12/23/amazons-ai-assistant-alexa-now-works-with-angi-expedia-square-and-yelp/ — 3P — pub 2025-12-23
97. VIIRL, Alexa × Thumbtack campaign — https://viirl.com/blog/alexa-partners-with-thumbtack/ — 3P (agency blog) — undated; Web Action SDK booking claim is **snippet** only

**Pine AI**
98. Pine Phone — https://www.19pine.ai/features/phone — FP — pub n/a
99. Pine pricing — https://www.19pine.ai/pricing — FP — pub n/a

**Yelp**
100. PPC Land, Yelp Assistant full-service — https://ppc.land/yelp-assistant-goes-full-service-book-order-and-schedule-in-one-chat/ — 3P (trade press) — pub 2026-04-21
101. Yelp Q2 2026 shareholder letter — https://s24.q4cdn.com/521204325/files/doc_financials/2026/q2/Yelp-Q2-2026-Letter-to-Shareholders.pdf — FP, **snippet** (PDF not opened)
102. Yelp Q1 2026 shareholder letter — https://s24.q4cdn.com/521204325/files/doc_financials/2026/q1/Yelp-Q1-2026-Letter-to-Shareholders.pdf — FP, **snippet**
103. GadgetReview, Yelp Check for Me — https://www.gadgetreview.com/?p=421547 — 3P — pub 2026-10

**Honey Homes / Casa**
104. SF Standard, handyman-as-a-service — https://sfstandard.com/2026/06/28/handyman-as-a-service/ — 3P — pub 2026-06-28
105. Yahoo Finance, $200/month startup (Casa) — https://finance.yahoo.com/markets/stocks/articles/200-month-startup-says-youll-140500756.html — 3P — pub 2026-05-04
106. RuntimeWire, Casa Austin — https://runtimewire.com/article/casa-austin-donation-pickups-home-care — 3P — pub 2026-10-05

**Orbits**
107. PR Newswire, Orbits pre-seed — http://www.prnewswire.com/news-releases/orbits-raises-2-6-million-pre-seed-round-to-bring-an-ai-assistant-to-the-household-302880247.html — FP (press release) — pub 2026-09-16

**Microsoft**
108. Thurrott, Copilot Tasks — https://www.thurrott.com/a-i/333118/microsoft-brings-agentic-ai-to-its-consumer-chatbot-with-new-copilot-tasks — 3P — pub 2026-02-27 (single outlet)

**Other marketplaces**
109. TaskRabbit blog, TaskRabbit in Claude — https://www.taskrabbit.com/blog/?p=29784 — FP — pub 2026-04-23
110. TaskRabbit blog, what's new this summer — https://www.taskrabbit.com/blog/whats-new-this-summer-built-for-you/ — FP — pub 2026-06-10, updated 2026-07-27
111. StreetInsider mirror of GlobeNewswire, Angi app in ChatGPT — https://www.streetinsider.com/Globe+Newswire/Angi+Launches+the+Angi+App+in+ChatGPT/26107934.html — FP-mirror — pub 2026-03-04
112. IT Brief, Airtasker ChatGPT booking — https://itbrief.com.au/story/airtasker-launches-chatgpt-booking-for-local-services — 3P — pub 2026-08-17

**Precedents**
113. TechCrunch, Fin's workplace pivot — https://techcrunch.com/2019/07/02/sam-lessin-and-andrew-kortina-on-their-voice-assistants-workplace-pivot — 3P — pub 2019-07-02 (>12 mo)
114. TechCrunch, Fin assistant pricing — https://techcrunch.com/2017/12/22/fin-assistant/ — 3P, **snippet** — pub 2017-12-22 (>12 mo)
115. Propmodo, why Alfred built a property-management company — https://propmodo.com/why-alfred-built-a-property-management-company-to-make-its-technology-better/ — 3P — pub 2026-05-25
116. helloalfred.com — https://www.helloalfred.com/ — FP — pub n/a
117. iTiger / MT Newswires, Yohana shutdown — https://www.itiger.com/hant/news/2591675868 — 3P (flags possible rumor) — pub 2025-12-16
118. Toyo Keizai, Panasonic Well — https://toyokeizai.net/articles/-/934705 — 3P, **snippet** (Japanese, not fetched)
119. GeekWire, Yohana launch — https://www.geekwire.com/2021/robotics-pioneer-yoky-matsuokas-panasonic-venture-debuts-personal-assistant-service-seattle/ — 3P — pub 2021 (>12 mo)
120. Tech.co, Zirtual — https://tech.co/?p=175032 — 3P, **snippet** (>12 mo)
121. Entrepreneur, Homejoy analysis — https://www.entrepreneur.com/article/248896 — 3P — pub 2015-07-30 (>12 mo)
