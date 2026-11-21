import type { Page } from '@playwright/test';
import { Api, addDays, weekday, weekdayName, type Occurrence } from '../support/api';
import { THEO, TIME_ZONE } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

// Two adults, each on their own phone (two browser contexts): asking the other to cover a
// handoff only hands it over once they accept (owner decision, 2026-11-21).

/** Local time in the household's zone, "HH:MM". */
const nowLocal = () =>
  new Date().toLocaleTimeString('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

/** Thursday's Daycare pickup (the demo's clash with Maya's planning meeting), read through the API. */
async function thursdayPickup(api: Api) {
  const today = await api.today();
  const thursday = addDays(today, (4 - weekday(today) + 7) % 7);
  const read = async (): Promise<Occurrence | undefined> =>
    (await api.occurrences(thursday, thursday)).find(
      (o) => o.title === 'Daycare pickup' && o.careAction === 'pick_up',
    );
  return { today, thursday, read };
}

const clashHeadsUp = (page: Page) =>
  page.getByRole('button', {
    name: /“Quarterly planning \(runs late\)” runs into June’s pickup at 5:30pm/,
  });
const askedHeadsUp = (page: Page) =>
  page.getByRole('button', {
    name: /^Maya asked you to cover June’s pickup · (Thu|Today|Tomorrow) 5:30pm/,
  });

/** Opens Thursday's pickup (the one that clashes) from the Week. */
async function openPickup(page: Page, thursday: string) {
  await page.goto(`/week?date=${thursday}`);
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible();
  await page.getByRole('button', { name: /^Pickup 5:30pm, you, needs sorting/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Event' });
  await expect(sheet.getByText('Daycare pickup').first()).toBeVisible();
  return sheet;
}

test.describe('Two adults: covering for each other', () => {
  test('Maya asks Theo to cover; he accepts on his phone; both see it covered', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const { thursday, read } = await thursdayPickup(mayaApi);
    test.skip((await mayaApi.today()) === thursday && nowLocal() >= '17:30', 'pickup is past');
    const theoApi = await Api.as(THEO.email);
    const theoId = theoApi.memberId;

    // Maya asks from the event itself, on the Week.
    const sheet = await openPickup(maya, thursday);
    await expect(sheet.getByRole('button', { name: 'Ask Theo to cover' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Ask Theo to cover' }).click();
    await expect(toast(maya, 'Asked Theo. You’ll see here when they answer.')).toBeVisible();
    await expect.poll(async () => (await read())?.coverRequest?.status).toBe('pending');
    expect((await read())?.cover).toBeNull();

    // On Maya's Week it still needs sorting, and says who it's waiting for.
    await expect(
      maya.getByRole('button', { name: /^Pickup 5:30pm, you, needs sorting, asked Theo, waiting/ }),
    ).toBeVisible();

    // Theo's phone: the ask is on his Today, with Accept and Decline.
    const theo = await app.as(THEO.email);
    await expect(askedHeadsUp(theo)).toBeVisible();
    await app.clip('ask-to-cover-accepted', theo, async () => {
      await theo.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(toast(theo, 'You have June’s pickup now')).toBeVisible();
    });
    await expect(askedHeadsUp(theo)).toBeHidden();
    // One pickup covered is a confirmation, not a milestone card.
    await expect(theo.getByText('Pickup covered')).toHaveCount(0);
    await expect.poll(async () => (await read())?.cover?.memberId).toBe(theoId);

    // Both see it covered by Theo: his Week, and Maya's (she reloads the Week).
    await theo.goto(`/week?date=${thursday}`);
    await expect(
      theo.getByRole('button', { name: 'Pickup 5:30pm, you', exact: true }),
    ).toBeVisible();
    await maya.reload();
    await expect(
      maya.getByRole('button', { name: 'Pickup 5:30pm, Theo', exact: true }),
    ).toBeVisible();
    // Undoing his cover would hand it back to Maya without her yes: Theo can't.
    await theo.getByRole('button', { name: 'Pickup 5:30pm, you', exact: true }).click();
    const theirs = theo.getByRole('dialog', { name: 'Event' });
    await expect(theirs.getByText(/Maya can take it back from their phone/)).toBeVisible();
    await expect(theirs.getByRole('button', { name: 'Back to the usual' })).toHaveCount(0);

    // Maya's Today: no clash left, and what Theo did, in words.
    await app.nav(maya, 'Today');
    await expect(clashHeadsUp(maya)).toBeHidden();
    await expect(maya.getByText('said yes: covering Daycare pickup')).toBeVisible();
  });

  test('Theo declines: Maya sees he can’t make it, and the pickup needs someone again', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const { thursday, read } = await thursdayPickup(mayaApi);
    test.skip((await mayaApi.today()) === thursday && nowLocal() >= '17:30', 'pickup is past');

    await expect(clashHeadsUp(maya)).toBeVisible();
    await maya.getByRole('button', { name: 'Ask Theo to cover' }).click();
    await expect(clashHeadsUp(maya)).toContainText('Asked Theo · waiting');

    const theo = await app.as(THEO.email);
    await expect(askedHeadsUp(theo)).toBeVisible();
    await theo.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(toast(theo, 'Told Maya you can’t make it')).toBeVisible();
    await expect(askedHeadsUp(theo)).toBeHidden();

    // Nothing changed hands, and nothing is waiting any more.
    await expect.poll(async () => (await read())?.coverRequest ?? null).toBeNull();
    expect((await read())?.cover).toBeNull();
    expect((await read())?.memberIds).toContain(mayaApi.memberId);

    // Maya comes back to Today: Theo can't make it, and the clash is hers to sort again.
    await app.nav(maya, 'Week');
    await app.nav(maya, 'Today');
    await expect(clashHeadsUp(maya)).toContainText('Theo can’t make it');
    await expect(maya.getByRole('button', { name: 'Ask Theo to cover' })).toBeVisible();
    await expect(maya.getByText('can’t make it: Daycare pickup')).toBeVisible();
  });

  test('Maya takes her request back before Theo answers', async ({ app, maya, mayaApi }) => {
    const { thursday, read } = await thursdayPickup(mayaApi);
    test.skip((await mayaApi.today()) === thursday && nowLocal() >= '17:30', 'pickup is past');

    await maya.getByRole('button', { name: 'Ask Theo to cover' }).click();
    await expect(clashHeadsUp(maya)).toContainText('Asked Theo · waiting');
    await maya.getByRole('button', { name: 'Cancel request' }).click();
    await expect(toast(maya, 'Took back your request to Theo')).toBeVisible();
    await expect(maya.getByRole('button', { name: 'Ask Theo to cover' })).toBeVisible();
    await expect.poll(async () => (await read())?.coverRequest ?? null).toBeNull();

    // Theo sees the clash, not a request.
    const theo = await app.as(THEO.email);
    await expect(clashHeadsUp(theo)).toBeVisible();
    await expect(askedHeadsUp(theo)).toHaveCount(0);
    await expect(theo.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
    expect((await read())?.cover).toBeNull();

    // Covering it himself needs nobody's yes: it's his at once.
    await theo.getByRole('button', { name: 'I’ll cover it' }).click();
    await expect(toast(theo, 'You have June’s pickup now')).toBeVisible();
    await expect(theo.getByText('Pickup covered')).toHaveCount(0);
    const theoApi = await Api.as(THEO.email);
    await expect.poll(async () => (await read())?.cover?.memberId).toBe(theoApi.memberId);
  });

  test('a request about an ordinary pickup reaches Theo’s Today too', async ({ app, mayaApi }) => {
    const today = await mayaApi.today();
    // The next weekday pickup after today with no clash: Maya's, as usual.
    let date = addDays(today, 1);
    while (weekday(date) > 5 || weekday(date) === 4) date = addDays(date, 1);
    const pickup = (await mayaApi.occurrences(date, date)).find(
      (o) => o.title === 'Daycare pickup',
    );
    if (!pickup) throw new Error('a weekday has a pickup');
    // Maya asks (through the API: the asking itself is covered above); no heads-up of its own.
    const asked = await mayaApi.request(
      `/households/${mayaApi.householdId}/events/${pickup.eventId}/occurrences/${date}/cover-requests`,
      { method: 'POST', body: { memberId: (await mayaApi.member('Theo')).id } },
    );
    expect(asked.status).toBe(201);

    const theo = await app.as(THEO.email);
    const short = weekdayName(date).slice(0, 3);
    const ask = theo.getByRole('button', {
      name: new RegExp(`^Maya asked you to cover June’s pickup · (${short}|Tomorrow) 5:30pm`),
    });
    await expect(ask).toBeVisible();
    await theo.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(toast(theo, 'Told Maya you can’t make it')).toBeVisible();
    await expect(ask).toBeHidden();
  });
});
