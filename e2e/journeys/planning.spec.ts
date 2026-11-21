import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { addDays, weekday, weekdayName } from '../support/api';
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

      // Cover June: each hatched problem is asked of Theo. On one screen it still takes his yes
      // on his own phone: until then it says so, and still counts as needing someone.
      await expect(maya.getByRole('heading', { name: 'Who has June, and when?' })).toBeVisible();
      for (let i = 0; i < problems; i++) {
        await maya
          .getByRole('radiogroup', { name: 'Who has it' })
          .nth(i)
          .getByRole('radio', { name: 'Theo' })
          .click();
        await expect(maya.getByText(/^Waiting for Theo/)).toHaveCount(i + 1);
      }
      await expect(maya.getByText(/^(Nobody is down for|You have “)/)).toHaveCount(problems);
      const waiting = await mayaApi.get<ResetRead>(`/reset?week=${week}`);
      expect(waiting.events.needsOwner.length + waiting.events.conflicts.length).toBe(problems);

      // Theo, on his own phone, says yes to each; Maya's screen follows within seconds, and
      // the last one is the milestone.
      const theo = await app.as(THEO.email);
      await theo.goto(`/reset?chapter=3&week=${week}`);
      await expect(theo.getByText('Maya asked you to cover this')).toHaveCount(problems);
      for (let i = 0; i < problems; i++) {
        await theo.getByRole('button', { name: 'Accept', exact: true }).first().click();
        await expect(theo.getByText('Maya asked you to cover this')).toHaveCount(problems - i - 1);
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

  test('the plan carries into the week: notes and open decisions on Today, dinners on the Week', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const monday = addDays(today, 1 - weekday(today));
    // This week's notes, as the Reset saves them.
    const current = await mayaApi.get<{ plan: { notesVersion?: number } | null }>(
      `/reset?week=${monday}`,
    );
    const notes = 'Theo has Wednesday pickup. Grandma visits Friday: tidy the spare room first.';
    const saved = await mayaApi.request(`/households/${mayaApi.householdId}/reset/notes`, {
      method: 'PATCH',
      body: { week: monday, notes, expectedVersion: current.plan?.notesVersion ?? 0 },
    });
    expect(saved.status).toBe(200);
    const open = (await mayaApi.get<{ decisions: unknown[] }>('/decisions?status=open')).decisions
      .length;
    expect(open, 'the seed has decisions open').toBeGreaterThan(1);

    // Today's plan line: the notes on one line (all of them on a tap), and the open decisions.
    await maya.reload();
    const line = maya.getByRole('button', { name: `This week’s notes: ${notes}` });
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute('aria-expanded', 'false');
    await line.click();
    await expect(line).toHaveAttribute('aria-expanded', 'true');
    await maya.getByRole('link', { name: `${open} decisions open` }).click();
    await expect(maya).toHaveURL(/\/decisions$/);
    await expect(maya.getByRole('heading', { name: 'Decisions', level: 1 })).toBeVisible();

    // The Week has each night's dinner from the meal plan.
    await app.nav(maya, 'Week');
    await expect(
      maya.getByRole('link', {
        name: `${weekdayName(today)} dinner: Sheet-pan salmon, Theo cooks`,
      }),
    ).toBeVisible();
  });

  test('meals and groceries: adding says where it went, and shows it', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const monday = addDays(today, 1 - weekday(today));
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
    const dinnersOn = async (from: string) =>
      (
        await mayaApi.get<{ meals: { onDate: string; slot: string }[] }>(
          `/meals?from=${from}&to=${addDays(from, 6)}`,
        )
      ).meals.filter((m) => m.slot === 'dinner');
    const planned = await dinnersOn(monday);
    let open = days.find((d) => d >= today && !planned.some((m) => m.onDate === d));
    await openMore(app, maya, 'Meals & groceries');
    if (!open) {
      // This week is all planned: the next one has open nights.
      const next = await dinnersOn(addDays(monday, 7));
      open = days.map((d) => addDays(d, 7)).find((d) => !next.some((m) => m.onDate === d));
      await maya.getByRole('button', { name: 'Next week' }).click();
    }
    if (!open) throw new Error('the seed leaves a night or two open');
    const field = maya.getByLabel(`Dinner on ${weekdayName(open)}`);
    await field.click();
    await field.fill('Lentil curry');
    await field.press('Enter');
    await expect(toast(maya, `Planned ${weekdayName(open)}’s dinner`)).toBeVisible();

    if (app.phone) await maya.getByRole('tab', { name: /^Groceries/ }).click();
    const add = maya.getByLabel('Add to the grocery list');
    await add.fill('Oat milk');
    await add.press('Enter');
    await expect(toast(maya, 'Added to Dairy & eggs')).toBeVisible();
    await expect(maya.getByRole('checkbox', { name: 'Check off Oat milk' })).toBeInViewport();
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

  test('contacts on a task: link one, add one inline, call from the task', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const task = await mayaApi.item('Fix sticking back door');
    const contactOf = async () =>
      (await mayaApi.get<{ item: { contactId: string | null } }>(`/work-items/${task.id}`)).item
        .contactId;
    expect(await contactOf(), 'the seed links no one to the back door').toBeNull();
    const { contacts } = await mayaApi.get<{ contacts: Contactish[] }>('/contacts');
    const dee = contacts.find((c) => c.name === 'Dee Okafor');
    if (!dee) throw new Error('the seed should have Dee Okafor, the plumber');

    await maya.goto(`/item/${task.id}`);
    await expect(
      maya.getByRole('button', { name: 'Fix sticking back door. Edit the title' }),
    ).toBeVisible();

    await app.clip('link-a-contact-to-a-task', maya, async () => {
      // Pick from the household's contacts, found by what they do.
      await maya.getByRole('button', { name: 'Link a contact' }).click();
      const picker = maya.getByRole('dialog', { name: 'Link a contact' });
      await picker.getByLabel('Search contacts').fill('plumb');
      await expect(picker.getByRole('button', { name: /^Link Dr\. Priya Raman/ })).toHaveCount(0);
      await picker.getByRole('button', { name: /^Link Dee Okafor, Plumber/ }).click();
      await expect(toast(maya, 'Linked Dee Okafor')).toBeVisible();
    });
    // On the task: who it is, and a call or a text in a tap.
    const card = maya.getByLabel('Contact: Dee Okafor');
    await expect(card.getByText('Plumber · Riverside Plumbing')).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Call Dee Okafor at (503) 555-0152' }),
    ).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Text Dee Okafor at (503) 555-0152' }),
    ).toBeVisible();
    await expect.poll(contactOf).toBe(dee.id);

    // Someone new, added right from the task and linked in the same step.
    await card.getByRole('button', { name: 'Change contact' }).click();
    await maya
      .getByRole('dialog', { name: 'Link a contact' })
      .getByRole('button', { name: 'Add a new contact' })
      .click();
    const form = maya.getByRole('dialog', { name: 'Add a contact' });
    await form.getByLabel('Name', { exact: true }).fill('Ana Ruiz');
    await form.getByRole('button', { name: 'Home', exact: true }).click();
    await form.getByLabel('Role', { exact: true }).fill('Carpenter');
    await form.getByLabel('Phone', { exact: true }).fill('(503) 555-0199');
    await form.getByRole('button', { name: 'Add contact' }).click();
    await expect(toast(maya, 'Linked Ana Ruiz')).toBeVisible();
    await expect(
      maya.getByRole('button', { name: 'Call Ana Ruiz at (503) 555-0199' }),
    ).toBeVisible();

    const ana = (await mayaApi.get<{ contacts: Contactish[] }>('/contacts')).contacts.find(
      (c) => c.name === 'Ana Ruiz',
    );
    expect(ana?.category).toBe('home');
    await expect.poll(contactOf).toBe(ana?.id);

    // It holds on a reload; unlinking takes it off again.
    await maya.reload();
    await expect(maya.getByLabel('Contact: Ana Ruiz')).toBeVisible();
    await maya.getByRole('button', { name: 'Unlink Ana Ruiz' }).click();
    await expect(maya.getByRole('button', { name: 'Link a contact' })).toBeVisible();
    await expect.poll(contactOf).toBeNull();
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
