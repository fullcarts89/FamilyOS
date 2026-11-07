# FamilyOS Demand and Economics Evidence (stress test)

All sources were accessed on 2026-11-07. Each entry lists the publication date (pub), the sample or method where one is stated, and a confidence rating. **[VENDOR]** marks surveys run or sponsored by a company that sells into the market being measured. **[MEASURED]** marks administrative, transaction or panel data. **[SURVEY]** marks self-report. **[CLAIM]** marks company or founder assertions. **[DERIVED]** marks my own arithmetic on cited figures.

Process notes for the report writer:
- I saw no page text that contained instructions aimed at AI agents. Pages I checked explicitly: Duckbill pricing and findskill.ai.
- Several primary pages returned HTTP 403 to my fetch tool: JCHS, Fast Company, Thumbtack/BusinessWire, MarketBeat, HKS and HBS Working Knowledge. Figures from those sources are marked "search-snippet only" and should be verified before publication.
- The shared web-search budget ran out near the end of this task. Gaps are listed honestly rather than filled.
- I ran the beachhead count myself from the Census ACS 2024 1-year PUMS microdata file, downloaded from census.gov. The method is described in the Size section.

---

## 1. Frequency: how often do US homeowner households hire home services, and which coordination tasks recur most?

### Takeaway
Measured hiring frequency is low and uneven. The best figures (Angi's survey of households that already hire, and Frontdoor's warranty data) point to roughly 2-8 professional engagements per year, and a large minority of owners spend nothing at all. Gutter cleaning, the hero task, is mostly DIY or ignored. The highest-frequency coordination is childcare and schedules, not home services.

### Cited Findings
**Home projects per household**
- **Angi 2024 State of Home Spending.** Per-household project counts were maintenance 5.6, improvement 2.3 and emergency 0.8. Spending averaged $12,050, split $9,322 improvement, $1,750 maintenance and $978 emergency.
  - Method: n=6,961 (5,000 general population plus 1,961 homeowners), fielded Nov 8-18, 2024.
  - Selection bias: the homeowner sample was restricted to households that completed a project in the last 12 months and "hired someone else to do at least some of the work". These counts are therefore **upward-biased** for the general owner population, and "projects" include DIY work.
  - Rating: [SURVEY][VENDOR], medium-low confidence for population inference. Page updated Aug 1, 2026. [Angi press](https://angi.com/press/2024-state-of-home-spending-report)
- **Angi 2025 report.** About 10 projects per household (up from 9). Spending averaged $12,472. 44% completed at least one maintenance project. 53% reported difficulty finding pros, rising to 70% for Millennials.
  - No sample or method is disclosed on the summary page, which is dated Jan 22, 2026.
  - Rating: [SURVEY][VENDOR], low-medium confidence. [Angi 2025 highlights](https://intercom.help/angi/en/articles/13464134-angi-s-2025-state-of-home-spending-report-highlights)

**Owners who spend little or nothing**
- **JCHS, 2023 data.** 20% of homeowners spent nothing on improvements or repairs, and 15% spent under $500. Average improvement spending was about $4,700.
  - The DIY share of improvement spending for owners under 35 fell from 40.1% (1995) to 24.1% (2023). JCHS measures DIY as materials only, so DIY and professional dollar shares are not directly comparable.
  - Source: JCHS *Improving America's Housing 2025* (pub Mar 2025), based on the American Housing Survey.
  - Rating: [MEASURED via AHS]. Search-snippet only (403 on fetch), medium confidence. [JCHS DIY blog](https://www.jchs.harvard.edu/blog/home-improvement-spending-has-shifted-away-diy); [IAH 2025 report](https://www.jchs.harvard.edu/improving-americas-housing-2025)
- **Frontdoor (home warranty), FY2025.** About 3.8 million service requests across more than 2.1 million members, which is roughly 1.8 covered repair requests per member-year [DERIVED]. This counts warranty-covered breakdowns only, among self-selected buyers.
  - Pub Feb 26, 2026, 8-K Ex. 99.1 and annual-report language surfaced via search.
  - Rating: [MEASURED][CLAIM], medium confidence. [Frontdoor 8-K Ex99.1](https://sec.gov/Archives/edgar/data/1727263/000119312526073378/ftdr-ex99_1.htm); [BusinessWire release](https://www.businesswire.com/news/home/20260226042868/en/Frontdoor-Announces-Record-Full-Year-2025-Financial-Results)
- **Angi FY2025 10-K.** Consumers used an Angi business for about 16 million projects in 2025. Service Requests totaled 15.5M (down 10%) and Leads 20.2M (down 17%).
  - For scale: there are about 86.7M owner-occupied households (ACS 2024 PUMS, my tabulation).
  - Pub Feb 2026.
  - Rating: [MEASURED], high confidence. [Angi 10-K FY2025 on EDGAR](https://sec.gov/Archives/edgar/data/1705110/000170511026000011/angi-20251231.htm)

**Gutters (the PRD hero task)**
- **LeafFilter survey.** 42% clean or inspect gutters once or twice a year, and 27-28% only when a problem arises. 52% do it themselves and 21% hire a professional. 36% spend nothing on gutter upkeep.
  - Method: n=2,000 US single-family homeowners, fielded Feb 10, 2025. Page updated Jun 26, 2025.
  - LeafFilter sells gutter guards and benefits from depicting neglect.
  - Rating: [SURVEY][VENDOR], low-medium confidence. [LeafFilter report](https://leaffilter.com/blog/gutter-protection-report)

**Time-use baseline**
- **BLS ATUS 2025** (released Jun 25, 2026). On an average day, 81% of people did household activities, for about 2 hours. Per-person daily averages:

  | Activity | Men | Women | All |
  |---|---|---|---|
  | Household management | 0.12 h | 0.22 h | 0.17 h (about 10 min) |
  | Lawn and garden | 0.26 h | 0.13 h | 0.19 h |
  | Interior cleaning | 0.20 h | 0.45 h | 0.33 h |

  - Adults with children under 6 averaged 2.3 hours per day of primary childcare.
  - Rating: [MEASURED], high confidence. [ATUS release](https://www.bls.gov/news.release/atus.nr0.htm); [ATUS chart](https://www.bls.gov/charts/american-time-use/activity-by-hldh.htm)
- **BLS Consumer Expenditure Survey.** Household operations spending averaged $1,921 per consumer unit in 2024 and $2,034 in 2025. The 2025 figure is affected by missed fieldwork in Oct-Nov 2025.
  - I could not retrieve line items for lawn care or housekeeping, or a breakdown for owners with children.
  - Rating: [MEASURED], search-snippet only, medium confidence. [BLS CE 2024 report](https://www.bls.gov/opub/reports/consumer-expenditures/2024/); [BLS CE release Oct 29, 2026](https://www.bls.gov/news.release/archives/cesan_10292026.htm)

**Which coordination load recurs most**
- **Weeks & Ruppanner 2024**, *Journal of Marriage and Family* (DOI 10.1111/jomf.13057; pub Dec 2024). n≈3,000 US parents.
  - Mothers report handling 71% of mental-load tasks, fathers 45%.
  - On daily ("core") tasks such as cleaning and childcare: mothers 79%, fathers 37%.
  - On episodic tasks such as **home repairs** and finances: fathers 65%, mothers 53%.
  - Rating: [SURVEY], peer-reviewed, high confidence. [ScienceDaily summary](https://www.sciencedaily.com/releases/2024/12/241212150327.htm); [author PDF](https://anacweeks.github.io/assets/pdf/Weeks_Ruppanner_2024_JMF.pdf)

### Inferences
- A plausible central estimate for a typical beachhead household is about 2-6 hires per year that need vendor discovery, plus a few recurring vendors (lawn, cleaning) that need no discovery once set up. This rests on Angi's biased sample, Frontdoor's covered-repair rate and the JCHS zero-spend share. Weekly agent use cannot rest on home services.
- The PRD's hero workflow (gutters) targets a task that, by a vendor's own survey, about half of owners DIY and more than a third ignore. Only about one in five hires it out. That is a weak first workflow for proving repeat delegation.
- Home repair is an episodic, father-skewed domain in the best peer-reviewed data (Weeks & Ruppanner). The heaviest, most female-skewed and most frequent load is daily childcare and schedule coordination. Leading with home services may target the household member who feels the pain less.
- ATUS household management averages about 10 minutes per day. Measured time on coordination is small, even though cognitive load is under-measured by time diaries. "Hours saved" claims need care.

### Gaps
- I found no rigorous public measure of the number of distinct paid home-service *hires* (not "projects") per owner household per year. Census AHS and BLS CE item tables would help but were not retrieved. The search budget was exhausted.
- I found no independent (non-vendor) gutter-cleaning frequency or DIY data.
- I could not retrieve primary frequency data for school-admin or medical-appointment coordination per family (for example, NCHS pediatric visit rates, or NPEN childcare-arrangement counts).

---

## 2. Time cost and vendor response: how long does booking take, do local vendors answer, and on which channel?

### Takeaway
No rigorous public study measures how often local home-service vendors reply to cold **email**. The weak evidence that exists says phone is the dominant booking channel, roughly a quarter of calls go unanswered, and most homeowners contact three or fewer firms. An email-first outreach design is unvalidated and probably mismatched to how trades operate.

### Cited Findings
**Call answer rates and homeowner search behavior**
- **Service Direct.** About 26% of calls to contractors went unanswered (its own 2022 Call Performance Report data). Fewer than 1 in 6 callers leave a callback request. 85% of homeowners contact 3 or fewer contractors, 60% decide within 72 hours, and about 40% rarely or never hire a contractor who missed their first call.
  - Method: n=559 homeowners via a SurveyMonkey panel (59% women, aged 30+). Pub Apr 28, 2022.
  - Service Direct is a pay-per-call vendor.
  - Rating: [SURVEY plus vendor call data][VENDOR], low-medium confidence. [Service Direct](https://blog.servicedirect.com/survey-what-matters-homeowners-choosing-contractor)
- **Invoca, as relayed by EnvisionUP and findskill.ai.** Of Google "Ask for Me" AI calls to businesses, 26% went unanswered. Among answered calls, 48% could not or would not give usable pricing. Tracked Jul-Nov 2025, reported Jan 2026.
  - These are **tertiary** figures with no primary link.
  - Rating: [CLAIM][VENDOR], low confidence. [findskill.ai](https://findskill.ai/learn/agentic-calling/)
- **CallRail (search snippet only).** 14% missed-call rate for home services, from its Jan 2025 small-business benchmark. This conflicts with the 26% figures, probably because definitions and samples differ. Rating: [VENDOR], low confidence. [Signpost blog listing](https://www.signpost.com/blog/how-much-revenue-do-home-services-businesses-lose-from-missed-calls)
- **Vendor marketing with no data.** Signpost (pub Apr 15, 2026) claims small businesses miss 22-40% of calls and that 85% of no-answer callers don't retry, with no primary sources. CustomerFlows claims a 4-8 hour average response with no sample or method.
  - Rating: [VENDOR], unreliable; do not cite as fact. [Signpost](https://www.signpost.com/blog/how-much-revenue-do-home-services-businesses-lose-from-missed-calls); [CustomerFlows](https://customerflows-website.pages.dev/research/contractor-lead-response-time-study/)

**Channel preferences (consumer side only)**
- **Modernize 2024 Homeowner Insights.**
  - Preferred channel for initial contact: phone 37.2%, email 30.5%, text 19.0%, self-booking online 13.3%.
  - Scheduling the first appointment: text 41.3%.
  - Sharing project details: text 56.8%.
  - No sample size is stated. Modernize is a contractor lead-gen vendor; page updated Aug 12, 2026.
  - Rating: [SURVEY][VENDOR], low-medium confidence. [Modernize](https://modernize.com/homeowner-insights/2024-communication-preferences)
- **Tinuiti.** 58% prefer to schedule home services by phone, about three times the next option (online). After booking, text and phone are nearly tied, together about 70%. No sample or date is stated (URL tag suggests Feb 2024). Rating: [SURVEY][VENDOR], low confidence. [Tinuiti](https://reports.tinuiti.com/tinuiti-home-services-marketing-study/page-4.html)
- **Invoca 2026 buyer report.** 37% prefer calling, down from 47% in 2025. 66% have hung up after a long hold. 79% would switch to a faster responder.
  - Method: only **n=134** US and UK home-services consumers, fielded May 8-22, 2026.
  - Rating: [SURVEY][VENDOR], low confidence. [Invoca](https://www.invoca.com/reports/home-services-buyer-experience-report-2026)

**Where vendor communication actually happens**
- **Thumbtack.** The CEO said Thumbtack saw only 30-40% of customer-pro communications in its in-app chat; the rest happened off-platform. Fast Company, 2026.
  - Rating: [CLAIM], search-snippet only (403 on fetch), medium-low confidence. [Fast Company](https://www.fastcompany.com/91534514/)

**Time spent searching**
- **Modernize.** 51.6% of homeowners spend 1-5 hours researching before contacting a contractor. Earlier waves found 20-30% spent zero hours. Rating: [SURVEY][VENDOR], search-snippet only, low confidence. [JLC/Modernize coverage](https://www.jlconline.com/business/modernize-homeowners-need-help-budgeting-and-rely-heavily-on-online-research_o/)
- **Google "Ask for Me".** Google's AI calls local businesses for prices and availability and typically returns a summary in about 30 minutes. It expanded to home repair with a nationwide US rollout announced at I/O on May 20, 2026. Rating: [CLAIM], medium confidence. [JobNimbus, pub May 27, 2026](https://www.jobnimbus.com/blog/google-ai-calling-home-services)

**Adjacent-industry evidence**
- **Doerr & Necker (AEA paper).** In German home-improvement online markets, *posting* a job drew more than 2,800 emailed offers from contractors. This is inbound bids to a posted request, not replies to cold outbound email, so it is not a reply-rate benchmark. Rating: [MEASURED], academic, not directly applicable. [Doerr & Necker PDF](https://www.aeaweb.org/content/file?id=13839)
- **DelPrete real-estate secret shop.** About 47% of website-form inquiries to agents never got a response. This is a different industry; search-snippet only. Rating: low confidence for home services. [Inman](https://inman.com/2024/07/30/delprete-secret-shopper-sting-reveals-agents-lose-hosts-of-leads)

### Inferences
- Consumer preference for phone and text, the Thumbtack off-platform finding, and roughly 25% unanswered calls together suggest that trades work by phone and text. An email-only agent will likely see low and slow replies. Plan Gate 1 to *measure* email reply rate directly; it is the single most important unknown for WF-03.
- Google "Ask for Me" already offers free AI price-checking calls to local pros at search scale, with about 30-minute turnaround. That commoditizes the research-and-quote step of the hero workflow. The remaining value has to come from follow-through: tracking replies, booking and verifying completion.
- The "time saved" may be modest. Many homeowners contact three or fewer firms and decide within three days, and some spend zero research hours.

### Gaps
- No independent mystery-shop or audit study of email, web-form or text response rates for US plumbers, HVAC, gutter or handyman firms was found. Audit-study literature exists for auto repair (Machelett) but could not be verified because the search budget was exhausted.
- No measured "minutes to book" figure exists from a neutral source.
- No published Thumbtack, Angi or Yelp figures on the share of requests that receive at least one pro response were found for 2025-26. The only figure, Yelp's "80% within 24h", dates from 2017.

---

## 3. Mental load: quality of evidence, and does pain translate into payment?

### Takeaway
The burden is well documented and gendered in peer-reviewed work. Money and outsourcing do not shrink mothers' mental load, and tools tend to create a "calendar partner" rather than shift ownership. Direct evidence that pain converts to *software* payment is thin, and people rarely spend discretionary money on buying time.

### Cited Findings
**Peer-reviewed and survey evidence on the burden**
- **Daminger 2019**, *American Sociological Review*. 70 in-depth interviews with 35 couples. She defines cognitive labor as anticipating needs, identifying options, deciding and monitoring. Women do more overall, and especially more anticipating and monitoring. Her 2022 dissertation finds men concentrated in decision-making.
  - Rating: [QUALITATIVE], peer-reviewed, high confidence on mechanism, not on prevalence. [HKS listing](https://inequality.hks.harvard.edu/publications/cognitive-dimension-household-labor); [UW profile](https://cde.wisc.edu/staff/daminger-allison/)
- **Weeks & Ruppanner 2024**, JMF (see section 1). Mothers report 71% of mental-load tasks, fathers 45%. Rating: high confidence. [ScienceDaily](https://www.sciencedaily.com/releases/2024/12/241212150327.htm)
- **Weeks et al., *Socius*, pub Oct 23, 2025.** n=2,133 partnered heterosexual US parents.
  - Mothers earning more than $100K report 30% less childcare and 17% less housework than lower-earning mothers, but **no reduction in mental load**.
  - Mothers average 13.72 mental tasks, fathers 8.2.
  - Rating: [SURVEY], peer-reviewed, high confidence. [Univ. of Bath](https://www.bath.ac.uk/announcements/successful-career-women-still-shoulder-the-majority-of-the-mental-load-at-home-new-research)
- **Pew, Apr 2023.** In opposite-sex marriages, wives spend about 2 more hours per week on caregiving and about 2.5 more on housework than husbands, even when earnings are equal.
  - Method: ATUS, CPS and an n=5,152 survey fielded Jan 2023.
  - Rating: [MEASURED plus SURVEY], high confidence. [Pew](https://www.pewresearch.org/social-trends/2023/04/13/in-a-growing-share-of-u-s-marriages-husbands-and-wives-earn-about-the-same/)
- **Bright Horizons Modern Family Index 2017.** Among working mothers, 69% say their responsibilities create a mental load and 52% are burning out. Breadwinning mothers keep the kids' schedules 76% of the time, against 22% for breadwinning fathers.
  - Method: Kelton online survey, n=2,082 employed US parents, Oct 2017, ±2.2%. Pub Dec 20, 2017. The data are dated.
  - Bright Horizons sells employer-sponsored childcare and benefits.
  - Rating: [SURVEY][VENDOR], medium confidence. [Bright Horizons](https://www.brighthorizons.com/newsroom/mental-load-impact-working-mothers-study)

**Does pain lead to payment?**
- **Whillans et al. 2017, PNAS.** n=6,271 across the US, Canada, Denmark and the Netherlands. Spending on time-saving services is associated with higher life satisfaction, and a 60-person field experiment found more positive affect after a time-saving purchase.
  - But in one Canadian sample only **about 2%** said they would spend a $40 windfall on time-saving.
  - Rating: [PEER-REVIEWED]. The 2% figure is search-snippet only (HBS page returned 403), medium confidence. [ADS abstract](https://ui.adsabs.harvard.edu/abs/2017PNAS..114.8523W); [HBS Working Knowledge](https://hbswk.hbs.edu/item/want-to-be-happier-spend-some-money-on-avoiding-household-chores)
- **NYT / Boston.com, pub May 12, 2025.** Daminger is skeptical that tools change the underlying dynamic, and describes one spouse acting as "calendar partner". Profiled couples often had one person doing all the entry.
  - Rating: [JOURNALISM / anecdote], medium confidence for the qualitative point. [Boston.com/NYT](https://www.boston.com/news/national-news/2025/05/13/can-a-700-calendar-save-your-marriage/)
- **Perales et al. 2016** (Australia, longitudinal). Domestic outsourcing reduces housework time and women's time pressure. Rating: search-snippet only, medium confidence. [vLex abstract](https://law-journals-books.vlex.com/vid/domestic-outsourcing-housework-time-900925773)

### Inferences
- The *Socius* finding cuts against a core assumption. Mothers who can already afford to outsource physical work still carry the mental load, because outsourcing adds management work (anticipate, select, monitor). A product that drafts and asks for approvals could *add* monitoring tasks unless it truly takes ownership.
- Pain is real but unpriced. The evidence that people actually buy time is weak, and stated willingness to spend on it is very low (about 2%). Treat interview "pain" as necessary but not sufficient; Gate 0's deposit or paid-concierge test is the right bar.
- The paying decision-maker may differ from the person in pain. Men skew toward decisions and episodic home repairs, women toward anticipation and daily coordination. Messaging and the first workflow should match the payer and the user.

### Gaps
- I found no study linking measured mental load to subscription purchase or retention for family apps.
- I found no recent (2024-26) Bright Horizons MFI wave with mental-load figures.

---

## 4. Willingness to pay and retention: subscription benchmarks, family organizers, AI-assistant churn

### Takeaway
At $9-15 per month, FamilyOS sits above the median subscription-app price. At $19-29 per month it sits at or above the 90th percentile. AI apps retain worse than non-AI apps on RevenueCat's data, and family organizers monetize at roughly $79-138 per year per family. The only human-plus-AI delegation comparable (Duckbill) charges $49-350 per month, which signals that real delegation is costly to deliver.

### Cited Findings
**Subscription-app benchmarks (RevenueCat)**
- **State of Subscription Apps 2026.** Covers more than 115,000 apps, more than $16B revenue and more than 1B transactions, mostly 2025 data; pub Mar 2026.
  - Pricing:

    | Plan | Most common | Median | Top percentile |
    |---|---|---|---|
    | Monthly | $10 | $8 (chart; the summary cites a $9.99 anchor) | $22.70 |
    | Yearly | $30 | $34.80 | $90 |

  - Median download-to-paid by day 35 is 2.0% globally and 2.8% in North America. Hard paywalls reach 10.7%, freemium 2.1%.
  - Trial-to-paid in North America is 34.2%.
  - RevenueCat's customer base is mostly mobile B2C, and it sells subscription infrastructure.
  - Rating: [MEASURED][VENDOR], high confidence for its own customer base. [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)
- **RevenueCat blog, pub Mar 19, 2026.**
  - Yearly-plan 1-year retention: freemium 28%, hard paywall 27%. About 72% of annual subscribers cancelled in year 1.
  - Month 1 accounts for 35% of annual cancellations.
  - Revenue per install at day 60: $3.09 (hard paywall) and $0.38 (freemium).
  - Rating: [MEASURED][VENDOR], high confidence. [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026.md)
- **AI apps vs non-AI apps (PPC Land on RevenueCat 2026, pub Mar 14, 2026).**
  - Year-1 realized LTV per payer: AI $30.16 vs non-AI $21.37 (about 41% higher).
  - Annual-plan retention: **21.1% vs 30.7%**.
  - Monthly-plan 12-month retention: **6.1% vs 9.5%**.
  - Median refund rate: 4.2% vs 3.5%.
  - Rating: [MEASURED][VENDOR], medium-high confidence. [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)
- **Productivity category.** Median year-1 realized LTV is $24.95. The page is internally inconsistent on plan mix. Rating: medium confidence. [RevenueCat Productivity](https://www.revenuecat.com/state-of-subscription-apps-2026-productivity)

**Paid general AI assistants**
- **YipitData.** Six-month retention of ChatGPT paid subscribers from Dec 31, 2025 to Jun 30, 2026 was 80.4% for ChatGPT-only payers (n=40,857) and 72.5% for those also paying for Claude (n=2,439).
  - Panel skews male and upper-middle income.
  - Rating: [MEASURED panel], medium-high confidence. [YipitData](https://ask.yipitdata.com/insights/chatgpt-claude-dual-subscriber-retention)
- **Earnest card data, pub Feb 21, 2024.** ChatGPT paid retention was over 89% after 1 quarter and 74% after 3 quarters. Most other AI tools retained only about 20-40% after 3 quarters. Rating: [MEASURED], medium confidence. [Earnest](https://www.earnestanalytics.com/insights/chatgpt-and-anthropic-top-paid-ai-tools-by-retention)
- **Menlo Ventures 2026 State of Consumer AI, pub Sep 16, 2026.**
  - 55% of US AI users pay for at least one AI product. In 2025 the comparable figure was about 3%, but the 2025 method differed.
  - The typical payer spends $20-49 per month. 34% of payers have a family member or friend paying.
  - 84% of parents use AI (56% of non-parents); 40% of parents use it daily.
  - The report says household-designed AI is largely absent: "Almost nothing in consumer AI is priced or designed around the household yet."
  - Method: n=5,067 US adults via Morning Consult, July 2026, weighted.
  - Menlo is a VC whose portfolio companies are cited in the report.
  - Rating: [SURVEY][VENDOR-adjacent], medium confidence. [Menlo page](http://menlovc.com/perspective/2026-the-state-of-consumer-ai/); [Menlo PDF](https://menlovc.com/wp-content/uploads/2026/09/menlo_ventures_consumer_ai_report-2026.pdf)

**Family organizers and family-coordination subscriptions**
- **Cozi.** Paid tiers run about $29.99-79.99 per year (Gold, Max).
  - Adapty estimates about $300-400K per month in revenue and 30-70K downloads per month. The page contradicts itself, does not disclose a method, and was updated Oct 22, 2026.
  - Rating: [ESTIMATE][VENDOR], low confidence. [Adapty](https://adapty.io/paywall-library/cozi-family-organizer/)
- **Skylight.**
  - Revenue: "over $300M ARR", bootstrapped and profitable, per a LinkedIn post relayed by ARR Club (pub May 6, 2026). The figure is unverified, and it is unclear whether it includes hardware. [ARR Club](https://www.arr.club/skylight/skylight-arr-hit-300m-fully-bootstrapped-and-profitable)
  - Pricing: per a RevenueCat podcast write-up (pub Feb 18, 2026), Skylight's testing found $99 per year revenue-maximizing, but $79 "felt fair" and $99 neared "disgust territory", so it chose $79 per year. [RevenueCat Sub Club](https://www.revenuecat.com/blog/growth/mark-michael-skylight-sub-club-podcast-2026.md)
  - Users: about 888,000 families own one (company claim, NYT May 2025).
  - Rating: [CLAIM], low-medium confidence.
- **Life360 (location and safety, the closest public "family subscription").**
  - Q2 2026: MAU of about 102.4M, 3.2M Paying Circles (up 25-27% YoY), subscription revenue $115.6M (up 31%), total revenue $159M. Reported Aug 10, 2026.
  - Q3 2025 average revenue per paying circle was $137.63 (about $11.50 per family per month).
  - Rating: [MEASURED, public company], high confidence for ARPPC; MAU and paying circles via secondary summaries. [GuruFocus call summary](https://www.gurufocus.com/news/9023298/life360-inc-lifx-q2-2026-earnings-call-highlights-surpasses-100-million-mau-milestone-with-38-revenue-growth); [Life360 Q3 2025 release](https://investors.life360.com/news-releases/news-release-details/life360-reports-record-q3-2025-results); [Barchart Q2 2026](https://www.barchart.com/story/news/3762799/life360-reports-record-q2-2026-results)

**Human-plus-AI delegation comparables**
- **Duckbill pricing page.**

  | Plan | Price | Credits/month | Member accounts |
  |---|---|---|---|
  | Essentials | $49/mo | 20 | 1 |
  | Individual | $99/mo | 40 | 1 |
  | Household ("Most Popular") | $169/mo | 70 | 2 |
  | Household Plus | $350/mo | 150 | 2 |

  - Every plan includes 200+ background-checked human specialists and phone calls made on the member's behalf.
  - The page does not say how many tasks a credit buys. A search snippet suggested "70 credits ~ 8 to 12 tasks", but this is unverified.
  - Rating: [CLAIM], high confidence on list price. [Duckbill pricing](https://www.getduckbill.com/pricing)
- **Duckbill funding and history.** $25M Series A led by Forerunner (pub Sep 13, 2023), with about 70% women in the early beta. Price was about $100 per month then and $99 per month in a Dec 3, 2024 review. Rating: [CLAIM]. [Forerunner](https://forerunnerventures.com/perspectives/delivering-on-techs-age-old-holy-grail-duckbill-the-indispensable-ai-powered); [Bustle](https://www.bustle.com/life/duckbill-ai-personal-assistant-app-review-price-features)
- **Ohai.ai.** Strategic round led by Muse Capital (Aug 2025); "human-in-the-loop" design; no user or subscriber data disclosed. Rating: [CLAIM]. [Pillsbury](https://www.pillsburylaw.com/en/news-and-insights/ohai-ai-raising-strategic-funding-support-launch-new-feature.html)

### Inferences
- Family-coordination products that monetize at scale clear about $79-138 per family per year (Skylight subscription, Cozi Max, Life360 ARPPC). FamilyOS's $9-15 per month ($108-180 per year) is at or above that ceiling for organization alone. $19-29 per month ($228-348 per year) has no family-app precedent. Its comparables are AI assistants ($20-49 per month typical payer per Menlo) and human concierge (Duckbill $49-350).
- With RevenueCat AI-app annual retention of about 21% and monthly 12-month retention of about 6%, a $25 per month plan nets roughly $30-80 lifetime revenue per payer, unless it beats the benchmarks by a wide margin [DERIVED, rough]. That likely sits below paid acquisition costs for parents.
- Duckbill's 2-seat Household plan costs $169 per month for about 70 credits. If real coordination needs humans, $19-29 per month will not cover them. If it does not need humans, FamilyOS competes with ChatGPT and Google at near-zero marginal price.
- Menlo's observation that household-priced AI barely exists supports the wedge but is also consistent with "no proven demand".

### Gaps
- No primary Cozi or Ohai subscriber counts, conversion or retention figures were found.
- No household-app category cut exists in RevenueCat's report.
- No Duckbill churn, task volume or revenue was found. A Latka figure of $17.9M is unreliable and conflicts with funding data, so I did not use it.

---

## 5. Low-frequency problem: precedents in home services and concierge, and whether "recurring chores plus high-value delegation" has worked

### Takeaway
The graveyard is large: Homejoy, Fin, Hello Alfred's consumer model, Zirtual and GoButler. Survivors made frequency structural (Handy's default recurring cleaning), sold insurance-like peace of mind (home warranty, about 2.1M members), or moved to B2B or B2B2C. I found no case where *software* chores plus occasional delegation sustained a consumer subscription.

### Cited Findings
- **Homejoy** closed July 2015. The founder blamed worker-classification suits. Backchannel (Farr), citing former employees, blamed poor retention, losses and over-expansion, but published no retention figures. Rating: [JOURNALISM], medium confidence. [SmartCompany, pub Oct 28, 2015](https://www.smartcompany.com.au/startupsmart/homejoy-comes-clean-on-why-it-failed-or-perhaps-not/)
  - A student analysis (not authoritative, pub Mar 25, 2018) describes deep discounts ($19 against about $85) that attracted non-repeat customers, plus off-platform leakage. [HBS Digital (student)](https://d3.harvard.edu/platform-digit/submission/homejoys-not-so-joyous-demise/index.html)
- **Handy.**
  - The CEO said 80% of bookings come from existing customers. Handy auto-enrolled new customers in recurring cleanings, and cancellation had previously been hard. Fortune, pub Nov 2, 2015. Rating: [CLAIM]. [Fortune](https://fortune.com/2015/11/02/handy-50-million)
  - ANGI Homeservices acquired Handy in Oct 2018. Rating: medium confidence. [Wikipedia](https://en.wikipedia.org/wiki/Handy_Technologies)
- **Fin (human-plus-AI assistant).** Charged $1 per minute at the late-2017 launch. Pivoted to B2B analytics; the founders called the consumer model "capital-intensive and hard-to-scale". TechCrunch, pub Jul 2, 2019. Rating: [JOURNALISM], medium-high confidence. [TechCrunch](https://techcrunch.com/2019/07/02/sam-lessin-and-andrew-kortina-on-their-voice-assistants-workplace-pivot)
  - The same TechCrunch coverage says GoButler pivoted to fully automated assistance and was sold "as scrap". [TechCrunch 2017](https://techcrunch.com/2017/12/22/fin-assistant/%20)
- **Hello Alfred.** Moved from $99 per month to per-week pricing (from $32 per week), and built partnerships with apartment buildings. In one building, service charges were bundled into rent. Rating: student case and older trade press, low-medium confidence. [HBS RC-TOM (student)](https://d3.harvard.edu/platform-rctom/submission/hello-alfred-or-should-i-say-goodbye-alfred/index.html); [BD+C](https://www.bdcnetwork.com/home/news/55159838/manager-of-new-yorks-first-micro-unit-development-inks-pact-with-personal-butler-service)
- **Home warranty (Frontdoor), FY2025.**
  - 2.11M home warranties, flat YoY. Revenue $2,093M, of which $1,587M came from renewals.
  - Gross margin 55%.
  - Revenue is about $900 per warranty per year [DERIVED, rough].
  - Search summaries cite a renewal rate of about 75% and a retention rate of about 79.2%; these were not verified (MarketBeat returned 403).
  - Rating: [MEASURED], high confidence on counts and revenue, low confidence on retention. [Frontdoor 8-K](https://sec.gov/Archives/edgar/data/1727263/000119312526073378/ftdr-ex99_1.htm)
- **Angi membership revenue.** Angi's US "Membership subscription" revenue, from Pros *and* consumers combined, was $5.6M in Q3 2026, down from $6.9M in Q3 2025. That is about 2% of revenue.
  - The consumer Angi Key membership ($29.99 per year, launched 2021) is reported only via third parties.
  - Rating: [MEASURED] for the 10-Q line, low confidence for Key price. [Angi 10-Q Q3 2026](https://sec.gov/Archives/edgar/data/1705110/000170511026000105/angi-20260930.htm); [LawnStarter Angi review](https://www.lawnstarter.com/blog/reviews/angi-review/)
- **OurHome (family chore app).** Reportedly shut down by late 2023, per a competitor's blog. Rating: unverified, low confidence. [Kunba blog](https://kunba-website.pages.dev/blog/ourhome-shut-down-best-alternatives-2026)

### Inferences
- Precedents that survived made frequency *structural* rather than hoping for it: recurring cleaning by default (Handy), annual insurance-style contracts (warranties), or bundling into rent and building fees (Alfred). Software chore lists are free elsewhere (Cozi free tier, Apple, Google), so they are unlikely to carry a premium subscription between rare delegated jobs.
- Home warranty shows consumers *will* pay about $900 per year for low-frequency home peace of mind when the product transfers financial risk, not effort. A FamilyOS variant that bundles a service guarantee or warranty-like protection would be closer to a proven model, but it would be a different business.
- Angi, the largest US home-services marketplace, earns about 2% of revenue from memberships. That is direct evidence that consumers resist subscribing to home-service *access*.

### Gaps
- No public retention curves exist for Homejoy, Handy, Alfred or Duckbill.
- No evidence was found, for or against, that "recurring chores plus high-value delegation" bundles retain better. The PRD's mitigation is untested in any public data I found.

---

## 6. Household sharing: does the second adult actually adopt?

### Takeaway
I found no quantitative public data on partner activation in family apps. The qualitative evidence suggests one partner typically administers the system. Life360's "circle" model shows multi-member family products can monetize per household, but its core use (passive location) needs no active participation from the second adult.

### Cited Findings
- **NYT, May 2025 (Boston.com syndication).** Profiled couples often had one person entering everything. Daminger describes a "calendar partner" and doubts tools change the dynamic. Eve Rodsky argues relief requires end-to-end task ownership.
  - The sample is a small set of affluent heterosexual couples.
  - Rating: [JOURNALISM / anecdote], medium confidence on mechanism. [Boston.com/NYT](https://www.boston.com/news/national-news/2025/05/13/can-a-700-calendar-save-your-marriage/)
- **Life360.** About 102M MAU against 3.2M Paying Circles (Q2 2026). Many circle members use the app passively. Rating: [MEASURED]. [GuruFocus](https://www.gurufocus.com/news/9023298/life360-inc-lifx-q2-2026-earnings-call-highlights-surpasses-100-million-mau-milestone-with-38-revenue-growth)
- **Menlo 2026.** 34% of AI payers have a family member or friend paying, so AI is becoming a household expense paid by one person. Rating: [SURVEY], medium confidence. [Menlo PDF](https://menlovc.com/wp-content/uploads/2026/09/menlo_ventures_consumer_ai_report-2026.pdf)
- **Duckbill.** About 70% of early beta customers were women (Forerunner, 2023). Rating: [CLAIM]. [Forerunner](https://forerunnerventures.com/perspectives/delivering-on-techs-age-old-holy-grail-duckbill-the-indispensable-ai-powered)

### Inferences
- Gate 3's target of 50% or more inviting another adult lacks any benchmark. Invitation is also not activation. Measure the second adult's weekly active use, and the share of tasks they own or complete, separately from invites.
- The peer-reviewed load data imply that the likely primary user (the mother, as anticipator and monitor) differs from the likely owner of home repairs (the father). A home-services-first product may be adopted by the partner who feels less pain, or by neither.

### Gaps
- No published invite-to-activation or two-adult weekly-active rates were found for Cozi, Ohai, Skylight, FamilyWall or Life360.
- I could not run the planned HCI literature search (for example, Neustaedter on family calendars) because the search budget was exhausted.

---

## 7. Monetization alternatives: lead-gen and affiliate fees, take rates, and conflict of interest

### Takeaway
Lead-gen pays about $45 per matched lead at Angi, and pros pay whether or not they are hired. Affiliate income per household would be tens of dollars per year at FamilyOS's likely frequency, too small to fund the product. It would also create the same lead-quality conflict the FTC sanctioned at HomeAdvisor.

### Cited Findings
- **Angi FY2025 10-K.**
  - Service Requests and Leads:

    | Channel | Service Requests 2025 | Leads 2025 | Change in Leads |
    |---|---|---|---|
    | Proprietary | 13.906M | 17.915M | +14% |
    | Network | 1.637M | 2.280M | -74% |
    | Total | 15.543M | 20.195M | -17% |

  - Revenue: Proprietary $800.6M (up 17%), Network $103.5M (down 72%). The Network decline is tied to a Jan 2025 "homeowner choice" change.
  - Selling and marketing was $507.5M, 49% of revenue.
  - Lead revenue consists of fees Pros pay for consumer matches "regardless of whether the Pro ultimately provides the requested service". Third-party affiliates are paid when they send a valid service request.
  - Derived: about $44.77 US revenue per lead, and about 1.3 leads per service request, which is roughly $58 of revenue per service request. The per-lead figure is allocated by Angi's method, so it is approximate.
  - Rating: [MEASURED] high confidence; [DERIVED] medium. [Angi 10-K](https://sec.gov/Archives/edgar/data/1705110/000170511026000011/angi-20251231.htm)
- **Angi Q3 2026 10-Q.** Total revenue $242.0M against $265.6M (down 8.9%). US advertising revenue went to $0 from $57.8M. About 101K Average Monthly Active Pros, against about 111K in Q4 2025. Rating: [MEASURED], high confidence. [Angi 10-Q](https://sec.gov/Archives/edgar/data/1705110/000170511026000105/angi-20260930.htm)
- **Thumbtack.**
  - Revenue was nearly $500M, up 24%, per the CEO in Fast Company (the year is unclear). Rating: [CLAIM], search-snippet only, medium-low confidence. [Fast Company](https://www.fastcompany.com/91534514/)
  - Pros report lead costs from about $10 to over $100, varying by trade and market; Thumbtack does not publish averages. Housecall Pro is a competitor-adjacent vendor; pub May 5, 2026. [Housecall Pro](https://www.housecallpro.com/resources/what-is-thumbtack-how-it-works/)
  - A forum pro reported paying $154 as the sole pro on a lead and about $50 when three pros were selected. Rating: [ANECDOTE], low confidence. [Housecall Pro, competitors page](https://www.housecallpro.com/resources/thumbtack-competitors/)
  - The ChatGPT app built on OpenAI's Apps SDK was announced Oct 6, 2025. [BusinessWire](https://www.businesswire.com/news/home/20251006760229/en/Thumbtack-Partners-with-OpenAI-to-Power-Home-Services-in-ChatGPT)
- **FTC v. HomeAdvisor.** The proposed order (Jan 2023) was finalized in Apr 2023. It provides up to $7.2M in redress and bars misrepresenting lead quality, for example claiming leads are from people ready to hire. HomeAdvisor admitted no wrongdoing. Rating: [REGULATORY], high confidence. [FTC press release](https://ftc.gov/news-events/news/press-releases/2023/01/ftc-order-requires-homeadvisor-pay-72-million-stop-deceptively-marketing-its-leads-home-improvement); [TechCrunch](https://techcrunch.com/2023/01/23/the-ftc-fines-homeadvisor-up-to-7-2m-for-lying-about-lead-quality-and-other-matters)

### Inferences
- **Unit math [DERIVED, illustrative].** Even capturing Angi's *gross* revenue of about $58 per service request (an affiliate would get a fraction), 2-4 delegated hires per household per year yields about $115-230 per household-year at best, and realistically about $20-80 at affiliate rates.
  - That could subsidize a $9-15 per month plan only partially. It cannot fund a $19-29 per month agent tier on its own.
- **Conflict of interest.** If FamilyOS is paid per lead or per booked job, its recommendation competes with "best vendor for this family". That is the HomeAdvisor lead-quality problem in a more trusted wrapper. If adopted, it needs disclosure, vendor-neutral ranking and probably a booked-job (not lead) fee.
- Angi's sharp drop in network-channel volume, and Thumbtack and Google's direct AI-agent integrations, suggest marketplaces are building their own agent front doors. That leaves less room for an intermediary to capture fees.

### Gaps
- No public affiliate payout rates were found for Angi, Thumbtack or Yelp partner programs. The search budget was exhausted before this could be checked.
- No take-rate data exist for pay-per-booked-job models such as Angi's pre-priced services.

---

## 8. Trust: consumer comfort with AI agents contacting people or spending money (2025-2026)

### Takeaway
Comfort depends heavily on how the question is worded. Most consumers are fine with AI researching and drafting, a minority will let it act unsupervised, and roughly half to three-quarters reject autonomous payment. Human approval is the top trust-raiser, which supports the PRD's approval-gated design. Comfort with AI dealing directly with companies is only about one in three.

### Cited Findings
- **Menlo 2026 (n=5,067 US, Jul 2026).** 32% of AI users have let AI act on their behalf at least once without final sign-off. 41% have tried an agent and 24% use one regularly. Among AI-using shoppers, 26% let AI complete a purchase. Few grant agents access to health apps (23%) or financial accounts (20%). Rating: [SURVEY][VC], medium confidence. [Menlo PDF](https://menlovc.com/wp-content/uploads/2026/09/menlo_ventures_consumer_ai_report-2026.pdf)
- **Forrester (pub Jun 15, 2026; fielded April; US, UK and Canada online adults; n not stated).** About three-quarters are uncomfortable letting an agent complete a purchase and pay autonomously, even with spending limits. Most are comfortable with recommendations and comparisons. Rating: [SURVEY], medium confidence. [Forrester](https://www.forrester.com/blogs/consumers-arent-ready-to-delegate-payments-to-ai-agents/)
- **Riskified Q1 2026 (n=2,000 US and UK).** 55% are not comfortable with an AI agent completing a purchase. 46.5% trust no company to manage purchases. 73.9% expect biometric or OTP verification for every agent transaction.
  - The prior Q4 2025 wave (n=5,400, global) found 70% at least somewhat comfortable; the samples differ, so the comparison is approximate.
  - Riskified is a fraud-prevention vendor.
  - Rating: [SURVEY][VENDOR], low-medium confidence. [Forkast](https://forkast.news/73-use-ai-for-shopping-55-wont-let-it-buy-anything-the-trust-gap-is-widening/)
- **YouGov for Zendesk (global, pub Jul 24, 2025; n not stated).** Comfort by task: managing to-do lists and calendars 64%, professional communications 52%, financial planning 39%. Only 33% are comfortable letting their AI handle interactions with a company's AI. 84% say a human option should always remain. Rating: [SURVEY][VENDOR], medium-low confidence. [IntelligentCIO](https://www.intelligentcio.com/north-america/2025/07/24/global-survey-finds-consumers-embrace-personal-ai-assistants-but-demand-human-support-in-key-moments/)
- **Deloitte Connected Consumer 2025 (n=3,524 US, Q2 2025; pub Sep 25, 2025).** 70% worry about data privacy and security. 27% have high confidence their data is protected. About 4 in 10 regular GenAI users' households pay for GenAI tools.
  - A separate Deloitte figure of "16% trust agents to complete purchases" appeared only in search summaries.
  - Rating: [SURVEY], medium confidence, with the 16% figure low. [Deloitte](https://www.deloitte.com/us/en/about/press-room/connectivity-mobile-trends-survey.html)
- **RTB House (search-snippet only).** Human approval before checkout was the top trust condition, at 35% globally. Rating: low confidence. [Chain Store Age](https://chainstoreage.com/rtb-house-consumer-trust-agentic-ai-grows)
- **Accenture 2026 (search-snippet only).** 32% would let an agent choose a purchase if they confirm payment; 9% would accept fully autonomous purchase. Rating: low confidence. [RSM summary](https://www.rsmus.com/insights/economics/ai-assisted-discovery-to-purchase-trust-gap)

### Inferences
- Trust data supports the PRD's "Prepare plus explicit approval" autonomy level and argues against any near-term autonomous booking or payment. The PRD already excludes these from v1.
- The binding trust constraint may sit on the *vendor* side. AI-originated calls go unanswered or unpriced at high rates (Invoca, tertiary), and only a third of consumers are comfortable with AI talking to companies. Sending outreach from the household's own email or phone identity, with approval, is likely necessary.

### Gaps
- No US survey was found that asks specifically about comfort with an AI agent contacting a *local contractor or babysitter* on the household's behalf.
- No data were found on contractor willingness to transact with AI intermediaries.

---

## 9. Size: bottom-up count of the beachhead (US dual-income, homeowner, married households with children)

### Takeaway
The beachhead is about 12.6 million households: owner-occupied, opposite-sex married, both spouses employed, with own children under 18 (ACS 2024). Narrowing to households earning $150K or more gives about 7.2M. The market is large in household count. Monetizable demand depends on penetration, which public data cannot estimate.

### Cited Findings
- **BLS Employment Characteristics of Families, 2025 CPS annual averages** (11 months; October 2025 was not collected). Table last modified Apr 23, 2026.
  - 22.708M married-couple families with own children under 18, of which 15.048M (66.3%) have both parents employed.
  - Of those dual-employed families: 9.008M have children aged 6-17 only and 6.040M have a child under 6.
  - Rating: [MEASURED], high confidence. [BLS Table 4](https://www.bls.gov/news.release/famee.t04.htm); [BLS TED, pub Jun 22, 2026](https://www.bls.gov/opub/ted/2026/among-married-couple-families-with-children-97-4-percent-had-at-least-one-employed-parent-in-2025.htm)
- **Census ACS 2024 1-year, table B25115.** 17,868,084 owner-occupied married-couple family households with own children under 18 (MOE ±84,913). Total owner-occupied households: 86,635,506. Rating: [MEASURED], high confidence. [data.census.gov B25115](https://data.census.gov/table/ACSDT1Y2024.B25115)
- **My tabulation of the ACS 2024 1-year PUMS housing file.**
  - Method: household weights (WGTP); TEN = owned; HHT = married couple; HUPAOC = own children under 18; WORKSTAT = 01 (husband and wife both employed); HINCP adjusted by ADJINC.
  - Rating: [MEASURED][DERIVED], high confidence on method, standard sampling error not computed. [PUMS file](https://www2.census.gov/programs-surveys/acs/data/pums/2024/1-Year/csv_hus.zip); [2024 data dictionary](https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_2024.txt)

  | Segment | Households |
  |---|---|
  | Married couple with own children, all tenures (the BLS comparison is 22.7M) | 23.01M |
  | ...of which owner-occupied (B25115 shows 17.87M) | 17.90M |
  | Opposite-sex married, both employed, own children, any tenure (BLS shows 15.05M) | 15.34M |
  | **Beachhead: owner, opposite-sex married, both employed, own children** | **12.60M** |
  | ...living in a one-family detached house | 11.43M |
  | ...with at least one child under 6 | 4.80M |
  | ...household income ≥ $100K | 10.46M |
  | ...household income ≥ $150K | 7.23M |
  | ...household income ≥ $200K | 4.59M |
  | Renters, married, both employed, own children (excluded by beachhead) | 2.74M |
  | Cohabiting-couple owners with own children (excluded; employment not filtered) | ~1.37M |

  - Caveats: WORKSTAT excludes same-sex married couples (about 0.15M married-with-children households have WORKSTAT not applicable). "Employed" refers to the ACS reference week. "Own children" excludes step and related children in some cases.
- **NAHB analysis of ACS.** The homeownership rate for married couples with children is about 78%, up from 73% at the start of the decade. Pub Sep 25, 2024. Rating: [MEASURED via ACS], medium-high confidence. [NAHB Eye on Housing](https://eyeonhousing.org/2024/09/homeownership-rates-of-family-households/)

### Inferences
- **Illustrative revenue [DERIVED].** A blended $12 per month ($144 per year) across 12.6M households implies about $1.8B of theoretical annual revenue at full penetration.
  - At RevenueCat's North America median download-to-paid of about 2.8%, and assuming even 10% of the beachhead installs, that is about 35K paying households, or about $5M ARR.
  - Life360-like penetration (about 3% of a large base paying) applied to the full beachhead gives about 378K households, or about $54M ARR at $12 per month.
  - These ranges bracket a niche-to-meaningful business. They depend on beating the AI-app retention benchmarks.
- Household count is not the binding constraint; frequency, payment and retention are. The $150K+ segment (7.2M) is the most plausible early-paying core, given Menlo's finding that high-spend AI payers skew toward affluent Millennial parents.

### Gaps
- I did not compute standard errors from replicate weights.
- No public cross-tab exists of this segment by app or AI-subscription ownership, or by vendor-hiring frequency.

---

## Process disclosure

- **User's email sent to SEC (should not have happened).** One curl request to sec.gov's EDGAR company browse endpoint used a User-Agent string containing the user's email address. This contradicts the instruction not to send it to unrelated services. All later SEC requests used a generic User-Agent string or the fetch tool. No other personal data was transmitted.
- **Downloads.** Census PUMS files were downloaded only to the session scratchpad and processed with `python3 -I`. No accounts were created and no gated forms were submitted.
