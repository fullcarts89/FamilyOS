import type { Locator, Page } from '@playwright/test';
import { addDays, weekday, weekdayName } from '../support/api';
import { THEO, TIME_ZONE } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

/** The day strip on Today links each of the next seven days to the Week. */
const stripDay = (page: Page, date: string): Locator =>
  page.getByRole('link', { name: new RegExp(`^${weekdayName(date)}, `) });

/** Local time in the household's zone, "HH:MM". */
const nowLocal = () =>
  new Date().toLocaleTimeString('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

test.describe('Events, handoffs and conflicts', () => {
  test('Thursday’s pickup clash is resolved from Today and shows covered on the Week', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const thursday = addDays(today, (4 - weekday(today) + 7) % 7);
    test.skip(
      thursday === today && nowLocal() >= '17:30',
      'Thursday’s pickup has already happened today; the clash is no longer a heads-up.',
    );
    const theo = await mayaApi.member('Theo');
    const pickupOn = async () =>
      (await mayaApi.occurrences(thursday, thursday)).find(
        (o) => o.title === 'Daycare pickup' && o.careAction === 'pick_up',
      );
    expect((await pickupOn())?.cover).toBeNull();

    // On the Week, Thursday's pickup needs sorting: it clashes with Maya's planning meeting.
    await stripDay(maya, thursday).click();
    await expect(maya).toHaveURL(new RegExp(`/week\\?date=${thursday}`));
    const clash = maya.getByRole('button', { name: 'Pick 5:30pm, pickup, you, needs sorting' });
    await expect(clash).toBeVisible();
    await expect(
      maya.getByRole('button', {
        name: 'Quarterly planning (runs late), 2pm, clashes with a handoff',
      }),
    ).toBeVisible();
    const theoPickups = maya.getByRole('button', {
      name: 'Pick 5:30pm, pickup, Theo',
      exact: true,
    });
    const coveredBefore = await theoPickups.count();

    // Today's heads-up offers the fix. Asking Theo changes nothing until he says yes: the
    // pickup stays Maya's, marked as waiting, with a way to take the request back.
    await app.nav(maya, 'Today');
    const headsUp = maya.getByRole('button', {
      name: /“Quarterly planning \(runs late\)” runs into June’s pickup at 5:30pm/,
    });
    await expect(headsUp).toBeVisible();
    await maya.getByRole('button', { name: 'Ask Theo to cover' }).click();
    await expect(toast(maya, 'Asked Theo. You’ll see here when they answer.')).toBeVisible();
    await expect(headsUp).toContainText('Asked Theo · waiting');
    await expect(maya.getByRole('button', { name: 'Cancel request' })).toBeVisible();
    await expect.poll(async () => (await pickupOn())?.coverRequest?.status).toBe('pending');
    expect((await pickupOn())?.cover).toBeNull();
    expect((await pickupOn())?.memberIds).not.toContain(theo.id);

    // Theo, on his own phone, is asked on his Today, and says yes.
    const theoPage = await app.as(THEO.email);
    const asked = theoPage.getByRole('button', {
      name: /^Maya asked you to cover June’s pickup · (Thu|Today|Tomorrow) 5:30pm/,
    });
    await expect(asked).toBeVisible();
    await app.clip('resolve-childcare-conflict', theoPage, async () => {
      await theoPage.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(toast(theoPage, 'You have June’s pickup now')).toBeVisible();
    });
    await expect(asked).toBeHidden();

    // The server has Theo covering that one pickup, and the request is answered.
    await expect.poll(async () => (await pickupOn())?.cover?.memberId).toBe(theo.id);
    expect((await pickupOn())?.memberIds).toContain(theo.id);
    expect((await pickupOn())?.coverRequest).toBeNull();

    // Back on Maya's Today, the clash is gone.
    await app.nav(maya, 'Week');
    await app.nav(maya, 'Today');
    await expect(headsUp).toBeHidden();

    // The Week shows it covered, and nothing left to sort that day.
    await stripDay(maya, thursday).click();
    await expect(maya).toHaveURL(new RegExp(`/week\\?date=${thursday}`));
    await expect(theoPickups).toHaveCount(coveredBefore + 1);
    await expect(clash).toHaveCount(0);
    await expect(
      maya.getByRole('button', { name: 'Quarterly planning (runs late), 2pm', exact: true }),
    ).toBeVisible();
  });

  test('a weekly event with a pickup handoff shows on the Week, every week', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const [today, theo, june] = await Promise.all([
      mayaApi.today(),
      mayaApi.member('Theo'),
      mayaApi.member('June'),
    ]);
    await app.nav(maya, 'Week');
    if (app.phone) {
      await maya.getByRole('button', { name: 'New event' }).click();
    } else {
      await maya.getByRole('button', { name: 'Drop-off or pickup' }).click();
    }
    const sheet = maya.getByRole('dialog', { name: 'New event' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('textbox', { name: 'What’s happening?' }).fill('Swim class pickup');
    // 4:45–5:15pm: a time Theo is free on every day of the demo week.
    await sheet.getByRole('textbox', { name: 'Starts time' }).fill('4:45pm');
    await sheet.getByRole('textbox', { name: 'Starts time' }).press('Tab');
    await sheet.getByRole('textbox', { name: 'Ends time' }).fill('5:15pm');
    await sheet.getByRole('textbox', { name: 'Ends time' }).press('Tab');
    // Who: Theo instead of Maya (the default).
    await sheet.getByRole('button', { name: 'You', exact: true }).click();
    await sheet.getByRole('button', { name: 'Theo', exact: true }).click();
    await sheet.getByRole('button', { name: `Every ${weekdayName(today)}` }).click();
    const handoff = sheet.getByRole('switch', { name: 'This is a drop-off or pickup' });
    if (app.phone) await handoff.click();
    await expect(handoff).toBeChecked();
    await sheet.getByRole('button', { name: 'June', exact: true }).click();
    await sheet.getByRole('button', { name: 'Pickup', exact: true }).click();
    await sheet.getByRole('textbox', { name: 'Where' }).fill('Dishman Pool');
    await sheet.getByRole('button', { name: 'Add to the week' }).click();
    await expect(toast(maya, 'Added: Swim class pickup')).toBeVisible();
    await expect(sheet).toBeHidden();

    // On the Week: Theo's pickup at 4:45, with nothing to sort.
    const card = maya.getByRole('button', { name: 'Pick 4:45pm, pickup, Theo', exact: true });
    await expect(card).toBeVisible();

    // What the server stored: a weekly series on today's weekday, a pickup of June by Theo.
    const thisWeek = (await mayaApi.occurrences(today, today)).filter(
      (o) => o.title === 'Swim class pickup',
    );
    expect(thisWeek).toHaveLength(1);
    expect(thisWeek[0]).toMatchObject({
      careAction: 'pick_up',
      careMemberId: june.id,
      carePlace: 'Dishman Pool',
      recurring: true,
      memberIds: expect.arrayContaining([theo.id]),
    });
    expect(thisWeek[0]?.memberIds).not.toContain(mayaApi.memberId);
    const nextWeek = addDays(today, 7);
    expect(
      (await mayaApi.occurrences(nextWeek, nextWeek)).filter(
        (o) => o.title === 'Swim class pickup',
      ),
    ).toHaveLength(1);

    // And it repeats: the next week has it too, after a reload.
    await maya.goto(`/week?date=${nextWeek}`);
    await expect(maya.getByRole('heading', { level: 1, name: /–/ })).toBeVisible();
    await expect(card).toBeVisible();
  });
});
