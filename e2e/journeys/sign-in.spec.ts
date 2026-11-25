import { DEMO_HOUSEHOLD, MAYA } from '../support/env';
import { expect, greeting, test } from '../support/fixtures';

test.describe('Sign in', () => {
  test('Maya signs in, lands on Today, and stays signed in across a reload', async ({ app }) => {
    // Signed out, the app sends you to sign in.
    const page = await app.open('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();

    // A wrong password says so without revealing whether the account exists.
    await page.getByLabel('Email').fill(MAYA.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('That email and password don’t match.')).toBeVisible();
    // Supabase answers a wrong password with 400, which the browser logs.
    app.allowConsoleError(/status of 400/);

    await app.signIn(page, MAYA.email);
    await expect(greeting(page, 'Maya')).toBeVisible();
    await expect(
      page.getByRole('link', { name: `${DEMO_HOUSEHOLD}, today` }).first(),
    ).toBeVisible();

    // The session is real: it survives a reload.
    await page.reload();
    await expect(greeting(page, 'Maya')).toBeVisible();
  });
});
