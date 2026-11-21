import { BASE_URL } from '../support/env';
import { expect, greeting, test } from '../support/fixtures';
import { e2eEmail } from '../support/stack';

test.describe('An invited adult’s first look', () => {
  test('one welcome screen after joining, shown once', async ({ app, maya }) => {
    const email = e2eEmail('robin');
    const password = 'a quiet morning by the lake 31';

    await app.nav(maya, 'Household');
    await maya.getByRole('textbox', { name: 'Their email' }).fill(email);
    await maya.getByRole('button', { name: 'Adult', exact: true }).click();
    await maya.getByRole('button', { name: 'Create invite link' }).click();
    const linkText = maya.getByText(`${BASE_URL}/invite?token=`);
    const link = ((await linkText.textContent()) ?? '').trim();

    const robin = await app.open(link.replace(BASE_URL, ''));
    await robin.getByLabel('Your name').fill('Robin');
    await robin.getByLabel('Email').fill(email);
    await robin.getByLabel('Password', { exact: true }).fill(password);
    await robin.getByLabel('Password again').fill(password);
    await robin.getByRole('button', { name: 'Join the household' }).click();

    // What's theirs, what's shared, where capture is: one screen, no navigation around it.
    await expect(robin.getByRole('heading', { name: /^Hi Robin\. You’re in / })).toBeVisible();
    await expect(robin.getByText('What’s yours')).toBeVisible();
    await expect(robin.getByText('What’s shared')).toBeVisible();
    await expect(robin.getByText('Where capture is')).toBeVisible();
    await expect(app.mainNav(robin)).toHaveCount(0);
    await robin.screenshot({ path: test.info().outputPath('welcome.png') });
    await robin.getByRole('button', { name: 'Go to Today' }).click();
    await expect(greeting(robin, 'Robin')).toBeVisible();

    // Once: not again after a reload, and not when the address is opened directly.
    await robin.reload();
    await expect(greeting(robin, 'Robin')).toBeVisible();
    await robin.goto('/welcome');
    await expect(greeting(robin, 'Robin')).toBeVisible();
    await expect(robin.getByText('Where capture is')).toHaveCount(0);
  });
});
