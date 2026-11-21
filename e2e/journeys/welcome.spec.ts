import { BASE_URL } from '../support/env';
import { expect, greeting, test } from '../support/fixtures';
import { createOwnerInvite, e2eEmail } from '../support/stack';

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

  test('a new household’s first owner goes straight to setup, never the partner welcome', async ({
    app,
  }) => {
    const email = e2eEmail('ada');
    const password = 'tea on the back step 17';
    const link = await createOwnerInvite({ name: 'The Okoro household', email });

    const ada = await app.open(link);
    // Watch the whole visit: the partner welcome must never appear, not even for a moment.
    await ada.evaluate(() => {
      const w = window as unknown as { __sawWelcome: boolean };
      w.__sawWelcome = false;
      const look = () => {
        if (/Where capture is|What’s shared/.test(document.body.innerText)) w.__sawWelcome = true;
      };
      new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
    });
    await expect(ada.getByRole('heading', { name: 'You’re invited' })).toBeVisible();
    await ada.getByLabel('Your name').fill('Ada');
    await ada.getByLabel('Email').fill(email);
    await ada.getByLabel('Password', { exact: true }).fill(password);
    await ada.getByLabel('Password again').fill(password);
    await ada.getByRole('button', { name: 'Join the household' }).click();

    // The guided setup, as before the welcome existed.
    await expect(
      ada.getByRole('heading', { name: 'Hi Ada. Let’s set up your household.' }),
    ).toBeVisible();
    await expect(ada).toHaveURL(/\/setup$/);
    await ada.screenshot({ path: test.info().outputPath('first-owner-setup.png') });
    await ada.getByRole('button', { name: 'Skip setup' }).click();
    await expect(greeting(ada, 'Ada')).toBeVisible();

    const saw = () =>
      ada.evaluate(() => (window as unknown as { __sawWelcome?: boolean }).__sawWelcome);
    expect(await saw(), 'the partner welcome showed on the way to setup').toBe(false);

    // Opening the welcome's address directly leads to Today for an owner, without a flash of it.
    await ada.addInitScript(() => {
      const w = window as unknown as { __sawWelcome: boolean };
      w.__sawWelcome = false;
      new MutationObserver(() => {
        if (/Where capture is|What’s shared/.test(document.body?.innerText ?? ''))
          w.__sawWelcome = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await ada.goto('/welcome');
    await expect(greeting(ada, 'Ada')).toBeVisible();
    expect(await saw(), 'the partner welcome showed at /welcome').toBe(false);
    await expect(ada.getByText('Where capture is')).toHaveCount(0);
  });
});
