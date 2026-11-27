import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { axe, blocking, recheckLabelInName, type AxeViolation } from '../support/a11y';
import { CACHE_DIR } from '../support/env';
import { expect, greeting, test } from '../support/fixtures';

/**
 * Serious findings that remain on purpose, each with its owner and reason. Anything else that is
 * serious or critical fails the gate. Keep this list short and remove entries as they are fixed.
 */
const KNOWN: { screen: string; id: string; node: RegExp; reason: string }[] = [];

/**
 * The accessibility gate: axe-core (WCAG 2.2 A/AA and best practices) over every main screen on
 * desktop and phone, with the capture sheet open too. Fails on any critical or serious finding;
 * every finding (moderate and minor too) is written to e2e/.cache/axe/<project>.json.
 */
test.describe('Accessibility: axe over every main screen', () => {
  test('no critical or serious violations', async ({ app, maya, mayaApi }) => {
    test.setTimeout(180_000);
    const item = await mayaApi.item('Pay Little Oaks invoice for next month');
    const routine = (await mayaApi.routines()).find((r) => r.title === 'Laundry');
    expect(routine, 'the seed has a Laundry routine').toBeTruthy();

    const screens: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
      { name: 'Today', path: '/', ready: (p) => expect(greeting(p)).toBeVisible() },
      {
        name: 'Week',
        path: '/week',
        ready: (p) => expect(p.getByRole('button', { name: 'Previous week' })).toBeVisible(),
      },
      {
        name: 'Tasks',
        path: '/tasks',
        ready: (p) => expect(p.getByRole('heading', { name: 'Who’s carrying what' })).toBeVisible(),
      },
      {
        name: 'Weekly Reset',
        path: '/reset',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'Household',
        path: '/household',
        ready: (p) => expect(p.getByRole('heading', { name: 'People and pets' })).toBeVisible(),
      },
      {
        name: 'Meals & groceries',
        path: '/meals',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'Decisions',
        path: '/decisions',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'Contacts',
        path: '/contacts',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'Budgets',
        path: '/budgets',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'Inbox',
        path: '/inbox',
        ready: (p) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible(),
      },
      {
        name: 'An item',
        path: `/item/${item.id}`,
        ready: (p) =>
          expect(p.getByRole('checkbox', { name: `Complete ${item.title}` })).toBeVisible(),
      },
      {
        name: 'A routine',
        path: `/routine/${routine?.id ?? ''}`,
        ready: (p) => expect(p.getByRole('heading', { name: 'Laundry' }).first()).toBeVisible(),
      },
    ];

    // `raw`: what axe reported; `violations`: after the label-in-name recheck (support/a11y.ts).
    const found: { screen: string; raw: AxeViolation[]; violations: AxeViolation[] }[] = [];
    for (const screen of screens) {
      await maya.goto(screen.path);
      await screen.ready(maya);
      // Let entrances finish and late sections arrive.
      await maya.waitForTimeout(700);
      const raw = await axe(maya);
      found.push({ screen: screen.name, raw, violations: await recheckLabelInName(maya, raw) });
    }
    // A dialog: quick capture, open on Today.
    await maya.goto('/');
    await expect(greeting(maya)).toBeVisible();
    const sheet = await app.openCapture(maya);
    await maya.waitForTimeout(400);
    const raw = await axe(maya);
    found.push({ screen: 'Capture sheet', raw, violations: await recheckLabelInName(maya, raw) });
    // Its "Pick a date" calendar, open.
    await sheet.getByRole('button', { name: 'Pick a date', exact: true }).click();
    await expect(sheet.getByRole('group', { name: 'Pick a date' })).toBeVisible();
    await maya.waitForTimeout(400);
    const rawCalendar = await axe(maya);
    found.push({
      screen: 'Capture sheet, date calendar',
      raw: rawCalendar,
      violations: await recheckLabelInName(maya, rawCalendar),
    });

    const project = test.info().project.name;
    const dir = resolve(CACHE_DIR, 'axe');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${project}.json`), JSON.stringify(found, null, 2));

    // Each serious node either matches a known, explained finding or fails the gate.
    const failures: string[] = [];
    const known: string[] = [];
    for (const { screen, violations } of found) {
      for (const v of blocking(violations)) {
        for (const n of v.nodes) {
          const why = KNOWN.find(
            (k) => k.screen === screen && k.id === v.id && k.node.test(n.html),
          );
          const line = `${screen}: ${v.impact} ${v.id} at ${n.target} (${n.summary.slice(0, 120)})`;
          if (why) known.push(`${line} — known: ${why.reason}`);
          else failures.push(line);
        }
      }
    }
    writeFileSync(resolve(dir, `${project}-known.txt`), known.join('\n'));
    for (const k of new Set(known.map((line) => line.split(' at ')[0] ?? line))) {
      test.info().annotations.push({ type: 'known axe finding', description: k });
    }
    expect(failures, 'critical or serious axe violations').toEqual([]);
  });
});
