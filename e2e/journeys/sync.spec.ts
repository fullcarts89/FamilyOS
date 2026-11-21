import type { Page } from '@playwright/test';
import { Api, DONE } from '../support/api';
import { MAYA, THEO, TIME_ZONE } from '../support/env';
import { expect, greeting, test, toast } from '../support/fixtures';

/** The instant of a wall-clock time on a local date in the household's zone. */
function householdTime(date: string, hhmmss: string): Date {
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = Number(/GMT([+-]\d+)/.exec(zone ?? '')?.[1] ?? -8);
  const offset = `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
  return new Date(`${date}T${hhmmss}${offset}`);
}

/** Today's date in the household's zone. */
const localToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());

/** Theo moves one of Maya's things to himself, from his own phone (the API, as his app does). */
async function theoTakes(theo: Api, title: string): Promise<void> {
  const item = await theo.item(title);
  const res = await theo.request(`/households/${theo.householdId}/work-items/${item.id}`, {
    method: 'PATCH',
    body: { expectedVersion: item.version, ownerMemberId: theo.memberId },
  });
  expect(res.status, `Theo takes “${title}”`).toBe(200);
}

const handTo = (page: Page, title: string) =>
  page.getByRole('button', { name: `Hand to Theo: ${title}` });

test.describe('Two adults, one household: open screens stay current', () => {
  test('Theo’s change reaches Maya’s open Today and Tasks within a minute', async ({ app }) => {
    const maya = await app.as(MAYA.email, undefined, { clock: true });
    const theo = await Api.as(THEO.email);

    // Today, open: Maya has the invoice. Theo takes it on his phone.
    const invoice = 'Pay Little Oaks invoice for next month';
    await expect(handTo(maya, invoice).first()).toBeVisible();
    await theoTakes(theo, invoice);
    // Nothing on Maya's screen is touched: within a minute it shows Theo has it.
    await maya.clock.fastForward(61_000);
    await expect(handTo(maya, invoice)).toHaveCount(0);
    if (!app.phone) {
      await expect(maya.getByRole('button', { name: `Take it: ${invoice}` }).first()).toBeVisible();
    }

    // Tasks, open: the same for another of hers.
    await app.nav(maya, 'Tasks');
    const rsvp = 'RSVP to Nora’s party';
    await expect(handTo(maya, rsvp).first()).toBeVisible();
    await theoTakes(theo, rsvp);
    await maya.clock.fastForward(61_000);
    await expect(handTo(maya, rsvp)).toHaveCount(0);
  });

  test('crossing midnight reloads an open Today', async ({ app }) => {
    // The browser's clock starts 20 seconds before midnight (yesterday's, so the session's tokens
    // stay valid): sign-in and Today take a few seconds of that.
    const midnight = householdTime(localToday(), '00:00:00');
    const maya = await app.as(MAYA.email, undefined, {
      clock: new Date(midnight.getTime() - 20_000),
    });
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    await expect(maya.getByRole('checkbox', { name: /^Complete / }).first()).toBeVisible();
    const now = await maya.evaluate(() => Date.now());
    expect(now, 'still before midnight in the browser').toBeLessThan(midnight.getTime() - 1000);
    const reloads: string[] = [];
    maya.on('request', (r) => {
      if (new URL(r.url()).pathname.endsWith('/rhythm')) reloads.push(r.url());
    });
    // Across midnight (well inside the once-a-minute reload): the day is read again.
    await maya.clock.fastForward(midnight.getTime() + 2000 - now);
    await expect.poll(() => reloads.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(greeting(maya, MAYA.name)).toBeVisible();
  });

  test('both tick the same task: the second sees “done by Theo”, not an error', async ({
    app,
    mayaApi,
  }) => {
    const title = 'Find a sitter for Friday';
    const maya = await app.as(MAYA.email);
    const theoPage = await app.as(THEO.email);
    for (const page of [maya, theoPage]) {
      await app.nav(page, 'Tasks');
      if (app.phone) await page.getByRole('tab', { name: 'Shared' }).click();
      await expect(page.getByRole('checkbox', { name: `Complete ${title}` })).toBeVisible();
    }

    // Theo gets there first.
    await theoPage.getByRole('checkbox', { name: `Complete ${title}` }).click();
    await expect(toast(theoPage, `Done: ${title}`)).toBeVisible();
    await expect.poll(async () => (await mayaApi.item(title)).status).toMatch(/done|complete/);

    // Maya's screen still shows it open; she ticks it too.
    await maya.getByRole('checkbox', { name: `Complete ${title}` }).click();
    await expect(toast(maya, `Already done by Theo: ${title}`)).toBeVisible();
    // A plain note, not an error, and nothing to retry: her row shows it done.
    await expect(maya.getByText(`Couldn’t mark “${title}” done.`)).toHaveCount(0);
    await expect(maya.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(maya.getByRole('checkbox', { name: `Complete ${title}` })).toHaveCount(0);

    // The server agrees: done once, by Theo.
    const item = await mayaApi.item(title);
    expect(DONE).toContain(item.status);
    const theoId = (await mayaApi.member('Theo')).id;
    const detail = await mayaApi.get<{ item: { completedByMemberId: string | null } }>(
      `/work-items/${item.id}`,
    );
    expect(detail.item.completedByMemberId).toBe(theoId);
    // The 409 the API answered (the browser logs it).
    app.allowConsoleError(/status of 409/);
  });
});
