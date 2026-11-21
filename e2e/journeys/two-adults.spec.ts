import type { Page } from '@playwright/test';
import { Api, addDays, weekday, weekdayName, type Occurrence } from '../support/api';
import { THEO, TIME_ZONE } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

// Two adults, each on their own phone (two browser contexts): asking the other to cover a
// handoff only hands it over once they accept (owner decision, 2026-11-21), and the Weekly Reset
// stays in step between the two screens.

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
  await page.getByRole('button', { name: /^Pick 5:30pm, pickup, you, needs sorting/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Event' });
  await expect(sheet.getByText('Daycare pickup').first()).toBeVisible();
  return sheet;
}

test.describe('Two adults: covering for each other, and the Weekly Reset in step', () => {
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
      maya.getByRole('button', {
        name: /^Pick 5:30pm, pickup, you, needs sorting, asked Theo, waiting/,
      }),
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
      theo.getByRole('button', { name: 'Pick 5:30pm, pickup, you', exact: true }),
    ).toBeVisible();
    await maya.reload();
    await expect(
      maya.getByRole('button', { name: 'Pick 5:30pm, pickup, Theo', exact: true }),
    ).toBeVisible();
    // Undoing his cover would hand it back to Maya without her yes: Theo can't.
    await theo.getByRole('button', { name: 'Pick 5:30pm, pickup, you', exact: true }).click();
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

    // Maya's Today, open all along, notices within seconds: Theo can't make it, and the clash
    // is hers to sort again.
    await expect(clashHeadsUp(maya)).toContainText('Theo can’t make it', { timeout: 15_000 });
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

  test('covering for the other adult is never direct: the app asks, the API refuses', async ({
    maya,
    mayaApi,
  }) => {
    const reset = await mayaApi.get<{ week: { start: string } }>('/reset');
    const week = reset.week.start;
    const theoApi = await Api.as(THEO.email);
    const swimOn = async () =>
      (await mayaApi.occurrences(addDays(week, 5), addDays(week, 5))).find(
        (o) => o.title === 'Swim lesson',
      );
    const swim = await swimOn();
    if (!swim) throw new Error('the seed has Saturday’s swim lesson with nobody down for it');

    // The API itself: a cover for someone else is refused (use a request).
    const direct = await mayaApi.request(
      `/households/${mayaApi.householdId}/events/${swim.eventId}/occurrences/${swim.date}`,
      { method: 'POST', body: { action: 'cover', memberId: theoApi.memberId } },
    );
    expect(direct.status).toBe(422);
    expect((direct.body as { error?: string }).error).toBe('use_request');

    // In the Reset (one screen for both), choosing Theo asks him: it waits for his yes and
    // still counts as needing someone.
    await maya.goto(`/reset?chapter=3&week=${week}`);
    await expect(maya.getByRole('heading', { name: 'Who has June, and when?' })).toBeVisible();
    const swimText = maya.getByText('Nobody is down for swim lesson with June yet.');
    await expect(swimText).toBeVisible();
    // The card that says so (the innermost block holding that line and a picker).
    const swimCard = maya
      .locator('div', { has: swimText })
      .filter({ has: maya.getByRole('radiogroup', { name: 'Who has it' }) })
      .last();
    const swimPicker = swimCard.getByRole('radiogroup', { name: 'Who has it' });
    await swimPicker.getByRole('radio', { name: 'Theo' }).click();
    await expect(toast(maya, 'Asked Theo. You’ll see here when they answer.')).toBeVisible();
    await expect(
      swimCard.getByText(/^Waiting for Theo · Theo says yes on their own phone/),
    ).toBeVisible();
    await expect(swimPicker.getByRole('radio', { name: 'Theo, asked, waiting' })).toBeVisible();
    await expect
      .poll(async () => (await swimOn())?.coverRequest?.askedMemberId)
      .toBe(theoApi.memberId);
    expect((await swimOn())?.cover).toBeNull();
    expect((await swimOn())?.memberIds).not.toContain(theoApi.memberId);

    // The plan can still be made, with it listed as open and waiting.
    await maya.goto(`/reset?chapter=5&week=${week}`);
    await expect(maya.getByText(/need someone · 1 waiting for Theo$/)).toBeVisible();
    await maya.getByRole('button', { name: 'Make it our plan' }).click();
    await expect(maya.getByRole('heading', { name: 'Your week has a plan.' })).toBeVisible();
    await expect(maya.getByText('Still open', { exact: true })).toBeVisible();
    await expect(
      maya.getByText(/^Swim lesson with June, Saturday 9:30am: waiting for Theo$/),
    ).toBeVisible();
  });

  test('the Weekly Reset on two phones: a vote and the commit show on the other within 5 s', async ({
    app,
    maya,
  }) => {
    const question = 'Thanksgiving: host here or go to Theo’s parents?';
    await maya.goto('/reset?chapter=2');
    await expect(maya.getByRole('heading', { name: 'What needs both of you?' })).toBeVisible();
    const theo = await app.as(THEO.email);
    await theo.goto('/reset?chapter=2&mode=apart');
    await expect(theo.getByRole('heading', { name: 'What needs both of you?' })).toBeVisible();

    // Theo votes on his phone; Maya's screen shows his pick within five seconds.
    await theo
      .getByRole('radiogroup', { name: question })
      .getByRole('radio', { name: /^Host here/ })
      .click();
    const voted = Date.now();
    await expect(maya.getByRole('radio', { name: 'Host here, picked by Theo' })).toBeVisible({
      timeout: 5000,
    });
    test
      .info()
      .annotations.push({ type: 'vote latency ms', description: String(Date.now() - voted) });

    // Maya makes it the plan; Theo's phone (each on your own phone) moves to the finish.
    await maya.goto('/reset?chapter=5');
    await maya.getByRole('button', { name: 'Make it our plan' }).click();
    await expect(maya.getByRole('heading', { name: 'Your week has a plan.' })).toBeVisible();
    const committed = Date.now();
    await expect(theo.getByRole('heading', { name: 'Your week has a plan.' })).toBeVisible({
      timeout: 5000,
    });
    test.info().annotations.push({
      type: 'commit latency ms',
      description: String(Date.now() - committed),
    });
    await expect(theo.getByText(/^Maya made it your plan on /)).toBeVisible();

    // Maya's Today says what Theo did.
    await app.nav(maya, 'Today');
    await expect(maya.getByText(`voted on “${question}”`)).toBeVisible();
  });

  test('the week’s notes: saved as you type, kept when you leave, and a stale save asks which to keep', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const week = (await mayaApi.get<{ week: { start: string } }>('/reset')).week.start;
    const notesOf = async () =>
      (await mayaApi.get<{ plan: { notes: string | null } | null }>(`/reset?week=${week}`)).plan
        ?.notes ?? null;
    const field = (page: Page) => page.getByLabel('Anything to remember this week? (optional)');

    // Maya types, and leaves at once: what she typed is saved, and there when she comes back.
    await maya.goto(`/reset?chapter=5&week=${week}`);
    await field(maya).fill('Theo has Wednesday pickup.');
    await app.nav(maya, 'Today');
    await expect.poll(notesOf).toBe('Theo has Wednesday pickup.');
    await maya.goto(`/reset?chapter=5&week=${week}`);
    await expect(field(maya)).toHaveValue('Theo has Wednesday pickup.');

    // Theo's phone has them within seconds.
    const theo = await app.as(THEO.email);
    await theo.goto(`/reset?chapter=5&week=${week}&mode=apart`);
    await expect(field(theo)).toHaveValue('Theo has Wednesday pickup.', { timeout: 5000 });

    // Theo's phone falls behind (its refreshes are held back), while Maya changes the notes.
    const theoApi = await Api.as(THEO.email);
    const stale = await theoApi.get<unknown>(`/reset?week=${week}`);
    const reads = /\/api\/households\/[^/]+\/reset\?week=/;
    await theo.route(reads, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: stale }) : route.fallback(),
    );
    await field(maya).fill('Theo has Wednesday pickup. Dentist Tuesday at 4.');
    await expect(maya.getByText('Saved for both of you')).toBeVisible();
    await expect.poll(notesOf).toBe('Theo has Wednesday pickup. Dentist Tuesday at 4.');

    // Theo types over the old version: his save is refused (a 409 the browser logs), and he
    // chooses.
    app.allowConsoleError(/status of 409 \(Conflict\)/);
    await field(theo).fill('Swim bag by the door Friday night.');
    await theo.unroute(reads);
    const choice = theo.getByLabel('Two versions of the notes');
    await expect(choice).toBeVisible();
    await expect(choice.getByText('Maya changed the notes too. Which should stay?')).toBeVisible();
    await expect(choice.getByText('Swim bag by the door Friday night.')).toBeVisible();
    await expect(
      choice.getByText('Theo has Wednesday pickup. Dentist Tuesday at 4.'),
    ).toBeVisible();
    expect(await notesOf()).toBe('Theo has Wednesday pickup. Dentist Tuesday at 4.');
    await choice.getByRole('button', { name: 'Keep mine' }).click();
    await expect(choice).toBeHidden();
    await expect.poll(notesOf).toBe('Swim bag by the door Friday night.');

    // Maya's screen follows his choice.
    await expect(field(maya)).toHaveValue('Swim bag by the door Friday night.', { timeout: 5000 });
  });
});
