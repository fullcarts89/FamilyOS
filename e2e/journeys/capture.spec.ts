import { addDays } from '../support/api';
import { expect, test, toast } from '../support/fixtures';

test.describe('Quick capture', () => {
  test('“Call the plumber tomorrow @theo #reno” lands on Theo’s list, tomorrow, in the reno', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const sheet = await app.openCapture(maya);
    await sheet
      .getByRole('textbox', { name: 'What needs doing?' })
      .fill('Call the plumber tomorrow @theo #reno');

    // The live preview reads the shorthand before anything is saved.
    await expect(sheet.getByText('Tomorrow', { exact: true }).first()).toBeVisible();
    await expect(sheet.getByText('Hall bathroom renovation', { exact: true })).toBeVisible();
    // The chosen list previews the title. (Its checked state isn't exposed: see README, hooks.)
    await expect(sheet.getByRole('radio', { name: 'Theo', exact: true })).toContainText(
      'Call the plumber',
    );

    await sheet.getByRole('button', { name: 'Add to Theo’s list' }).click();
    await expect(toast(maya, 'Added to Theo’s list: Call the plumber')).toBeVisible();
    await expect(sheet).toBeHidden();

    // What the server stored: Theo's, due tomorrow, a step of the renovation.
    const [theo, today, reno] = await Promise.all([
      mayaApi.member('Theo'),
      mayaApi.today(),
      mayaApi.item('Hall bathroom renovation'),
    ]);
    const item = await mayaApi.item('Call the plumber');
    expect(item).toMatchObject({
      ownerMemberId: theo.id,
      dueOn: addDays(today, 1),
      parentId: reno.id,
      status: 'ready',
    });

    // And it shows as Theo's step of the renovation, after a reload: under the project, and on
    // Theo's own list with the project's name. "Take it" is offered only on the partner's items.
    await app.nav(maya, 'Tasks');
    await maya.reload();
    const takeIt = maya.getByRole('button', { name: 'Take it: Call the plumber' });
    if (app.phone) {
      await maya.getByRole('tab', { name: 'Theo' }).click();
      await expect(takeIt).toBeVisible();
      await expect(maya.getByText('Hall bathroom renovation').first()).toBeVisible();
      await maya.getByRole('tab', { name: 'Projects' }).click();
      await maya.getByRole('button', { name: 'Show steps' }).click();
      await expect(takeIt).toBeVisible();
    } else {
      await maya.getByRole('button', { name: 'Show steps' }).click();
      await expect(takeIt).toHaveCount(2);
    }
  });
});
