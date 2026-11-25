# FamilyOS: Platform, Legal and Security Constraints (issue-spotting notes, not legal advice)

Scope: a US consumer app in which an AI agent drafts messages to local home-service vendors for a household, a human approves, the system sends and tracks replies, and household documents, photos and possibly child-related data are stored.

Conventions used below:
- Every source was accessed on **2026-11-07** ("acc. 2026-11-07"). The publication or last-updated date is given where the page shows one; "undated" means the page showed none.
- **[RULE]** is a clear rule taken from a primary or official source. **[UNCERTAIN]** is an interpretation, a contested point or a secondary-source claim. **[COUNSEL]** marks a question that needs a lawyer before launch.
- Secondary sources (law-firm alerts, vendor blogs, news) are labelled as such. Where only a search-result summary was available and the page itself was not fetched, the finding says "(search summary)".
- Prompt-injection check: none of the fetched pages contained instructions aimed at the research agent. Several primary PDFs (FCC, Ninth Circuit, CSLB) were binary and were read by extracting their text locally.
- The web-search budget ran out near the end of the research. Items that could not be verified because of that are listed under Gaps.

---

## 1. Google OAuth for Gmail, Microsoft Graph, and the relay alternative

### Takeaway
Sending as the user needs only `gmail.send`, which Google classifies as *sensitive*. That means OAuth verification but no CASA security assessment. Reading vendor replies in the user's mailbox needs a *restricted* scope (`gmail.readonly`, `gmail.modify`, even `gmail.metadata`). Restricted scopes bring roughly 6 weeks of verification, an annual third-party CASA assessment, Limited Use rules (no generalized AI training, no human reading without specific consent) and a requirement to fit an "approved Gmail use case." Microsoft Graph has no equivalent restricted tier, only free publisher verification. A FamilyOS-owned relay or reply address avoids mailbox scopes entirely, at a cost in deliverability and vendor trust.

### Cited Findings
**Scope classification [RULE]**
- Gmail scope tiers: *non-sensitive*: `gmail.labels`, `gmail.addons.current.action.compose`, `gmail.addons.current.message.action`. *Sensitive*: `gmail.send`, `gmail.addons.current.message.metadata`, `gmail.addons.current.message.readonly`. *Restricted*: `https://mail.google.com/`, `gmail.readonly`, `gmail.compose`, `gmail.insert`, `gmail.modify`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing` — [Google, Choose Gmail API scopes, undated; acc. 2026-11-07](https://developers.google.com/workspace/gmail/api/auth/scopes)
- Apps that use IMAP/SMTP must request the restricted `https://mail.google.com/` scope — [Google Cloud OAuth verification FAQ, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13463817)

**Verification and CASA [RULE unless noted]**
- Apps requesting sensitive or restricted scopes must complete OAuth app verification. Restricted-scope apps must re-verify annually. Non-sensitive-only apps need only brand verification — [Google, OAuth app verification overview, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13463073)
- Verification requirements include: a homepage on an owned domain; a privacy policy on that domain; domain verification in Search Console; a demo video showing the full OAuth flow and each scope's use (and, if data is used for AI model training, the user explicitly consenting to it); per-scope justification explaining why narrower scopes would not work; and requesting only the minimum scopes, with no scopes for unbuilt features. Restricted scopes additionally need an annual assessment by a Google-empanelled assessor — [Google, Verification requirements, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13464321)
- Estimated review times, which Google says are "not guaranteed": brand about 2–3 business days, sensitive about 10 business days, restricted about 6 weeks. Google does not charge for assessments; the developer pays the assessor. Projects with no restricted scopes do not need a security assessment. Unverified sensitive or restricted apps are capped at 100 users — [Google OAuth verification FAQ, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13463817)
- CASA uses the App Defense Alliance framework, based on OWASP ASVS. Tiers AL1 and AL2 depend on user count, scopes and risk signals. "All applications must be revalidated every year," and the required level can rise as the user base grows — [Google, Security Assessment, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13465431)
- Reassessment falls every 12 months from the previous Letter of Validation and must be a comprehensive test even if the app is unchanged — [Google, Annual Recertification, undated; acc. 2026-11-07](https://support.google.com/cloud/answer/13463816)
- Testing mode: an external app in "Testing" status gets refresh tokens that expire in 7 days, and the 100-user cap is lifetime and cannot be reset (search summary of Google pages) — [Google, Manage App Audience; acc. 2026-11-07](https://support.google.com/cloud/answer/15549945); [Google, Unverified apps; acc. 2026-11-07](https://support.google.com/cloud/answer/7454865)
- **[UNCERTAIN, vendor-reported cost]** CASA Tier 2 prices: TAC Security $540 (premium up to $1,800), Leviathan $800–1,200, NCC $1,200+, Bishop Fox $1,500+. Tier 3: TAC $4,500 and others $5,000–8,000+. Turnaround is 1–4 weeks for Tier 2. The table is labelled "as of 2024" — [Switch Labs, CASA providers and pricing, undated; acc. 2026-11-07](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option)

**Limited Use and AI/ML [RULE]**
- Google API Services User Data Policy (last updated 2024-02-15):
  - Data from sensitive or restricted scopes may be used only to provide or improve prominent user-facing features. The limits cover aggregated, anonymized and derived data too.
  - Transfers are allowed only for user-facing features with consent, for security, for legal compliance, or in an M&A transaction with prior consent.
  - "Don't allow humans to read the data," except with affirmative user agreement for specific data, or for security, legal or aggregated-operations needs.
  - No use for ads, sale to data brokers, or creditworthiness decisions.
  - Contractors and agents must also comply.
  - Annual security assessment depending on API and user count.
  — [Google API Services User Data Policy, updated 2024-02-15; acc. 2026-11-07](https://developers.google.com/terms/api-services-user-data-policy)
- Google Workspace API User Data and Developer Policy:
  - It completely prohibits using Workspace user data to create, train or improve an AI/ML model beyond that specific user's personalized model.
  - Approved Gmail restricted-scope use cases are: email clients with a UI; email backup; productivity enhancements (CRM, scheduled send, mail merge, AI summaries); and reporting/monitoring (e.g., itinerary or package tracking).
  - Apps must require users to confirm agentic tool or skill invocations granularly.
  - No permanent copies of user data; data and tokens must be encrypted at rest; user deletion requests must be honored.
  — [Google Workspace API User Data and Developer Policy, undated; acc. 2026-11-07](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

**Microsoft Graph [RULE]**
- `sendMail` requires only `Mail.Send`, for work/school accounts, personal Microsoft accounts and application permission alike — [Microsoft Learn, user: sendMail, ms.date 2024-06-21, updated 2026-06-19; acc. 2026-11-07](https://learn.microsoft.com/en-us/graph/api/user-sendmail)
- Reading a message requires `Mail.ReadBasic` or `Mail.Read`, both available for personal accounts — [Microsoft Learn, Get message, updated 2026-05-19; acc. 2026-11-07](https://learn.microsoft.com/en-us/graph/api/message-get)
- Publisher verification is free and needs a verified Microsoft AI Cloud Partner Program account plus a non-onmicrosoft.com publisher domain. Since November 2020, where risk-based step-up consent is enabled, users cannot consent to unverified multitenant apps (registered after 2020-11-08) asking for more than basic profile access from other tenants. Microsoft 365 App Certification is a separate, complementary program — [Microsoft Learn, Publisher verification overview, updated 2026-06-15; acc. 2026-11-07](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)

**Relay / no-OAuth deliverability [RULE]**
- Gmail rules for all senders: SPF or DKIM, valid forward and reverse DNS, TLS, spam rate below 0.3%, RFC 5322 formatting, and no impersonation of Gmail From: headers, since Gmail is applying DMARC quarantine. Senders over 5,000/day additionally need SPF+DKIM+DMARC, From: alignment, and one-click unsubscribe for marketing mail. Effective 2024-02-01 — [Google, Email sender guidelines, undated; acc. 2026-11-07](https://support.google.com/mail/answer/81126)
- Yahoo: similar all-sender and bulk rules. Bulk senders must honor unsubscribes within 2 days. Enforcement began February 2024 — [Yahoo Sender Hub best practices, undated; acc. 2026-11-07](https://senders.yahooinc.com/best-practices/)
- Outlook.com: from 2025-05-05, domains sending over 5,000/day to Outlook.com must pass SPF, DKIM and DMARC (search summary) — [Microsoft Tech Community, Outlook high-volume sender requirements; acc. 2026-11-07](https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)

### Inferences
- **Send-only is cheap; reading replies is expensive.** `gmail.send` gives "send as the user" with roughly 10-day verification and no CASA. Tracking replies inside Gmail needs a restricted scope, which means annual CASA, recurring cost and calendar time, the "approved use case" fit, and strict Limited Use. Even `gmail.metadata` (headers only) is restricted.
- **Hybrid pattern worth prototyping:** send through `gmail.send` from the user's own address, but set a per-task `Reply-To:` pointing at a FamilyOS inbound address (e.g., `t-123@reply.familyos…`). Replies then arrive at FamilyOS without any mailbox-read scope. Some vendors will hit "reply" to the From address or call instead, so a fallback is needed (the user forwards the reply, or a user-created Gmail forwarding filter). This is an inference; it needs a deliverability and UX spike.
- **Whether FamilyOS fits an approved Gmail use case is unclear.** A household agent reading vendor replies would most plausibly be argued as a "productivity enhancement" with a UI and granular confirmation of agent actions. Google decides this case by case. **[UNCERTAIN]**
- **Concierge and human-ops risk.** Under Limited Use, FamilyOS staff (including Gate 1 concierge operators) may not read Gmail-derived data unless the user affirmatively agrees for specific data. A blanket ToS clause probably does not meet that standard. This should shape the concierge test. **[COUNSEL]**
- **LLM subprocessor.** Sending Gmail content to a third-party LLM is a "transfer." It looks permissible only to serve the user-facing feature, under contract terms of no training and no human review, and it must be disclosed. Apple 5.1.2(i) separately requires explicit permission (see Q6). **[COUNSEL]**
- **Microsoft is lighter** (no mandatory third-party assessment found). Outlook.com users are a minority of US consumers, so Microsoft does not remove the Gmail problem.
- **A relay is viable** if FamilyOS owns the domain, authenticates it (SPF/DKIM/DMARC aligned) and never spoofs the user's gmail.com address in From:. Something like "Jane Doe via FamilyOS <jane.h123@mail.familyos…>" works. Costs: FamilyOS carries the domain reputation and needs complaint monitoring, and vendors may distrust an unfamiliar domain.

### Gaps
- No official Google price list for CASA exists; vendor prices are from 2024 and inconsistent.
- I did not find Google text saying whether a client-only (on-device) app can avoid CASA while using restricted scopes.
- I did not verify whether Gmail add-on scopes (`gmail.addons.current.message.readonly`, sensitive) could support an in-Gmail sidebar workflow as a lower-tier alternative. They appear limited to add-on context.
- No official Microsoft guidance was found on any mandatory security assessment for consumer Graph mail apps.

---

## 2. Email law: CAN-SPAM, sender identification, bulk-sender rules, AI-disclosure laws

### Takeaway
A one-off request for a quote from a consumer to a contractor is probably not "commercial electronic mail," because it advertises nothing. It is also not "transactional," which is narrow and assumes an existing deal. FamilyOS branding or vendor-acquisition pitches in the message would turn it commercial, with FamilyOS as a potentially liable sender. No US law found generally requires labelling a human-approved, AI-drafted email as AI. The California BOT Act, Maine and Utah target deceiving people about bot identity in commercial interactions, so honest identification is the safe design.

### Cited Findings
- **[RULE]** CAN-SPAM makes no B2B exception. It applies by primary purpose (commercial, transactional/relationship, or other). Transactional categories are read narrowly. Commercial mail needs accurate headers, non-deceptive subjects, ad disclosure, a postal address and an opt-out honored within 10 business days. Both the promoted company and the sender can be liable. Penalty is up to $53,088 per email — [FTC, CAN-SPAM Act: A Compliance Guide for Business, Aug 2023, edited Jan 2024; acc. 2026-11-07](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- **[RULE]** Primary-purpose test:
  - Messages consisting exclusively of advertising are commercial.
  - Mixed messages are commercial if the subject line suggests an ad, or if transactional content is not at or near the beginning.
  - Transactional content is limited to completing or confirming an agreed transaction, warranty/safety information, account and relationship notices, employment information, and delivering goods or services already entitled.
  — [16 CFR 316.3 (Cornell LII); acc. 2026-11-07](https://www.law.cornell.edu/cfr/text/16/316.3)
- **[RULE, secondary text]** California BOT Act (B&P 17940–17943, SB 1001, 2018):
  - It is unlawful to use a bot to mislead a person about its artificial identity in order to incentivize a purchase or sale in a commercial transaction, or to influence a vote.
  - A clear, conspicuous disclosure is a safe harbor.
  - "Online platform" is defined with a 10,000,000 monthly US visitors/users threshold.
  - AB 410 (2025–26) would amend it; enactment status was not verified.
  — [California Public Law, B&P 17941 (unofficial); acc. 2026-11-07](https://california.public.law/codes/business_and_professions_code_section_17941); [LegiScan AB 410; acc. 2026-11-07](https://legiscan.com/CA/text/AB410/2025). The official leginfo page returned HTTP 403.
- **[RULE]** Maine 10 M.R.S. §1500-DD (from LD 1727):
  - No one may use an AI chatbot or other computer technology to engage in trade and commerce with a consumer in a way that may mislead a reasonable consumer into thinking they are dealing with a human.
  - Clear and conspicuous disclosure is required.
  - A violation is a Maine UTPA violation.
  - One source gives the effective date as 2025-09-16.
  — [Maine Revised Statutes §1500-DD; acc. 2026-11-07](https://legislature.maine.gov/statutes/10/title10sec1500-DD.html) (search summary)
- **[RULE, secondary]** Utah AI Policy Act as amended by SB 226 (2025):
  - Disclosure is due when a consumer clearly and unambiguously asks whether they are dealing with AI.
  - Regulated occupations must disclose up front in "high-risk" interactions.
  - There is a safe harbor for clear disclosure at the outset and throughout.
  - SB 332 extended the sunset to 2027-07-01.
  - Fines are up to $2,500 per violation.
  — [Perkins Coie, New Utah AI laws, 2025; acc. 2026-11-07](https://perkinscoie.com/insights/update/new-utah-ai-laws-change-disclosure-requirements-and-identity-protections-target); [Davis Polk, Utah scales back AI law, 2025; acc. 2026-11-07](https://www.davispolk.com/insights/client-update/utah-scales-back-reach-generative-ai-consumer-protection-law)
- **[RULE]** California AB 1609, the Right to Human Customer Service Act, was signed 2026-09-28. It covers businesses with more than $500M in revenue from 2027-01-01, bars presenting a customer-service chatbot as human, and requires a path to a human — [Office of the Governor, 2026-09-28; acc. 2026-11-07](https://www.gov.ca.gov/2026/09/28/governor-newsom-signs-commonsense-legislation-to-make-your-life-easier/) (search summary; threshold from secondary reports)
- **[RULE]** Recent chatbot laws are mostly companion-focused:
  - CA SB 243 (2026-01-01)
  - NY AI companion law (2025-11-05)
  - Oregon and Washington companion laws (2027-01-01)
  - Nebraska LB 525 and Idaho SB 1297, conversational-AI laws (2027-07-01)
  - Colorado AI Act, high-risk systems (2026-06-30)
  — [Orrick, 2026 State Chatbot Laws, 2026-04-29; acc. 2026-11-07](https://www.orrick.com/en/Insights/2026/04/2026-State-Chatbot-Laws-Key-Provisions-and-Regulatory-Trends)
- **[UNCERTAIN]** A New York City rule proposed 2026-10-20 would require disclosure of AI customer-service bots; it is not final (search summary of a secondary article; the page returned 403) — [The College Investor; acc. 2026-11-07](https://thecollegeinvestor.com/90989/ai-customer-service-chatbot-laws-nyc-california-maine-and-utah/)
- **[UNCERTAIN]** The FTC issued a "Proposed Policy Statement Concerning the Suppression of Accuracy in AI Systems" (July 2026, under EO 14365):
  - Hallucinations alone are not a Section 5 violation.
  - Undisclosed steering of outputs can be deceptive.
  - Clear disclosure mitigates the risk.
  - The FTC asserts implied preemption of conflicting state AI laws (it cites Colorado).
  - It is a proposal only.
  — [Arnold & Porter, 2026-07; acc. 2026-11-07](https://www.arnoldporter.com/en/perspectives/blogs/major-questions-an-administrative-law-and-regulatory-blog/2026/07/ftcs-proposed-policy-statement-on-ai-accuracy-and-preemption-of-state-ai-laws); [Holland & Knight, 2026-08-19; acc. 2026-11-07](https://www.hklaw.com/en/insights/publications/2026/08/a-look-at-the-ftcs-current-approach-to-ai-regulation)
- **[RULE]** At the FCC, the AI-call NPRM (FCC 24-84, Aug 2024), which proposed AI disclosure at the start of calls, has not been adopted. The Fall 2025 Unified Agenda lists it as a long-term action — [eConsent.org, 2026-10-16 (secondary); acc. 2026-11-07](https://econsent.org/posts/ai-voice-agents-tcpa-rules-october-2026/)

### Inferences
- **An RFQ email is likely in CAN-SPAM's "other" category.** A neutral request for a quote sent from the household is likely outside the commercial-mail requirements. FamilyOS should still keep accurate From/routing and an honest subject. **[COUNSEL]** to confirm, especially if FamilyOS sends from its own domain.
- **Messages that turn commercial:** a "Sent with FamilyOS – try it free" footer; vendor-onboarding mail ("claim your listing," "join our pro network"); and any message promoting a paid lead product. These turn mail commercial with FamilyOS as initiator. Keep vendor-acquisition email in a separate, CAN-SPAM-compliant program.
- **Sender identification design:** always identify the household member (real name) and that the message was sent through FamilyOS. Never imply a FamilyOS staffer or human assistant wrote it if no one did.
- **AI disclosure:** none of the general laws found clearly reaches a human-approved message written in the user's own voice. But the vendor is often a sole proprietor, and Maine/Utah/BOT-Act-style laws aim at misleading people about bot identity in commerce. If the agent ever converses autonomously (multi-turn replies, voice), disclose. A low-cost default line: "drafted with AI assistance, approved by [name]." **[COUNSEL]** on whether vendors count as "consumers" under Maine's statute; they are businesses, so probably not.

### Gaps
- The official California statute text and the BOT Act's "bot" definition could not be fetched (403). AB 410 status is unverified.
- The NYC proposed rule's text was not reviewed.
- State anti-spam statutes (e.g., California B&P 17529.5, Washington CEMA) were not researched.

---

## 3. Voice and SMS: TCPA, the FCC AI-voice ruling, 2025–26 changes, A2P 10DLC, state mini-TCPAs

### Takeaway
An AI-voice call to a contractor's cell phone is an "artificial voice" call under the TCPA whether or not it is marketing. It needs the called party's prior express consent. Courts are split on whether a publicly listed number provides that consent, and none was found holding it does for AI voice. Texts sent through a provider must go through registered A2P 10DLC. State mini-TCPAs mostly target solicitations, so a one-to-one vendor inquiry is lower risk, but AI voice is the riskiest channel. Defer it, or have a human place calls.

### Cited Findings
- **[RULE]** FCC Declaratory Ruling FCC 24-17 (adopted 2024-02-02, released 2024-02-08) confirms that the TCPA's "artificial or prerecorded voice" restrictions cover current AI technologies that generate human voices. Callers need prior express consent absent an exemption, and the identification and disclosure rules for such messages (47 CFR 64.1200(b)) apply — [FCC 24-17 (PDF); acc. 2026-11-07](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf)
- **[RULE]** 47 U.S.C. 227(b)(1)(A) prohibits non-emergency calls using an ATDS or an artificial/prerecorded voice to cellular numbers without prior express consent, regardless of purpose. (b)(1)(B) covers residential lines. "Telephone solicitation" means calls encouraging the purchase or rental of goods or services — [47 U.S.C. 227 (Cornell LII); acc. 2026-11-07](https://www.law.cornell.edu/uscode/text/47/227)
- **[RULE, circuit-limited]** *Bradford v. Sovereign Pest Control of TX* (5th Cir., No. 24-20379, 2026-02-25) held that the TCPA requires only "prior express consent," not written consent, even for prerecorded telemarketing calls. The holding binds only TX, LA and MS — [Nixon Peabody, 2026-02-27; acc. 2026-11-07](https://www.nixonpeabody.com/insights/alerts/2026/02/27/fifth-circuit-holds-the-tcpa-does-not-require-prior-express-written-consent); [Holland & Knight, 2026-03-02; acc. 2026-11-07](https://www.hklaw.com/en/insights/publications/2026/03/tcpa-reset-fifth-circuit-rejects-prior-express-written-consent-rule)
- **[RULE]** After *McLaughlin Chiropractic v. McKesson* (U.S., June 2025), courts are not bound by FCC TCPA interpretations — [eConsent.org, 2026-10-16 (secondary); acc. 2026-11-07](https://econsent.org/posts/ai-voice-agents-tcpa-rules-october-2026/)
- **[RULE]** FCC revocation order of 2026-09-30, unanimous (cited as FCC 26-67 by a secondary source):
  - Callers may designate exclusive opt-out methods (an in-call key press or voice opt-out, a STOP-type text reply, or a designated website or number).
  - Informational opt-outs can be campaign-specific; marketing opt-outs apply company-wide.
  - Automated opt-out remains required for artificial/AI-voice calls.
  - Effective 30 days after Federal Register publication.
  — [Kelley Drye, 2026-10-13; acc. 2026-11-07](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/fcc-revises-tcpa-consent-revocation-rules-exclusive-opt-out-methods-category-specific-revocations-and-other-key-changes)
- **[UNCERTAIN]** In January 2026 the FCC delayed the "revoke-all" effective date to 2027-01-31 (search summary of a secondary source) — [Womble Bond Dickinson; acc. 2026-11-07](https://www.womblebonddickinson.com/us/node/19868). The one-to-one consent rule was vacated by the 11th Circuit in January 2025, and the FCC removed it in September 2025 (secondary search summary) — [Retell AI blog; acc. 2026-11-07](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound)
- **[RULE]** The FCC AI-specific consent and disclosure NPRM (FCC 24-84) remains unadopted as of October 2026 — [eConsent.org, 2026-10-16; acc. 2026-11-07](https://econsent.org/posts/ai-voice-agents-tcpa-rules-october-2026/)
- **[UNCERTAIN]** Implied consent: informational calls require only "prior express consent," generally established when the consumer gives the business their number. No case was found holding that a number merely published on a website gives consent to artificial-voice calls (search summary; gap) — [Olshan, Fifth Circuit consent post; acc. 2026-11-07](https://www.olshanlaw.com/Advertising-Law-Blog/In-the-Fifth-Circuit-Giving-Your-Phone-Number-Can-Now-Count-as-Express-Consent-Under-the-TCPA)
- **[RULE]** A2P 10DLC (Twilio, page modified 2026-10-30):
  - Anyone sending SMS/MMS from a 10DLC number to US recipients must register a Brand and a Campaign (purpose, opt-in, opt-out, help).
  - Carriers treat all messages from a Twilio number as A2P.
  - The ISV model registers customers through an API.
  - Sole Proprietor brands get one campaign and about 1,000 segments/day to T-Mobile.
  - Unregistered traffic is filtered and incurs extra fees.
  — [Twilio, A2P 10DLC docs; acc. 2026-11-07](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- **[RULE]** Recent state mini-TCPA changes:
  - **Texas SB 140** (eff. 2025-09-01): adds texts to "telephone solicitation," with registration ($200 fee, $10,000 security). The Secretary of State and AG say consent-based texting need not register.
  - **Florida FTSA** (May 2023 update): 15-day safe harbor for text opt-outs.
  - **Virginia SB 1339** (eff. 2026-01-01): honor "Unsubscribe" replies.
  — [Husch Blackwell Byte Back, 2026-07-16; acc. 2026-11-07](https://www.bytebacklaw.com/2026/07/looking-back-on-the-last-year-of-state-level-tcpa-updates/); [Kean Miller, Texas SB 140; acc. 2026-11-07](https://www.keanmiller.com/insights/blog/texas-law-blog/dont-text-with-texas-expansive-regulations-now-in-effect-for-text-messages-to-texas-residents/)

### Inferences
- **A one-to-one vendor inquiry differs from marketing in two ways.** It is not a "telephone solicitation," because the household is buying, not selling, so DNC and written-consent rules for telemarketing likely do not apply. But **227(b)(1)(A) is content-neutral**: an AI voice to a contractor's mobile is covered whatever the purpose. Many small contractors use cell phones as business lines.
- **Who "makes" the call** (the household or FamilyOS as platform) affects liability. It depends on who takes the steps to initiate the call and on the degree of platform control. **[COUNSEL]**
- **Practical MVP posture:** email first. For SMS, register FamilyOS as an ISV/brand with a "customer care / conversational" campaign. Send only human-approved, one-to-one texts, identify sender and household, honor STOP. Defer AI-voice outbound calling. If it is ever offered, use a human-in-the-loop "click to call" placed by the user, or obtain the vendor's consent first (e.g., by text) before an AI call.
- **Mini-TCPAs and quiet hours:** apply 8 am–9 pm local quiet hours to all outbound texts and calls, a common state baseline.

### Gaps
- No authority found on whether a publicly listed business number equals consent for AI-voice calls.
- State call-recording and two-party consent laws (e.g., California Penal Code 632/632.7) for AI calls that are recorded or transcribed were not researched within budget. **[COUNSEL]**
- The primary text of FCC 26-67 and its Federal Register effective date were not verified.

---

## 4. Children, school documents and health data

### Takeaway
COPPA's amended rule (compliance date 2026-04-22) applies to services directed to children or with actual knowledge of collecting personal information *from* a child. A parent entering information about a child is generally outside COPPA. The PRD's "child-visible chores" feature (child logins) would bring FamilyOS inside it. New app-store age-signal laws (Texas, Utah, Louisiana, California AB 1043) may hand developers actual knowledge of child users. FERPA governs schools, not a parent's copy of a school notice. Caregiver and medical features would trigger Washington's My Health My Data Act and the FTC Health Breach Notification Rule.

### Cited Findings
- **[RULE]** The amended COPPA Rule was published 2025-04-22 and became effective 2025-06-23. The compliance date is 2026-04-22, except §312.11(d)(1), (d)(4) and (g). The FTC did not finalize the proposed ed-tech/school-authorization changes (search summary) — [Federal Register, 2025-04-22; acc. 2026-11-07](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule); [Hunton; acc. 2026-11-07](https://www.hunton.com/privacy-and-cybersecurity-law-blog/coppa-rule-amendment-compliance-deadline-approaches)
- **[RULE]** Key changes: separate parental consent before disclosing children's data to third parties for targeted ads or other purposes; retention only as long as needed for the collection purpose (operators "cannot retain the information indefinitely"); biometric and government identifiers added to "personal information" — [FTC press release, 2025-01-16; acc. 2026-11-07](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data)
- **[RULE]** FTC COPPA FAQ (undated; references the 2025 amendment):
  - COPPA applies only to personal information collected online *from* children. It does not cover information collected from adults that may pertain to children (FAQ A.8, F.4).
  - General-audience operators are covered when they have actual knowledge, e.g., when a parent tells them a child is using the service (A.2, H.1).
  - Directed-to-children factors include subject matter, visuals, animated characters and age of models (D.1).
  - A site is not child-directed merely because some children visit (D.3).
  — [FTC, Complying with COPPA FAQs; acc. 2026-11-07](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- **[RULE]** Amazon Alexa (FTC/DOJ, 2023-05-31): $25M civil penalty. Alleged indefinite retention of children's voice recordings, used to improve Alexa; deletion requests not fully honored (transcripts persisted). The order bars using deleted data for data products and requires deleting inactive child accounts — [FTC press release, 2023-05-31; acc. 2026-11-07](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-doj-charge-amazon-violating-childrens-privacy-law-keeping-kids-alexa-voice-recordings-forever)
- **[RULE]** Apple 5.1.4: apps that collect, transmit or can share a minor's personal information (including photos) must have a privacy policy and comply with children's privacy statutes. "For Kids"/"For Children" terms are reserved for the Kids Category. Kids Category apps may not send PII to third parties — [Apple App Review Guidelines; acc. 2026-11-07](https://developer.apple.com/app-store/review/guidelines/)
- **[RULE, dates partly contested]** App Store Accountability Acts:
  - **Texas SB 2420:** enjoined 2025-12-23; the 5th Circuit stayed the injunction 2026-05-28; the Supreme Court declined to intervene 2026-07-06, so it is enforceable. App stores provide age and consent signals to developers. Violations are deceptive trade practices.
  - **Utah SB 142:** core requirements reported effective 2026-05-06; one source says 2027.
  - **Louisiana HB 570:** 2026-07-01 per FPF; 2027 per another source.
  — [FPF, Comparing Enacted App Store Accountability Acts; acc. 2026-11-07](https://fpf.org/blog/comparing-enacted-app-store-accountability-acts/); [Ashurst Perkins Coie; acc. 2026-11-07](https://www.ashurstperkinscoie.com/en/insights/supreme-court-green-lights-the-texas-age-verification-law-for-app-stores/) (search summary)
- **[RULE, secondary]** California AB 1043 (Digital Age Assurance Act, signed 2025-10-13): operative 2027-01-01. OS and app-store providers supply an age-bracket signal (under 13, 13–15, 16–17, 18+), and developers must request it (one source says before 2027-07-01). AG enforcement of up to $2,500 (negligent) or $7,500 (intentional) per affected child; no private right of action — [Troutman Privacy, 2025-10; acc. 2026-11-07](https://troutmanprivacy.com/2025/10/analyzing-californias-digital-age-assurance-act/); [Hunton; acc. 2026-11-07](https://www.hunton.com/privacy-and-cybersecurity-law-blog/california-introduces-new-age-verification-requirements-for-software-applications) (search summary)
- **[RULE]** Apple's Declared Age Range API lets apps request a user-declared age range (declared by the user or a parent/guardian) — [Apple Developer, DeclaredAgeRange; acc. 2026-11-07](https://developer.apple.com/documentation/declaredagerange.md) (search summary). **[UNCERTAIN]** A secondary source says new App Store age-rating descriptors arrive 2026-11-16, with completion required by 2027-01-12 — [ppc.land; acc. 2026-11-07](https://ppc.land/apple-forces-13-rating-on-apps-with-social-feeds-from-september/)
- **[RULE]** FERPA (20 U.S.C. 1232g; 34 CFR Part 99) gives parents rights to access, amend and control disclosure of their children's education records. Rights transfer at 18 or postsecondary enrollment — [US Dept. of Education, Student Privacy, "What is FERPA?"; acc. 2026-11-07](https://studentprivacy.ed.gov/faq/what-ferpa)
- **[RULE]** Washington My Health My Data Act:
  - It covers entities doing business in or targeting Washington that determine the purposes of consumer health data processing.
  - "Consumer health data" includes health inferences drawn from non-health data.
  - Consent is needed to collect and share; a signed authorization is needed to sell.
  - Violations are per se Consumer Protection Act violations, with a private right of action.
  - In force since 2024-03-31 (2024-06-30 for small businesses).
  — [Washington AG, MHMDA FAQ; acc. 2026-11-07](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
- **[RULE]** FTC Health Breach Notification Rule: covers vendors of personal health records that can draw from multiple sources. Unauthorized disclosure, not just hacking, is a breach. Up to $53,088 per violation. Guidance dated July 2024 — [FTC, Complying with the HBNR; acc. 2026-11-07](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
- **[RULE, secondary]** Illinois BIPA covers scans of face geometry; photographs themselves are excluded. The 2024 amendment (P.A. 103-0769) counts damages per person, and the 7th Circuit (*Clay v. Union Pacific*, 2026-04-01) applied it retroactively — [Benesch; acc. 2026-11-07](https://www.beneschlaw.com/insight/illinois-amends-biometric-information-privacy-act-to-reign-in-liquidated-damages-and-permit-electronic-signatures/); [secureprivacy.ai BIPA 2026 guide; acc. 2026-11-07](https://secureprivacy.ai/blog/illinois-bipa-2026-guide) (search summary)

### Inferences
- **Adult-only accounts keep FamilyOS outside COPPA on federal law.** A parent uploading a child's school notice or photo is information "from an adult that pertains to a child," per the FAQ. The design should still treat such data as sensitive: minimize it, set short retention, exclude it from model training, and make deletion verifiable (the Alexa lesson).
- **Child-visible chores or child logins** are online collection from children. They would require COPPA verifiable parental consent, separate consent for any third-party disclosure (including possibly an LLM provider), a written retention policy and Apple 5.1.4 compliance. Keep the PRD's "child (deferred)" deferral until counsel signs off. **[COUNSEL]**
- **Age signals may create actual knowledge.** If FamilyOS receives a "<13" signal from Texas/Utah/California-style frameworks, that likely gives actual knowledge of a child user. Plan an age-gate response (block or route to parental consent). **[COUNSEL]**
- **FERPA** binds schools, not FamilyOS or the parent. A school notice in a parent's possession is not regulated by FERPA when stored by FamilyOS. State student-privacy laws generally reach operators serving schools, not parents. **[UNCERTAIN]**
- **Photos:** do not run face recognition or clustering on family photos without BIPA/CUBI-grade consent. Plain storage is lower risk. Child photos sent to a third-party vision LLM also raise the Apple 5.1.2(i) consent requirement.
- **Caregiver or medical tasks** (prescriptions, appointments, therapy) would make FamilyOS hold "consumer health data" under MHMDA. Even inferences count, e.g., "book pediatric allergist." It could also make FamilyOS a PHR vendor if it pulls health data from multiple sources (HBNR). Gate these features. **[COUNSEL]**

### Gaps
- The amended COPPA rule text (e.g., §312.10's written retention-policy requirement) was not read directly; eCFR redirected to a block page.
- Texas CUBI, Nevada SB 370 and Connecticut health-data provisions were not researched.
- State kids' codes (Maryland, Vermont, Nebraska) and the New York Child Data Protection Act were not checked for applicability to general-audience family apps.
- Google Play Families policy was not reviewed.

---

## 5. Privacy law and FTC Section 5 (AI claims, humans vs. AI, retention)

### Takeaway
CCPA applies from $26.625M revenue, or 100k consumers/households, or 50% of revenue from selling/sharing. Email and message contents are "sensitive personal information." About 20 states have comprehensive laws, and some have low thresholds. The FTC still pursues false or unsubstantiated AI capability claims (DoNotPay, Workado, Air AI) even after pulling back on "AI as such" cases (Rytr set aside). DOJ and SEC have prosecuted "AI" that was really humans (Nate, Presto). Saying a concierge human's work is automation, or automation is a human, is a direct deception risk.

### Cited Findings
- **[RULE]** CCPA thresholds after the CPI adjustment effective 2025-01-01: annual gross revenue **$26,625,000** (was $25M). Administrative fines up to $2,663, or $7,988 for intentional violations and those involving known minors under 16 — [CPPA, Updated Monetary Thresholds; acc. 2026-11-07](https://www.cppa.ca.gov/regulations/cpi_adjustment.html). The AG FAQ (updated 2026-08-28) still lists ">$25 million," 100,000+ consumers/households, or 50%+ of revenue from selling, so the two official pages conflict. SPI includes "contents of mail, email, and text messages," and selling data of known under-16s needs opt-in (a parent's for under 13) — [California AG, CCPA page, updated 2026-08-28; acc. 2026-11-07](https://oag.ca.gov/privacy/ccpa)
- **[UNCERTAIN]** State law count: about 20 comprehensive state laws. Indiana, Kentucky and Rhode Island took effect 2026-01-01. Rhode Island's threshold is 35,000 consumers, with no cure period. One tracker lists 2026 enactments in Oklahoma and Louisiana (2027-01-01), Alabama (2027-05-01) and Vermont (2028-01-01) (secondary; counts conflict) — [IAPP, 2026; acc. 2026-11-07](https://iapp.org/news/a/new-year-new-rules-us-state-privacy-requirements-coming-online-as-2026-begins); [Koley Jessen; acc. 2026-11-07](https://www.koleyjessen.com/insights/publications/new-state-privacy-laws-effective-january-1-2026-indiana-kentucky-and-rhode-island) (search summary)
- **[RULE]** Operation AI Comply (2024-09-25) brought five actions. DoNotPay, the "robot lawyer," allegedly did not test against human-lawyer quality and employed no attorneys. Remedy: $193,000, consumer notice, and a ban on claiming it substitutes for professional services without evidence — [FTC press release, 2024-09-25; acc. 2026-11-07](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes)
- **[RULE, secondary]** Workado (final order, August 2025): AI content-detector accuracy claims require competent and reliable evidence; the product was trained mainly on academic content — [Legal 500; acc. 2026-11-07](https://www.legal500.com/intelligence/united-states/media-telecoms-it-entertainment/ftc's-ai-crackdown-continues-workado-ordered-to-drop-unsupported-accuracy-claims)
- **[RULE, secondary]** Current FTC posture (Holland & Knight, 2026-08-19):
  - The Rytr order was set aside 2025-12-22 as an undue burden on AI innovation.
  - The FTC continues to act on false capability, earnings and substantiation claims: Air AI (proposed $18M judgment); FBA Machine ($15.7M); "Active Listening" AI ad-targeting claims ($880k plus $25k orders).
  — [Holland & Knight, 2026-08-19; acc. 2026-11-07](https://www.hklaw.com/en/insights/publications/2026/08/a-look-at-the-ftcs-current-approach-to-ai-regulation)
- **[RULE, allegations]** Nate: SDNY indicted former CEO Albert Saniger (April 2025) for securities and wire fraud. The "AI" shopping app's automation rate was allegedly effectively zero, with purchases completed by contractors in the Philippines. The SEC brought a parallel civil action — [TechCrunch, 2025-04-10; acc. 2026-11-07](https://techcrunch.com/2025/04/10/fintech-founder-charged-with-fraud-after-ai-shopping-app-found-to-be-powered-by-humans-in-the-philippines); [Fortune, 2025-04-11; acc. 2026-11-07](https://fortune.com/2025/04/11/albert-saniger-nate-shopping-app-fraud-ai-justice-department/). The DOJ press page returned empty.
- **[RULE]** Presto Automation (SEC, 2025-01-14): claims that drive-thru AI eliminated human order-taking were misleading, because offshore humans handled most orders. "Non-intervention" metrics excluded off-site humans. Cease-and-desist, no penalty — [DLA Piper, 2025-01-28; acc. 2026-11-07](https://www.dlapiper.com/en/insights/publications/ai-outlook/2025/sec-settlement-highlights-continued-focus-on-ai-washing); [Cooley PubCo, 2025-01-30; acc. 2026-11-07](https://cooleypubco.com/2025/01/30/sec-charges-ai-washing/)
- **[RULE]** Data retention: see Amazon Alexa in Q4. "COPPA does not allow companies to keep children's data forever" — [FTC, 2023-05-31; acc. 2026-11-07](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-doj-charge-amazon-violating-childrens-privacy-law-keeping-kids-alexa-voice-recordings-forever)

### Inferences
- **CCPA is likely not triggered at launch** on revenue. It could be triggered by the 100k consumers/households test as FamilyOS scales. Each household includes several people and the vendors whose data is stored. Build CCPA-grade rights (access, delete, correct, limit SPI) from day one anyway; Apple and Google demand deletion regardless.
- **Vendors' personal data counts.** Vendor contact data (sole proprietors are individuals) is personal information under most state laws. The B2B exemption under CCPA expired, per general knowledge rather than a source found here (see Gaps). **[COUNSEL]**
- **Concierge (Gate 1) disclosures:** marketing, UI and status labels must say when a human did the work ("handled by your FamilyOS coordinator"). Automation and completion rates must not exclude human interventions (the Presto lesson). Never claim "AI handled X" for human-performed tasks; investor materials carry securities-fraud exposure (the Nate lesson).
- **The reverse risk:** do not give the agent a human persona ("Hi, this is Sarah from FamilyOS") when no human is involved. This touches the BOT Act, Maine and Section 5.
- **Claims discipline:** "verified completion," "saves X hours" and similar claims need substantiation (test data), per DoNotPay and Workado.

### Gaps
- Texas TDPSA and Nebraska small-business (SBA-standard) applicability was not verified.
- CPPA ADMT and risk-assessment regulations (effective dates) were not researched.
- The CCPA B2B exemption sunset was not sourced in this session.
- No FTC case found specifically on "humans presented as AI." The cases found are DOJ/SEC investor-fraud cases.

---

## 6. App stores: Apple and Google rules

### Takeaway
Apple 5.1.2(i) now requires clearly disclosing, and getting explicit permission for, any sharing of personal data with "third-party AI" (added about 2025-11-13). FamilyOS will need an in-app consent screen before sending household data to an LLM provider. Using Google Sign-In means also offering an equivalent privacy-preserving login (in practice Sign in with Apple). In-app account deletion is mandatory on both stores, and Play also needs a web deletion link. Google Play's AI-generated content policy likely does not reach productivity uses such as AI-drafted emails.

### Cited Findings
- **[RULE]** Apple 5.1.2(i): developers must clearly disclose where personal data will be shared with third parties, "including with third-party AI," and obtain explicit permission first — [Apple App Review Guidelines (live); acc. 2026-11-07](https://developer.apple.com/app-store/review/guidelines/)
- **[UNCERTAIN, date]** The third-party AI language was added 2025-11-13 per most secondary sources; some say 2025-11-14 — [9to5Mac (search result); acc. 2026-11-07](https://9to5mac.com/?p=1028296); [Radom, 2025-11-15; acc. 2026-11-07](https://www.radom.com/insights/apple-updates-app-review-guidelines-to-strengthen-privacy-protections-against-third-party-ai-data-sharing)
- **[RULE]** Apple 4.8: apps that use a third-party or social login (e.g., Google Sign-In) for the primary account must also offer an equivalent login that limits data to name and email, lets users keep their email private, and does not collect interactions for ads without consent — [Apple App Review Guidelines; acc. 2026-11-07](https://developer.apple.com/app-store/review/guidelines/)
- **[RULE]** Apple 5.1.1(v) and account-deletion guidance:
  - Apps that support account creation must offer in-app deletion of the account and associated data, not merely deactivation.
  - It must be available to all users in all regions.
  - Sign in with Apple tokens must be revoked through the REST API.
  - The guidelines also bar storing social-network tokens off-device.
  — [Apple, Offering account deletion in your app; acc. 2026-11-07](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- **[RULE]** Apple 1.2 (UGC) now names "AI content creation apps," and 4.7 addresses chatbots and plug-ins — [Apple App Review Guidelines; acc. 2026-11-07](https://developer.apple.com/app-store/review/guidelines/)
- **[RULE]** Google Play account deletion requires in-app deletion plus a web link for deletion requests, and the Data safety form's deletion questions. Deadline was 2023-12-07, with enforcement after 2024-05-31. Service providers must also delete — [Google Play Console Help, account deletion; acc. 2026-11-07](https://support.google.com/googleplay/android-developer/answer/13327111)
- **[RULE]** Google Play AI-Generated Content policy: covers AI chatbots central to the app, image generation, and voice/video of real people. Out of scope "at this time": productivity apps using AI to improve an existing feature (example: AI-suggested email drafts) and summarization-only apps — [Google Play policy, undated; acc. 2026-11-07](https://support.google.com/googleplay/android-developer/answer/14094294)

### Inferences
- **Consent flow:** a first-run consent screen naming the AI provider(s) and the data categories sent (household notes, documents, photos, email content), with a granular toggle for documents and photos. This also helps the Google Limited Use transfer and CCPA SPI positions.
- **Login:** offering Google Sign-In (likely, given Gmail OAuth) triggers 4.8. Plan Sign in with Apple, plus its token revocation on deletion.
- **Deletion must cascade:** delete FamilyOS data, revoke OAuth tokens (Google, Microsoft, Apple), and request deletion from subprocessors (LLM, storage, SMS). Google Workspace policy also requires honoring deletion of Gmail-derived data.
- **Play AI policy:** FamilyOS's drafting assistant likely sits in the out-of-scope productivity carve-out. A standalone chat assistant could pull it in scope (flag the "central feature" test). **[UNCERTAIN]**

### Gaps
- Apple's own changelog entry for the November 2025 guideline update was not found.
- Apple age-rating changes for AI assistants were confirmed only by secondary sources.
- Google Play's requirement for in-app reporting of AI content was not confirmed on the current page.

---

## 7. Liability: electronic agents, booking commitments, recommendations, contractor-referral licensing

### Takeaway
Under E-SIGN and UETA, contracts formed through an electronic agent bind the person whose agent acted. Agent errors are generally the user's, unless the provider offered no way to prevent or correct them (UETA §10). The approval gate is both a UX feature and a legal control. If FamilyOS takes vendor lead fees, it moves toward regulated territory: in California, a referral service may only pass along licensed contractors' contact details and may not solicit or negotiate contracts. The FTC has sanctioned HomeAdvisor for deceptive lead claims.

### Cited Findings
- **[RULE]** E-SIGN 15 U.S.C. 7001(h): a contract or record "may not be denied legal effect" solely because electronic agents were involved in its formation, so long as the agent's action is "legally attributable to the person to be bound" — [15 U.S.C. 7001 (Cornell LII); acc. 2026-11-07](https://www.law.cornell.edu/uscode/text/15/7001)
- **[RULE, secondary]** UETA:
  - Adopted by all states and D.C. except New York, which uses ESRA.
  - §2(6) defines an electronic agent as acting without individual review.
  - §14 allows contracts formed through electronic agents even with no human review.
  - It generally attributes responsibility to the agent's user.
  - §10 error remedies depend on agreed security or confirmation procedures.
  - Developer ToS are the main liability-allocation tool.
  — [Proskauer, 2025-04-09; acc. 2026-11-07](https://www.proskauer.com/blog/contract-law-in-the-age-of-agentic-ai-whos-really-clicking-accept)
- **[RULE, secondary]** UETA §10(b) lets an individual avoid an erroneous electronic-agent transaction if no reasonable means to prevent or correct the error was provided. The right reportedly cannot be waived by fine print. Suggested safeguards are confirmations, review steps, spending thresholds and error reporting — [Consumer Reports Innovation Lab (Dazza Greenwood), 2025-05-19; acc. 2026-11-07](https://innovation.consumerreports.org/?p=10650)
- **[RULE]** California CSLB "Fast Facts" for online home-improvement marketplaces (PDF created 2018, modified 2020):
  - BPC §7026 defines a contractor to include anyone who offers to undertake work "by or through others."
  - A license is required for jobs of $500 or more (§7048); unlicensed contracting is a misdemeanor.
  - Referral services are legal within limits. They may not solicit or negotiate contracts for a contractor, and the customer should contract and pay the contractor directly.
  - Home Improvement Salesperson registration is required for anyone soliciting, selling, negotiating or executing contracts on a licensee's behalf (§§7152, 7154).
  - Advertising construction work requires a license (§7027.1), and ads must carry the license number (§7030.5).
  — [CSLB Fast Facts PDF; acc. 2026-11-07](https://www.cslb.ca.gov/resources/industrybulletins/online_marketplace_fast_facts.pdf)
- **[UNCERTAIN, secondary]** Other states vary. Maryland requires a home-improvement license, Connecticut a registration, and Pennsylvania HICPA requires contractor registration with the number in ads. New York has no statewide license but has a home-improvement contract law (search summary) — [Pennsylvania AG, HICPA text; acc. 2026-11-07](https://www.attorneygeneral.gov/wp-content/uploads/2018/01/Act_132_Home_Improvement.pdf); [agrlaw, HIS requirements; acc. 2026-11-07](https://www.agrlaw.com/15_requirements_for_home_improvement_salespersons)
- **[RULE]** FTC v. HomeAdvisor: final consent order April 2023, up to $7.2M redress. The FTC alleged misrepresentation of lead quality (homeowners not ready to hire, mismatched services or areas) and a falsely "free" first month of mHelpDesk — [FTC press release, Jan 2023; acc. 2026-11-07](https://ftc.gov/news-events/news/press-releases/2023/01/ftc-order-requires-homeadvisor-pay-72-million-stop-deceptively-marketing-its-leads-home-improvement) (search summary); [TechCrunch, 2023-01-23; acc. 2026-11-07](https://techcrunch.com/2023/01/23/the-ftc-fines-homeadvisor-up-to-7-2m-for-lying-about-lead-quality-and-other-matters)

### Inferences
- **Booking commitments.** If the approved message says "Yes, book Tuesday at $250," that is likely an acceptance attributable to the household (apparent authority, because it comes from the user's own address or number). Design rules:
  - Show the exact payload at approval, as the PRD already requires.
  - Hard-flag any message containing acceptance, price or date commitments.
  - Never let the agent agree to terms in follow-up replies without fresh approval.
  - Keep an immutable record of what was approved.
  These also serve as UETA §10-style error-prevention evidence.
- **ToS allocation:** FamilyOS terms will likely disclaim agent errors. Under UETA §10(b), and possibly state UDAP law, that may not fully work for consumers if confirmation steps are missing. **[COUNSEL]**
- **Recommendation liability:** if FamilyOS suggests vendors, label the basis ("from Google reviews; license not verified"), run a license lookup where state data exists (CSLB has one), and avoid "vetted/background-checked" claims unless true (the HomeAdvisor lesson).
- **Lead fees, commissions or a "pro network":** in California this risks referral-service limits, HIS registration or unlicensed-contractor theories if FamilyOS negotiates for vendors or is paid per job. Acting solely as the household's agent and taking no vendor money is the cleanest MVP posture. **[COUNSEL]** before any vendor monetization, state by state.

### Gaps
- No case law was found on liability for AI-agent-made bookings with home-service vendors.
- Section 230 applicability to AI-generated vendor recommendations was not researched.
- Marketplace-facilitator tax rules were not researched.
- State-by-state referral-licensing coverage beyond California is thin.

---

## 8. Website terms and browser agents (scraping directories, filling vendor contact forms)

### Takeaway
The Ninth Circuit (*Amazon v. Perplexity*, 2026-08-04) held on the facts before it that a user-directed agent's access is the user's access for CFAA purposes. It said the ruling sets no general regime and expressly preserved contract (ToS) and tort theories. Logged-off scraping of public data has fared well (*Meta v. Bright Data*; *X v. Bright Data*). Defeating anti-bot measures is the live risk: the *Reddit v. SerpApi/Perplexity* DMCA §1201 claims survived dismissal in July 2026. Browser Use Cloud's default stealth, CAPTCHA solving and anti-bot bypass should be turned off for FamilyOS.

### Cited Findings
- **[RULE]** *Amazon.com Services v. Perplexity AI*, No. 26-1444 (9th Cir. 2026-08-04, Smith and Tung):
  - The court vacated the CFAA/CDAFA preliminary injunction, holding it is the user who accesses Amazon with the Assistant's help.
  - The court said it does "not establish a new legal regime governing agentic AI."
  - It did not decide tort liability, and its holding is limited to CFAA "access" on this record.
  - Footnote 5: the outcome "does not impair Amazon's ability to regulate access" through its terms of service.
  - The dispute centered on Perplexity's choice not to use an identifying user-agent string.
  — [Ninth Circuit opinion (Courthouse News PDF), 2026-08-04; acc. 2026-11-07](https://www.courthousenews.com/wp-content/uploads/2026/08/amazon-v-perplexity-ninth-circuit-opinion.pdf)
- **[RULE]** Rehearing en banc was denied (order PDF; MLex reported 2026-09-10) — [Courthouse News, order PDF; acc. 2026-11-07](https://www.courthousenews.com/wp-content/uploads/2026/09/amazon-perplexity-no-rehearing.pdf); [MLex; acc. 2026-11-07](https://www.mlex.com/mlex/articles/2523861) (search summary). The district court had granted the PI in March 2026 — [CNBC, 2026-03-10; acc. 2026-11-07](https://www.cnbc.com/2026/03/10/amazon-wins-court-order-to-block-perplexitys-ai-shopping-agent.html)
- **[UNCERTAIN]** Commentary:
  - The ruling supports user responsibility, but provider control could change the result.
  - Contract, unfair-competition and tortious-interference theories remain open.
  — [Troutman Privacy, 2026-08-21; acc. 2026-11-07](https://www.troutmanprivacy.com/2026/08/ninth-circuit-holds-human-user-not-developer-of-ai-agent-responsible-for-websites-accessed/)
  - Courts may scrutinize how far providers facilitate user activity.
  — [Eric Goldman, 2026-08-06; acc. 2026-11-07](https://blog.ericgoldman.org/archives/2026/08/ninth-circuit-lifts-restrictions-on-agentic-ai-accessing-amazon.htm)
- **[RULE]** *Meta v. Bright Data* (N.D. Cal. 2024-01-23, Chen): summary judgment for Bright Data, holding logged-off scraping of public data did not breach Meta's terms. Meta later dropped the case — [Eric Goldman guest post, 2024-01; acc. 2026-11-07](https://blog.ericgoldman.org/archives/2024/01/game-on-bright-data-scores-major-victory-in-web-scraping-dispute-with-meta-guest-blog-post.htm)
- **[RULE]** *X Corp. v. Bright Data* (N.D. Cal. 2024-05-09, Alsup): state-law claims based on scraping and selling public posts were preempted by the Copyright Act. A later order allowed amended server-impairment claims (search summary) — [Frankfurt Kurnit, 2024-05; acc. 2026-11-07](https://technologylaw.fkks.com/post/102j7s5/blockbuster-ruling-federal-court-holds-that-copyright-act-preempts-xs-web-scrap); [MediaPost; acc. 2026-11-07](https://www.mediapost.com/publications/article/401510/x-corp-can-revive-scraping-battle-with-bright-dat.html)
- **[RULE]** *Google v. SerpApi* (N.D. Cal. 2026-07-20, Gonzalez Rogers): DMCA claims dismissed, partly with leave to amend — [Order PDF, 2026-07-20; acc. 2026-11-07](https://chatgptiseatingtheworld.com/wp-content/uploads/2026/07/Google-v-SerpApi-order-granting-motion-to-dismiss-July-20-2026.pdf) (search summary)
- **[UNCERTAIN, secondary]** *Reddit v. SerpApi, Oxylabs, AWMProxy, Perplexity* (S.D.N.Y. 1:25-cv-08736): the motion to dismiss was largely denied 2026-07-31. The court found Google's SearchGuard plausibly an effective access control and Perplexity plausibly a direct circumventor (search summary) — [Loeb & Loeb, 2026-08; acc. 2026-11-07](https://www.loeb.com/en/insights/publications/2026/08/reddit-v-serpapi-llc)
- **[RULE, vendor docs]** Browser Use Cloud:
  - Its docs say stealth is always on, with automatic CAPTCHA solving, Cloudflare/anti-bot bypass and a default US residential proxy.
  - Its stealth page claims bypass of Cloudflare, DataDome, Kasada, Akamai and PerimeterX.
  — [Browser Use docs, stealth (search summary); acc. 2026-11-07](https://docs.browser-use.com/usage/stealth); [Browser Use stealth browsers page; acc. 2026-11-07](https://browser-use.com/stealth-browsers)
  - Its remote browser page says managed browsers include CAPTCHA handling.
  — [Browser Use docs, Remote Browser; acc. 2026-11-07](https://docs.browser-use.com/customize/browser/remote)
  - The core library is MIT-licensed.
  — [browser-use LICENSE; acc. 2026-11-07](https://github.com/browser-use/browser-use/blob/main/LICENSE)
- **[RULE]** Yelp Terms (updated 2019-12-13, effective 2020-01-31) prohibit robots, spiders or other automated means to access or scrape the Service without express permission — [Yelp Terms of Service; acc. 2026-11-07](https://terms.yelp.com/tos/en_us/20200101_en_us/)

### Inferences
- **A user-directed, single-task agent** visiting a contractor's public website to fill a contact form, at the user's request and after approval, sits closest to the user-as-actor reasoning in *Amazon v. Perplexity*. Even so, the agent should identify itself (user-agent), avoid logged-in areas, and stop on CAPTCHAs or blocks.
- **Systematic scraping of directories** (Yelp, Google Maps, Angi) for a vendor database is a different, provider-driven activity. It breaches the terms of major directories, and ToS claims survived *Amazon v. Perplexity* (footnote 5). Use licensed APIs (e.g., Google Places or Yelp Fusion under their terms) instead. **[COUNSEL]** on API display and caching terms.
- **Do not use stealth, CAPTCHA solving or residential-proxy evasion.** After *Reddit v. SerpApi*, circumventing bot defenses carries DMCA §1201 exposure on top of ToS and CFAA risk. Configure Browser Use with stealth and CAPTCHA solving disabled, or use the open-source library with plain Chromium. This also matches the execution brief's "no bypassing access controls" rule.
- **Contact forms are vendor-owned channels.** Submitting messages through them is a form of outreach that should follow the same identification and approval rules as email. Avoid submitting at scale.

### Gaps
- *hiQ v. LinkedIn* final disposition (2022 breach-of-contract ruling and settlement) could not be verified; the search budget was exhausted.
- Google Maps Platform terms text was not retrieved.
- The primary text of the Reddit v. SerpApi order was not reviewed.
- No case found on agents filling third-party contact forms.

---

## 9. Security state of the art for email-reading agents

### Takeaway
FamilyOS has the full "lethal trifecta": private household data, untrusted vendor emails and web pages, and the ability to send. Adaptive attacks break most prompt-injection filters (>90% success against 12 published defenses). Even the best vendor-reported browser-agent rates are about 0.5% per attempt with full safeguards, and those safeguards are not present in raw API use. The defensible design is architectural:
- Rule of Two / CaMeL-style separation, so the model reading untrusted replies cannot send or reach sensitive stores.
- Deterministic policy and human approval of exact payloads.
- Patched agent frameworks: LangChain "LangGrinch" CVE-2025-68664 and the LangGraph checkpoint RCE CVE-2025-64439.

### Cited Findings
- **[RULE]** OWASP Top 10 for LLM Applications 2025: LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses, LLM09 Misinformation, LLM10 Unbounded Consumption — [OWASP GenAI, LLM Top 10; acc. 2026-11-07](https://genai.owasp.org/llm-top-10/)
- **[RULE]** OWASP Top 10 for Agentic Applications 2026 (published 2025-12-09): ASI01 Agent Goal Hijack, ASI02 Tool Misuse and Exploitation, ASI03 Identity and Privilege Abuse, ASI04 Agentic Supply Chain, ASI05 Unexpected Code Execution, ASI06 Memory and Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08 Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents — [OWASP resource page, 2025-12-09; acc. 2026-11-07](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/); names from [Cycode, updated 2026-07-21; acc. 2026-11-07](https://cycode.com/blog/owasp-top-10-agentic-applications/)
- **[RULE]** Lethal trifecta (Simon Willison, 2025-06-16): access to private data, exposure to untrusted content, and the ability to communicate externally. Willison is skeptical of guardrail products, noting a 95% detection rate is a failing grade in security — [simonwillison.net, 2025-06-16; acc. 2026-11-07](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- **[RULE]** Dual-LLM pattern: a privileged LLM never sees untrusted text, and a quarantined LLM processes it into symbolic outputs (Willison, April 2023; not re-fetched this session) — [simonwillison.net, Dual LLM pattern, 2023-04-25; acc. 2026-11-07](https://simonwillison.net/2023/Apr/25/dual-llm-pattern/)
- **[RULE]** CaMeL (Google DeepMind and others; arXiv 2503.18813, v1 2025-03-24, v2 2025-06-24) separates control flow, derived from the trusted user query, from data flow, and uses capabilities to enforce policies at tool calls. On AgentDojo it solves 77% of tasks with provable security versus 84% undefended — [arXiv 2503.18813; acc. 2026-11-07](https://arxiv.org/abs/2503.18813)
- **[RULE]** Meta's Agents Rule of Two (2025-10-31): within a session an agent should have at most two of: [A] untrusted inputs, [B] sensitive systems or private data, [C] state change or external communication. Otherwise it needs a fresh session or human approval. Meta says this is not a complete defense; a user who blindly approves still fails — [Meta AI blog, 2025-10-31; acc. 2026-11-07](https://ai.meta.com/blog/practical-ai-agent-security/)
- **[RULE]** "The Attacker Moves Second" (Nasr, Carlini, Tramèr et al.; arXiv 2510.09023, 2025-10-10): adaptive attacks bypassed 12 recent defenses, with success above 90% for most, although most had originally reported near-zero attack success — [arXiv 2510.09023; acc. 2026-11-07](https://arxiv.org/abs/2510.09023)
- **[UNCERTAIN, secondary report of system cards]**
  - Claude Opus 4.8 system card (2026-05-28): browser prompt-injection success 31.5% per attempt without safeguards, 0.5% with the full safeguard stack (Claude in Chrome, Cowork). API deployments ship without those safeguards.
  - OpenAI GPT-5.5 reports a connector robustness score of 0.963, not comparable to attack success rates.
  - Meta reports AgentDojo attack success falling from 17.6% to 1.75% with combined guardrails.
  — [VentureBeat, 2026-06-01; acc. 2026-11-07](https://venturebeat.com/security/anthropic-browser-agent-hijacked-31-percent-before-safeguards-engaged)
- **[RULE]** EchoLeak, CVE-2025-32711 (Aim Labs, June 2025; CVSS 9.3): a zero-click indirect prompt injection in Microsoft 365 Copilot. One crafted email could exfiltrate data from the user's context, bypassing Microsoft's XPIA classifier and abusing auto-loaded images. Microsoft fixed it server-side — [The Hacker News, 2025-06; acc. 2026-11-07](https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html); [arXiv 2509.10540, EchoLeak paper; acc. 2026-11-07](https://arxiv.org/pdf/2509.10540) (search summary). The NVD page did not render.
- **[RULE]** Gemini "Invitation Is All You Need" (SafeBreach, Tel Aviv University, Technion; disclosed to Google February 2025; Black Hat 2025): indirect prompt injection through Google Calendar invites, email subjects and doc titles hijacked Gemini for Workspace agents (spam, event deletion and more). Google deployed URL redaction, user-confirmation for sensitive actions, and notifications — [Project page; acc. 2026-11-07](https://sites.google.com/view/invitation-is-all-you-need); [Information Security Buzz; acc. 2026-11-07](https://informationsecuritybuzz.com/invitation-is-all-you-need-how-researchers-used-a-calendar-event-to-hijack-gemini-agents/) (search summary)
- **[UNCERTAIN, secondary]** 2026 incidents:
  - "ZombieAgent" (Radware, January 2026): hidden HTML instructions in emails targeted ChatGPT's Gmail and Outlook connectors.
  - "Reprompt," CVE-2026-24307: one-click exfiltration from Copilot Personal.
  - CVE-2026-21520: Copilot Studio agent hijack.
  — [Infosecurity Magazine; acc. 2026-11-07](https://www.infosecurity-magazine.com/news/new-zeroclick-attack-chatgpt/); [Vectra; acc. 2026-11-07](https://www.vectra.ai/topics/prompt-injection) (search summary)
- **[RULE]** LangGrinch, CVE-2025-68664 / GHSA-c67j-w6g6-q2cm (published 2025-12-23; CVSS 9.3):
  - Cause: langchain-core `dumps()`/`dumpd()` do not escape `lc`-keyed dicts, so attacker data (including through prompt-injected metadata fields) is revived as LangChain objects on load. This can leak environment secrets and instantiate trusted classes.
  - Affected: below 0.3.81, and 1.0.0 to below 1.2.5. Patched in 0.3.81 and 1.2.5.
  — [GitHub Advisory; acc. 2026-11-07](https://github.com/advisories/GHSA-c67j-w6g6-q2cm)
  - The related LangChain.js flaw, CVE-2025-68665 (CVSS 8.6), is fixed in @langchain/core 1.1.8 and 0.3.80.
  — [The Hacker News, 2025-12; acc. 2026-11-07](https://thehackernews.com/2025/12/critical-langchain-core-vulnerability.html)
- **[RULE]** LangGraph CVE-2025-64439 (GHSA-wwqv-p2pp-99h5; published 2025-11-07): RCE in langgraph-checkpoint's JsonPlusSerializer when deserializing "json"-mode payloads, a mode reached by fallback before 3.0. Fixed in langgraph-checkpoint 3.0.0. Risk is higher when untrusted data is persisted to checkpoints. Severity ratings conflict between sources — [SentinelOne vuln DB; acc. 2026-11-07](https://www.sentinelone.com/vulnerability-database/cve-2025-64439/) (search summary)

### Inferences
**Architecture for FamilyOS**
- **Reader/extractor:** a quarantined model reads vendor replies and web pages. It has no tools, no access to household documents and no send capability. It outputs only a typed schema (price, date, availability, questions, sentiment) validated by code. Raw vendor text is shown to the human, never fed into the planner as instructions.
- **Planner/drafter:** a privileged model sees household context and structured extracts only.
- **Sender:** a deterministic service that sends only an exact payload the human approved, through a recipient allowlist (vendors in the task), with rate limits and idempotency keys.
- Together these satisfy Rule of Two: no component has A, B and C at once without human approval.

**Controls**
- No auto-rendering of remote images or links in agent contexts (the EchoLeak vector).
- Egress allowlist for tools.
- Treat calendar and email metadata (subjects, titles) as untrusted (the Gemini lesson).
- Approval UI shows a diff between the draft and what the human saw.
- Granular confirmation per agentic action, which the Google Workspace policy also requires (Q1).

**Approval fatigue**
- Meta notes blind approvals defeat Rule of Two. Keep approvals rare, high-signal and specific (who, what, money, commitments).

**Framework hygiene**
- Pin langchain-core ≥ 0.3.81 or ≥ 1.2.5, and langgraph-checkpoint ≥ 3.0.
- Never `load()` serialized objects that may contain model or user-controlled data.
- Store checkpoints as plain data with explicit schemas.
- Track GHSA feeds for LangGraph and the OpenAI Agents SDK.

**Measurement**
- Run an AgentDojo-style injection suite against FamilyOS's own flows (malicious vendor replies, poisoned PDFs and photos) as a release gate. Don't rely on vendor-reported rates.

### Gaps
- The primary Anthropic and OpenAI system cards and the NIST CAISI agent-hijacking evaluation were not fetched; figures are from secondary reporting.
- No 2026 LangGraph-specific CVE was found.
- The OWASP Agentic PDF was not read directly.

---

## 10. Copyleft: GPL-3.0 vs. AGPL, hosted service vs. distributed mobile client, learning from nanoMuse

### Takeaway
nanoMuse is GPL-3.0-or-later and includes phone, desktop, web-console and relay code.
- Server-only use of GPL code without distribution triggers no source-release duty. AGPL would.
- Shipping any GPL-derived code in the iOS or Android client, or in JavaScript sent to browsers, makes FamilyOS distribute it, so the combined client must be GPL.
- Reading the repo for ideas and architecture is generally lawful, because copyright does not protect ideas, systems or methods.
- The real risk is literal or close copying, including through AI coding assistants given nanoMuse as context. A documented clean-room process mitigates that.

### Cited Findings
- **[RULE]** The nanoMuse repository's LICENSE is the GNU GPL v3 text; the GitHub API reports SPDX GPL-3.0. The README says the phone app, desktop app, web console and relay are all under GPL-3.0-or-later and describes the project as in the style of Meta's Muse. Last push 2026-11-07 — [nanoMuse README; acc. 2026-11-07](https://github.com/nano-muse/nanoMuse); [LICENSE; acc. 2026-11-07](https://github.com/nano-muse/nanoMuse/blob/main/LICENSE)
- **[RULE]** GPL FAQ:
  - The GPL does not require releasing a modified version used without distribution; a company running modified GPL code on a website need not release it (#GPLRequireSourcePostedPublic, #UnreleasedMods).
  - GPL programs sent to visitors' browsers must have source released.
  - The AGPL requires offering source to all users interacting over a network (#UnreleasedModsAGPL).
  - Static or dynamic linking creates a combined work (#GPLStaticVsDynamic, #LinkingWithGPL).
  - Separate programs communicating over pipes or sockets are normally an aggregate, unless they intimately share complex data structures (#MereAggregation, #GPLPlugins).
  — [GNU GPL FAQ; acc. 2026-11-07](https://www.gnu.org/licenses/gpl-faq.html)
- **[RULE]** AGPL purpose: closes the server loophole. If you run a modified program on a server for others, users must be able to download its source — [FSF, Why the Affero GPL, updated 2022-01-02; acc. 2026-11-07](https://www.gnu.org/licenses/why-affero-gpl.html)
- **[RULE]** 17 U.S.C. 102(b): copyright protection does not extend to "any idea, procedure," process, system, method of operation, concept, principle or discovery — [17 U.S.C. 102 (Cornell LII); acc. 2026-11-07](https://www.law.cornell.edu/uscode/text/17/102)
- **[RULE]** The competitor audit already flags nanoMuse as a "reference implementation," not to be forked into proprietary code without legal clearance — [local: COMPETITOR_AUDIT.md, lines 66–75]

### Inferences
- **Hosted backend (GPL-3.0 code):** even if FamilyOS incorporated nanoMuse server or relay code and never distributed it, the GPL would impose no source obligation. Any future on-prem, self-hosted or desktop distribution would. If any dependency is AGPL, network use alone triggers source-offer duties. Audit transitive dependencies for AGPL (e.g., some databases, agents, browser tooling).
- **Mobile client:** including GPL code (or code derived from nanoMuse's phone app) makes the app a covered work. The whole client would have to be offered under GPLv3 with source. App Store terms have historically been considered in tension with GPL obligations (e.g., the VLC removal in 2011, from general knowledge, not sourced here). Treat this as a **hard no** for proprietary FamilyOS.
- **"Learning from" a GPL repo:** reading design docs, flows, data models and UX for ideas is low risk (§102(b)). Risk rises with copied file structure, identifiers, comments, prompts, non-trivial code fragments, or "translated" code. Mitigations:
  1. A written clean-room protocol: notes on behavior and architecture only, no code excerpts.
  2. Do not load the nanoMuse repo into AI coding-assistant context for FamilyOS work.
  3. Code-similarity scans before release.
  4. Keep the provenance record.
- **Prompts and system-prompt text in nanoMuse** are likely copyrightable expression too. Do not reuse them verbatim.
- **[COUNSEL]** for any plan to reuse nanoMuse code, assets or prompts, or to interoperate with its relay protocol in a way that embeds its code.

### Gaps
- The GPL FAQ entries on App Store distribution and AGPL network-interaction details were in the unread portion of the page.
- No case law was found on AI-assisted "re-implementation" of GPL code.
- nanoMuse's bundled dependency licenses and any separate asset or trademark terms were not reviewed.
