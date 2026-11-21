import type { Locator, Page } from '@playwright/test';
import pg from 'pg';
import { Api, DONE, addDays, weekday } from '../support/api';
import { DATABASE_URL, MAYA, TIME_ZONE } from '../support/env';
import { expect, greeting, test, toast } from '../support/fixtures';
import { createAccount, createHousehold, e2eEmail } from '../support/stack';

/** A wall-clock time on a date in the household's zone, as an instant. */
function householdTime(date: string, hhmm: string): Date {
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const hours = Number(/GMT([+-]\d+)/.exec(zone ?? '')?.[1] ?? -8);
  const offset = `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
  return new Date(`${date}T${hhmm}:00${offset}`);
}

/** SQL against the stack's database (fixtures only; the app itself is driven through the UI). */
async function sql<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<R[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<R>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Whether all of an element is on screen (above the phone's bottom bar). */
async function fullyOnScreen(page: Page, target: Locator, phone: boolean): Promise<boolean> {
  const box = await target.boundingBox();
  const bottom = phone
    ? ((await page.getByRole('tablist', { name: 'Main' }).boundingBox())?.y ?? 0)
    : (page.viewportSize()?.height ?? 0);
  return !!box && box.y >= 0 && box.y + box.height <= bottom;
}

/** The late rows on Maya's own list ("Who's on what"): ticks and missed-turn rows. */
async function lateOnHerList(page: Page): Promise<number> {
  const group = page
    .getByRole('heading', { name: /^Running late/ })
    .first()
    .locator('xpath=..');
  return (
    (await group.getByRole('checkbox').count()) +
    (await group.getByRole('button', { name: /^Skip missed/ }).count())
  );
}

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

test.describe('Today: your own things first', () => {
  test('at 7:45 on a weekday your late item is on the first screen, and the headline counts yours', async ({
    app,
    mayaApi,
  }) => {
    const [today, theo, june] = await Promise.all([
      mayaApi.today(),
      mayaApi.member('Theo'),
      mayaApi.member('June'),
    ]);
    const events = `/households/${mayaApi.householdId}/events`;
    // A weekday morning: on a weekend, add the daycare handoffs a weekday has.
    if (weekday(today) >= 6) {
      for (const [title, from, to, who, action] of [
        ['Daycare drop-off', '08:15', '08:35', theo.id, 'drop_off'],
        ['Daycare pickup', '17:30', '17:50', mayaApi.memberId, 'pick_up'],
      ] as const) {
        const res = await mayaApi.request(events, {
          method: 'POST',
          body: {
            title,
            kind: 'childcare',
            startsAt: householdTime(today, from).toISOString(),
            endsAt: householdTime(today, to).toISOString(),
            memberIds: [who, june.id],
            careMemberId: june.id,
            careAction: action,
            carePlace: 'Little Oaks',
          },
        });
        expect(res.status).toBe(201);
      }
    }
    // Something of Maya's is late (the demo's late routine turn is hers only every other week).
    const late = 'Return the library DVD';
    const created = await mayaApi.request(`/households/${mayaApi.householdId}/work-items`, {
      method: 'POST',
      body: {
        title: late,
        ownerMemberId: mayaApi.memberId,
        dueOn: addDays(today, -2),
        inbox: false,
      },
    });
    expect(created.status).toBe(201);

    const maya = await app.as(MAYA.email);
    await maya.clock.install({ time: householdTime(today, '07:45') });
    await maya.reload();
    await expect(greeting(maya, 'Maya')).toBeVisible();
    await expect(maya.getByText(/^Good morning/)).toBeVisible();

    // "On you" leads with what's late: the first row is on screen, check and title.
    const onYou = maya.getByRole('region', { name: 'On you: late and due today' });
    await expect(onYou).toBeVisible();
    const first = onYou.getByRole('checkbox').first();
    const name = ((await first.getAttribute('aria-label')) ?? '').replace(/^Complete /, '');
    const lateTitles = (await mayaApi.items())
      .filter((i) => i.ownerMemberId === mayaApi.memberId && !DONE.includes(i.status))
      .filter((i) => (i.dueOn ?? '9999') < today || i.title === late)
      .map((i) => i.title);
    expect(lateTitles).toContain(name);
    expect(await fullyOnScreen(maya, first, app.phone)).toBe(true);
    expect(await fullyOnScreen(maya, onYou.getByText(name, { exact: true }), app.phone)).toBe(true);

    // The headline counts hers, the same number her list shows as running late.
    const n = await lateOnHerList(maya);
    expect(n).toBeGreaterThanOrEqual(1);
    await expect(
      maya.getByText(new RegExp(`${n} of yours ${n === 1 ? 'is' : 'are'} running late`)).first(),
    ).toBeVisible();
  });

  test('something with no date shows on Today under “Anytime”, in a new household too', async ({
    app,
  }) => {
    const email = e2eEmail('ines');
    const password = 'a kettle on the stove 4';
    const userId = await createAccount(email, password);
    await createHousehold({ name: 'The Okafor household', ownerUserId: userId, ownerName: 'Ines' });
    const ines = await app.as(email, password);

    const sheet = await app.openCapture(ines);
    await sheet.getByRole('textbox', { name: 'What needs doing?' }).fill('Call the vet');
    await sheet.getByRole('button', { name: 'Add to your list' }).click();
    await expect(toast(ines, 'Added to your list: Call the vet')).toBeVisible();
    await expect(sheet).toBeHidden();

    // Same session, no reload: it's on Today, undated, under "Anytime".
    const check = ines.getByRole('checkbox', { name: 'Complete Call the vet', exact: true });
    await expect(check).toBeVisible();
    await expect(ines.getByRole('heading', { name: 'Anytime' }).first()).toBeVisible();
    await expect(ines.getByText('Nothing on your list. Enjoy it.')).toHaveCount(0);
    const api = await Api.as(email, password);
    expect(await api.item('Call the vet')).toMatchObject({ dueOn: null, status: 'ready' });

    // And finishing it from Today works.
    await check.click();
    await expect(toast(ines, 'Done: Call the vet')).toBeVisible();
    await expect
      .poll(async () => DONE.includes((await api.item('Call the vet')).status))
      .toBe(true);
    expect((await api.item('Call the vet')).dueOn).toBeNull();
  });

  test('an all-day event shows on Today, with whose it is', async ({ app, mayaApi }) => {
    const [today, june] = await Promise.all([mayaApi.today(), mayaApi.member('June')]);
    const res = await mayaApi.request(`/households/${mayaApi.householdId}/events`, {
      method: 'POST',
      body: {
        title: 'School closed',
        allDay: true,
        startsOn: today,
        endsOn: today,
        memberIds: [june.id],
      },
    });
    expect(res.status).toBe(201);
    const maya = await app.as(MAYA.email);
    const event = maya.getByRole('button', { name: 'All day: School closed, June' });
    await expect(event).toBeVisible();
    await expect(maya.getByRole('list', { name: 'All day today' })).toBeVisible();
    if (app.phone) expect(await fullyOnScreen(maya, event, true)).toBe(true);
    // It opens like any event.
    await event.click();
    await expect(maya.getByRole('dialog').getByText('School closed').first()).toBeVisible();
  });
});

test.describe('Today: back after days away', () => {
  /** Bath and bedtime's turns for the four days before today: open again, and Maya's. */
  async function missFourBedtimes(api: Api, today: string): Promise<void> {
    await sql(
      `update app.work_item w
          set status = 'ready', completed_at = null, completed_by_member_id = null,
              completed_from_status = null, owner_member_id = $1
         from app.recurrence_rule r
         join app.work_item routine on routine.id = r.routine_id
        where w.recurrence_rule_id = r.id and routine.title = 'Bath and bedtime'
          and w.household_id = $2 and w.occurrence_on >= $3 and w.occurrence_on < $4`,
      [api.memberId, api.householdId, addDays(today, -4), today],
    );
    // Maya last looked four days ago.
    await sql(
      `insert into app.member_state (member_id, household_id, last_seen_at)
       values ($1, $2, now() - interval '4 days')
       on conflict (member_id) do update set last_seen_at = excluded.last_seen_at`,
      [api.memberId, api.householdId],
    );
  }

  /** The statuses of those four turns, oldest first (skipped ones are cancelled). */
  const bedtimes = async (api: Api, today: string) =>
    (
      await sql<{ status: string }>(
        `select w.status::text as status
           from app.work_item w
           join app.recurrence_rule r on r.id = w.recurrence_rule_id
           join app.work_item routine on routine.id = r.routine_id
          where routine.title = 'Bath and bedtime' and w.household_id = $1
            and w.occurrence_on >= $2 and w.occurrence_on < $3
          order by w.occurrence_on`,
        [api.householdId, addDays(today, -4), today],
      )
    ).map((r) => r.status);

  test('four missed turns are one row; Done does the latest and skips the rest', async ({
    app,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    await missFourBedtimes(mayaApi, today);
    const maya = await app.as(MAYA.email);

    await expect(maya.getByText(/^While you were away: .*need/)).toBeVisible();
    // One row, not four: in "On you" and on her list, never a row per turn.
    await expect(maya.getByText('4 missed').first()).toBeVisible();
    await expect(maya.getByRole('checkbox', { name: 'Complete Bath and bedtime' })).toHaveCount(0);
    await maya
      .getByRole('button', { name: 'Done: Bath and bedtime, and skip the 3 older' })
      .first()
      .click();
    await expect(toast(maya, 'Done: Bath and bedtime')).toBeVisible();
    await expect(toast(maya, '3 older turns skipped.')).toBeVisible();
    await expect
      .poll(() => bedtimes(mayaApi, today))
      .toEqual(['cancelled', 'cancelled', 'cancelled', 'verified_complete']);
    await expect(maya.getByText('4 missed')).toHaveCount(0);
  });

  test('Skip missed skips them all in one tap', async ({ app, mayaApi }) => {
    const today = await mayaApi.today();
    await missFourBedtimes(mayaApi, today);
    const maya = await app.as(MAYA.email);
    await maya.getByRole('button', { name: 'Skip missed: Bath and bedtime' }).first().click();
    await expect(toast(maya, 'Skipped 4 missed: Bath and bedtime')).toBeVisible();
    await expect
      .poll(() => bedtimes(mayaApi, today))
      .toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    await expect(maya.getByText('4 missed')).toHaveCount(0);
  });
});
