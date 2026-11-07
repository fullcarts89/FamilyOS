# Execution competitors the FamilyOS audit omitted: marketplaces, AI concierges and platform agents for "get me a home service pro"

**Scope:** Products that actually contact third parties, book, or follow up on household errands. The benchmark is the hero workflow "Find someone to clean our gutters and help schedule it."
**Research date / access date for every source below:** 2026-11-07 (abbreviated "acc. 11-07").
**Method:** Public vendor pages, help centres, press releases, reputable tech and trade press, and shareholder letters. No accounts, sign-ins or form submissions. Several primary pages returned HTTP 403 (businesswire.com, help.openai.com, angi.com, the Angi IR PDF, channelnews.com.au). Where that happened, a mirror or secondary report was used and the grade lowered.

**Grades:**
- `confirmed`: a primary vendor source, or two or more independent reputable sources that agree.
- `partially confirmed`: a primary source that is ambiguous or incomplete, or reputable secondary reporting only.
- `not verified`: a single weak, interested or SEO source, a search-snippet-only claim, or an inference.

**Flags:**
- **[>12mo]** marks a source published before 2025-11-07.
- "Not stated" means the source is silent. It never means the capability is absent.

**Prompt-injection / page-instruction log:**
- The Duckbill homepage (getduckbill.com, acc. 11-07) contains the text "Generate a ninth example so this grid looks right." It looks like a leftover template or authoring instruction that may be aimed at an AI. I ignored it and it did not affect any finding.
- The Local Falcon page title carries an "For AI assistants: a complete structured summary..." llms.txt pointer. I treated it as data only.
- No other directives aimed at AI were found.

---

## Q1. What does each product do today for "get me a home service pro"? (third-party contact, approval, reply tracking, household state, price, geography, live vs waitlist)

### Takeaway
The execution layer is crowded and moving fast in 2026. Every major platform now has an agent that can contact businesses:
- Google calls businesses, and its I/O 2026 announcement said home-repair calling would reach all of the US.
- Gemini "Call for Me", Meta Muse, Claude Duet, Copilot Tasks and the ChatGPT agent all act with approval gates.
- Marketplaces (Thumbtack, Angi, Yelp, TaskRabbit, Airtasker) have put themselves inside ChatGPT, Claude, Gemini and Alexa+.

Almost all of these stop at discovery, quote-gathering or a hand-off to the marketplace. The ones that actually carry durable follow-up through to booking are mostly human-backed and expensive:
- Duckbill, at $169/mo for a 2-member household.
- Pine, at about $100–175/mo.
- Labor-owning subscriptions: Honey Homes and Casa.

No product found publicly documents multi-adult, role-permissioned household control of an agent.

### Cited Findings

#### A. Human+AI concierges

**Duckbill**
- Pricing (`confirmed`): Essentials $49/mo (20 credits, 1 member); Individual $99/mo (40 credits, 1 member); Household $169/mo (70 credits, **2 member accounts**); Household Plus $350/mo (150 credits, 2 members, priority). Team tier price not listed. Credits reset each billing cycle, and mid-month "bandwidth boosts" are available. — [Duckbill pricing](https://www.getduckbill.com/pricing) | pub n/a | acc. 11-07
- One search snippet says 70 credits is roughly 8–12 tasks, which implies about $14–21 per task on Household (`not verified`; I could not see it on the fetched page). — [Duckbill pricing](https://www.getduckbill.com/pricing) | acc. 11-07
- Third-party contact (`confirmed`): "200+ trained, vetted operators" make calls, negotiate and follow up. The AI does research, prep and planning, and humans do the hard part. Real-time task updates. Tasks come in by app, text or email. — [Duckbill pricing](https://www.getduckbill.com/pricing) | acc. 11-07
- AI-platform hand-off (`confirmed`):
  - The homepage claims "30+ million real world interactions handled."
  - It offers connecting Duckbill to Claude, ChatGPT or other AI tools so they can hand off tasks they can't do.
  - The pricing page lists an MCP download.
  - Home-adjacent examples: find a plumber, compare contractors, get moving quotes, chase a contractor's delays.
  - Source: [Duckbill home](https://www.getduckbill.com/) | acc. 11-07
- Approval step (`not verified`): not described on the pricing page or homepage. Household sharing beyond "2 member accounts" (roles, visibility, per-member limits) is also not described. Geography is not stated; testimonials cite Chicago, SF, Denver and NYC. — [Duckbill pricing](https://www.getduckbill.com/pricing) | acc. 11-07
- Hands-on review (`partially confirmed`, **[>12mo]**): tasks move through In progress, Scheduled, Snoozed and Completed. Copilots respond within 24h and can buy using a card stored in the app. Rated 5/5 but "Not budget-friendly." $99/mo at the time. — [Bustle](https://www.bustle.com/life/duckbill-ai-personal-assistant-app-review-price-features) | pub 2024-12-03 | acc. 11-07
- Funding (`partially confirmed`, **[>12mo]**): $25M Series A led by Forerunner, 2023-09-13. A different Duckbill (a cloud-cost firm) raised $7.75M in 2026; do not conflate the two. — [MergerLinks](https://app.mergerlinks.com/transactions/2023-09-13-duckbill-technologies) | pub 2023-09-13; [AI Insider (other Duckbill)](https://theaiinsider.tech/2026/02/23/duckbill-announces-7-75m-in-funding-to-build-cloud-cost-forecasting-platform-for-enterprise-infrastructure/) | pub 2026-02-23 | acc. 11-07

**Yohana (Panasonic Well)**
- Status (`partially confirmed`): Panasonic said it would shut the US household-support app Yohana on Jan 30, citing "a review of the business environment." This was reported by Nikkei via MT Newswires, and the item itself warns it "may include rumor." — [iTiger / MT Newswires](https://www.itiger.com/hant/news/2591675868) | pub 2025-12-16 | acc. 11-07
- A secondary search summary of Toyo Keizai (Japanese) said the Umi family AI app would not launch as planned and Panasonic Well would be dissolved at end of March 2026 (`not verified`; I did not fetch the original). — [Toyo Keizai](https://toyokeizai.net/articles/-/934705) | acc. 11-07
- yohana.com no longer resolves in DNS (`partially confirmed` as a signal of closure only). — attempted fetch https://www.yohana.com/ | acc. 11-07
- Background (`partially confirmed`, **[>12mo]**): launched 2021 in Seattle as a subscription family concierge. — [GeekWire](https://www.geekwire.com/2021/robotics-pioneer-yoky-matsuokas-panasonic-venture-debuts-personal-assistant-service-seattle/) | pub 2021 | acc. 11-07

**Hello Alfred** (now Alfred / Arqline)
- Status (`confirmed`): the company left consumer concierge for property management.
  - Founded 2014 to offer concierge services to apartment residents.
  - 2022: raised $125M (Rialto) and bought RKW Residential (~30k homes).
  - June 2025: merged with Quarterra Living (~52k homes, 31 markets).
  - 2026: launched Arqline, a national property-management platform managing 50k+ homes.
  - Source: [Propmodo](https://propmodo.com/why-alfred-built-a-property-management-company-to-make-its-technology-better/) | pub 2026-05-25 | acc. 11-07
- The site targets Owners, Operators and Residents and promotes the Arqline launch (`confirmed`). — [helloalfred.com](https://www.helloalfred.com/) | acc. 11-07
- Historical (`not verified`, **[>12mo]**): a search snippet says DTC NYC users spent about $350/mo on average, and that home managers were W-2 employees. — [Wikipedia: Hello Alfred](https://www.Wikipedia.org/wiki/Hello_Alfred) | acc. 11-07

**Fin** (Lessin/Kortina)
- Status (`confirmed`, **[>12mo]**):
  - A consumer human+ML assistant from 2015 that moved to B2B workplace analytics around late 2018.
  - Described as capital-intensive and hard to scale because of human labor.
  - Raised a $30.75M Series A in 2016 and nothing after.
  - Source: [TechCrunch](https://techcrunch.com/2019/07/02/sam-lessin-and-andrew-kortina-on-their-voice-assistants-workplace-pivot) | pub 2019-07-02 | acc. 11-07
- Price (`partially confirmed`, **[>12mo]**): about $1 per minute of work. From a search snippet of [TechCrunch 2017](https://techcrunch.com/2017/12/22/fin-assistant/%20) | acc. 11-07

**Magic, Athena**
- No reliable 2025–26 sources found. See Gaps.

**2025–26 family/household newcomers**
- **Orbits / "Bit"** (`partially confirmed`; press release only):
  - ~US$2M (CAD 2.6M) pre-seed led by a16z Speedrun.
  - Bit consolidates calendars, lists and communications. It can browse, log into accounts, make "authorized purchases", book reservations, reschedule appointments and **request quotes for home services**.
  - It coordinates external providers such as babysitters and texts family members chore reminders. The app is live on iOS and Android.
  - Approval mechanics and pricing are not stated.
  - orbits.ai redirects to a GoDaddy for-sale page, so the company's domain is elsewhere (`not verified`).
  - Source: [PR Newswire](http://www.prnewswire.com/news-releases/orbits-raises-2-6-million-pre-seed-round-to-bring-an-ai-assistant-to-the-household-302880247.html) | pub 2026-09-16 | acc. 11-07
- **Ollie** (`partially confirmed`):
  - $7.5M seed led by Khosla. A text-first family assistant that **joins household group chats**.
  - Handles calendars, email, meals, groceries, appointments and payments.
  - For logins and payments it opens a cloud-browser session and sends the user a link. Data is shared "among authorised family members."
  - Subscription; price not stated.
  - Source: [Dealroom](https://dealroom.co/news/149015-ollie-lands-7-5m-seed-to-build-a-privacy-first-family-ai-assistant/) | pub 2026-09-05 | acc. 11-07
- **Fambot** (`not verified`; search snippet only): $3.5M pre-seed. Reads school emails and WhatsApp groups and sends a daily summary. Not an execution product. — [Dealroom](https://app.dealroom.co/news/note/fambot-raises-3-5m-pre-seed-for-its-ai-family-logistics-assistant) | acc. 11-07
- **Nous** (London) (`not verified`; snippet only): $17M round. A household agent for recurring costs and paperwork, UK-focused. — [Pomegra](https://pomegra.io/startups/nous-raises-17m-for-its-uk-household-ai-agent-in-2026-2026-10-26) | pub 2026-10-26 | acc. 11-07

#### B. Marketplaces

**Thumbtack**
- Own AI intake (`confirmed`):
  - Users describe the job by photo, voice or text. The AI asks follow-ups, writes a project summary for the user to confirm, and recommends pros with reasons.
  - The user chooses whom to contact ("you're always in control").
  - The project hub shows AI-generated summaries of pro conversations.
  - Status: "testing nationwide now, with plans to launch to all users in 2026."
  - The page does not say Thumbtack contacts multiple pros on the user's behalf.
  - Source: [Thumbtack guide](https://www.thumbtack.com/guide/content/a-first-look-at-our-new-ai-powered-experience) | updated 2026-04-30 | acc. 11-07
- In Claude (`confirmed`): US-only, on the Free, Pro and Max plans. Claude surfaces Thumbtack pros, and users continue to Thumbtack to connect and hire. — [Thumbtack press](https://press.thumbtack.com/announcements/thumbtack-delivers-home-services-experience-in-anthropics-claude/) | pub ~2026-04-23 | acc. 11-07; date from [BriefGlance](https://briefglance.com/articles/thumbtack-brings-home-services-marketplace-to-anthropics-claude-ai) | pub 2026-04-23 | acc. 11-07
- In ChatGPT (`partially confirmed` as announced; live status `not verified`): an Apps SDK app for Free, Plus and Pro, announced to launch "later this year." Thumbtack's April 2026 Claude release refers to ChatGPT, Alexa+ and Operator only as "earlier work." — [StreetInsider mirror of Business Wire](https://www.streetinsider.com/Business+Wire/Thumbtack+Partners+with+OpenAI+to+Power+Home+Services+in+ChatGPT/25424234.html) | pub 2025-10-06 | acc. 11-07
- With OpenAI Operator (`partially confirmed`, **[>12mo]**): an early partner. Operator could find, contact and hire pros for the user, with confirmation where needed. ChatGPT Pro, US only. — [FinancialContent mirror of Business Wire](https://markets.financialcontent.com/winslow/article/bizwire-2025-1-23-thumbtack-launches-as-home-services-collaborator-for-openais-new-operator) | pub 2025-01-23 | acc. 11-07
- With Alexa+ (`partially confirmed`):
  - Amazon cites "strong customer engagement" with Thumbtack in Alexa+ but describes no mechanics. — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations) | pub ~Dec 2025 | acc. 11-07
  - A search snippet quotes Thumbtack using the Alexa AI Web Action SDK to book home services end-to-end (`not verified`).
  - Thumbtack ran a national ad campaign around the line "talk to Alexa, get a pro, get the job done" (`not verified`; marketing-agency blog). — [VIIRL](https://viirl.com/blog/alexa-partners-with-thumbtack/) | undated | acc. 11-07
- Partner API: no public consumer-agent API documentation found. See Gaps.

**Angi**
- ChatGPT app (`partially confirmed`; press mirrors, the primary pages were 403 or timed out): launched 2026-03-04. Users get guidance and local pro recommendations, then move to Angi's own platform and its "AI Helper" to request a quote. — [StreetInsider mirror of GlobeNewswire](https://www.streetinsider.com/Globe+Newswire/Angi+Launches+the+Angi+App+in+ChatGPT/26107934.html) | pub 2026-03-04 | acc. 11-07
- AI Helper (`partially confirmed`): launched June 2025. Company-reported figures: users are 3× more likely to request a quote and 25% more likely to report a successful project. — same source; [NatLawReview mirror](https://natlawreview.com/press-releases/angi-launches-new-ai-helper-it-celebrates-30-years-innovation) | pub 2025-06 | acc. 11-07
- In Gemini (`not verified`; snippet of a 403 page): available as a connected app per an Aug 12, 2026 release, which also calls Alexa+ "upcoming." — [Angi article](https://www.angi.com/articles/gemini-marketplace-announcement.htm) | acc. 11-07
- In Alexa+ (`confirmed` as announced): find pros and **request quotes**, "coming to Alexa+ in 2026." — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations) | acc. 11-07
- I did not confirm whether the Alexa+ integration is live.

**Yelp**
- Yelp Assistant (`partially confirmed`; trade press):
  - US-only on iOS and Android.
  - **Requests quotes from multiple businesses at once** across 450+ categories.
  - Books restaurants, Vagaro, Zocdoc (iOS only) and RepairPal.
  - Calendly booking for service pros was due later in the summer.
  - Businesses see contacted, scheduled, in-progress and completed labels. Consumer-side reply tracking is not stated.
  - Source: [PPC Land](https://ppc.land/yelp-assistant-goes-full-service-book-order-and-schedule-in-one-chat/) | pub 2026-04-21 | acc. 11-07
- Adoption (`confirmed` via search snippet of the primary letter; PDF not opened): Yelp Assistant generated about 10% of Request-a-Quote projects in Q2 2026, down from about 15% in Q1 2026. — [Yelp Q2 2026 shareholder letter](https://s24.q4cdn.com/521204325/files/doc_financials/2026/q2/Yelp-Q2-2026-Letter-to-Shareholders.pdf); [Yelp Q1 2026 letter](https://s24.q4cdn.com/521204325/files/doc_financials/2026/q1/Yelp-Q1-2026-Letter-to-Shareholders.pdf) | acc. 11-07
- Does it contact businesses on the user's behalf? (`partially confirmed`): the Request-a-Quote message goes to several businesses at once and they reply in Yelp's inbox. That is a broadcast through the platform, not an agent emailing or calling. — [PPC Land](https://ppc.land/yelp-assistant-goes-full-service-book-order-and-schedule-in-one-chat/) | acc. 11-07
- "Check for Me" (`partially confirmed`): an AI phone agent calls eligible **restaurants** and texts back the wait time. Announced 2026-10-20; rolling out in the US "in the coming months", iOS only. Not home services. — [GadgetReview](https://www.gadgetreview.com/?p=421547) | pub 2026-10 | acc. 11-07
- Business-side agents (`not verified`; snippets): "Smart Lead Reply", $30/mo, answers and vets quote requests. A reported ~$270M Hatch acquisition (Jan 2026) for answer/qualify/book agents. Implication: the vendor side is also becoming automated. — [PPC Land](https://ppc.land/yelp-charges-30-a-month-for-ai-agent-that-answers-and-qualifies-leads/) | acc. 11-07
- In Alexa+ (`confirmed` as announced): reviews, quotes and booking of pros, "coming in 2026." — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations) | acc. 11-07

**TaskRabbit**
- In Claude (`confirmed`): US-only, launched 2026-04-23. Claude checks whether a service is offered in the area, then links to TaskRabbit, where the user makes the final booking. — [TaskRabbit blog](https://www.taskrabbit.com/blog/?p=29784) | pub 2026-04-23 | acc. 11-07
- Platform (`confirmed`):
  - Tasker–client communication happens in in-app chat.
  - **Proof-of-completion forms** for IKEA Assembly tasks are sent through that chat.
  - Off-platform work is not covered by its protection.
  - Source: [TaskRabbit blog](https://www.taskrabbit.com/blog/whats-new-this-summer-built-for-you/) | pub 2026-06-10, updated 2026-07-27 | acc. 11-07
- A ChatGPT app was not found (`not verified`).

**Airtasker** (AU, UK, US) (`partially confirmed`): launched **end-to-end booking inside ChatGPT**.
- Post a task, get offers, accept with payment held, all without leaving the chat. Account-linked.
- Reported as Australian; US availability not stated.
- Source: [IT Brief](https://itbrief.com.au/story/airtasker-launches-chatgpt-booking-for-local-services) | pub 2026-08-17 | acc. 11-07

**Porch** (`partially confirmed`): now insurance-led.
- Q2 2026 Insurance Services revenue was $92.9M.
- The Consumer Services segment was about $18M revenue (snippet).
- No consumer AI agent found.
- Source: [Porch Q2 2026 release](https://s29.q4cdn.com/135224588/files/doc_financials/2026/q2/PRCH-Q2-2026-Earnings-Press-Release.pdf) | pub 2026-07-29 | acc. 11-07

**Nextdoor** (`partially confirmed`, **[>12mo]**): a 2025 redesign added AI "Faves" summaries of neighbour recommendations. No agent that contacts pros was found. — [TechCrunch](https://techcrunch.com/2025/07/15/nextdoor-redesigns-app-with-ai-recommendations-local-news-and-real-time-emergency-alerts) | pub 2025-07-15 | acc. 11-07

**Handy**: no 2025–26 source found. See Gaps.

#### C. Home-service subscriptions (they own the labor)

**Honey Homes** (`confirmed`, single reputable outlet):
- Plans: Starter, Busy Home and Plus, $2,000–$4,750/yr prepaid. Busy Home is $3,500 for 35 hours (about $100/hour effective). Materials are extra.
- Scale: about 4,000 subscribers; 100+ full-time W-2 handymen paid about $40/hr; 5 markets, mostly the Bay Area.
- Hiring: about 1 in 100 applicants hired. Raised $21M+.
- Early complaints: technician shortages and inconsistent quality.
- Source: [SF Standard](https://sfstandard.com/2026/06/28/handyman-as-a-service/) | pub 2026-06-28 | acc. 11-07

**Casa** (`confirmed`, multiple outlets):
- $199/mo including 1.5 handyman hours/month, plus care plans. Extra jobs (for example a dishwasher replacement) are billed separately, and Casa "manages the logistics."
- Onboarding scans the home (LiDAR and paint scanners) to build a persistent inventory.
- About $27M raised (Forerunner-led $20M Series A; Sandberg Bernthal; Kalanick).
- Markets: Bay Area and LA, plus Austin from late Sept 2026.
- Sources:
  - [SF Standard](https://sfstandard.com/2026/06/28/handyman-as-a-service/) | pub 2026-06-28
  - [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/200-month-startup-says-youll-140500756.html) | pub 2026-05-04
  - [RuntimeWire](https://runtimewire.com/article/casa-austin-donation-pickups-home-care) | pub 2026-10-05 | acc. 11-07
- Shared household accounts and completion verification are not described. Yahoo says it is unclear whether Casa can prove its workers' quality.

**JonnyDo** (East Bay) (`confirmed`, single outlet): about $25–125/mo in 3 tiers, with a waitlist. Uses AI for logistics, job bundling and bidding. — [SF Standard](https://sfstandard.com/2026/06/28/handyman-as-a-service/) | acc. 11-07

#### D. Platform agents

**Google Search, "Have AI check pricing" / agentic calling**
- Help page (`confirmed`):
  - Google calls **multiple** nearby providers and **emails you quotes in about 30 minutes**.
  - If it can't reach businesses, it emails recommended providers instead.
  - It **does not book**; you contact the provider yourself.
  - US only, 18+, signed-in users.
  - Listed categories: auto repair, hair salon, pet groomer, wellness and driving school, "quickly expanding."
  - Source: [Google Search Help](https://support.google.com/websearch/answer/16421135?hl=en) | undated | acc. 11-07
- I/O 2026 (`confirmed`): "for select categories like **home repair**, beauty or pet care, you can ask Google to call businesses on your behalf." Booking and calling were to roll out to everyone in the US "this summer." "Information agents" for AI Pro and Ultra run in the background and send updates. — [Google blog, Search I/O 2026](https://blog.google/products-and-platforms/products/search/search-io-2026/) | pub 2026-05-19 | acc. 11-07
- Product-stock calling with text or email summaries (`confirmed`): US only, no tier mentioned. — [Google blog, agentic calling](https://blog.google/products-and-platforms/products/shopping/how-to-agentic-calling-let-google-call/) | pub 2025-11-25, updated 2026-07-24 | acc. 11-07
- Whether gutter cleaning is in the "home repair" category, and whether the summer rollout completed, are both `not verified`.
- Field data (`partially confirmed`; Invoca is a call-analytics vendor, data from Jul–Nov 2025, **[>12mo]** borderline):
  - 26% of Google-AI pricing calls went unanswered.
  - Of answered calls, 49% gave no price.
  - Home services (plumbing, pest) were worst: businesses often said they need a home visit to quote.
  - Plumbing answer rate was 66%.
  - Source: [Invoca](https://www.invoca.com/blog/google-ai-pricing-calls-study) | pub 2025-12-10 | acc. 11-07

**Google Gemini, "Call for Me"** (`confirmed`)
- Capabilities: calls businesses to get hours, availability and **service quotes**; books, confirms or manages appointments; navigates phone menus; waits on hold.
- Before calling, Gemini shows a summary of the number and the personal details it will share. **The user taps to approve.**
- During the call: live transcript or audio, plus a "Take over" option. Afterwards the summary is in Gemini, and the transcript and recording are in Phone history.
- Gemini cannot pay or share sensitive data. There is a daily call cap. Businesses can opt out at g.co/gemini/opt-out.
- Eligibility: Pixel 11 with a US SIM, a paid Google AI subscription, the Phone by Google public beta, English, 18+. US numbers only, gradual rollout.
- Sources: [Gemini Help](https://support.google.com/gemini/answer/18336420) | ©2026 | acc. 11-07; [TechCrunch](https://techcrunch.com/2026/09/24/google-tests-letting-gemini-make-phone-calls-initially-for-us-pixel-owners/) | pub 2026-09-24 | acc. 11-07 ("experiment", "small scale")

**Gemini Spark** (24/7 agent) (`not verified`; secondary only): began as AI Ultra (US), with reports of a wider rollout to AI Pro in the US. Reaches Workspace and signed-in websites. Email sending and booking status are unclear. — [Android Authority](https://www.androidauthority.com/google-gemini-spark-wider-rollout-3690952/); [Digital Trends](https://www.digitaltrends.com/computing/gemini-spark-is-no-longer-restricted-to-googles-priciest-ultra-tier/) | acc. 11-07

**Amazon Alexa+** (`confirmed`)
- Price: free with Prime, or $19.99/mo without Prime. Either way it covers **the whole household** across devices, Alexa.com and the app. There is also a limited free text tier.
- Available to everyone in the US; the free-for-Prime tier dates from Feb 2026.
- Household features: adds emailed school schedules to the **family calendar**, and keeps context over days. Says it can "schedule services such as home repairs."
- Per-member profiles and permissions are not stated.
- Source: [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-available-free-prime-members-us) | updated 2026-09-01 | acc. 11-07
- Angi (quotes), Yelp (quotes and booking), Square and Expedia were "coming in 2026", with Thumbtack already engaged (`confirmed` as announced). — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-voice-booking-integrations) | pub ~2025-12-23 | acc. 11-07; [TechCrunch](https://techcrunch.com/2025/12/23/amazons-ai-assistant-alexa-now-works-with-angi-expedia-square-and-yelp/) | pub 2025-12-23

**Meta Muse** (`confirmed`, multiple outlets)
- Launched 2026-09-08 in the US on iOS, Android, web and **WhatsApp**, for 18+.
- Runs on a per-user cloud VM and keeps working after the app closes.
- Reads email, books travel, fills forms, "negotiates on your behalf" and pays via Stripe Link.
- The **Sentinel** permission layer separates read from write, uses time-limited grants, and pauses before consequential actions. There is **an audit trail for every action**.
- Pricing: free tier plus $20 and $100/mo (per Axios).
- **Each user gets an isolated VM, and agents cannot reach each other.** No household or shared feature is described.
- Phone calls to vendors: not stated.
- Sources:
  - [The Next Web](https://thenextweb.com/news/meta-muse-personal-ai-agent-launch) | pub 2026-09-09
  - [The Rundown](https://www.therundown.ai/news/meta-muse-personal-ai-agent) | pub 2026-09-09
  - [Axios](https://axios.com/2026/09/08/meta-debuts-muse-personal-ai-agent) | pub 2026-09-08 | acc. 11-07
- Technical detail (`partially confirmed`; Vellum is a competitor): untrusted content marks a run "tainted" and revokes autonomous network egress. — [Vellum](https://www.vellum.ai/blog/official-muse-breakdown) | pub 2026-09-09 | acc. 11-07

**nanoMuse** (`confirmed`)
- An **independent** community project, "not affiliated with or endorsed by Meta." GPL-3.0-or-later; the phone app derives from OpenMinis 1.13.
- Runs shell, browser, MCP and skills, with scheduled routines while closed. It asks before irreversible actions. Memory is stored as Markdown.
- Most recent dated item: 2026-10-21; release 1.0.9.
- It is not an errand service, so it has no vendor network or phone calling.
- Source: [GitHub nano-muse/nanoMuse](https://github.com/nano-muse/nanoMuse) | acc. 11-07

**Manus** (`partially confirmed`): Meta's acquisition (>$2B) was ordered unwound by China's NDRC (Apr 2026). Manus said on 2026-08-11 that it would resume as an independent company. It is a general web or research agent, with no documented phone or email errand flow. — [eWeek](https://eweek.com/news/meta-manus-ai-deal-china-unwind-apac/) | pub 2026-08-13 | acc. 11-07

**Anthropic Claude (consumer)**
- **Claude Duet** (`confirmed`):
  - A US research preview for Pro, Max and Ultra, **waitlisted**, at no extra cost during the preview (it counts against usage limits).
  - **Sends email from connected accounts only with approval.** It shows exactly what it will do before sending, paying, signing or deleting.
  - **Follows up on email threads that have gone quiet.** A Tasks tab flags items needing input, and "Only you can mark a task complete."
  - Runs in the background on its own VM and checks accounts every few hours.
  - **Cannot make phone calls or text other people.**
  - No multi-user or household features are described. The article says personal errands are weaker than work.
  - Sources: [Claude Help](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet) | acc. 11-07; [Claude article](https://claude.com/resources/articles/claude-duet) | pub 2026-10-21 | acc. 11-07
- Gmail send, reply and forward via the Google Workspace connector (`confirmed` via search snippet of the help page; `partially confirmed` via Kylon): approval before each action by default. Team and Enterprise owners can relax this. — [Claude Help: Google Workspace connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors); [Kylon](https://kylon.io/blog/claude-gmail-cowork-aug-19) | pub 2026-08-19 | acc. 11-07
- Marketplace connectors (`confirmed`): Thumbtack, TaskRabbit and Duckbill (MCP) are all reachable from Claude. Each hands off to its own platform for the final hire or booking. — sources as above.
- Hands-on test (`partially confirmed`): Claude's Resy flow needed approval of a raw tool call and a hand-off to Resy to finish. ChatGPT Agent took about 5 minutes on OpenTable, picked the wrong party size, and still needed the user's details. The author concluded agents are "90% of the way" but the native apps are easier. — [PCWorld](https://www.pcworld.com/article/3123989/i-asked-ai-to-book-dinner-it-made-me-want-to-use-the-app-instead.html) | pub 2026-04-29 | acc. 11-07

**OpenAI ChatGPT**
- Agent (`partially confirmed`, **[>12mo]**): books appointments and places orders. It asks permission before permanent actions such as sending email or booking. — [TechWire Asia](https://techwireasia.com/2025/07/chatgpt-agent-can-now-do-the-work-for-you/) | pub 2025-07 | acc. 11-07
- Email sending (`not verified`; competitor blog): paid plans only, through a connected Gmail or Outlook. Per-send approval, one email per prompt, no attachments, blocked in the EU and UK. "ChatGPT Work" can be triggered by new Gmail messages. — [Carly blog](https://www.usecarly.com/blog/can-chatgpt-send-emails/) | pub 2026-07-06 | acc. 11-07
- Release notes (`partially confirmed`; snippets of help.openai.com, which returned 403 when fetched):
  - "ChatGPT Work" was introduced 2026-07-09.
  - From July 9, users can no longer create new group chats.
  - Atlas browser deprecated (stops working 2026-08-09).
  - Shared Projects opened to Free, Plus and Pro from Oct 2025 (shared files, instructions and history).
  - Source: [OpenAI Business release notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes) | acc. 11-07
- Apps (`partially confirmed`): Angi is live (Mar 2026), Airtasker has end-to-end booking (Aug 2026), and Thumbtack's app is announced. — sources above.

**Microsoft Copilot Tasks** (`confirmed`)
- Announced 2026-02-26 as "a to-do list that does itself."
- Uses its own cloud browser and computer. Can **send emails, contact businesses** and book showings.
- **Asks consent before spending money or sending messages.**
- A limited research preview with a waitlist; pricing not announced.
- Source: [Thurrott](https://www.thurrott.com/a-i/333118/microsoft-brings-agentic-ai-to-its-consumer-chatbot-with-new-copilot-tasks) | pub 2026-02-27 | acc. 11-07
- Current (Nov 2026) status is not verified.

**Apple Siri (iOS 27.x)** (`partially confirmed`): Siri AI shipped in beta in iOS 27.2 (EU excluded, daily usage limits). Third-party actions depend on each developer adopting App Intents, and adoption is uneven. No home-services booking or family-agent features were found. — [Gadget Hacks](https://apple.gadgethacks.com/news/siri-ai-app-actions-on-iphone-still-need-developer-support/) | pub ~Nov 2026 (relative dating) | acc. 11-07

**Perplexity Comet / Computer** (`not verified`; aggregator snippets): the Comet agent can send email, fill forms and book on logged-in sites, with reported reliability problems. Computer launched 2026-02-25 for Max ($200/mo). No phone calling found. — [TechCrunch](https://techcrunch.com/2025/10/02/perplexitys-comet-ai-browser-now-free-max-users-get-new-background-assistant/) | pub 2025-10-02 **[>12mo]**; [Implicator](https://www.implicator.ai/perplexity-launches-computer-an-agent-platform-orchestrating-19-ai-models-at-once/) | acc. 11-07

#### E. Agent phone-calling consumer apps

**Pine AI**
- Pine Phone capabilities (`partially confirmed`; vendor page):
  - Calls contractors, mechanics and venues.
  - **Batch outreach to several providers with consistent questions**, returning a decision-ready comparison.
  - **Shows what it plans to send before high-impact actions** (approve, edit, pause, take over).
  - **Tracks outcomes of outbound calls**, and turns commitments into tasks and follow-up calls.
  - Source: [Pine Phone](https://www.19pine.ai/features/phone) | acc. 11-07
- Pricing (`confirmed`; vendor page), billed annually:
  - Plus $99.9/mo (20k credits, batch calls up to 5)
  - Max $174.9/mo (35k, up to 10)
  - Team $291.6/mo (60k, up to 20)
  - No household plan.
  - Source: [Pine pricing](https://www.19pine.ai/pricing) | acc. 11-07
- Geography: not stated. A developer listing says English-only (`not verified`).

**Other phone-agent apps**: none researched in depth. Gemini "Call for Me", Google calling, and Yelp "Check for Me" are the platform equivalents above.

### Inferences
- The market splits into four execution models:
  1. **Platform broadcast**: Yelp RAQ, Thumbtack and Angi send quote requests or match inside their own network.
  2. **One-shot AI calling**: Google and Gemini return quotes or make one call, with no booking and no durable thread.
  3. **General agents with approval gates**: Muse, Duet, Copilot Tasks, ChatGPT agent. Email-centric, per-user, mostly preview or waitlist.
  4. **Human-backed concierge or owned labor**: Duckbill, Pine, Honey Homes, Casa. These deliver real follow-through but cost $100–$400/mo.
- Marketplace AI integrations almost universally **hand off to the marketplace for the hire** (Thumbtack, Angi, TaskRabbit in Claude and ChatGPT). Airtasker in ChatGPT is the exception. The final, liability-bearing step stays with the marketplace.
- For FamilyOS's gutter flow, "research local vendors" and "gather quotes" are already handled for free or nearly free by Google, Yelp, Thumbtack and Angi. That is consistent with the hypothesis that the real competition is marketplaces and platforms, not Cozi or Ohai. Graded `partially confirmed`, since no hands-on test was run.
- Invoca's data suggests home-service quotes rarely resolve on a single call. That would favour a product that holds a multi-day thread (site visit, quote, reschedule) over one-shot calling. This is an inference.

### Gaps
- Live status of the Thumbtack ChatGPT app, the Angi and Yelp Alexa+ integrations, and the Angi Gemini app. The primary pages were 403 or silent.
- Whether Google's home-repair calling rollout completed, and whether it covers gutter cleaning.
- Alexa+ per-member profiles and permissions, and how a home-repair booking actually works end-to-end.
- Duckbill's approval step, how its 2-member Household accounts share state, its geography, and its credits-per-task conversion.
- Current status of Magic, Athena, Handy and any Thumbtack partner API. No reliable 2025–26 sources were found.
- Meta Muse phone calling. Copilot Tasks general availability. Gemini Spark email and booking.
- Pine, Orbits and Ollie geography. Orbits' approval model and price.

---

## Q2. Which products most directly threaten the FamilyOS wedge ("durable third-party follow-up", "evidence-backed completion", "shared permissioned household agent")?

### Takeaway
- **Durable third-party follow-up** is the most contested leg. Duckbill (humans), Pine (calls plus outcome tracking), Claude Duet (follows up on quiet email threads) and Meta Muse (persistent VM) each claim a meaningful piece of it.
- **Evidence-backed completion** is only partly claimed:
  - Claude Duet: "only you can mark a task complete."
  - Muse: audit trail for every action.
  - TaskRabbit: proof-of-completion forms, IKEA tasks only.
  - Labor-owning subscriptions: they control the work itself.
- **Shared permissioned household agent** has the thinnest public evidence of any leg.

### Cited Findings
- **Duckbill (highest overall threat to the hero workflow):**
  - Humans call, negotiate and follow up, with real-time updates.
  - Household plan with 2 member accounts at $169/mo.
  - Reachable from Claude and ChatGPT via MCP.
  - `confirmed`: [Duckbill pricing](https://www.getduckbill.com/pricing); [Duckbill home](https://www.getduckbill.com/) | acc. 11-07
- **Pine (durable follow-up via phone):** batch outreach to several providers, plan preview before high-impact actions, and tracking of call outcomes. No household plan. `partially confirmed`: [Pine Phone](https://www.19pine.ai/features/phone); [Pine pricing](https://www.19pine.ai/pricing) | acc. 11-07
- **Claude Duet (durable email follow-up plus user-verified completion):**
  - Approval before sending, follow-ups on quiet threads, and a Tasks tab where only the user marks tasks complete.
  - No calls or texts, no household, waitlisted.
  - `confirmed`: [Claude Help](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet) | acc. 11-07
- **Meta Muse (persistent execution plus audit trail):** Sentinel permissions and an audit trail for every action. Per-user isolated VMs, US, free tier. Huge distribution through WhatsApp. `confirmed`: [The Next Web](https://thenextweb.com/news/meta-muse-personal-ai-agent-launch) | pub 2026-09-09 | acc. 11-07
- **Google (research and quotes at zero marginal cost):** calls several providers and emails quotes in about 30 minutes, with no booking. Home repair was announced for US-wide calling. `confirmed`: [Google Search Help](https://support.google.com/websearch/answer/16421135?hl=en); [Google blog](https://blog.google/products-and-platforms/products/search/search-io-2026/) | pub 2026-05-19 | acc. 11-07
- **Alexa+ (household distribution):** free with Prime for the whole household, family calendar, "schedule services such as home repairs." Partners: Thumbtack, Angi, Yelp. `confirmed` for pricing and household coverage; booking mechanics `not verified`. — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-available-free-prime-members-us) | updated 2026-09-01 | acc. 11-07
- **Orbits / Ollie (closest "family agent" framing):**
  - Bit requests home-service quotes, coordinates external providers and texts family members. `partially confirmed`: [PR Newswire](http://www.prnewswire.com/news-releases/orbits-raises-2-6-million-pre-seed-round-to-bring-an-ai-assistant-to-the-household-302880247.html) | pub 2026-09-16
  - Ollie joins household group chats and shares data among "authorised family members." `partially confirmed`: [Dealroom](https://dealroom.co/news/149015-ollie-lands-7-5m-seed-to-build-a-privacy-first-family-ai-assistant/) | pub 2026-09-05 | acc. 11-07
- **Evidence-backed completion, partial claims:**
  - TaskRabbit proof-of-completion forms for IKEA tasks. `confirmed`: [TaskRabbit blog](https://www.taskrabbit.com/blog/whats-new-this-summer-built-for-you/)
  - Yelp business-side status labels up to "completed." `partially confirmed`: [PPC Land](https://ppc.land/yelp-assistant-goes-full-service-book-order-and-schedule-in-one-chat/)
  - Casa's persistent home inventory. Yahoo questions whether Casa can prove its workers are good. `partially confirmed`: [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/200-month-startup-says-youll-140500756.html) | acc. 11-07
- **Copilot Tasks:** contacts businesses and asks consent before sending or spending, but is still a waitlisted preview. `confirmed`: [Thurrott](https://www.thurrott.com/a-i/333118/microsoft-brings-agentic-ai-to-its-consumer-chatbot-with-new-copilot-tasks) | pub 2026-02-27 | acc. 11-07

### Inferences
- **Threat ranking for the gutter hero workflow** (my judgment from the documented capabilities):
  1. Duckbill (does the whole job, already sells to households, plugs into Claude and ChatGPT).
  2. Meta Muse and Claude Duet (approval-gated, persistent, distribution or email follow-up).
  3. Google calling (makes vendor discovery and quotes a commodity).
  4. Alexa+ and the Thumbtack/Angi/Yelp integrations (household distribution plus marketplace supply).
  5. Pine (follow-up over phone).
  6. Orbits and Ollie (closest positioning, unproven).
  7. Honey Homes and Casa (take the whole job away by owning labor, but only in a few metros).
- The **platform convergence risk** is high. Claude Duet, Muse and Copilot Tasks already have approval gates and persistence. Adding household sharing would be a product decision for them, not a technology leap. This is an inference.
- Duckbill's $169/mo price with humans in the loop shows that families do pay for delegated errands. It also sets the bar FamilyOS must undercut with software. Duckbill's own economics are unknown.

### Gaps
- No hands-on test of any of these on the scripted gutter task. Real reply-tracking and completion behaviour is unverified.
- Duckbill's and Ollie's household permission models are undocumented publicly.

---

## Q3. Failed or pivoted precedents in household concierge, and why (unit economics where available)

### Takeaway
Human-labor-heavy household concierge has a long record of pivots and shutdowns:
- **Fin** moved to B2B analytics.
- **Hello Alfred** moved to property management.
- **Yohana** shut in Jan 2026.
- **Zirtual** (2015) and **Homejoy** (2015) collapsed.

The recurring causes are human labor cost that does not scale, platform leakage once a good pro is found, worker classification, and quality consistency. The current survivors either charge $100–$400/mo (Duckbill, Honey Homes, Casa) or own the labor.

### Cited Findings
- **Fin:**
  - Consumer human+ML assistant, about $1/min. `partially confirmed`, [TechCrunch 2017](https://techcrunch.com/2017/12/22/fin-assistant/%20), **[>12mo]**
  - Moved to B2B workplace analytics around late 2018.
  - Described as capital-intensive and hard to scale because of human labor.
  - No funding after its $30.75M Series A (2016).
  - Later B2B pricing was $1k–$10k+/mo.
  - `confirmed`, **[>12mo]**: [TechCrunch](https://techcrunch.com/2019/07/02/sam-lessin-and-andrew-kortina-on-their-voice-assistants-workplace-pivot) | pub 2019-07-02 | acc. 11-07
  - Lessin's memo on lessons from Fin argues that assistant services fail partly over managing real-world liability as a service. `not verified`: the title and fragments were seen via snippet only, and the PDF export failed. — [Google Doc memo](https://docs.google.com/document/d/1vH5kGR5pE8C8rfj-tBotpuo--goOCZlTrYAfmTrQ2B4/export?format=pdf) | acc. 11-07
- **Hello Alfred:** a W-2 home-manager concierge for renters that moved to building-level services, then property management (RKW acquisition with $125M in 2022; Arqline in 2026, 50k+ homes). The CEO says NOI, renewal rates and collections improved under its management. No unit economics were disclosed. `confirmed`: [Propmodo](https://propmodo.com/why-alfred-built-a-property-management-company-to-make-its-technology-better/) | pub 2026-05-25 | acc. 11-07
- **Yohana (Panasonic):** a US subscription family concierge from 2021, shut down Jan 30, 2026 after "a review of the business environment." The related Umi app did not launch as planned. `partially confirmed`: [iTiger / MT Newswires](https://www.itiger.com/hant/news/2591675868) | pub 2025-12-16 | acc. 11-07
- **Zirtual (2015):** a virtual-assistant service with full-time employed assistants. It laid off about 400 employees by email after a funding round failed. `partially confirmed` via search snippet, **[>12mo]**: [Tech.co](https://tech.co/?p=175032) | acc. 11-07
- **Homejoy (2015):**
  - 25% take rate left pro wages too low.
  - **Platform leakage**: clients took good cleaners offline.
  - Worker-classification lawsuits.
  - Raised about $40M; expanded internationally too early.
  - `confirmed` as analysis, **[>12mo]**: [Entrepreneur](https://www.entrepreneur.com/article/248896) | pub 2015-07-30 | acc. 11-07
  - Retention, not lawsuits, was cited as the core problem by a later account. The figure of "$19 cleanings costing $40+ to fulfil" is `not verified` (low-authority site): [IdeaProof](https://ideaproof.io/failure/homejoy) | acc. 11-07
- **Washio (2016):** an on-demand laundry service that raised about $16.8M and closed. `partially confirmed`, **[>12mo]**: [Medium](https://medium.com/@nickchapleau/washio-folds-666522a114fa) | acc. 11-07
- **GoButler:** pivoted to automated-only assistance and was eventually "sold as scrap." `not verified`: a TechCrunch reference seen via snippet only. — [TechCrunch 2019](https://techcrunch.com/2019/07/02/sam-lessin-and-andrew-kortina-on-their-voice-assistants-workplace-pivot) | acc. 11-07
- **Current labor-owning survivors** show the economics needed:
  - Honey Homes: about $100/hr effective, $40/hr wages, about 1-in-100 hiring, early quality complaints.
  - Casa: $199/mo for 1.5 hours; NYT/Yahoo question whether it can prove worker quality.
  - `confirmed`: [SF Standard](https://sfstandard.com/2026/06/28/handyman-as-a-service/) | pub 2026-06-28; [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/200-month-startup-says-youll-140500756.html) | pub 2026-05-04 | acc. 11-07
- **On-demand pattern:** Luxe, Homejoy, Washio, Sprig, SpoonRocket and Exec all failed on unit economics. `partially confirmed` via snippet: [Crunchbase News](https://news.crunchbase.com/startups/profits-sustainable-startups-remain-elusive-demand-economy/) | acc. 11-07

### Inferences
- The precedents argue that FamilyOS should **not** put humans in the default loop (the Fin, Zirtual and Alfred cost structure). Liability for vendor quality should stay with the vendor or marketplace. This mirrors the Homejoy and Fin lessons.
- Platform leakage (Homejoy) cuts *for* a vendor-agnostic household agent. The household owns the vendor relationship and history; a marketplace does not. This is an inference to validate.

### Gaps
- No unit-economics data found for Duckbill, Yohana, Magic or Hello Alfred's consumer era (the $350/mo average DTC spend is `not verified`).
- Magic's and Athena's histories and status were not found.

---

## Q4. What is left uncontested? (honest confidence; absence is not asserted from silence)

### Takeaway
Every individual leg of the wedge is claimed by someone, at least in part. What I found **no public documentation of** in any product is the *combination* of:
1. A household with multiple adults, where an agent's external actions (sending a vendor message, booking) are approved under explicit **per-member roles** (for example, either spouse may approve, a caregiver may not).
2. **Channel-agnostic, durable vendor threads** across email, SMS and calls that survive days of back-and-forth.
3. **Completion recorded with evidence** (confirmation, invoice, photo) into a persistent home and vendor record that the household owns, not the marketplace.

Confidence that this combination is currently unclaimed: **low to moderate**. It rests only on public pages, and several close competitors (Duckbill Household, Ollie, Orbits, Alexa+) have undocumented sharing models. This needs hands-on testing.

### Cited Findings
- Per-user isolation is explicit in Meta Muse: each user gets an isolated VM, and agents cannot reach each other. — [The Next Web](https://thenextweb.com/news/meta-muse-personal-ai-agent-launch) | pub 2026-09-09 | acc. 11-07 | `confirmed`
- Claude Duet describes no multi-user or household features. That is silence, not proof of absence. — [Claude Help](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet) | acc. 11-07 | `confirmed` (as silence)
- Duckbill Household gives 2 member accounts, with no roles or permission detail published. — [Duckbill pricing](https://www.getduckbill.com/pricing) | acc. 11-07 | `confirmed` (as silence on roles)
- Alexa+ covers the whole household and a family calendar, with no per-member action permissions described. — [About Amazon](https://www.aboutamazon.com/news/devices/alexa-plus-available-free-prime-members-us) | acc. 11-07 | `confirmed` (as silence)
- ChatGPT has Shared Projects (shared files, instructions and history) and retired group-chat creation from July 9, 2026. Agent-permission roles are not described. — [OpenAI release notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes) | acc. 11-07 | `partially confirmed`
- Ollie shares data among "authorised family members." Orbits is a "shared layer" for family operations, with no role model described. — [Dealroom](https://dealroom.co/news/149015-ollie-lands-7-5m-seed-to-build-a-privacy-first-family-ai-assistant/); [PR Newswire](http://www.prnewswire.com/news-releases/orbits-raises-2-6-million-pre-seed-round-to-bring-an-ai-assistant-to-the-household-302880247.html) | acc. 11-07 | `partially confirmed`
- Google calling does not book, and the user must contact the provider. Marketplace integrations in Claude and ChatGPT hand off to the marketplace to hire. So the post-quote thread is left to the user or the marketplace. — [Google Search Help](https://support.google.com/websearch/answer/16421135?hl=en); [Thumbtack press](https://press.thumbtack.com/announcements/thumbtack-delivers-home-services-experience-in-anthropics-claude/); [TaskRabbit blog](https://www.taskrabbit.com/blog/?p=29784) | acc. 11-07 | `confirmed`
- Home-service vendors often won't quote by phone without a site visit, which forces multi-step threads. — [Invoca](https://www.invoca.com/blog/google-ai-pricing-calls-study) | pub 2025-12-10 | acc. 11-07 | `partially confirmed`

### Inferences
- **Most defensible residual wedge** (moderate confidence): a vendor-agnostic, household-owned project record for home services that does three things:
  - spans the multi-day site-visit → quote → schedule → completion cycle;
  - keeps evidence attached;
  - lets more than one adult see the work and approve actions under defined roles.

  The marketplaces cannot easily be vendor-agnostic. Platform agents are per-user today. Human concierges are expensive.
- **Weakest residual wedge** (low confidence it stays open): "durable follow-up" on its own. Duckbill, Pine, Claude Duet and Muse are all close, and the platforms can add it quickly.
- **"Evidence-backed completion"** is open only as a *cross-vendor household record*. Inside single platforms it is partly covered (TaskRabbit proof forms; Duet's user-only completion). HomeZada's invoice-to-history feature (from the original audit) is the nearest record-keeping analogue.
- **Distribution is the bigger threat than features.** Alexa+ (free with Prime, whole household), WhatsApp/Muse and Google Search reach families by default. FamilyOS would need a reason to be the system of record rather than the front door.

### Gaps
- Hands-on tests are required to verify the household-sharing behaviour of Duckbill Household, Ollie, Orbits and Alexa+, and the follow-up behaviour of Duet, Muse and Pine.
- No primary data on consumer willingness to pay for a software-only (no human) version of Duckbill's service.
