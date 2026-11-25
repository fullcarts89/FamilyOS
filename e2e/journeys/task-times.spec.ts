import type { Locator, Page } from '@playwright/test';
import { DONE, addDays } from '../support/api';
import { TIME_ZONE } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

/** A wall-clock time on a date in the household's zone, as an ISO instant. */
function householdTime(date: string, hhmm: string): string {
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = Number(/GMT([+-]\d+)/.exec(zone ?? '')?.[1] ?? -8);
  const offset = `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
  return new Date(`${date}T${hhmm}:00${offset}`).toISOString();
}

/**
 * Today's day view: the lanes on desktop (DayTimeline), the whole day hour by hour on phones
 * (DayColumn, behind "See the whole day").
 */
async function dayView(page: Page, phone: boolean): Promise<Locator> {
  if (phone) {
    await page.getByRole('button', { name: 'See the whole day' }).click();
    const day = page.getByRole('list', { name: 'The whole day, hour by hour' });
    await expect(day).toBeVisible();
    return day;
  }
  // Screens stay mounted (hidden) in the navigation stack: the Today on show.
  const lanes = page.locator('[aria-label^="The day’s rhythm"]').filter({ visible: true });
  await expect(lanes).toBeVisible();
  return lanes;
}

test.describe('Task times: blocking out time on the day', () => {
  test('a time and 30 minutes on a task make a block in your lane, ticked from the block', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const title = 'Pay Little Oaks invoice for next month';
    const today = await mayaApi.today();

    // The task's own screen, from "On you" on Today.
    const onYou = maya.getByRole('region', { name: 'On you: late and due today' });
    await expect(async () => {
      await onYou.getByRole('button', { name: new RegExp(`^${title}`) }).click();
      await expect(maya).toHaveURL(/\/item\//, { timeout: 2000 });
    }).toPass();
    await expect(
      maya.getByRole('checkbox', { name: `Complete ${title}` }).filter({ visible: true }),
    ).toBeVisible();
    await maya.getByRole('button', { name: 'Add a time' }).click();
    const time = maya.getByRole('textbox', { name: 'Time, like 5:30pm or 17:30' });
    await time.fill('5:30pm');
    await time.press('Enter');
    await expect(toast(maya, 'Set for 5:30pm')).toBeVisible();
    await maya.getByRole('button', { name: '30 min', exact: true }).click();
    await expect(toast(maya, 'Set for 5:30–6pm')).toBeVisible();
    await expect(maya.getByRole('button', { name: '30 min', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(maya.getByText('Due today 5:30–6pm.', { exact: false })).toBeVisible();

    // The server has it on the same day (it had one), 5:30 for 30 minutes.
    await expect
      .poll(async () => {
        const item = await mayaApi.item(title);
        return [item.dueOn, item.dueAt, item.durationMinutes];
      })
      .toEqual([null, householdTime(today, '17:30'), 30]);

    // Today's day view: a block at that time, in Maya's own lane, with its round check.
    await app.nav(maya, 'Today');
    const day = await dayView(maya, app.phone);
    const check = day.getByRole('checkbox', { name: `Complete ${title}, 5:30–6pm` });
    await expect(check).toBeVisible();
    if (app.phone) {
      await expect(day.getByText('5:30–6pm · You')).toBeVisible();
    } else {
      const block = day.getByRole('button', { name: new RegExp(`${title}.*5:30–6pm, yours`) });
      await expect(block).toBeVisible();
      // Level with Maya's lane head ("You"), not Theo's.
      const [blockBox, headBox] = await Promise.all([
        block.boundingBox(),
        day.getByText('You', { exact: true }).last().boundingBox(),
      ]);
      if (!blockBox || !headBox) throw new Error('the block or the lane head is not on screen');
      expect(
        Math.abs(blockBox.y + blockBox.height / 2 - (headBox.y + headBox.height / 2)),
      ).toBeLessThan(30);
    }

    // Ticked from the block: checked for its moment, "Done", then it leaves the day view.
    await check.click();
    await expect(day.getByRole('checkbox', { name: `Reopen ${title}, 5:30–6pm` })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    await expect(day.getByRole('checkbox', { name: new RegExp(`${title}, 5:30–6pm`) })).toHaveCount(
      0,
      { timeout: 5000 },
    );
    await expect.poll(async () => DONE.includes((await mayaApi.item(title)).status)).toBe(true);
  });

  test('capturing “Walk Biscuit at 5:30pm for 30 min” makes one task with that block', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const sheet = await app.openCapture(maya);
    await sheet
      .getByRole('textbox', { name: 'What needs doing?' })
      .fill('Walk Biscuit at 5:30pm for 30 min');
    // The preview reads the time and the length before anything is saved.
    await expect(sheet.getByText('Today 5:30–6pm', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('radio', { name: 'You', exact: true })).toContainText(
      'Walk Biscuit',
    );
    await sheet.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(maya, 'Added to your list: Walk Biscuit')).toBeVisible();
    await expect(sheet).toBeHidden();

    // Exactly one task, titled without the time words, today 5:30 for 30 minutes.
    const items = (await mayaApi.items()).filter((i) => i.title.startsWith('Walk Biscuit'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Walk Biscuit',
      ownerMemberId: mayaApi.memberId,
      dueOn: null,
      dueAt: householdTime(today, '17:30'),
      durationMinutes: 30,
      status: 'ready',
    });

    // And it's a block on Today's day view.
    const day = await dayView(maya, app.phone);
    await expect(
      day.getByRole('checkbox', { name: 'Complete Walk Biscuit, 5:30–6pm' }),
    ).toBeVisible();
  });

  test('the + sheet: “Add a time”, a time of your own and how long, without typing them in', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const sheet = await app.openCapture(maya);
    await sheet.getByRole('textbox', { name: 'What needs doing?' }).fill('Call the vet tomorrow');
    await sheet.getByRole('button', { name: 'Add a time' }).click();
    const time = sheet.getByRole('group', { name: 'Time' });

    // One tap for a usual time: the preview reads it on the day.
    await time.getByRole('button', { name: '7pm', exact: true }).click();
    await expect(sheet.getByText('Tomorrow 7pm', { exact: true })).toBeVisible();

    // Another time in its own field: a time it can't read says so, and nothing can be added.
    const other = time.getByRole('textbox', { name: 'Another time, like 6:30am' });
    await other.fill('soon');
    await expect(sheet.getByText('Write the time like 6:30am or 8pm.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Add to your list' })).toBeDisabled();
    await other.fill('5:15pm');
    await expect(sheet.getByText('Tomorrow 5:15pm', { exact: true })).toBeVisible();
    await expect(time.getByRole('button', { name: '7pm', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // How long, once it has a time.
    await time.getByRole('button', { name: '45 min', exact: true }).click();
    await expect(sheet.getByText('Tomorrow 5:15–6pm', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Time: 5:15–6pm' })).toBeVisible();
    await sheet.screenshot({ path: test.info().outputPath('capture-time.png') });
    await sheet.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(maya, 'Added to your list: Call the vet')).toBeVisible();
    await expect(sheet).toBeHidden();

    // Tomorrow 5:15 for 45 minutes, on the server.
    expect(await mayaApi.item('Call the vet')).toMatchObject({
      ownerMemberId: mayaApi.memberId,
      dueOn: null,
      dueAt: householdTime(addDays(today, 1), '17:15'),
      durationMinutes: 45,
      status: 'ready',
    });
  });

  test('the + sheet: a tapped time replaces one typed in the words, and keeps its length', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const sheet = await app.openCapture(maya);
    const words = sheet.getByRole('textbox', { name: 'What needs doing?' });
    await words.fill('Walk Biscuit at 5:30pm for 30 min');
    await expect(sheet.getByText('Today 5:30–6pm', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Time: 5:30–6pm' }).click();
    const time = sheet.getByRole('group', { name: 'Time' });
    // The typed time shows in the field, ready to change, with its length.
    await expect(time.getByRole('textbox', { name: 'Another time, like 6:30am' })).toHaveValue(
      '5:30pm',
    );
    await expect(time.getByRole('button', { name: '30 min', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await time.getByRole('button', { name: '7pm', exact: true }).click();
    await expect(words).toHaveValue('Walk Biscuit');
    await expect(sheet.getByText('Today 7–7:30pm', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(maya, 'Added to your list: Walk Biscuit')).toBeVisible();
    expect(await mayaApi.item('Walk Biscuit')).toMatchObject({
      dueAt: householdTime(today, '19:00'),
      durationMinutes: 30,
    });

    // "No time" takes it all back off: an untimed task.
    const again = await app.openCapture(maya);
    await again.getByRole('textbox', { name: 'What needs doing?' }).fill('Brush Biscuit at 6pm');
    await again.getByRole('button', { name: 'Time: 6pm' }).click();
    await again.getByRole('button', { name: 'No time, clear it' }).click();
    await expect(again.getByRole('textbox', { name: 'What needs doing?' })).toHaveValue(
      'Brush Biscuit',
    );
    await expect(again.getByRole('button', { name: 'Add a time' })).toBeVisible();
    await again.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(maya, 'Added to your list: Brush Biscuit')).toBeVisible();
    expect(await mayaApi.item('Brush Biscuit')).toMatchObject({
      dueAt: null,
      durationMinutes: null,
    });
  });

  test('a routine with a length makes turns that carry it', async ({ app, maya, mayaApi }) => {
    const today = await mayaApi.today();
    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Routines' }).click();
    await maya.getByRole('button', { name: 'New routine' }).click();
    await expect(maya.getByRole('heading', { name: 'New routine' })).toBeVisible();
    await maya.getByRole('textbox', { name: 'What needs doing?' }).fill('Evening walk');
    await maya.getByRole('button', { name: 'Every day', exact: true }).click();
    await maya.getByRole('button', { name: '7pm', exact: true }).click();
    // Lengths are offered once it has a time.
    await maya.getByRole('button', { name: '30 min', exact: true }).click();
    await expect(maya.getByText('Every day at 7pm for 30 min')).toBeVisible();
    await maya.getByRole('button', { name: 'Save routine' }).click();
    await expect(toast(maya, 'Routine set up: Evening walk')).toBeVisible();
    await expect(maya.getByRole('heading', { level: 1, name: 'Evening walk' })).toBeVisible();

    // Saving created today's turn (the scheduler runs on save): 7pm for 30 minutes.
    const detail = await mayaApi.routine('Evening walk');
    expect(detail.routine).toMatchObject({ time: '19:00', durationMinutes: 30 });
    const turns = (await mayaApi.items()).filter((i) => i.title === 'Evening walk');
    expect(turns.length).toBeGreaterThan(0);
    const first = turns.find((t) => t.occurrenceOn === today);
    expect(first).toMatchObject({ dueAt: householdTime(today, '19:00'), durationMinutes: 30 });

    // Changing the length on the routine's page reaches its open turns.
    await maya.getByRole('button', { name: '45 min', exact: true }).click();
    await expect(toast(maya, 'Each turn takes 45 min')).toBeVisible();
    await expect(maya.getByRole('button', { name: '45 min', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () =>
        (await mayaApi.items())
          .filter((i) => i.title === 'Evening walk')
          .map((i) => i.durationMinutes),
      )
      .toEqual(turns.map(() => 45));
  });
});
