import { resolve } from 'node:path';
import { E2E_DIR } from '../support/env';
import { test } from '../support/fixtures';

/**
 * Journeys whose screens are still being built (they show "Coming next" today). Each is a
 * test.fixme with the steps to write once the screen lands; the API behind each one already
 * exists and is covered by apps/api tests. Turn a stub on by replacing test.fixme with test.
 */
test.describe('Coming next (stubs)', () => {
  test.fixme('Weekly Reset, from the opening to “Your week has a plan”', async () => {
    // TODO when /reset lands (plan M4):
    // - Maya opens Reset; the opening greets her by name (Fraunces chapter title).
    // - Look back: highlights from last week in words (the toddler bed project, the tile
    //   decision made together, Theo covering Wednesday's pickup); no counts compared.
    // - Loose ends: triage each late item (keep / move / hand over / drop).
    // - Cover June: Saturday's swim lesson has nobody; assign Theo; the board updates live.
    // - Dinners and groceries: fill the two open nights.
    // - Commit: "Your week has a plan. You're ready to take it on together." with anything
    //   unresolved clearly marked; re-read GET /reset and /weekly-plan (committed_at set).
    // - Record as acceptance clip 'weekly-reset-full-session'.
  });

  test.fixme('a decision resolved together', async () => {
    // TODO when decisions get a screen (Reset → Decide, plan M4):
    // - Maya has voted "Little Oaks Pre-K" on "Which preschool for June next fall?".
    // - Theo (second context) votes the same option; it shows decided for both, with the
    //   "decided together" milestone once per person (refresh does not replay it).
    // - GET /decisions/:id → status 'decided', decided_via 'agreement'.
  });

  test.fixme('groceries: check items off, and undo', async () => {
    // TODO when /meals lands (More → Meals):
    // - Check off "Bananas" and "Spinach"; they move to the cart section; undo one.
    // - GET /groceries → checkedAt set for Bananas only; reload keeps it.
    // - Theo's device sees the change on refresh.
  });

  test.fixme('contacts: add the plumber and link it to a task', async () => {
    // TODO when /contacts lands (More → Contacts):
    // - Add "Sam Ortiz", category Home, role Electrician, phone; it lists under Home.
    // - Link it from a task's detail; GET /contacts and /work-items/:id → contactId.
    // - Search finds it; phone number is a tel: link.
  });

  test.fixme('Monarch budget CSV import', async () => {
    const csv = resolve(E2E_DIR, 'fixtures/monarch-budget.csv');
    void csv;
    // TODO when /budgets lands (More → Budgets):
    // - Upload e2e/fixtures/monarch-budget.csv (page.setInputFiles on the file input).
    // - The month shows Groceries 903.42 of 1,100 and the other four categories.
    // - GET /budgets?month=2026-11 → five snapshots replacing the seeded month.
    // - A transactions export is refused with a plain-language message.
  });
});
