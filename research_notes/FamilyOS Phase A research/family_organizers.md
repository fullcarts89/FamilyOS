# AI family-organizer competitors to FamilyOS: evidence for a capability matrix

Reading key. Every citation carries a tag: `FP` = first-party (vendor site, legal page, vendor help page, vendor's own app store listing); `3P` = third-party; `3P-rival` = third-party that sells a competing product. All pages were accessed 2026-11-07, shown as `11-07` in tags to save space. `snippet` means the claim came from a search-result summary and the page itself was not opened, so treat it as weaker than a fetched page.

Grades are only `confirmed`, `partially confirmed`, `not verified`. `not verified` means no public first-party statement was found. It does not mean the capability is missing.

Method limits. Public pages only: no accounts, no sign-ins, no forms, no hands-on tests. The fetch tool returns model-written summaries rather than raw HTML, so check exact wording against the live page before quoting anything publicly. Nothing instruction-like aimed at AI agents surfaced in any page, but hidden text cannot be ruled out through summaries. No page is reported here as containing an injection.

## Q1. Are getohai.com and ohai.ai the same company or product?

### Takeaway
**Unresolved.** ohai.ai is operated by Ohai.ai, Inc. (high confidence), but getohai.com could not be loaded by any available route, so I can neither confirm nor rule out a link (low confidence either way). Do not merge getohai.com features or its $9/$16 pricing into the Ohai.ai, Inc. product.

### Cited Findings
**ohai.ai entity (high confidence)**
- Privacy policy names Ohai.ai, Inc., 125 Church St., Suite 170, Pembroke, MA 02359, effective December 1, 2025 — [Ohai privacy policy](https://www.ohai.ai/privacy-policy/) `FP 11-07`
- Terms name Ohai.ai, Inc. and Massachusetts governing law, effective December 1, 2025 — [Ohai terms](https://www.ohai.ai/terms-of-service/) `FP 11-07`
- Support page repeats the same company name and address — [Ohai support](https://www.ohai.ai/support/) `FP 11-07`
- App Store seller is ohai.ai Inc.; the listing's website and privacy links point to ohai.ai — [App Store: Ohai.ai: Household Assistant](https://apps.apple.com/us/app/ohai-ai-household-assistant/id6477802468) `FP 11-07`
- Founder is Sheila Lirio Marcelo, also founder of Care.com — [Wikipedia](https://en.wikipedia.org/wiki/Ohai.ai) `3P 11-07`

**Link to getohai.com (no evidence found in either direction)**
- The ohai.ai features page links only to ohai.ai pages and social accounts, with no getohai.com link — [Ohai features](https://www.ohai.ai/en/features/) `FP 11-07`
- The Wikipedia article does not mention getohai.com — [Wikipedia](https://en.wikipedia.org/wiki/Ohai.ai) `3P 11-07`
- Ohai.ai's first-party price ladder is $9.99 / $19.99 / $29.99, which does not match the Free / Family $9 / Premium $16 attributed to getohai.com in [COMPETITOR_AUDIT.md](../../COMPETITOR_AUDIT.md) — [How Ohai works](https://www.ohai.ai/how-it-works/) `FP 11-07`
- Other App Store apps named OHAI exist and are unrelated (ORION HAUS, LLC travel/housing app; a macOS Markdown viewer), so name collision is real in this namespace — [OHAI listing](https://apps.apple.com/us/app/ohai/id1627695152) and [Ohai Markdown Viewer](https://apps.apple.com/us/app/ohai-markdown-viewer/id6756699613?mt=12) `FP 11-07 snippet`

**Access attempts on getohai.com, all failed**
- Web fetch of the `www` and bare-domain homepage, `/pricing` and `/privacy` returned a closed-socket error. The Wayback Machine is not fetchable from this environment. The in-app browser reported navigation denied or failed. A domain-restricted search returned zero results.
- A shell command for `curl`, `dig` and `whois` was denied by the session's permission classifier and was not run, so no WHOIS or DNS data was collected. I did not try to route around that denial.
- These are access failures on my side. They say nothing about whether the site is live, or about who owns it.

### Inferences
- The price mismatch and the absence of cross-links are weak signals against a single SKU, not proof. A stale page, a marketing test or an unrelated company would all produce the same signals.
- Working rule for the matrix: every "Ohai" grade below refers to Ohai.ai, Inc. only. Audit claims sourced solely to getohai.com (chore board, $9/$16 pricing) stay `not verified` until someone reads that site's footer and legal pages.

### Gaps
- getohai.com legal entity, privacy policy, terms, footer: not read.
- WHOIS/DNS for both domains: not run (denied).
- LinkedIn company page for [Ohai.ai](https://www.linkedin.com/company/ohaidotai) returned HTTP 403, so its listed website is unknown.
- Company registries (Massachusetts corporate search): not checked, because registry lookups normally need a form submission, which the brief excludes.
- Fastest fix: a person opens getohai.com in a normal browser and reads the footer and privacy policy (about 2 minutes), or allows the blocked `whois` command.

## Q2. Current pricing and tiers

### Takeaway
Cozi's claimed tiers hold, with a $79 versus $79.99 inconsistency on Cozi's own pages. The claimed Ohai prices of $9 and $16 do **not** match Ohai.ai, Inc., whose web prices are $9.99 / $19.99 / $29.99 per month and whose App Store prices are higher.

### Cited Findings
**Cozi**
- Free $0; Gold $39/yr; Max $79/yr — [Compare plans](https://www.cozi.com/compare-plans/) `FP 11-07`, and [Cozi homepage](https://www.cozi.com/) `FP 11-07`
- Cozi Max is shown at $79.99/yr on its own product page — [Cozi Max](https://www.cozi.com/cozi-max/) `FP 11-07`
- App Store in-app purchases: Cozi Max $79.99; Cozi Gold entries at $39.00, $42.00, $49.99, $59.99; a 1-year Gold subscription at $29.99. The listing does not explain the several Gold entries — [App Store: Cozi](https://apps.apple.com/us/app/cozi-family-organizer/id407108860) `FP 11-07`
- Plans cover all family members on all devices; one account holds up to 12 people — [Compare plans](https://www.cozi.com/compare-plans/) `FP 11-07`, [Cozi FAQ](https://www.cozi.com/faq/) `FP 11-07`
- All three AI features (Event Import, Recipe Creator, Meal Planner) are Max-only, and work in the mobile app, not the website — [Cozi Max upgrade post](https://www.cozi.com/blog/why-more-families-are-upgrading-to-cozi-max/) `FP 11-07`

**Ohai.ai, Inc.**
- Web pricing: Individual Premium $9.99/mo, Premium Plus (Duo) $19.99/mo, Premium Group $29.99/mo; free trial for new users — [How Ohai works](https://www.ohai.ai/how-it-works/) `FP 11-07`
- Free tier covers reminders, meal planning and lists; shared household calendars and family task coordination are paid — [Ohai homepage](https://ohai.ai/) `FP 11-07`
- App Store in-app purchases are higher: Premium $14.99, Premium Plus $24.99, Premium Group $39.99 — [App Store: Ohai](https://apps.apple.com/us/app/ohai-ai-household-assistant/id6477802468) `FP 11-07`
- Billing is monthly in USD, generally non-refundable; fees can change — [Ohai terms](https://www.ohai.ai/terms-of-service/) `FP 11-07`
- A rival checked the site on September 24, 2026 and found the same web prices, monthly only with no annual price — [Sense vs Ohai](https://getsense.ai/blog/posts/sense-vs-ohai-2026) `3P-rival 11-07`
- The claimed Free / Family $9 / Premium $16: **not verified**. No page I could read supports it, and a targeted search found no source for $16 — [Sense vs Ohai](https://getsense.ai/blog/posts/sense-vs-ohai-2026) `3P-rival 11-07`

### Inferences
- A two-adult household on the web pays $19.99/mo ($239.88/yr) for Ohai Duo, against $79/yr for Cozi Max, about 3x. That annual figure is my arithmetic on monthly prices.
- Ohai's App Store premium of $5 to $10/mo probably passes on store fees and may steer buyers to the web. The vendor does not say so.

### Gaps
- Why Cozi lists several Gold prices in the App Store (legacy, regional or term differences) is not stated.
- Cozi's Google Play prices could not be read, because the Play page rendered empty.
- Which Ohai tier includes which number of Circle members is not stated beyond the plan names.

## Q3. Capability grades, Cozi and Ohai.ai, Inc.

### Takeaway
Cozi is a shared-account organizer with narrow AI (document to calendar event, meals). Ohai.ai, Inc. goes further and has the only first-party evidence of third-party outreach with status tracking, but only for doctor's appointments, carried out by a partner's human team. No public document from either vendor describes home-vendor outreach, tracked follow-up with vendors, or evidence-backed completion.

### Cited Findings
**Cozi**

| Capability | Grade | Evidence (all `FP 11-07` unless tagged) |
|---|---|---|
| Shared membership | `confirmed` | One account, individual emails, one shared password, up to 12 people — [FAQ](https://www.cozi.com/faq/), [email help](https://www.cozi.com/help-mobile-email-addresses/) |
| Roles / permissions (caregiver, child) | `not verified` | The FAQ affirmatively says Cozi has no restricted-access option and that every included person can view, add, edit and delete all account data. This is a vendor statement, not an inference from silence. Children get chore lists, and a parent can pin a child's list, but no child role is documented — [FAQ](https://www.cozi.com/faq/), [Chores post](https://www.cozi.com/blog/cozi-chores/) |
| Shared tasks | `confirmed` | Shared to-do lists; items can be assigned; per-list visibility — [feature overview](https://www.cozi.com/feature-overview/), [FAQ](https://www.cozi.com/faq/) |
| Recurring chores with skip/pause | `partially confirmed` | Daily or weekly recurrence is documented; skip and pause are not — [Chores post](https://www.cozi.com/blog/cozi-chores/), [FAQ](https://www.cozi.com/faq/) |
| Per-person assignment and notification | `partially confirmed` | Per-person chore lists are confirmed. Notification docs cover events only and do not mention chores or to-dos — [feature overview](https://www.cozi.com/feature-overview/), [notifications help](https://www.cozi.com/how-to-manage-cozi-notifications/) |
| Missed-task escalation | `not verified` | Not covered in the FAQ, Chores post or notifications help — same pages as above |
| Email / flyer to event | `confirmed` | Forward an email, PDF or flyer photo to a unique address; Max only; item must contain a date; event is created with you as attendee and is editable afterward; no pre-creation review step is described — [Introducing Cozi Max](https://www.cozi.com/blog/introducing-cozi-max/), [feature overview](https://www.cozi.com/feature-overview/) |
| Document to structured action | `partially confirmed` | Documented output is calendar events only; no tasks or projects — [Introducing Cozi Max](https://www.cozi.com/blog/introducing-cozi-max/) |
| Multi-step agent research | `not verified` | AI scope in public docs is event import, recipes and meal plans — [Compare plans](https://www.cozi.com/compare-plans/) |
| External outreach with approval | `not verified` | No public statement found |
| Durable third-party follow-up | `not verified` | No public statement found |
| Evidence-backed completion | `not verified` | Kids check off chores and everyone sees status; no evidence capture documented — [feature overview](https://www.cozi.com/feature-overview/) |
| Export / delete household data | `partially confirmed` | Delete is confirmed: self-serve, removes the account for everyone, 2-week grace period. Export is thin: printing from the website; the privacy policy mentions access and copy for signed-in users and machine-readable requests for EU/UK users; the terms describe no export — [FAQ](https://www.cozi.com/faq/), [terms](https://www.cozi.com/terms-of-use/), [privacy](https://www.cozi.com/privacy-policy/) |
| Revoke member access | `confirmed` | Remove the member in Settings, then reset the shared password so that person is signed out. Nothing is said about data a removed member already saved — [FAQ](https://www.cozi.com/faq/) |

**Ohai.ai, Inc.**

| Capability | Grade | Evidence (all `FP 11-07`) |
|---|---|---|
| Shared membership | `confirmed` | Circles: invite family, roommates, partners or caretakers by link or contact — [collaboration tools](https://www.ohai.ai/features/ai-household-collaboration-tools) |
| Roles / permissions (caregiver, child) | `partially confirmed` | Circle Lead; Basic members view, Premium members create and edit; a dependent without an account routes reminders to the Circle Lead. Caretakers can be invited, but no caretaker-scoped permission is documented — [collaboration tools](https://www.ohai.ai/features/ai-household-collaboration-tools), [Reminders and To-Dos](https://www.ohai.ai/blog/reminders-and-to-dos/) |
| Shared tasks | `confirmed` | One or more assignees including whole household; Member View groups by person — [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/) |
| Recurring chores with skip/pause | `partially confirmed` | Repeat rules exist and only the next occurrence is listed; skip, snooze and pause are not addressed — [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/), [Reminders and To-Dos](https://www.ohai.ai/blog/reminders-and-to-dos/) |
| Per-person assignment and notification | `confirmed` | Every assignee gets the reminder by app notification or SMS; no owner means no reminder — [Reminders and To-Dos](https://www.ohai.ai/blog/reminders-and-to-dos/) |
| Missed-task escalation | `not verified` | Overdue items turn red; no further handling is described — [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/) |
| Email / flyer to event | `confirmed` | Forward emails or upload screenshots, PDFs or photos; events go to the right calendar — [How Ohai works](https://www.ohai.ai/how-it-works/) |
| Document to structured action | `confirmed` | Documents become events, tasks, reminders or notes. General claim only: contractor estimates are not specifically documented — [How Ohai works](https://www.ohai.ai/how-it-works/) |
| Multi-step agent research | `partially confirmed` | Explore looks up activities, restaurants and trips and returns a plan; Assign to O runs lookups on a schedule with a first-time confirmation prompt. Chained multi-step work is not described — [Meet the New O](https://www.ohai.ai/blog/meet-the-new-ohai/), [Assign to O guide](https://www.ohai.ai/blog/the-hidden-ohai-feature-that-does-your-to-dos-for-you/) |
| External outreach with approval | `partially confirmed` | Terms allow messages to contacts only where the user requests or authorizes them. For doctor's appointments, Ferry Health's human team calls providers and the user picks from returned options. No home-vendor outreach is documented — [terms](https://www.ohai.ai/terms-of-service/), [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) |
| Durable third-party follow-up | `partially confirmed` | Medical only: a dashboard shows requested, pending, confirmed, reschedule-requested and cancel-requested states — [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) |
| Evidence-backed completion | `not verified` | Adjacent only: Ferry Health confirms bookings, and O messages when a delegated task is done. No proof-of-completion artifact is described — [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/), [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/) |
| Export / delete household data | `partially confirmed` | Policy lists erasure and portability rights, exercised by emailing support; retention carve-outs apply. No self-serve path or household-level export is documented — [privacy](https://www.ohai.ai/privacy-policy/) |
| Revoke member access | `not verified` | No public document found on removing a Circle member; support page and search did not surface one — [Ohai support](https://www.ohai.ai/support/) |

**Status notes affecting the grades above**
- Ohai's doctor scheduling post was published August 1, 2026. It is inconsistent about status (private beta versus just out of beta), requires insurance, and says it is expanding to more Premium households — [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) `FP 11-07`
- Smart Ohai Sync (inbox and school/sports app scanning with a preview-and-approve step) is waitlist or pilot only, so it is not counted as shipped — [Smart Ohai Sync](https://www.ohai.ai/features/unified-family-organizer/) `FP 11-07`, [Meet the New O](https://www.ohai.ai/blog/meet-the-new-ohai/) `FP 11-07`
- Grocery ordering through Instacart is the other documented external integration — [Ohai features](https://www.ohai.ai/en/features/) `FP 11-07`

**Privacy and trust facts relevant to a shared household agent**
- Ohai names OpenAI as a partner and Stripe as payment processor, and says trained Human Assistants may review a subset of emails and parts of shopping interactions — [Ohai privacy](https://www.ohai.ai/privacy-policy/) `FP 11-07`
- Ohai says data given to Ferry Health for appointments, including insurance card photos, is not shared with Ohai and is handled under HIPAA compliance — [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) `FP 11-07`
- Cozi's terms say partners may not use customer data to train their own models, and that AI output should not be the sole source of truth — [Cozi terms](https://www.cozi.com/terms-of-use/) `FP 11-07`
- Cozi's privacy policy does not mention AI features or AI providers — [Cozi privacy](https://www.cozi.com/privacy-policy/) `FP 11-07`
- Cozi's App Store privacy labels include identifiers and usage data used to track, and third-party advertising use — [App Store: Cozi](https://apps.apple.com/us/app/cozi-family-organizer/id407108860) `FP 11-07`

**Cozi legal entity (documents conflict)**
- Privacy policy, updated June 11, 2026, names OurFamilyWizard, LLC, 729 Washington Ave N, Minneapolis, as controller — [Cozi privacy](https://www.cozi.com/privacy-policy/) `FP 11-07`
- Terms, updated October 13, 2026, say the site is operated by Cozi, Inc., Family & Co. and In Tandem Families, with In Tandem solely responsible for the software — [Cozi terms](https://www.cozi.com/terms-of-use/) `FP 11-07`
- Deletion timing also differs: 14 days reversible in the terms and 2 weeks in the FAQ, against processing stopping 28 days after an emailed request in the privacy policy — [terms](https://www.cozi.com/terms-of-use/), [FAQ](https://www.cozi.com/faq/), [privacy](https://www.cozi.com/privacy-policy/) `FP 11-07`

### Inferences
- Corrections needed in COMPETITOR_AUDIT.md: for Ohai, "Multi-step agent research" and "External action with explicit approval" move from `?` to partial, and "Durable third-party follow-up" moves to partial for medical only. The core-wedge rows should be narrowed to **home-service vendors**, because a general claim that no incumbent has outreach would be wrong.
- Ohai's Ferry Health design is a useful precedent for FamilyOS: partner humans place calls, the user approves at a choice point, and status lives in a dashboard. It also suggests Ohai can add verticals by partnering rather than building, which is a threat to the wedge. This is my reading, as Ohai states no plan to extend beyond medical.
- Cozi's shared-password model looks structurally weak for caregiver access: with no restricted access, a caregiver sees everything, and revocation forces a password change on the whole household. The household-wide impact is my inference from the shared password.

### Gaps
- No public Ohai help centre was found. The support page points to a FAQ under How it works, and removal, export and account-deletion steps did not surface, so in-app behaviour is unknown.
- The Cozi Getting Started guides for To Do Lists were linked but not read, so to-do recurrence may be documented there.
- Whether Cozi Chores are on all plans: the feature overview lists them under Free, while the Chores post does not state plans.
- All vendor claims are untested. Hands-on testing remains necessary, per the audit plan.

## Q4. What public docs say about the 8 audit scenarios

### Takeaway
Scenarios 1 to 4 and 8 have partial public support on both products. Scenario 5, the FamilyOS wedge, is `not verified` for home vendors on both, with Ohai's medical flow the nearest analogue. Scenario 6 is `not verified` on both.

### Cited Findings
| # | Scenario | Cozi | Ohai.ai, Inc. |
|---|---|---|---|
| 1 | Capture "gutters before rainy season" | `partially confirmed`: manual to-do items with TODAY / THIS WEEK grouping; no AI capture of free text into tasks is documented — [feature overview](https://www.cozi.com/feature-overview/) `FP 11-07` | `partially confirmed`: text or voice becomes a to-do; a date-only item gets a 9:00 a.m. reminder; fuzzy deadlines such as a season are not addressed. Gutters appear only as a homeowner checklist item — [How Ohai works](https://www.ohai.ai/how-it-works/), [Reminders and To-Dos](https://www.ohai.ai/blog/reminders-and-to-dos/), [maintenance checklist](https://www.ohai.ai/blog/how-to-create-a-home-maintenance-checklist/) `FP 11-07` |
| 2 | Assign to partner, audit visibility | `partially confirmed`: to-do items are assignable and any member can edit; no change log is documented, and change notifications are documented for events only — [FAQ](https://www.cozi.com/faq/) `FP 11-07` | `partially confirmed`: assignees, Member View, reminders to each assignee, filter for O-created items; no edit history is documented — [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/) `FP 11-07` |
| 3 | Repeating HVAC filter, skip one | `partially confirmed`: Chores repeat daily or weekly only as documented. Calendar events can repeat, and a single date can be edited with a This date only option, per a page on a Cozi test host. Skipping a chore is not documented — [Chores post](https://www.cozi.com/blog/cozi-chores/), [bills post](https://www.cozi.com/blog/use-cozi-to-manage-bills-and-expenses/) `FP 11-07`; [test-host support](https://test-www.cozi.com/support/) `FP 11-07 snippet` | `partially confirmed`: repeat rules confirmed; skip not addressed. The maintenance post presents filter changes as a homeowner task and does not claim Ohai handles them — [new To-Dos](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/), [maintenance checklist](https://www.ohai.ai/blog/how-to-create-a-home-maintenance-checklist/) `FP 11-07` |
| 4 | Upload contractor estimate | `partially confirmed`: PDF or photo to calendar event only, and it needs a date; no issue object or attachment is documented — [Introducing Cozi Max](https://www.cozi.com/blog/introducing-cozi-max/) `FP 11-07` | `partially confirmed`: PDFs and photos become events, tasks, reminders or notes; estimates, attachment to an issue, and source fidelity are not documented — [How Ohai works](https://www.ohai.ai/how-it-works/) `FP 11-07` |
| 5 | Research vendors, draft, send after approval, track, confirm | `not verified` for every step; no public statement found | **Research** `partially confirmed` (Explore). **Find contractors** `partially confirmed`: an August 2025 post says only that an assistant helps find contractors, with no mechanism. **Draft and send to vendor** `not verified` for home services; terms allow authorized messages to contacts. **Track and confirm** `partially confirmed` for medical only, via Ferry Health — [Meet the New O](https://www.ohai.ai/blog/meet-the-new-ohai/), [maintenance checklist](https://www.ohai.ai/blog/how-to-create-a-home-maintenance-checklist/), [terms](https://www.ohai.ai/terms-of-service/), [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) `FP 11-07` |
| 6 | "Who fixed the dishwasher last year?" with sources | `not verified`: adjacent is Gold calendar search over events only — [Compare plans](https://www.cozi.com/compare-plans/) `FP 11-07` | `not verified`: adjacent are memory of details users provide, a contacts section that can hold plumbers and electricians, and asking O about confirmed appointments; no sourced answers are documented — [Meet the New O](https://www.ohai.ai/blog/meet-the-new-ohai/), [family home management](https://www.ohai.ai/blog/family-home-management/), [doctor scheduling post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/) `FP 11-07` |
| 7 | Remove caregiver access | `partially confirmed`: removal plus shared-password reset are documented; whether old records stay inaccessible is not stated beyond sign-out — [FAQ](https://www.cozi.com/faq/) `FP 11-07` | `not verified`: caretakers can be invited, but removal is not documented in anything I could read — [collaboration tools](https://www.ohai.ai/features/ai-household-collaboration-tools) `FP 11-07` |
| 8 | Export / delete data | `partially confirmed`: self-serve household delete with grace period; no bulk household export is documented — [FAQ](https://www.cozi.com/faq/), [terms](https://www.cozi.com/terms-of-use/) `FP 11-07` | `partially confirmed`: rights exercised by email with identity verification; deletion on written request, subject to retention carve-outs; no self-serve steps are documented — [privacy](https://www.ohai.ai/privacy-policy/) `FP 11-07` |

### Inferences
- The cleanest public gap for FamilyOS is home-service vendors handled end to end with a durable record and sources (scenarios 5 and 6). This is a gap in public documentation only, and it needs hands-on confirmation.
- Recurrence granularity may matter for home maintenance: a quarterly filter change does not fit Cozi's documented daily or weekly chores, so it would likely land on the calendar instead. That placement is my inference.

### Gaps
- Scenarios 1 to 8 were not run. The test-host Cozi page in row 3 is a weak source because the live support page does not carry that text.
- HomeZada, Homer and other home-record apps are outside this note's scope, and scenarios 4 and 6 should be read alongside research on them.

## Q5. Store ratings and recent complaint themes (as read 2026-11-07)

### Takeaway
Cozi has huge review volume at 4.8 but its visible iOS reviews are old. Ohai has a small base of 228 iOS ratings at 4.4, and its complaints centre on calendar visibility, sync reliability and paywall limits. Google Play pages did not render, so all Play figures are weak.

### Cited Findings
**Cozi**
- App Store: 4.8 from 403K ratings; version 2026.11.02, updated 4 days before capture; seller shown as Cozi — [App Store: Cozi](https://apps.apple.com/us/app/cozi-family-organizer/id407108860) `FP 11-07`. Cozi's own site still shows 399K, slightly stale — [Cozi homepage](https://www.cozi.com/) `FP 11-07`
- Reviews displayed on the listing are dated 2019 and 2024 only: month view hard to use on small screens, bulk undo for groceries, notifications reaching members without their own email — [App Store: Cozi](https://apps.apple.com/us/app/cozi-family-organizer/id407108860) `FP 11-07`
- Google Play: trackers report roughly 4.74 to 4.8 with about 114K to 118K reviews and 5M to 6M installs, tagged as containing ads — [AppPricingLab](https://apppricinglab.com/app/google_play/com.cozi.androidfree), [AppGoblin](https://appgoblin.info/apps/com.cozi.androidfree/trends), [Chrome-Stats](https://chrome-stats.com/d/com.cozi.androidfree) `3P 11-07 snippet`
- An AI-generated summary of about 99 Play reviews reports lag and freezing during list entry after an update (low confidence, undated) — [Kimola report](https://kimola.com/reports/unlock-insights-with-our-cozi-family-organizer-user-feedback-report-google-play-en-150141) `3P 11-07 snippet`

**Ohai.ai, Inc.**
- App Store: 4.4 from 228 ratings; version 3.4.1, released 2 days before capture — [App Store: Ohai](https://apps.apple.com/us/app/ohai-ai-household-assistant/id6477802468) `FP 11-07`
- Reviews: no monthly calendar view and unreliable sync and email forwarding (10/21/2025); wants a full calendar in-app and less promotion (Jan 13, year not shown); free tier too limited (05/05/2025). Praise centres on document and email scanning, text reminders and delegation — [App Store reviews](https://apps.apple.com/us/app/6477802468?see-all=reviews&platform=iphone) `FP 11-07`
- Google Play figures conflict: about 3.5 from 13 reviews and about 3.3 from 11 reviews in two regional snapshots — [Play US](https://play.google.com/store/apps/details?id=ai.ohai.app&hl=en_US), [Play IN](https://play.google.com/store/apps/details?id=ai.ohai.app&hl=en_IN) `FP 11-07 snippet`; a rival reported 3.0 from 9 reviews and over 1,000 downloads on September 24, 2026 — [Sense vs Ohai](https://getsense.ai/blog/posts/sense-vs-ohai-2026) `3P-rival 11-07`
- January 2026 Play reviews reportedly describe failing Google connections — [Sense vs Ohai](https://getsense.ai/blog/posts/sense-vs-ohai-2026) `3P-rival 11-07`
- A three-week hands-on review gives 3.5/5: setup burden, generic suggestions, overlapping features, and a recurring automation that a human at Ohai had to build. Independence is unconfirmed — [GBRLIFE review](https://www.gbrlife.com/blog/ohai-ai-review) `3P 11-07`
- A rival lists inconsistent calendar-scan accuracy, generic meal planning and dependence on whole-household adoption — [Carly: Ohai alternatives](https://www.usecarly.com/blog/ohai-alternatives/) `3P-rival 11-07`

### Inferences
- Ohai's review count is low for a company in market since 2024. It is a thin base, but it fits a modest consumer footprint, and it is not a direct measure of users.
- The reliability complaints (events missing, sync failing) support FamilyOS treating verifiable state as a core requirement.

### Gaps
- No direct read of either Play listing. No review-frequency data; these themes are anecdotal and are not complaint rates.
- Ratings for getohai.com's product, if a separate app exists, are unknown.

## Q6. Funding, user numbers and 2026 launches

### Takeaway
Ohai shipped a major relaunch and its doctor-booking feature in 2026, but I found no 2026 funding. Cozi's 2026 change is mainly corporate and legal alignment under In Tandem. The notable market event is Ollie shutting down on November 6, 2026, weeks after a $7.5M seed.

### Cited Findings
**Ohai.ai, Inc.**
- $6M seed from Eniac Ventures and LifeX Ventures at the 2024 launch — [Wikipedia](https://en.wikipedia.org/wiki/Ohai.ai) `3P 11-07`, [Fast Company](https://www.fastcompany.com/91023840/this-company-designed-an-ai-assistant-to-help-families-manage-their-calendars-and-childcare) `3P 11-07 snippet`
- Strategic round announced August 19, 2025, led by Muse Capital, amount undisclosed, with NEA, Eniac, Bright Ventures, Wisdom Ventures and angels including Olivia Munn, Mindy Kaling and Abby Wambach — [Pillsbury](https://www.pillsburylaw.com/en/news-and-insights/ohai-ai-raising-strategic-funding-support-launch-new-feature.html), [FemTech Insider](https://femtechinsider.com/ohai-ai-raises-strategic-investment-to-reduce-mental-load-for-parents/) `3P 11-07 snippet`
- CB Insights reports a conflicting $44.45M over 8 rounds under the predecessor name Proof of Learn — [CB Insights](https://www.cbinsights.com/company/proof-of-learn) `3P 11-07 snippet`
- User count: only a secondary claim of "thousands" of US households — [Traded](https://traded.co/vc/proptech/ohai-ai-raises-strategic-capital-to-advance-ai-assistant-for-family-productivity/) `3P 11-07 snippet`
- 2026 launches: relaunch April 2 ([post](https://www.ohai.ai/blog/meet-the-new-ohai-household-manager-built-for-your-whole-family/)); feature rundown April 17 ([post](https://www.ohai.ai/blog/meet-the-new-ohai/)); To-Dos April 29 ([post](https://www.ohai.ai/blog/new-ohai-to-dos-one-place-for-household-tasks/)); Assign to O guide May 5 ([post](https://www.ohai.ai/blog/the-hidden-ohai-feature-that-does-your-to-dos-for-you/)); reminders merged into to-dos July 14 ([post](https://www.ohai.ai/blog/reminders-and-to-dos/)); doctor scheduling August 1 ([post](https://www.ohai.ai/blog/ai-scheduling-assistant-doctor-appointments/)) — all `FP 11-07`

**Cozi / In Tandem**
- OurFamilyWizard acquired Cozi, announced May 4, 2022, terms undisclosed — [press release](https://prnewswire.com/news-releases/ourfamilywizard-acquires-cozi-1-family-organizing-app-301539136.html) `3P 11-07 snippet`
- In Tandem became parent on September 18, 2024, with OurFamilyWizard, Cozi, FamilyWall and Custody Navigator; it claims millions of families but gives no Cozi-specific figure — [Newswire](https://www.newswire.com/news/ourfamilywizard-launches-new-parent-company-in-tandem-22427670) `FP 11-07`
- Cozi Chores launched April 14, 2025 — [Chores post](https://www.cozi.com/blog/cozi-chores/) `FP 11-07`. I found no dated 2026 Cozi feature launch; terms were updated October 13, 2026 — [Cozi terms](https://www.cozi.com/terms-of-use/) `FP 11-07`

**Market signals**
- Ollie, a text-based family AI assistant launched June 2, 2026 with a $7.5M Khosla-led seed announced September 2026, stops running November 6, 2026. Its CEO cited competition from Muse, Instinct and others and difficulty raising capital; users get export instructions and refunds — [AI Weekly, republishing TechCrunch](https://aiweekly.co/alerts/ollie-to-shut-down-nov-6-weeks-after-75m-khosla-seed) `3P 11-07`; launch date from [American Bazaar](https://americanbazaaronline.com/2026/09/08/san-diego-ai-startup-ollie-secures-7-5-million-in-seed-funding-487752/) `3P 11-07 snippet`
- A New York Times feature (October 15, 2026, republished by The Star) covers Ollie, FamBot, Ohai and Ava, and quotes an NYU researcher on the lack of easy guardrails given agents' email and calendar access. It cites a Lurie Children's survey (two in three parents report reduced mental load, 58+ minutes saved weekly) and a Menlo Ventures figure (84% of parents use AI for everyday tasks) — [The Star](https://www.thestar.com.my/lifestyle/family/2026/11/01/as-mums-juggle-work-and-family-ai-apps-are-becoming-their-039second-brain039) `3P 11-07`

### Inferences
- Ollie's stated reason suggests that general-purpose agents are a live threat to standalone family assistants, which bears directly on FamilyOS positioning. One CEO's explanation is a single data point, not market proof.
- The $44.45M total likely mixes in Proof of Learn funding, since Wikipedia lists $15M for that company. This is unverified, and the numbers do not reconcile.

### Gaps
- No audited user, revenue or conversion figures for either company.
- The Fast Company piece on family AI "chief of staff" returned HTTP 403 and was not read: [Fast Company](https://fastcompany.com/91599193/ai-wants-to-become-your-familys-chief-of-staff-should-you-let-it). TechCrunch's original on Ollie was also not opened.

## Q7. Other family-organizer apps with AI (short entries)

### Takeaway
Most others cluster around document-to-calendar import. None I checked publicly documents vendor outreach. The most relevant newcomers are Sense, Nori and possibly Dinnerbell; Fyli could not be identified.

### Cited Findings
| Product | Relevant evidence | Price | Grade for AI capture |
|---|---|---|---|
| Skylight Calendar / Sidekick | Email text, PDF, image, zip or spreadsheet to events, recipes, menus and photos. Subject line routes to profiles; confirmation email with undo; can misfile items. Help updated August 31, 2026 — [Sidekick help](https://skylight.zendesk.com/hc/en-us/articles/47278643288091-Email-Events-Recipes-Menus-and-Photos-With-Sidekick) `FP 11-07`. Recurring chore tracking free; rewards and Sidekick need Plus — [subscription help](https://skylight.zendesk.com/hc/en-us/articles/36009559376795-Does-Skylight-Calendar-require-a-subscription) `FP 11-07` | Plus $79/yr — [Skylight Plus](https://myskylight.com/products/calendar-skylight-plus) `FP 11-07` | `confirmed` |
| Hearth Display / Hearth Helper | Text events and meal plans, and approve results before they appear; assignable repeating to-dos; Stars & Rewards; caregiver info on profiles — [Hearth features](https://www.hearthdisplay.com/pages/features) `FP 11-07` | About $9/mo membership and about $699 hardware — [Mango comparison](https://mangodisplay.com/mango-display-vs-hearth-display/) `3P-rival 11-07 snippet`. Hearth's own membership page returned HTTP 429 | `confirmed` |
| FamilyWall | Sister brand to Cozi under In Tandem; seller Family & Co; 4.8 from 25K ratings; AI import of forwarded email to events in v12.2; to-do assignment free, repeating tasks Premium — [App Store: FamilyWall](https://apps.apple.com/us/app/familywall-family-organizer/id496889629) `FP 11-07` | $7.99/mo, $44.99/yr in the US listing — same source | `confirmed` |
| TimeTree | AI suggestions rolling out gradually, with an opt-out setting around August 2026; says no human review and no generative model training — [TimeTree newsroom](https://timetreeapp.com/intl/en/newsroom/2026-07-31/ai-personalization-settings-2) `FP 11-07` | $4.49/mo, $44.99/yr — [Capterra](https://capterra.com/p/246790/TimeTree/) `3P 11-07 snippet`; vendor price page returned HTTP 403 | `not verified` (suggestions only) |
| Maple | Shared family inbox; Maple Fast turns inbox emails into tasks and events; free with in-app purchases — [App Store](https://apps.apple.com/us/app/maple-family-organizer/id1551070188) `FP 11-07 snippet` (fetch returned 404), [Quicken roundup](https://www.quicken.com/blog/?p=9664) `3P 11-07 snippet` | Paid tier prices not found | `partially confirmed` |
| Jam | AI-enabled shared calendar launched 2024; forwarding, suggestions, delegated to-do and shopping lists — [press release](https://prnewswire.com/news-releases/new-digital-family-calendar-app-jam-takes-aim-at-the-mental-load-302075409.html) `FP 11-07 snippet` | Not found | `partially confirmed` |
| Milo | SMS organizer with daily rundowns — [Milo site](https://joinmilo.com/) `FP 11-07 snippet` (fetch returned HTTP 402). Investors reportedly include OpenAI Startup Fund and Y Combinator — [CB Insights](https://www.cbinsights.com/company/milo-4) `3P 11-07 snippet` | Conflicting: $10, $24 and $40/mo across aggregators — [Creati](https://creati.ai/ai-tools/joinmilo-com), [10Web](https://10web.io/?p=58226), [Stackviv](https://stackviv.ai/ai-tools/milo) `3P 11-07 snippet` | `partially confirmed` |
| Sense | Claims chores, Kid Mode without kid logins, capture from email, photos, PDFs, WhatsApp and voice, ICS export, and forwarded-email deletion after 90 days — [Sense vs Ohai](https://getsense.ai/blog/posts/sense-vs-ohai-2026) `FP 11-07` | Free 10 AI actions/mo; $6.99/mo or $59.99/yr, same source | `confirmed` |
| Nori | Free tier reportedly includes calendar, tasks and 10 AI uses; has a help article on sharing AI access, which now redirects, and the support site returned HTTP 403 — [Nori article](https://heynori.com/article/family-operations-system/best-digital-smart-family-calendars-with-displays) `FP 11-07 snippet` | Not confirmed | `not verified` |
| Dinnerbell | Press release describes an agentic assistant launched April 8, 2026; page returned HTTP 403 — [StreetInsider](https://www.streetinsider.com/Press+Releases/Dinnerbell+Launches+Agentic+AI+Assistant+for+Busy+Families/26290655.html) `3P 11-07 snippet` | Not found | `not verified` |
| KallyAI | Markets call handling for busy parents. Worth a look on external outreach, but these are unverified marketing claims from a page I did not open — [KallyAI](https://kallyai-landing.pages.dev/ai-executive-assistant-for/busy-parents) `FP 11-07 snippet` | Not found | `not verified` |
| Fyli | No matching product found; searches returned similarly named apps — [Fyli search result example: FamLife AI](https://www.producthunt.com/products/famlife-ai) `3P 11-07 snippet` | n/a | `not verified` |

### Inferences
- Skylight and Hearth reach families through hardware, a distribution route FamilyOS would not share. Their AI is capture-focused, based on the pages read.
- Cozi and FamilyWall share a parent, and FamilyWall already lists AI email import, so In Tandem could plausibly consolidate features across brands. This is speculation, with no stated roadmap.
- Review-step design varies: Hearth documents approval before items appear, Skylight documents after-the-fact undo, and Cozi describes after-the-fact editing. That is a concrete design comparison for FamilyOS.

### Gaps
- No "Sunsama-for-families" product was found under that description; Sense, Nori, Domio, Famnest, FamBot and Ava are the closest leads. Domio, Famnest, FamBot and Ava were not examined.
- "Fyli" may be a misspelling, and a store link would settle it.
- Capability grids for the apps in this section were not attempted, per the brief's short-entry scope.
