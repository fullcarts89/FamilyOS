import type { Page } from '@playwright/test';
import { DONE, type Api } from '../support/api';
import { expect, test, toast } from '../support/fixtures';

/**
 * Maya's own open one-off tasks in Today's "Who's on what" (her list), in the order they show:
 * those that appear once on the page (her late and due-today ones also show at the top, under
 * "On you"). Routine turns are left out: they share a title.
 */
async function listRows(page: Page, api: Api): Promise<string[]> {
  const items = await api.items();
  const mine = new Set(
    items
      .filter((i) => i.ownerMemberId === api.memberId && !DONE.includes(i.status))
      .filter((i) => !i.recurrenceRuleId && items.filter((x) => x.title === i.title).length === 1)
      .map((i) => i.title),
  );
  const labels = await page
    .getByRole('checkbox')
    .evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => e.getAttribute('aria-label') ?? ''),
    );
  const names = labels.filter((l) => l.startsWith('Complete ')).map((l) => l.slice(9));
  return names.filter((n) => names.indexOf(n) === names.lastIndexOf(n) && mine.has(n));
}

/** A tap (phone) or click (desktop) at a fixed point on the screen, like a finger or a mouse. */
async function pressAt(page: Page, phone: boolean, at: { x: number; y: number }) {
  if (phone) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

test.describe('Today: finishing something', () => {
  test('a ticked row stays checked for a moment, then leaves; Reopen is there meanwhile', async ({
    maya,
    mayaApi,
  }) => {
    const [title] = await listRows(maya, mayaApi);
    if (!title) throw new Error('Maya’s list should have an open row');
    const check = maya.getByRole('checkbox', { name: `Complete ${title}`, exact: true });
    await check.scrollIntoViewIfNeeded();
    const started = Date.now();
    await check.click();
    const ticked = maya.getByRole('checkbox', { name: `Reopen ${title}`, exact: true });
    // Checked (and struck) the whole time, at least 1.2 s from the press.
    while (Date.now() - started < 1250) {
      await expect(ticked).toHaveAttribute('aria-checked', 'true', { timeout: 200 });
      await maya.waitForTimeout(100);
    }
    await expect(toast(maya, `Done: ${title}`)).toBeVisible();
    // Then it fades and leaves the list.
    await expect(ticked).toHaveCount(0, { timeout: 3000 });
    await expect.poll(async () => DONE.includes((await mayaApi.item(title)).status)).toBe(true);
  });

  test('three rows ticked 150 ms apart complete exactly those three', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const names = (await listRows(maya, mayaApi)).slice(0, 3);
    expect(names).toHaveLength(3);
    const before = new Map((await mayaApi.items()).map((i) => [i.id, i.status]));
    const checks = names.map((n) =>
      maya.getByRole('checkbox', { name: `Complete ${n}`, exact: true }),
    );
    await checks[1]?.scrollIntoViewIfNeeded();
    // Where each one is now: a person aims at a spot, not at a name.
    const points = [];
    for (const c of checks) {
      const box = await c.boundingBox();
      if (!box) throw new Error('row not on screen');
      points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    for (const [i, at] of points.entries()) {
      if (i > 0) await maya.waitForTimeout(150);
      await pressAt(maya, app.phone, at);
    }
    for (const n of names) {
      await expect(maya.getByRole('checkbox', { name: `Reopen ${n}`, exact: true })).toBeVisible();
    }
    // The server finished exactly those three, and nothing else changed.
    const done = async () =>
      (await mayaApi.items())
        .filter((i) => DONE.includes(i.status) && !DONE.includes(before.get(i.id) ?? ''))
        .map((i) => i.title)
        .sort();
    await expect.poll(done).toEqual([...names].sort());
    await maya.waitForTimeout(1500);
    expect(await done()).toEqual([...names].sort());
  });

  test('a save that fails puts the row back unticked at once, with no “Done”', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const [title] = await listRows(maya, mayaApi);
    if (!title) throw new Error('Maya’s list should have an open row');
    app.allowConsoleError(/status of 500/);
    await maya.route('**/api/households/*/work-items/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.fallback(),
    );
    const check = maya.getByRole('checkbox', { name: `Complete ${title}`, exact: true });
    await check.scrollIntoViewIfNeeded();
    const failed = maya.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.status() === 500,
    );
    await check.click();
    await failed;
    const answered = Date.now();
    await expect(check).toHaveAttribute('aria-checked', 'false', { timeout: 300 });
    expect(Date.now() - answered).toBeLessThan(300);
    await expect(toast(maya, `Couldn’t mark “${title}” done.`)).toBeVisible();
    await expect(toast(maya, `Done: ${title}`)).toHaveCount(0);
    // Still there, still open, after the moment a finished row would have left.
    await maya.waitForTimeout(1600);
    await expect(check).toBeVisible();
    expect(DONE).not.toContain((await mayaApi.item(title)).status);
  });
});
