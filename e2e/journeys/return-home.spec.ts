import { Api, DONE } from '../support/api';
import { THEO } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

test.describe('Daily return', () => {
  test('returning to Today after Theo changed the plan shows what he did', async ({
    app,
    maya,
  }) => {
    const title = 'Renew car registration';
    // Maya has looked at Today (the app marks the visit); she moves on to the Week.
    await app.nav(maya, 'Week');

    // Meanwhile Theo, on his own device, handles the overdue registration.
    const theo = await app.as(THEO.email);
    await app.nav(theo, 'Tasks');
    await theo.getByRole('checkbox', { name: `Complete ${title}` }).click();
    await expect(toast(theo, `Done: ${title}`)).toBeVisible();
    const theoApi = await Api.as(THEO.email);
    await expect.poll(async () => DONE.includes((await theoApi.item(title)).status)).toBe(true);

    // Maya comes back to Today: it says what changed, in words, and the late item is gone.
    await app.clip('return-home-after-plan-changed', maya, async () => {
      await app.nav(maya, 'Today');
      await expect(maya.getByRole('heading', { name: 'Since you last looked' })).toBeVisible();
      await expect(maya.getByText(`handled ${title}`)).toBeVisible();
    });
    await expect(maya.getByRole('button', { name: `Take it: ${title}` })).toHaveCount(0);
  });
});
