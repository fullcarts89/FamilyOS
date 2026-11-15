import { DONE, addMonths } from '../support/api';
import { expect, test, toast } from '../support/fixtures';

/** "Dec 1": how the app writes a date more than a week away. */
const short = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

test.describe('Routines, including pets', () => {
  test('completing Biscuit’s monthly flea meds moves the routine to the next month', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const title = 'Biscuit’s flea meds';
    const before = await mayaApi.routine(title);
    const biscuit = await mayaApi.member('Biscuit');
    expect(before.routine.subjectMemberId).toBe(biscuit.id);
    const turn = before.upcoming.find((o) => !o.skipped && o.itemId);
    if (!turn) throw new Error('the seed should have materialized the next flea-meds turn');
    const next = addMonths(turn.date, 1);

    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Routines' }).click();
    await app.clip('complete-pet-care-routine', maya, async () => {
      await maya.getByRole('button', { name: `Done: ${title}` }).click();
      await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    });

    // The server has this month's turn done, and the next turn is the 1st of the month after.
    await expect
      .poll(async () => (await mayaApi.routine(title)).history.map((h) => h.status))
      .toContainEqual(expect.stringMatching(new RegExp(DONE.join('|'))));
    const after = await mayaApi.routine(title);
    const upcoming = after.upcoming.find((o) => !o.skipped && !DONE.includes(o.status ?? ''));
    expect(upcoming?.date).toBe(next);

    // The routine's page records the turn as done and the next one as coming up.
    await maya.getByRole('link', { name: title, exact: true }).click();
    await expect(maya.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(
      maya.getByRole('link', {
        name: new RegExp(`^${short(turn.date)}(, \\d{4})? · done by you$`),
      }),
    ).toBeVisible();
    await expect(maya.getByText(new RegExp(`^${short(next)}(, \\d{4})?$`))).toBeVisible();
  });

  test('the routine card moves on to the next turn once this one is done', async ({
    app,
    maya,
    mayaApi,
  }) => {
    // App bug (reported): after an early Done, the card on Tasks keeps showing this turn
    // ("Your turn · Dec 1", Done disabled) because Routines.tsx takes the first upcoming
    // occurrence without skipping done ones. Remove test.fail() once fixed.
    test.fail();
    const title = 'Biscuit’s flea meds';
    const turn = (await mayaApi.routine(title)).upcoming.find((o) => !o.skipped && o.itemId);
    if (!turn) throw new Error('no flea-meds turn');
    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Routines' }).click();
    await maya.getByRole('button', { name: `Done: ${title}` }).click();
    await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    await maya.reload();
    if (app.phone) await maya.getByRole('tab', { name: 'Routines' }).click();
    await expect(maya.getByText(`Your turn · ${short(addMonths(turn.date, 1))}`)).toBeVisible({
      timeout: 5000,
    });
  });
});
