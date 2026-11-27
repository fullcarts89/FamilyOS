import type { Locator, Page } from '@playwright/test';
import { addDays } from '../support/api';
import { expect, test, toast } from '../support/fixtures';

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  utc(date).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

/** The picked day on its chip, as the app writes it: "Thu, Dec 17", "Thu, Jan 7, 2027". */
function chipDate(date: string, today: string): string {
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${format(date, { weekday: 'short' })}, ${format(date, { month: 'short', day: 'numeric' })}${year}`;
}

/** A day's button in the calendar: "Thursday, December 17" (", 2027" in another year). */
function dayName(date: string, today: string): string {
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${format(date, { weekday: 'long' })}, ${format(date, { month: 'long', day: 'numeric' })}${year}`;
}

/** Months from today's month to the date's (0 when it's this month). */
const monthsAhead = (date: string, today: string) =>
  (Number(date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
  Number(date.slice(5, 7)) -
  Number(today.slice(5, 7));

/** Opens "Pick a date" in `scope`, goes forward to the date's month and picks the day. */
async function pickDate(scope: Page | Locator, date: string, today: string): Promise<void> {
  const chip = scope.getByRole('button', { name: 'Pick a date', exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  const calendar = scope.getByRole('group', { name: 'Pick a date' });
  await expect(calendar).toBeVisible();
  // It opens on this month: there's nothing earlier to go back to, and yesterday isn't offered.
  await expect(calendar.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  const yesterday = addDays(today, -1);
  if (yesterday.slice(0, 7) === today.slice(0, 7)) {
    await expect(calendar.getByRole('button', { name: dayName(yesterday, today) })).toBeDisabled();
  }
  await expect(
    calendar.getByRole('button', { name: `Today, ${dayName(today, today)}` }),
  ).toBeEnabled();
  for (let i = 0; i < monthsAhead(date, today); i++) {
    await calendar.getByRole('button', { name: 'Next month' }).click();
  }
  await calendar.getByRole('button', { name: dayName(date, today), exact: true }).click();
  // Picking a day closes the calendar.
  await expect(calendar).toBeHidden();
}

test.describe('Task dates: a specific day, beyond today, tomorrow and next week', () => {
  test('quick capture: a day picked from the calendar is the day it’s due', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const title = 'Book the chimney sweep';
    const today = await mayaApi.today();
    // Far enough out to need the next month (or the one after).
    const date = addDays(today, 40);

    const sheet = await app.openCapture(maya);
    await sheet.getByRole('textbox', { name: 'What needs doing?' }).fill(`${title} tomorrow`);
    await pickDate(sheet, date, today);

    // The day picked replaces the typed one: "tomorrow" is out of the words, and the chip and
    // the preview name the date.
    await expect(sheet.getByRole('textbox', { name: 'What needs doing?' })).toHaveValue(title);
    const chip = sheet.getByRole('button', { name: `Pick a date, ${chipDate(date, today)}` });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet.getByText(chipDate(date, today), { exact: true }).first()).toBeVisible();

    await sheet.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(maya, `Added to your list: ${title}`)).toBeVisible();
    await expect(sheet).toBeHidden();

    // What the server stored: due that day, all day.
    await expect
      .poll(async () => {
        const item = await mayaApi.item(title);
        return [item.dueOn, item.dueAt];
      })
      .toEqual([date, null]);
  });

  test('a task’s own screen: moved to a day picked from the calendar', async ({
    maya,
    mayaApi,
  }) => {
    const title = 'Pay Little Oaks invoice for next month';
    const today = await mayaApi.today();
    const date = addDays(today, 17);

    // The task's own screen, from "On you" on Today.
    const onYou = maya.getByRole('region', { name: 'On you: late and due today' });
    await expect(async () => {
      await onYou.getByRole('button', { name: new RegExp(`^${title}`) }).click();
      await expect(maya).toHaveURL(/\/item\//, { timeout: 2000 });
    }).toPass();
    await expect(maya.getByRole('button', { name: 'Pick a date', exact: true })).toBeVisible();
    await pickDate(maya, date, today);
    await expect(toast(maya, `Moved to ${chipDate(date, today)}`)).toBeVisible();
    await expect(
      maya.getByRole('button', { name: `Pick a date, ${chipDate(date, today)}` }),
    ).toBeVisible();

    await expect.poll(async () => (await mayaApi.item(title)).dueOn).toBe(date);

    // Still that day after a reload; the calendar opens on its month with it chosen.
    await maya.reload();
    const chip = maya.getByRole('button', { name: `Pick a date, ${chipDate(date, today)}` });
    await chip.click();
    await expect(
      maya.getByRole('button', { name: dayName(date, today), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
