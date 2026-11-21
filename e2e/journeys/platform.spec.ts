import type { Locator, Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  movingFrames,
  overlaps,
  recordFrames,
  recordedFrames,
  tapTargets,
  type Box,
} from '../support/a11y';
import { MAYA } from '../support/env';
import { expect, greeting, test, toast, type AppDriver } from '../support/fixtures';

const skeleton = (page: Page) => page.getByRole('progressbar', { name: /^Loading/ }).first();
const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox();
  if (!b) throw new Error('not on screen');
  return { name: '', ...b };
};

/** Scrolls every scrolling area to its end, until the page stops growing (sections arrive late). */
async function scrollToEnd(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 10; i++) {
    const height = await page.evaluate(() => {
      let total = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4) {
          el.scrollTop = el.scrollHeight;
          total += el.scrollHeight;
        }
      }
      return total;
    });
    await page.waitForTimeout(400);
    if (height === last) return;
    last = height;
  }
}

/** Interactive elements whose own frame shows in the page's scrolling area. */
async function visibleControls(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const roles =
      'button, a, input, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]';
    const nav = document.querySelector('[role="navigation"]');
    const out: { name: string; x: number; y: number; width: number; height: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(roles))) {
      if (nav?.contains(el) || el.getAttribute('aria-label') === 'Capture something') continue;
      if (el.closest('[role="status"], [role="dialog"], [aria-hidden="true"]')) continue;
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Clipped away by a scrolling ancestor: not on screen, so not covered either.
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowY)) {
          const c = p.getBoundingClientRect();
          if (r.bottom <= c.top + 1 || r.top >= c.bottom - 1) clipped = true;
        }
      }
      if (clipped || r.bottom <= 0 || r.top >= window.innerHeight) continue;
      const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 50);
      out.push({ name, x: r.x, y: r.y, width: r.width, height: r.height });
    }
    return out;
  });
}

test.describe('Offline, errors, slow networks and expired sessions', () => {
  test('offline keeps the shell and what was loaded, says so, and recovers', async ({
    app,
    maya,
  }) => {
    app.allowConsoleError(/ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_NETWORK/);
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    const rows = maya.getByRole('checkbox', { name: /^Complete / });
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    await maya.context().setOffline(true);
    // Changing section offline: the navigation stays and the app says it's offline.
    await app.mainNav(maya).getByRole('link', { name: 'Week', exact: true }).click();
    await expect(app.mainNav(maya)).toBeVisible();
    await expect(maya.getByText(/^You’re offline\. Showing what was last loaded/)).toBeVisible();
    await expect(maya.getByText(/Check your connection/)).toHaveCount(0);
    await maya.screenshot({ path: test.info().outputPath('offline-week.png') });

    // Back to Today: everything it had is still there.
    await app.mainNav(maya).getByRole('link', { name: 'Today', exact: true }).click();
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    await expect(rows).toHaveCount(before);
    await maya.screenshot({ path: test.info().outputPath('offline-today.png') });

    // Back online: the note goes by itself and Today reloads.
    await maya.context().setOffline(false);
    await expect(maya.getByText(/^You’re offline\./)).toHaveCount(0);
    await expect(rows.first()).toBeVisible();
  });

  test('a server error says it is not your connection', async ({ app, maya }) => {
    app.allowConsoleError(/status of 500/);
    await maya.route('**/api/households/*/rhythm', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }),
    );
    await maya.reload();
    await expect(maya.getByText(/Couldn’t load today\. .*not your connection/)).toBeVisible();
    await expect(maya.getByText(/Check your connection/)).toHaveCount(0);
    await maya.screenshot({ path: test.info().outputPath('server-error.png') });
  });

  test('a slow network shows the page’s shape at once, never a blank screen', async ({
    app,
    maya,
  }) => {
    await maya.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue().catch(() => undefined);
    });
    await maya.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(skeleton(maya)).toBeVisible({ timeout: 300 });
    await maya.screenshot({ path: test.info().outputPath('slow-skeleton.png') });
    await expect(greeting(maya, MAYA.name)).toBeVisible({ timeout: 20_000 });
    void app;
  });

  test('a corrupted session goes back to sign-in with “Please sign in again”', async ({
    app,
    maya,
  }) => {
    // The API's 401, and Auth refusing to sign out a token it can't read (403): both expected.
    app.allowConsoleError(/status of 40[13]/);
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    await maya.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      if (!key) throw new Error('no stored session');
      const session = JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token: string };
      session.access_token = 'corrupted.token.value';
      localStorage.setItem(key, JSON.stringify(session));
    });
    await maya.reload();
    await expect(maya.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
    await expect(maya.getByText(/^Please sign in again/)).toBeVisible();
    await maya.screenshot({ path: test.info().outputPath('signed-out.png') });
    // Signing in again works.
    await app.signIn(maya, MAYA.email);
  });
});

test.describe('Quick capture: once, even when pressed again or retried', () => {
  test('three Enters create one item; a retry after a lost answer creates no second', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const sheet = await app.openCapture(maya);
    const input = sheet.getByRole('textbox', { name: 'What needs doing?' });
    await input.fill('Book the chimney sweep');
    await input.press('Enter');
    await input.press('Enter');
    await input.press('Enter');
    await expect(toast(maya, /Book the chimney sweep/)).toBeVisible();
    await expect
      .poll(async () => (await mayaApi.items()).filter((i) => i.title === 'Book the chimney sweep'))
      .toHaveLength(1);
    // Desktop: focus is back on Capture, ready for the next one.
    if (!app.phone) {
      await expect(maya.getByRole('button', { name: 'Capture something (N)' })).toBeFocused();
    }

    // The answer to the first save is lost (the item was made); saving again makes no second.
    app.allowConsoleError(/Failed to load resource|ERR_FAILED/);
    let first = true;
    await maya.route('**/api/households/*/work-items', async (route) => {
      if (route.request().method() === 'POST' && first) {
        first = false;
        await route.fetch();
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    const again = await app.openCapture(maya);
    await again.getByRole('textbox', { name: 'What needs doing?' }).fill('Renew library cards');
    const save = again.getByRole('button', { name: /^Add to / });
    await save.click();
    await expect(again.getByRole('alert')).toBeVisible();
    await save.click();
    await expect(toast(maya, /Renew library cards/)).toBeVisible();
    expect(
      (await mayaApi.items()).filter((i) => i.title === 'Renew library cards'),
      'one item, though it was sent twice',
    ).toHaveLength(1);
  });

  test('an undo that fails says so', async ({ app, maya }) => {
    app.allowConsoleError(/status of 500/);
    const sheet = await app.openCapture(maya);
    await sheet.getByRole('textbox', { name: 'What needs doing?' }).fill('Water the ferns');
    await sheet.getByRole('textbox', { name: 'What needs doing?' }).press('Enter');
    await maya.route('**/api/households/*/work-items/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })
        : route.continue(),
    );
    await maya.getByRole('button', { name: /^Undo: Added to .*Water the ferns/ }).click();
    await expect(toast(maya, /^Couldn’t undo adding “Water the ferns”/)).toBeVisible();
  });
});

test.describe('Reduce Motion', () => {
  test('toasts, sheets and celebrations appear in place, without moving', async ({ app }) => {
    const page = await app.as(MAYA.email, undefined, { reducedMotion: 'reduce' });
    await recordFrames(page);

    // A sheet: quick capture, opened and closed.
    await app.openCapture(page);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Capture something for the household' }),
    ).toHaveCount(0);

    // A toast and a celebration: the renovation's halfway step.
    await app.nav(page, 'Tasks');
    if (app.phone) await page.getByRole('tab', { name: 'Projects' }).click();
    await page.getByRole('button', { name: 'Show steps' }).click();
    await page.getByRole('checkbox', { name: 'Complete Pick paint color' }).first().click();
    await expect(toast(page, 'Done: Pick paint color')).toBeVisible();
    await expect(page.getByText('Halfway through Hall bathroom renovation')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('reduced-motion.png') });
    await page.waitForTimeout(500);

    const samples = await recordedFrames(page);
    const moving = await movingFrames(page);
    writeFileSync(
      test.info().outputPath('reduced-motion-frames.json'),
      JSON.stringify({ samples, moving }, null, 2),
    );
    expect(samples, 'the recorder saw the toast, sheet and card').toBeGreaterThan(0);
    expect(moving, 'frames with a translate, scale or fade').toEqual([]);
  });

  test('without Reduce Motion the same sheet does move (the check can see motion)', async ({
    app,
    maya,
  }) => {
    await recordFrames(maya);
    await app.openCapture(maya);
    await maya.waitForTimeout(400);
    expect((await movingFrames(maya)).length).toBeGreaterThan(0);
  });
});

test.describe('Phones: nothing covers what you can tap', () => {
  async function check(app: AppDriver, page: Page, where: string): Promise<void> {
    await scrollToEnd(page);
    const fab = page.getByRole('button', { name: 'Capture something', exact: true });
    const covers: Box[] = [await box(app.mainNav(page))];
    if (await fab.isVisible()) covers.push(await box(fab));
    const hidden = (await visibleControls(page)).filter((c) => covers.some((f) => overlaps(c, f)));
    expect(
      hidden.map((c) => c.name),
      `${where}: controls under the + button or the bar`,
    ).toEqual([]);
  }

  test('Today, Tasks, Meals and the Weekly Reset at 390×844', async ({ app, maya }) => {
    test.skip(!app.phone, 'The floating + button and the bottom bar are the phone’s.');
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    await check(app, maya, 'Today');
    await maya.screenshot({ path: test.info().outputPath('today-390-end.png') });

    // A toast sits above the + button, never over it; only one at a time.
    await app.nav(maya, 'Tasks');
    await maya
      .getByRole('checkbox', { name: /^Complete / })
      .first()
      .click();
    await maya
      .getByRole('checkbox', { name: /^Complete / })
      .first()
      .click();
    const toasts = maya.getByRole('status').filter({ hasText: /^Done: / });
    await expect(toasts).toHaveCount(1);
    const fab = await box(maya.getByRole('button', { name: 'Capture something', exact: true }));
    expect(overlaps(await box(toasts.first()), fab), 'toast over the + button').toBe(false);
    await maya.screenshot({ path: test.info().outputPath('tasks-390-toast.png') });
    await check(app, maya, 'Tasks');

    await maya.goto('/meals');
    await expect(maya.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await check(app, maya, 'Meals');

    await app.nav(maya, 'Reset');
    await check(app, maya, 'Weekly Reset');
  });
});

test.describe('Big enough to tap', () => {
  test('every control on Today and Tasks takes a 44×44 tap', async ({ app, maya }) => {
    for (const section of ['Today', 'Tasks'] as const) {
      await app.nav(maya, section);
      await maya.waitForTimeout(500);
      const small = (await tapTargets(maya)).filter(
        (b) => Math.round(b.width) < 44 || Math.round(b.height) < 44,
      );
      expect(
        small.map((b) => `${b.name} ${Math.round(b.width)}×${Math.round(b.height)}`),
        `${section}: under 44×44`,
      ).toEqual([]);
    }
  });
});

test.describe('Keyboard', () => {
  test('Tab through Today, N opens capture, Esc closes it and returns focus; More by keys', async ({
    app,
    maya,
  }) => {
    test.skip(app.phone, 'Keyboard journey: desktop.');
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    // Tab moves through the top bar into the page, with a visible focus ring.
    await maya.keyboard.press('Tab');
    await expect(maya.getByRole('link', { name: 'The Rivera household, today' })).toBeFocused();
    for (let i = 0; i < 3; i++) await maya.keyboard.press('Tab');
    await expect(app.mainNav(maya).getByRole('link', { name: 'Week', exact: true })).toBeFocused();
    const ring = await maya.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(ring).toBe('solid');
    await maya.screenshot({ path: test.info().outputPath('keyboard-focus-nav.png') });

    // N opens capture; one Escape closes it and focus goes back where it was.
    await maya.keyboard.press('n');
    const sheet = maya.getByRole('dialog', { name: 'Capture something for the household' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'What needs doing?' })).toBeFocused();
    await maya.screenshot({ path: test.info().outputPath('keyboard-capture.png') });
    await maya.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(app.mainNav(maya).getByRole('link', { name: 'Week', exact: true })).toBeFocused();

    // More opens with Enter and closes with Escape.
    const more = maya.getByRole('button', { name: /^More:/ });
    await more.focus();
    await maya.keyboard.press('Enter');
    await expect(maya.getByRole('menu')).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await maya.keyboard.press('Escape');
    await expect(maya.getByRole('menu')).toHaveCount(0);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  test('the single-key shortcuts can be turned off', async ({ app, maya }) => {
    test.skip(app.phone, 'Keyboard shortcuts: desktop web.');
    await app.nav(maya, 'Household');
    await maya.getByRole('switch', { name: 'Keyboard shortcuts' }).click();
    await app.nav(maya, 'Today');
    await maya.keyboard.press('n');
    await maya.waitForTimeout(300);
    await expect(
      maya.getByRole('dialog', { name: 'Capture something for the household' }),
    ).toHaveCount(0);
    // Still off after a reload (this device).
    await maya.reload();
    await expect(greeting(maya, MAYA.name)).toBeVisible();
    await expect(
      maya.getByRole('button', { name: 'Capture something', exact: true }),
    ).toBeVisible();
  });
});
