import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { addDays, weekdayName } from '../support/api';
import { E2E_DIR, THEO } from '../support/env';
import { expect, test, toast, type AppDriver } from '../support/fixtures';

/** Opens a page under More (the top bar's menu on desktop, the More tab's sheet on phones). */
async function openMore(app: AppDriver, page: Page, label: string): Promise<void> {
  if (app.phone) {
    await page.getByRole('tab', { name: /^More/ }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: label }).click();
  } else {
    await page.getByRole('button', { name: /^More:/ }).click();
    await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
  }
}

interface ResetRead {
  week: { start: string; end: string };
  plan: { committedAt: string | null } | null;
  events: { needsOwner: { occurrenceKey: string }[]; conflicts: { occurrenceKey: string }[] };
  meals: { onDate: string; slot: string; title: string }[];
  unresolved: { type: string }[];
}

test.describe('Planning together: the Weekly Reset, decisions, meals, contacts, budgets', () => {
  test('Weekly Reset, from the opening to “Your week has a plan”', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const before = await mayaApi.get<ResetRead>('/reset');
    const week = before.week.start;
    const problems = before.events.needsOwner.length + before.events.conflicts.length;
    const open = (d: string) => !before.meals.some((m) => m.onDate === d && m.slot === 'dinner');
    const openNights = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)).filter(open);
    expect(problems, 'the seed leaves the swim lesson without anyone').toBeGreaterThan(0);

    const next = async (title: string) => {
      await (
        app.phone
          ? maya.getByRole('button', { name: `Next: ${title}` })
          : maya.getByRole('button', { name: title, exact: true })
      ).click();
    };

    await app.nav(maya, 'Reset');
    await app.clip('weekly-reset-full-session', maya, async () => {
      // The opening greets by name and says what the week holds, from the data.
      await expect(
        maya.getByRole('heading', { name: /^Good (morning|afternoon|evening), Maya/ }),
      ).toBeVisible();
      await expect(maya.getByText(/^Let’s plan .+ together\.$/)).toBeVisible();
      await maya.getByRole('button', { name: 'Begin with a look back' }).click();

      // Look back: what got done, in words; each person's part as thanks, never a count.
      await expect(maya.getByRole('heading', { name: 'What we got done together' })).toBeVisible();
      await expect(maya.getByText('Finished “Switch June to a toddler bed”.')).toBeVisible();
      await expect(maya.getByRole('heading', { name: 'Thank you' })).toBeVisible();
      await expect(maya.getByText(/^Maya .+\.$/).first()).toBeVisible();
      await next('Loose ends');

      // Loose ends: keep one, then the rest, all through the bulk endpoint.
      await expect(
        maya.getByRole('heading', { name: 'What carries into the week?' }),
      ).toBeVisible();
      await maya
        .getByRole('button', { name: /^Keep for / })
        .first()
        .click();
      const rest = maya.getByRole('button', { name: /^Keep the other / });
      if (await rest.count()) await rest.click();
      await expect(maya.getByText(/every loose end has a place\.$/i)).toBeVisible();
      await next('Decide together');

      // Decisions stay open here, so the finish has something honest to mark.
      await expect(maya.getByRole('heading', { name: 'What needs both of you?' })).toBeVisible();
      await next('Cover June');

      // Cover June: each hatched problem goes to Theo; the last one is a milestone.
      await expect(maya.getByRole('heading', { name: 'Who has June, and when?' })).toBeVisible();
      for (let i = 0; i < problems; i++) {
        await maya
          .getByRole('radiogroup', { name: 'Who has it' })
          .first()
          .getByRole('radio', { name: 'Theo' })
          .click();
        await expect(maya.getByText(/^(Nobody is down for|You have “)/)).toHaveCount(
          problems - i - 1,
        );
      }
      await expect(toast(maya, 'June’s week is covered')).toBeVisible();
      await expect(
        maya.getByText('Every drop-off and pickup has someone, and nothing clashes.').first(),
      ).toBeVisible();
      // The board updated with it: Saturday's swim lesson is Theo's.
      await expect(
        maya.getByRole('button', { name: /^Saturday Swim lesson at 9:30am: Theo/ }),
      ).toBeVisible();
      await next('Dinners');

      // Dinners for the open nights, and something for the list.
      for (const [i, date] of openNights.entries()) {
        const field = maya.getByLabel(`Dinner on ${weekdayName(date)}`);
        await field.click();
        await field.fill(i === 0 ? 'Black bean burritos' : 'Roast vegetables');
        await field.press('Enter');
      }
      const add = maya.getByLabel('Add to the grocery list');
      await add.click();
      await add.fill('Tortillas');
      await add.press('Enter');
      await next('Our plan');

      await maya.getByRole('button', { name: 'Make it our plan' }).click();
      await expect(maya.getByRole('heading', { name: 'Your week has a plan.' })).toBeVisible();
      // Decisions are still open: the copy says so and they're set apart, never "all handled".
      await expect(
        maya.getByText(/^You’re ready to take it on together, with .+ still to sort/),
      ).toBeVisible();
      await expect(maya.getByText('Still open', { exact: true })).toBeVisible();
      await expect(maya.getByText(/^Still to decide: /).first()).toBeVisible();
    });

    const after = await mayaApi.get<ResetRead>(`/reset?week=${week}`);
    expect(after.plan?.committedAt).toBeTruthy();
    expect(after.events.needsOwner).toEqual([]);
    expect(after.events.conflicts).toEqual([]);
    expect(after.unresolved.every((u) => u.type === 'decision_open')).toBe(true);
    for (const date of openNights) {
      expect(after.meals.some((m) => m.onDate === date && m.slot === 'dinner')).toBe(true);
    }
    const { items } = await mayaApi.get<{ items: { name: string }[] }>('/groceries');
    expect(items.map((i) => i.name)).toContain('Tortillas');
  });

  test('a decision resolved together', async ({ app, maya, mayaApi }) => {
    const question = 'Which preschool for June next fall?';
    const { decisions } = await mayaApi.get<{ decisions: Decisionish[] }>('/decisions?status=open');
    const decision = decisions.find((d) => d.question === question);
    if (!decision) throw new Error('the seed should have the preschool decision open');
    expect(decision.myVoteOptionId).not.toBeNull();

    await openMore(app, maya, 'Decisions');
    await expect(maya.getByText('Waiting on Theo. They can vote on their phone.')).toBeVisible();

    // Theo, on his own phone, picks the same school: decided by agreement.
    const theo = await app.as(THEO.email);
    await openMore(app, theo, 'Decisions');
    await app.clip('decision-resolved-together', theo, async () => {
      await theo.getByRole('radio', { name: /^Little Oaks Pre-K/ }).click();
      await expect(toast(theo, 'Decided together')).toBeVisible();
    });
    const read = await mayaApi.get<{ decision: Decisionish }>(`/decisions/${decision.id}`);
    expect(read.decision.status).toBe('decided');
    expect(read.decision.decidedVia).toBe('agreement');

    // Maya sees it on her next look, once: a refresh doesn't replay it.
    const card = maya.getByLabel(`Decision: ${question}`);
    await maya.reload();
    await expect(toast(maya, 'Decided together')).toBeVisible();
    await expect(card.getByText('You both picked it.')).toBeVisible();
    await maya.reload();
    await expect(card.getByText('You both picked it.')).toBeVisible();
    await maya.waitForTimeout(1500);
    await expect(toast(maya, 'Decided together')).toHaveCount(0);
  });

  test('groceries: check items off, and undo', async ({ app, maya, mayaApi }) => {
    await openMore(app, maya, 'Meals & groceries');
    if (app.phone) await maya.getByRole('tab', { name: /^Groceries/ }).click();

    await app.clip('check-off-groceries', maya, async () => {
      await maya.getByRole('checkbox', { name: 'Check off Bananas' }).click();
      await maya.getByRole('checkbox', { name: 'Check off Spinach' }).click();
      await expect(maya.getByRole('checkbox', { name: 'Uncheck Bananas' })).toBeChecked();
      // Changed my mind about the spinach.
      await maya.getByRole('checkbox', { name: 'Uncheck Spinach' }).click();
      await expect(maya.getByRole('checkbox', { name: 'Check off Spinach' })).not.toBeChecked();
    });

    const byName = async () =>
      Object.fromEntries(
        (await mayaApi.get<{ items: Groceryish[] }>('/groceries')).items.map((i) => [i.name, i]),
      );
    await expect.poll(async () => (await byName()).Bananas?.checkedAt ?? null).not.toBeNull();
    await expect
      .poll(async () => {
        const spinach = (await byName()).Spinach;
        return spinach ? spinach.checkedAt : 'missing';
      })
      .toBeNull();

    await maya.reload();
    if (app.phone) await maya.getByRole('tab', { name: /^Groceries/ }).click();
    await expect(maya.getByRole('checkbox', { name: 'Uncheck Bananas' })).toBeChecked();

    // Theo's phone has the same list.
    const theo = await app.as(THEO.email);
    await theo.goto('/meals?tab=groceries');
    await expect(theo.getByRole('checkbox', { name: 'Uncheck Bananas' })).toBeChecked();
    await expect(theo.getByText('In Maya’s cart').first()).toBeVisible();

    // Clear checked takes what's in the cart off the list.
    await maya.getByRole('button', { name: /^Clear \d+ checked$/ }).click();
    await expect(maya.getByRole('checkbox', { name: /Bananas$/ })).toHaveCount(0);
    await expect.poll(async () => (await byName()).Bananas).toBeUndefined();
  });

  test('contacts: add the electrician, find it, see what it’s linked to', async ({
    app,
    maya,
    mayaApi,
  }) => {
    await openMore(app, maya, 'Contacts');
    await app.clip('add-a-contact', maya, async () => {
      await maya.getByRole('button', { name: 'Add a contact' }).first().click();
      const sheet = maya.getByRole('dialog', { name: 'Add a contact' });
      await sheet.getByLabel('Name', { exact: true }).fill('Sam Ortiz');
      await sheet.getByRole('button', { name: 'Home', exact: true }).click();
      await sheet.getByLabel('Role', { exact: true }).fill('Electrician');
      await sheet.getByLabel('Phone', { exact: true }).fill('(503) 555-0175');
      await sheet.getByRole('button', { name: 'Add contact' }).click();
      await expect(toast(maya, 'Added Sam Ortiz')).toBeVisible();
    });
    const shown = maya.getByRole('dialog', { name: 'Sam Ortiz' });
    await expect(shown.getByRole('button', { name: 'Call' })).toBeVisible();
    await expect(shown.getByText('(503) 555-0175')).toBeVisible();

    const { contacts } = await mayaApi.get<{ contacts: Contactish[] }>('/contacts');
    const sam = contacts.find((c) => c.name === 'Sam Ortiz');
    expect(sam?.category).toBe('home');
    expect(sam?.phone).toBe('(503) 555-0175');

    // Linked to a task (through the API), the contact shows it.
    const task = await mayaApi.item('Fix sticking back door');
    const linked = await mayaApi.request(
      `/households/${mayaApi.householdId}/work-items/${task.id}`,
      {
        method: 'PATCH',
        body: { expectedVersion: task.version, contactId: sam?.id },
      },
    );
    expect(linked.status).toBe(200);

    await maya.keyboard.press('Escape');
    await maya.reload();
    await maya.getByLabel('Search contacts').fill('electric');
    await expect(
      maya.getByRole('link', { name: 'Call Sam Ortiz at (503) 555-0175' }),
    ).toBeVisible();
    await expect(maya.getByRole('button', { name: /^Dr\. Priya Raman/ })).toHaveCount(0);
    await maya.getByRole('button', { name: /^Sam Ortiz, Electrician/ }).click();
    await expect(
      maya
        .getByRole('dialog', { name: 'Sam Ortiz' })
        .getByRole('link', { name: /Fix sticking back door/ }),
    ).toBeVisible();
  });

  test('Monarch budget CSV import', async ({ app, maya, mayaApi }) => {
    await openMore(app, maya, 'Budgets');
    await expect(maya.getByText('Spent so far')).toBeVisible();
    await maya.getByRole('button', { name: 'Import from Monarch' }).first().click();
    const sheet = maya.getByRole('dialog', { name: 'Import from Monarch' });
    await expect(sheet.getByText('Export the budget as a CSV file')).toBeVisible();

    // A transactions export is refused in plain words, before anything is sent.
    let chooser = maya.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: 'Choose the CSV file' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'transactions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Date,Merchant,Category,Account,Original Statement,Amount\n2026-11-03,Corner Market,Groceries,Checking,CORNER MKT,-42.10\n',
      ),
    });
    await expect(sheet.getByText(/^That’s a transactions export\./)).toBeVisible();

    chooser = maya.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: 'Choose another file' }).click();
    await (await chooser).setFiles(resolve(E2E_DIR, 'fixtures/monarch-budget.csv'));
    await expect(toast(maya, /^Imported /)).toBeVisible();
    await expect(maya.getByLabel('Groceries: $903 spent of $1,100')).toBeVisible();
    for (const category of ['Restaurants', 'Daycare', 'Utilities', 'Pet Care']) {
      await expect(maya.getByText(category, { exact: true })).toBeVisible();
    }

    const budget = await mayaApi.get<{ categories: { category: string; actual: number | null }[] }>(
      '/budgets?month=2026-11',
    );
    expect(budget.categories).toHaveLength(5);
    expect(budget.categories.find((c) => c.category === 'Groceries')?.actual).toBe(903.42);
  });
});

interface Decisionish {
  id: string;
  question: string;
  status: string;
  decidedVia: string | null;
  myVoteOptionId: string | null;
}
interface Groceryish {
  name: string;
  checkedAt: string | null;
}
interface Contactish {
  id: string;
  name: string;
  category: string;
  phone: string | null;
}
