# Gate 0 interview script and Gate 1 concierge protocol

> **Archived (2026-11-07).** FamilyOS is now built for the founder's own household first (`docs/product/product-contract.md`). These interviews and concierge pilots are **not** prerequisites for development. The kit is kept for a possible later commercial decision.

**Date:** 2026-11-07. Founder-run. Nothing here is automated, and no FamilyOS software contacts anyone.

## Gate 0: 12–15 target-household interviews (45 min each, including about 10 minutes on the prototype)

**Screen:**
- US, two or more adults sharing a household, children under 18, homeowner, both adults employed.
- Uses at least one of a family calendar, Cozi, Skylight or Alexa.

**Questions.** Ask about past behaviour, never hypotheticals.

1. Walk me through the last time something in the house needed a pro. What was it, and when?
2. Who noticed it? Who did the work of finding someone? How long did that take, roughly, over how many days?
3. How did you contact them: call, text, form, email, app? Did they reply? How fast?
4. What fell through the cracks? (Missed callbacks, forgotten follow-ups, "I thought you booked it".)
5. How often in the past 12 months did you hire someone for the house? List them.
6. Which other recurring coordination eats the most time (childcare, school, medical, cleaning, lawn)?
7. What do you use today to split this with your partner? What breaks?
8. Have you used Thumbtack, Angi, Yelp quotes, Google's AI calling, Alexa+, Duckbill or an AI assistant for this? What happened?
9. Would you let software email a contractor for you if you approved each message? Text? Call? Where's the line?
10. Commitment test: "We're running a 3-week pilot where our team handles your next home-service job end to end. $25 deposit, refunded if we don't book it." Yes / no / why.

**Wedge questions (added after founder review; use the Phase B prototype as the prop).** Walk through the five demo paths in a rotated order, so no path always comes first.

11. "Which of these would you open this week, and why?" Then: "Which would you still be using in two months?"
12. "Would you want chores, the shared week and contractor follow-up in one app, or only one of them? Which one?" Probe what they would drop.
13. "What does your partner use today? Would they join for this? For which part?"
14. "If you could pay for only one part, which, and roughly how much a month?" Ask only after 11–13, so price does not anchor the earlier answers.

**Record:**
- Number of hires in the last 12 months.
- Minutes spent on the last one.
- Channels used.
- Partner split.
- Incumbent apps used.
- Pilot commitment (yes/no/deposit).
- Wedge preference: first choice and two-month choice among A (home-service coordination), B (chores and routines), C (two-adult coordination) and D (unified), plus whether the partner would join.

**Pass:**
- 8 or more of the interviewees describe a recurring coordination or follow-up pain.
- 5 or more commit to the pilot, ideally with a deposit.
- The median household reports 3 or more hires a year.

That third condition is new; it addresses the frequency risk.

**Wedge decision rule** (feeds `docs/product/product-contract.md` §4):
- If 50% or more choose **D (unified)** as their two-month choice, the launch is the unified system, with the most-chosen part as its lead.
- Otherwise, the single most-chosen part leads, and the others stay on the roadmap in the order chosen.
- If no option reaches 35%, or partner-join intent is under 40%, record the split and run Gate 1 on the top two candidates.
- These thresholds are proposals for the founder to adjust before interviews start.

## Gate 1: concierge (5–10 households, one real task each)

- **Transparency:** tell participants the FamilyOS team is doing the work with software help. Never present manual work as autonomous (PRD Gate 1; FTC precedents).
- **Channel:** email vendors from a FamilyOS-team address, with the household's consent to use their name and address. **Never log into participants' mailboxes**: Gmail Limited Use forbids human reading.
- **Every outbound message gets the household's approval** in writing (a text reply is enough). Log the approval time.
- **Per vendor contacted, log:**
  - the channel;
  - time to first reply;
  - whether they replied at all;
  - whether they quoted without a site visit;
  - whether they booked.
- **Per task, log:**
  - household active minutes;
  - team minutes;
  - calendar days to booking;
  - whether the outcome was verified (invoice or photo);
  - whether the second adult engaged;
  - "would you delegate again?";
  - price-test response: per-job ($15 / $25 / $40) vs monthly ($19 / $29).
- **Pass:**
  - 70% or more of tasks booked.
  - The household saves at least 30 minutes against their own estimate.
  - 60% or more would delegate again.
  - Email reply rate of 40% or more within 48 hours; otherwise the channel plan changes.
  - Team minutes per task are low enough that software automating about 70% of them leaves a margin.
