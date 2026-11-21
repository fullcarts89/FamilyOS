import { DONE } from '../support/api';
import { expect, test, toast } from '../support/fixtures';

test.describe('Tasks: complete, take, hand over', () => {
  test('completing a task, then undo, puts it back exactly as it was', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const title = 'Pay Little Oaks invoice for next month';
    const before = await mayaApi.item(title);
    expect(before.status).toBe('ready');

    await app.nav(maya, 'Tasks');
    const check = maya.getByRole('checkbox', { name: `Complete ${title}` });
    await app.clip('complete-a-task', maya, async () => {
      await check.click();
      await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    });
    // The server has it done, by Maya.
    await expect.poll(async () => (await mayaApi.item(title)).status).toMatch(/done|complete/);
    expect(DONE).toContain((await mayaApi.item(title)).status);

    await maya.getByRole('button', { name: `Undo: Done: ${title}` }).click();
    await expect.poll(async () => (await mayaApi.item(title)).status).toBe(before.status);
    const after = await mayaApi.item(title);
    expect(after.ownerMemberId).toBe(before.ownerMemberId);
    expect(after.dueOn).toBe(before.dueOn);

    // After a reload it is open again, on Maya's list.
    await maya.reload();
    // The checkbox exposes no checked state on web (README, hooks); the row's hand-over button
    // only shows on open items.
    await expect(maya.getByRole('checkbox', { name: `Complete ${title}` })).toBeVisible();
    await expect(maya.getByRole('button', { name: `Hand to Theo: ${title}` })).toBeVisible();
  });

  test('ticking a just-finished row again reopens it', async ({ app, maya, mayaApi }) => {
    const title = 'Pay Little Oaks invoice for next month';
    await app.nav(maya, 'Tasks');
    await maya.getByRole('checkbox', { name: `Complete ${title}` }).click();
    await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    // The finished row stays a moment, checked; ticking it then reopens it.
    await maya.getByRole('checkbox', { name: `Reopen ${title}` }).click();
    await expect(toast(maya, `Reopened: ${title}`)).toBeVisible();
    await expect.poll(async () => (await mayaApi.item(title)).status).toBe('in_progress');
    await expect(maya.getByRole('checkbox', { name: `Complete ${title}` })).toBeVisible();
    await maya.reload();
    await expect(maya.getByRole('checkbox', { name: `Complete ${title}` })).toBeVisible();
  });

  test('every Tasks tab fits a 390px phone, none under 44px', async ({ app, maya }) => {
    test.skip(!app.phone, 'The tab strip is the phone’s (desktop shows the columns).');
    await app.nav(maya, 'Tasks');
    const strip = maya
      .getByRole('tablist')
      .filter({ has: maya.getByRole('tab', { name: 'Routines' }) });
    const tabs = strip.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    const width = maya.viewportSize()?.width ?? 0;
    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      expect(box, await tab.innerText()).not.toBeNull();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await strip.getByRole('tab', { name: 'Routines' }).click();
    await expect(maya.getByRole('heading', { name: 'Routines' })).toBeVisible();
  });

  test('taking a shared item makes it Maya’s ("I’ll take it")', async ({ app, maya, mayaApi }) => {
    const title = 'Find a sitter for Friday';
    expect((await mayaApi.item(title)).ownerMemberId).toBeNull();

    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Shared' }).click();
    await maya.getByRole('button', { name: `I’ll take it: ${title}` }).click();
    await expect(toast(maya, `Yours now: ${title}`)).toBeVisible();
    await expect(toast(maya, 'One less thing for both of you.')).toBeVisible();

    await expect.poll(async () => (await mayaApi.item(title)).ownerMemberId).toBe(mayaApi.memberId);
    await maya.reload();
    if (app.phone) await maya.getByRole('tab', { name: 'You' }).click();
    await expect(maya.getByRole('button', { name: `Hand to Theo: ${title}` })).toBeVisible();
    await expect(maya.getByRole('button', { name: `I’ll take it: ${title}` })).toHaveCount(0);
  });

  test('taking something off Theo’s plate', async ({ app, maya, mayaApi }) => {
    const title = 'Replace furnace filter';
    const theo = await mayaApi.member('Theo');
    expect((await mayaApi.item(title)).ownerMemberId).toBe(theo.id);

    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Theo' }).click();
    await app.clip('take-off-partners-plate', maya, async () => {
      await maya.getByRole('button', { name: `Take it: ${title}` }).click();
      await expect(toast(maya, 'Taken off Theo’s plate')).toBeVisible();
    });

    await expect.poll(async () => (await mayaApi.item(title)).ownerMemberId).toBe(mayaApi.memberId);
    await maya.reload();
    if (app.phone) await maya.getByRole('tab', { name: 'You' }).click();
    await expect(maya.getByRole('button', { name: `Hand to Theo: ${title}` })).toBeVisible();
  });

  test('completing a project step reaches the halfway milestone', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const project = 'Hall bathroom renovation';
    const step = 'Pick paint color';
    const projectId = (await mayaApi.item(project)).id;
    const steps = (await mayaApi.items()).filter((i) => i.parentId === projectId);
    // Two of six done: one more is half.
    expect(steps.filter((s) => DONE.includes(s.status))).toHaveLength(steps.length / 2 - 1);

    await app.nav(maya, 'Tasks');
    if (app.phone) await maya.getByRole('tab', { name: 'Projects' }).click();
    await maya.getByRole('button', { name: 'Show steps' }).click();
    await app.clip('complete-project-milestone', maya, async () => {
      // Maya's own step is on her list and under the project: either completes it.
      await maya
        .getByRole('checkbox', { name: `Complete ${step}` })
        .first()
        .click();
      await expect(maya.getByText(`Halfway through ${project}`)).toBeVisible();
    });
    expect(DONE).toContain((await mayaApi.item(step)).status);
  });
});
