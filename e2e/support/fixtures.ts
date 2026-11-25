import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Api } from './api';
import { BASE_URL, DEMO_PASSWORD, MAYA, RECORD, TIME_ZONE, VIDEO_DIR } from './env';
import { seedDemo } from './stack';
import { toGif } from './record';

export type Section = 'Today' | 'Week' | 'Tasks' | 'Reset' | 'Household';

/** Each section's link in the main navigation (its accessible name). */
const LINKS: Record<Section, string> = {
  Today: 'Today',
  Week: 'Week',
  Tasks: 'Tasks',
  Reset: 'Weekly Reset',
  Household: 'Household',
};

/** What a journey can add to a fresh browser (on top of the project's viewport). */
export interface ContextExtras {
  reducedMotion?: 'reduce' | 'no-preference';
  /** Install Playwright's fake clock before the app loads: at the real time, or at this one. */
  clock?: boolean | Date;
}

const PATHS: Record<Section, string> = {
  Today: '/',
  Week: '/week',
  Tasks: '/tasks',
  Reset: '/reset',
  Household: '/household',
};
/** Something only that screen shows, once it has loaded. */
const LANDMARKS: Record<Section, (page: Page) => Locator> = {
  Today: (page) => greeting(page),
  Week: (page) => page.getByRole('button', { name: 'Previous week' }),
  Tasks: (page) => page.getByRole('heading', { name: 'Who’s carrying what' }),
  Reset: (page) => page.getByRole('heading', { level: 1 }).first(),
  Household: (page) => page.getByRole('heading', { name: 'People and pets' }),
};

interface Clip {
  name: string;
  page: Page;
  from: number;
  to: number;
}

/**
 * Drives the app the way a person does, in fresh browser contexts: signs in through the real
 * sign-in screen, navigates with the visible navigation, and fails the test on any error-level
 * console message or uncaught page error. With E2E_RECORD=1 it also films marked interactions
 * and turns them into GIFs in e2e/artifacts/.
 */
export class AppDriver {
  readonly phone: boolean;
  private readonly contexts: BrowserContext[] = [];
  private readonly started = new Map<Page, number>();
  private readonly errors: string[] = [];
  private readonly allowed: RegExp[] = [];
  private readonly clips: Clip[] = [];

  constructor(
    private readonly browser: Browser,
    private readonly info: TestInfo,
  ) {
    this.phone = info.project.name === 'phone';
  }

  /** A new, signed-out browser (its own storage, like another device). */
  async open(path = '/', extras: ContextExtras = {}): Promise<Page> {
    const use = this.info.project.use;
    const viewport = use.viewport ?? { width: 1440, height: 900 };
    const { clock, ...contextOptions } = extras;
    const context = await this.browser.newContext({
      ...contextOptions,
      baseURL: BASE_URL,
      viewport,
      ...(use.deviceScaleFactor !== undefined && { deviceScaleFactor: use.deviceScaleFactor }),
      ...(use.isMobile !== undefined && { isMobile: use.isMobile }),
      ...(use.hasTouch !== undefined && { hasTouch: use.hasTouch }),
      timezoneId: TIME_ZONE,
      locale: 'en-US',
      ...(RECORD && {
        recordVideo: {
          dir: resolve(VIDEO_DIR, this.info.testId),
          size: viewport,
        },
      }),
    });
    this.contexts.push(context);
    const page = await context.newPage();
    if (clock) await page.clock.install(clock instanceof Date ? { time: clock } : {});
    this.started.set(page, Date.now());
    const where = () => new URL(page.url()).pathname;
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(`console.error on ${where()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => this.errors.push(`uncaught on ${where()}: ${e.message}`));
    await page.goto(path);
    return page;
  }

  /** Signs in on the real sign-in screen and waits for Today. */
  async signIn(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
    if (!new URL(page.url()).pathname.startsWith('/sign-in')) await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(greeting(page)).toBeVisible();
  }

  /** A fresh browser signed in as this person, on Today. */
  async as(email: string, password = DEMO_PASSWORD, extras: ContextExtras = {}): Promise<Page> {
    const page = await this.open('/sign-in', extras);
    await this.signIn(page, email, password);
    return page;
  }

  /** The main navigation: the top bar's links on desktop, the bottom bar's on phones. */
  mainNav(page: Page): Locator {
    return page.getByRole('navigation', { name: 'Main' });
  }

  /** Goes to a section with the app's own navigation (top bar on desktop, bottom bar on phone). */
  async nav(page: Page, section: Section): Promise<void> {
    if (section === 'Household' && this.phone) {
      // Phone: the household button in the header (desktop: a top-bar link).
      await page.getByRole('link', { name: 'Household', exact: true }).click();
    } else {
      await this.mainNav(page).getByRole('link', { name: LINKS[section], exact: true }).click();
    }
    // Screens stay mounted (hidden) in the navigation stack: wait until this one is showing, so
    // a locator never settles on the same row in the screen we just left.
    await expect(page).toHaveURL(`${BASE_URL}${PATHS[section]}`);
    await expect(LANDMARKS[section](page)).toBeVisible();
  }

  /** Opens quick capture from the always-there button. */
  async openCapture(page: Page): Promise<Locator> {
    await page
      .getByRole('button', { name: this.phone ? 'Capture something' : 'Capture something (N)' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Capture something for the household' });
    await expect(sheet).toBeVisible();
    return sheet;
  }

  /** An expected error-level console message (for example, a 404 the journey provokes). */
  allowConsoleError(pattern: RegExp): void {
    this.allowed.push(pattern);
  }

  /**
   * Marks an acceptance interaction. With E2E_RECORD=1 it is cut from the page's video into
   * e2e/artifacts/<name>-<project>.gif; otherwise it simply runs.
   */
  async clip(name: string, page: Page, interaction: () => Promise<void>): Promise<void> {
    const started = this.started.get(page) ?? Date.now();
    const from = Date.now() - started;
    await interaction();
    if (RECORD) {
      // Recording only: let the confirmation and its animation play out on film.
      await page.waitForTimeout(1600);
      this.clips.push({ name, page, from, to: Date.now() - started });
    }
  }

  /** After the test: closes every context, writes GIFs, then checks the console stayed clean. */
  async finish(): Promise<void> {
    if (this.info.status !== this.info.expectedStatus) {
      let n = 0;
      for (const page of this.started.keys()) {
        if (page.isClosed()) continue;
        const body = await page.screenshot({ fullPage: true }).catch(() => null);
        if (body) await this.info.attach(`page-${++n}`, { body, contentType: 'image/png' });
      }
    }
    for (const context of this.contexts) await context.close();
    for (const clip of this.clips) {
      const video = await clip.page.video()?.path();
      if (video) await toGif(video, clip.name, this.info.project.name, clip.from, clip.to);
    }
    const unexpected = this.errors.filter((e) => !this.allowed.some((re) => re.test(e)));
    expect(unexpected, 'error-level console messages or uncaught errors').toEqual([]);
  }
}

/** Today's greeting ("Good morning, Maya"): the sign that the household has loaded. */
export function greeting(page: Page, name?: string): Locator {
  return page.getByRole('heading', {
    level: 1,
    name: new RegExp(`^Good (morning|afternoon|evening)${name ? `, ${name}` : ''}`),
  });
}

/** The toast region's message ("Done: …"), matched by its start. */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByRole('status').filter({ hasText: text });
}

export const test = base.extend<{
  /** Resets the demo household before every test, so journeys never depend on each other. */
  demo: undefined;
  app: AppDriver;
  /** Maya (the owner), signed in on Today in a fresh browser. */
  maya: Page;
  /** The API as Maya, to re-read real state after acting in the UI. */
  mayaApi: Api;
}>({
  demo: [
    async ({}, use) => {
      await seedDemo();
      await use(undefined);
    },
    { auto: true },
  ],
  app: async ({ browser }, use, info) => {
    if (RECORD) mkdirSync(VIDEO_DIR, { recursive: true });
    const driver = new AppDriver(browser, info);
    await use(driver);
    await driver.finish();
  },
  maya: async ({ app }, use) => {
    await use(await app.as(MAYA.email));
  },
  mayaApi: async ({}, use) => {
    await use(await Api.as(MAYA.email));
  },
});

export { expect };
