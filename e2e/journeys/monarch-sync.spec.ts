import type { Page } from '@playwright/test';
import { API_URL } from '../support/env';
import { expect, test, toast, type AppDriver } from '../support/fixtures';

// The Monarch budget sync: the key an adult makes, what the scheduled task posts and reports with
// it (played here by the journey itself, calling the sync API), and the plans an adult sends to
// Monarch from the Budgets page.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

async function openBudgets(app: AppDriver, page: Page): Promise<void> {
  if (app.phone) {
    await page.getByRole('button', { name: /^More/ }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Budgets' }).click();
  } else {
    await page.getByRole('button', { name: /^More:/ }).click();
    await page.getByRole('menuitem', { name: /^Budgets/ }).click();
  }
  await expect(page.getByText('Spent so far')).toBeVisible();
}

/** A call to the sync API with the household's sync key, as the scheduled task makes it. */
async function sync<T>(key: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API_URL}/sync/monarch${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${key}`,
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

interface Run {
  months: string[];
  changes: {
    id: string;
    category: string;
    fromAmount: number | null;
    toAmount: number;
    applyToFuture: boolean;
  }[];
}

test.describe('Budgets synced with Monarch', () => {
  test('spending apart from income and transfers, a new key, and plans that go to Monarch', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const month = `${today.slice(0, 7)}-01`;
    const name = MONTHS[Number(today.slice(5, 7)) - 1] ?? '';
    await openBudgets(app, maya);

    // Spending only: the card payment isn't spending, and income has its own line.
    await expect(maya.getByLabel('Groceries: $842 spent of $1,100')).toBeVisible();
    await expect(maya.getByText('Income so far')).toBeVisible();
    await expect(maya.getByText('Credit Card Payment')).toHaveCount(0);
    await expect(maya.getByLabel('Cleaners: $160 spent, no plan')).toBeVisible();
    await expect(maya.getByText('$12 back in refunds · $60 planned')).toBeVisible();
    await maya.screenshot({ path: test.info().outputPath('budgets.png'), fullPage: true });

    // A new key, shown once.
    await maya.getByRole('button', { name: /^Monarch sync: last synced/ }).click();
    const sheet = maya.getByRole('dialog', { name: 'Monarch sync' });
    await sheet.getByRole('button', { name: 'Replace the key' }).click();
    await sheet.getByRole('button', { name: 'Make a new key' }).click();
    const field = sheet.getByRole('textbox', { name: 'The sync key' });
    await expect(field).toHaveValue(/^fos_sync_[A-Za-z0-9_-]{43}$/);
    const key = await field.inputValue();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    // Groceries: a new plan, waiting until the sync takes it.
    await maya.getByRole('button', { name: 'Change the plan for Groceries' }).click();
    const plan = maya.getByRole('dialog', { name: 'Change the plan for Groceries' });
    await plan
      .getByRole('textbox', { name: `New plan for Groceries in ${name}, in dollars` })
      .fill('1250');
    // After the sheet's arrival.
    await maya.waitForTimeout(400);
    await maya.screenshot({ path: test.info().outputPath('plan-sheet.png') });
    await app.clip('send-plan-to-monarch', maya, async () => {
      await plan.getByRole('button', { name: 'Send to Monarch' }).click();
      await expect(toast(maya, 'Waiting for Monarch: Groceries, $1,250')).toBeVisible();
    });
    await expect(maya.getByText(/^Waiting for Monarch · \$1,100 → \$1,250/)).toBeVisible();
    // Monarch's number stays until Monarch confirms the new one.
    await expect(maya.getByLabel('Groceries: $842 spent of $1,100')).toBeVisible();
    await maya
      .getByLabel('Groceries: $842 spent of $1,100')
      .screenshot({ path: test.info().outputPath('waiting.png') });

    // The scheduled run: it takes the change, Monarch confirms it, and it posts the month.
    const run = await sync<Run>(key, '/run');
    expect(run.status).toBe(200);
    expect(run.body.months).toContain(month);
    expect(run.body.changes).toEqual([
      expect.objectContaining({
        category: 'Groceries',
        fromAmount: 1100,
        toAmount: 1250,
        applyToFuture: false,
      }),
    ]);
    const groceries = run.body.changes[0]?.id ?? '';
    expect(
      (await sync(key, `/changes/${groceries}`, { method: 'POST', body: { outcome: 'saved' } }))
        .status,
    ).toBe(200);
    await maya.reload();
    await expect(maya.getByLabel('Groceries: $842 spent of $1,250')).toBeVisible();
    await expect(maya.getByText(/^Saved in Monarch/)).toBeVisible();

    // Cleaners had no plan: one for this month and after meets a plan Monarch already changed.
    await maya.getByRole('button', { name: 'Add a plan for Cleaners' }).click();
    const add = maya.getByRole('dialog', { name: 'Change the plan for Cleaners' });
    await add
      .getByRole('textbox', { name: `New plan for Cleaners in ${name}, in dollars` })
      .fill('200');
    await add.getByRole('tab', { name: `${name} and after` }).click();
    await add.getByRole('button', { name: 'Send to Monarch' }).click();
    await expect(toast(maya, 'Waiting for Monarch: Cleaners, $200')).toBeVisible();
    const next = await sync<Run>(key, '/run');
    expect(next.body.changes).toEqual([
      expect.objectContaining({
        category: 'Cleaners',
        fromAmount: 0,
        toAmount: 200,
        applyToFuture: true,
      }),
    ]);
    await sync(key, `/changes/${next.body.changes[0]?.id ?? ''}`, {
      method: 'POST',
      body: { outcome: 'conflict', monarchAmount: 150 },
    });
    await maya.reload();
    await expect(
      maya.getByText('Monarch’s plan for Cleaners changed to $150 before yours went.'),
    ).toBeVisible();
    await maya
      .getByLabel('Cleaners: $160 spent, no plan')
      .screenshot({ path: test.info().outputPath('conflict.png') });
    await maya.getByRole('button', { name: 'Keep $150' }).click();
    await expect(toast(maya, 'Kept Monarch’s plan for Cleaners: $150')).toBeVisible();
    await expect(maya.getByText(/^Monarch’s plan for Cleaners changed/)).toHaveCount(0);

    // Nothing else waits; the old key no longer works.
    expect((await sync<Run>(key, '/run')).body.changes).toEqual([]);
    const budget = await mayaApi.get<{ changes: { status: string }[] }>(`/budgets?month=${month}`);
    expect(budget.changes.map((c) => c.status)).toEqual(['saved']);
  });

  test('turning the sync off stops its key and the plan buttons', async ({ app, maya }) => {
    await openBudgets(app, maya);
    await maya.getByRole('button', { name: /^Monarch sync: last synced/ }).click();
    const sheet = maya.getByRole('dialog', { name: 'Monarch sync' });
    await expect(sheet.getByText(/^Key ending …/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Turn off' }).click();
    await sheet.getByRole('button', { name: 'Turn the sync off' }).click();
    await expect(toast(maya, 'Monarch sync turned off')).toBeVisible();
    await expect(maya.getByRole('button', { name: 'Set up Monarch sync' })).toBeVisible();
    await expect(maya.getByRole('button', { name: 'Change the plan for Groceries' })).toHaveCount(
      0,
    );
    // The numbers stay.
    await expect(maya.getByLabel('Groceries: $842 spent of $1,100')).toBeVisible();
  });
});
