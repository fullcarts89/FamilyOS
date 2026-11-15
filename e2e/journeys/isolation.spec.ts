import { Api } from '../support/api';
import { DEMO_HOUSEHOLD } from '../support/env';
import { expect, greeting, test } from '../support/fixtures';
import { createAccount, createHousehold, e2eEmail } from '../support/stack';

test.describe('Household isolation', () => {
  test('someone in another household sees none of the Riveras, in the app or the API', async ({
    app,
    mayaApi,
  }) => {
    const email = e2eEmail('robin');
    const password = 'quiet house by the sea 7';
    const userId = await createAccount(email, password);
    const other = await createHousehold({
      name: 'The Lindqvist household',
      ownerUserId: userId,
      ownerName: 'Robin',
    });
    const rivera = mayaApi.householdId;
    const invoice = await mayaApi.item('Pay Little Oaks invoice for next month');

    // In the app: Robin's own household, and nothing of the Riveras'.
    const robin = await app.as(email, password);
    await expect(greeting(robin, 'Robin')).toBeVisible();
    await expect(
      robin.getByRole('link', { name: 'The Lindqvist household, today' }).first(),
    ).toBeVisible();
    await app.nav(robin, 'Tasks');
    await expect(robin.getByRole('checkbox', { name: 'Complete Water the fern' })).toBeVisible();
    for (const text of [DEMO_HOUSEHOLD, 'Pay Little Oaks invoice', 'Maya', 'Theo', 'Biscuit']) {
      await expect(robin.getByText(text)).toHaveCount(0);
    }
    // Even with a Rivera item's address, the item doesn't show.
    app.allowConsoleError(/^console\.error on \/item\/.*status of 404/);
    await robin.goto(`/item/${invoice.id}`);
    // (The app says only "Something went wrong. Try again." here: see README, findings.)
    await expect(robin.getByRole('alert')).toBeVisible();
    await expect(robin.getByText(invoice.title)).toHaveCount(0);

    // In the API: the Riveras' household answers 404, exactly like one that doesn't exist.
    const robinApi = await Api.as(email, password);
    expect(robinApi.householdId).toBe(other.householdId);
    for (const path of [
      `/households/${rivera}`,
      `/households/${rivera}/work-items`,
      `/households/${rivera}/work-items/${invoice.id}`,
      `/households/${rivera}/events?from=2026-01-01&to=2026-01-07`,
      `/households/${rivera}/contacts`,
      `/households/${other.householdId}/work-items/${invoice.id}`,
    ]) {
      const res = await robinApi.request(path);
      expect(res.status, path).toBe(404);
    }
    // And the other way round.
    expect((await mayaApi.request(`/households/${other.householdId}/work-items`)).status).toBe(404);
  });
});
