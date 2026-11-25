import { expect, greeting, test } from '../support/fixtures';
import { createAccount, createHousehold, e2eEmail, resetLinkFor } from '../support/stack';

const SENT =
  'If that email has a FamilyOS account, we’ve sent it a link to choose a new password. Check your inbox, and your spam folder too.';

test.describe('Forgotten password', () => {
  test('Robin resets a forgotten password from the email link and is signed in', async ({
    app,
  }) => {
    const email = e2eEmail('reset');
    const userId = await createAccount(email, 'the old password, long forgotten');
    await createHousehold({
      name: 'The Lindqvist household',
      ownerUserId: userId,
      ownerName: 'Robin',
    });

    // From sign-in, ask for a link. An address without an account gets exactly the same answer.
    const page = await app.open('/sign-in');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Email').fill(e2eEmail('nobody'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(SENT)).toBeVisible();
    await page.getByRole('button', { name: 'Use a different email' }).click();
    await page.getByLabel('Email').fill(email.toUpperCase());
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(SENT)).toBeVisible();

    // The email's link opens the reset page; it checks the new password before saving.
    const link = await resetLinkFor(email);
    expect(link).toMatch(/^\/reset-password\?token_hash=[^&]+&type=recovery$/);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    const save = page.getByRole('button', { name: 'Save and sign in' });
    await page.getByLabel('New password', { exact: true }).fill('lanterns in the hall');
    await page.getByLabel('New password again').fill('lanterns in the hal');
    await expect(page.getByText('The passwords don’t match.')).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel('New password again').fill('lanterns in the hall');
    await save.click();

    // Signed in, on Today.
    await expect(greeting(page, 'Robin')).toBeVisible();

    // The link works once.
    const again = await app.open(link);
    await again.getByLabel('New password', { exact: true }).fill('another long password');
    await again.getByLabel('New password again').fill('another long password');
    await again.getByRole('button', { name: 'Save and sign in' }).click();
    await expect(again.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(again.getByRole('button', { name: 'Send a new link' })).toBeVisible();
    // Supabase answers a used token with 403, which the browser logs.
    app.allowConsoleError(/status of 403/);

    // The new password signs in on another device; the old one no longer does.
    await app.as(email, 'lanterns in the hall');
    const old = await app.open('/sign-in');
    await old.getByLabel('Email').fill(email);
    await old.getByLabel('Password').fill('the old password, long forgotten');
    await old.getByRole('button', { name: 'Sign in' }).click();
    await expect(old.getByText('That email and password don’t match.')).toBeVisible();
    app.allowConsoleError(/status of 400/);
  });

  test('an incomplete link says so and offers a new one', async ({ app }) => {
    const page = await app.open('/reset-password?type=recovery');
    await expect(page.getByRole('heading', { name: 'This link isn’t complete' })).toBeVisible();
    await page.getByRole('button', { name: 'Send a new link' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});
