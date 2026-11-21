import { Api } from '../support/api';
import { BASE_URL, DEMO_HOUSEHOLD } from '../support/env';
import { expect, greeting, test, toast } from '../support/fixtures';
import { e2eEmail } from '../support/stack';

test.describe('Household: pets and invites', () => {
  test('adding a pet, then its monthly care routine', async ({ app, maya, mayaApi }) => {
    await app.nav(maya, 'Household');
    await maya.getByRole('button', { name: 'Add a child or pet' }).click();
    const sheet = maya.getByRole('dialog', { name: 'Add to the household' });
    await sheet.getByRole('button', { name: /^A pet/ }).click();
    await sheet.getByRole('textbox', { name: 'Their name' }).fill('Pepper');
    await sheet.getByRole('button', { name: 'Cat', exact: true }).click();
    await sheet.getByRole('button', { name: 'Add pet' }).click();
    await expect(
      sheet.getByRole('heading', { name: 'Pepper is part of the household' }),
    ).toBeVisible();

    const pepper = await mayaApi.member('Pepper');
    expect(pepper).toMatchObject({ role: 'pet', species: 'Cat' });

    // The guided next step: their care, monthly on the 1st, prefilled.
    await sheet.getByRole('button', { name: 'Set up Pepper’s care routine' }).click();
    await expect(maya.getByRole('heading', { name: 'New routine' })).toBeVisible();
    await expect(maya.getByRole('textbox', { name: 'What needs doing?' })).toHaveValue(
      'Pepper’s flea meds',
    );
    await expect(maya.getByText('Monthly on the 1st').last()).toBeVisible();
    await maya.getByRole('button', { name: 'Save routine' }).click();
    await expect(toast(maya, 'Routine set up: Pepper’s flea meds')).toBeVisible();
    await expect(maya.getByRole('heading', { level: 1, name: 'Pepper’s flea meds' })).toBeVisible();

    const routine = (await mayaApi.routine('Pepper’s flea meds')).routine;
    expect(routine).toMatchObject({
      subjectMemberId: pepper.id,
      ownerMemberId: mayaApi.memberId,
      rule: { freq: 'monthly', dayOfMonth: 1, interval: 1 },
    });
    expect(routine.startOn.slice(8)).toBe('01');

    // Pepper is listed with the household's pets, after a reload.
    await app.nav(maya, 'Household');
    await maya.reload();
    await expect(maya.getByRole('button', { name: 'Pepper, Pet, edit' })).toBeVisible();
  });

  test('an invited adult joins with a password in a fresh browser, then signs in', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const email = e2eEmail('sam');
    const password = 'a long walk to the river 26';

    // Maya creates the invite.
    await app.nav(maya, 'Household');
    await maya.getByRole('textbox', { name: 'Their email' }).fill(email);
    await maya.getByRole('button', { name: 'Adult', exact: true }).click();
    await maya.getByRole('button', { name: 'Create invite link' }).click();
    const linkText = maya.getByText(`${BASE_URL}/invite?token=`);
    await expect(linkText).toBeVisible();
    const link = (await linkText.textContent())?.trim() ?? '';
    expect(link).toMatch(/\/invite\?token=.+/);
    await expect(maya.getByText(`${email} · Adult`)).toBeVisible();

    // Sam opens it on another device: no account yet, so they choose a password.
    const sam = await app.open(link.replace(BASE_URL, ''));
    await expect(sam.getByRole('heading', { name: 'You’re invited' })).toBeVisible();
    await sam.getByLabel('Your name').fill('Sam');
    await sam.getByLabel('Email').fill(email);
    await sam.getByLabel('Password', { exact: true }).fill(password);
    await sam.getByLabel('Password again').fill(password);
    await sam.getByRole('button', { name: 'Join the household' }).click();
    await sam.getByRole('button', { name: 'Go to Today' }).click();
    await expect(greeting(sam, 'Sam')).toBeVisible();
    await expect(sam.getByRole('link', { name: `${DEMO_HOUSEHOLD}, today` }).first()).toBeVisible();

    // The account is real: sign out, then in again with the chosen password.
    await app.nav(sam, 'Household');
    await sam.getByRole('button', { name: 'Sign out' }).click();
    await expect(sam.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
    await app.signIn(sam, email, password);
    await expect(greeting(sam, 'Sam')).toBeVisible();

    // Server state: Sam is an adult of the Rivera household; the invite is used up.
    const samApi = await Api.as(email, password);
    expect(samApi.householdId).toBe(mayaApi.householdId);
    const me = (await mayaApi.members()).find((m) => m.displayName === 'Sam');
    expect(me?.role).toBe('adult');
    await maya.reload();
    await expect(maya.getByRole('button', { name: 'Sam, Adult, edit' })).toBeVisible();
    await expect(maya.getByText(`${email} · Adult`)).toHaveCount(0);

    // The link works once.
    const again = await app.open(link.replace(BASE_URL, ''));
    await again.getByLabel('Your name').fill('Someone');
    await again.getByLabel('Email').fill(email);
    await again.getByLabel('Password', { exact: true }).fill(password);
    await again.getByLabel('Password again').fill(password);
    await again.getByRole('button', { name: 'Join the household' }).click();
    await expect(again.getByText('This invite isn’t valid for that email.')).toBeVisible();
    // The API's 404 for a used invite, which the browser logs.
    app.allowConsoleError(/^console\.error on \/invite: .*status of 404/);
  });
});
