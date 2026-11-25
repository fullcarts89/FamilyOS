import { Api, addDays, type Occurrence } from '../support/api';
import { THEO } from '../support/env';
import { expect, test, toast } from '../support/fixtures';

// Who's in town (docs/plan/whos-in-town.md): Maya marks Theo away; his task due while he's away
// is suggested and moves to her only once she says so, his daycare drop-offs are hers on those
// days, and Theo's own Today says he's away. Then a visitor, a week ahead.

const TASK = 'Return the library books';

test.describe('Who’s in town', () => {
  test('marking Theo away hands his things to Maya once she confirms', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const tomorrow = addDays(today, 1);
    const theo = await mayaApi.member('Theo');
    // Something of Theo's due tomorrow, a day he'll be away.
    const created = await mayaApi.request<{ item: { id: string } }>(
      `/households/${mayaApi.householdId}/work-items`,
      {
        method: 'POST',
        body: { title: TASK, ownerMemberId: theo.id, dueOn: tomorrow, inbox: false },
      },
    );
    expect(created.status).toBe(201);

    // Household → Away and visiting → Mark someone away: Theo, from tomorrow (the default) for
    // three days, Maya covering (the only other adult).
    await app.nav(maya, 'Household');
    await maya.getByRole('link', { name: 'Away and visiting' }).click();
    await expect(maya.getByRole('heading', { name: 'Who’s in town' })).toBeVisible();
    await expect(maya.getByText('Everyone’s home.')).toBeVisible();
    await maya.getByRole('button', { name: 'Mark someone away' }).click();
    const sheet = maya.getByRole('dialog', { name: 'Mark someone away' });
    await sheet.getByRole('button', { name: 'Theo', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Me', exact: true }).last()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sheet.getByRole('button', { name: 'Mark away' }).click();

    // The review: Theo's task, ticked; nothing has moved yet.
    await expect(sheet.getByText('Hand these to you?')).toBeVisible();
    await expect(sheet.getByRole('checkbox', { name: `Hand over “${TASK}”` })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await mayaApi.item(TASK)).ownerMemberId).toBe(theo.id);
    await sheet.getByRole('button', { name: 'Hand them over' }).click();
    await expect(toast(maya, /(thing goes|things go) to you while Theo’s away\./)).toBeVisible();
    await expect.poll(async () => (await mayaApi.item(TASK)).ownerMemberId).toBe(mayaApi.memberId);

    // Theo's weekday drop-off tomorrow is Maya's, on read: nothing about the series changed.
    const dropOff = async (): Promise<Occurrence | undefined> =>
      (await mayaApi.occurrences(tomorrow, tomorrow)).find((o) => o.careAction === 'drop_off');
    const drop = await dropOff();
    if (drop) {
      expect(drop.memberIds).toContain(mayaApi.memberId);
      expect(drop.memberIds).not.toContain(theo.id);
    }

    // The screen lists it; Today says so.
    await expect(
      maya.getByRole('button', { name: /^Theo’s away from tomorrow, back .* · You cover$/ }),
    ).toBeVisible();
    await app.nav(maya, 'Today');
    await expect(
      maya
        .getByRole('link', { name: /Theo’s away from tomorrow, back / })
        .filter({ visible: true }),
    ).toBeVisible();
  });

  test('Theo sees he’s away; a visitor shows a week ahead; removing gives things back', async ({
    app,
    maya,
    mayaApi,
  }) => {
    const today = await mayaApi.today();
    const theoApi = await Api.as(THEO.email);
    const theo = await mayaApi.member('Theo');
    const created = await mayaApi.request<{ item: { id: string } }>(
      `/households/${mayaApi.householdId}/work-items`,
      {
        method: 'POST',
        body: { title: TASK, ownerMemberId: theo.id, dueOn: addDays(today, 2), inbox: false },
      },
    );
    expect(created.status).toBe(201);
    const away = await theoApi.request<{
      awayPeriod: { id: string; version: number };
      suggestions: { item: { id: string; version: number } }[];
    }>(`/households/${theoApi.householdId}/away-periods`, {
      method: 'POST',
      body: { memberId: theo.id, startsOn: addDays(today, 1), endsOn: addDays(today, 3) },
    });
    expect(away.status).toBe(201);
    // Theo hands it over himself before leaving.
    const handed = await theoApi.request(
      `/households/${theoApi.householdId}/away-periods/${away.body.awayPeriod.id}/handover`,
      {
        method: 'POST',
        body: {
          move: away.body.suggestions.map((s) => ({
            id: s.item.id,
            expectedVersion: s.item.version,
          })),
        },
      },
    );
    expect(handed.status).toBe(200);
    expect((await mayaApi.item(TASK)).ownerMemberId).toBe(mayaApi.memberId);

    // Theo's own Today.
    const theoPage = await app.as(THEO.email);
    await expect(
      theoPage
        .getByRole('link', { name: /You’re away from tomorrow, back / })
        .filter({ visible: true }),
    ).toBeVisible();

    // Maya adds Grandma, arriving in three days: Today shows her coming.
    await maya.goto('/in-town');
    await maya.getByRole('button', { name: 'Add a visitor' }).click();
    const sheet = maya.getByRole('dialog', { name: 'Add a visitor' });
    await sheet.getByRole('textbox', { name: 'Who’s coming' }).fill('Grandma');
    // The default arrival is a week out; three days earlier puts it in three days.
    for (let i = 0; i < 4; i++) {
      await sheet.getByRole('button', { name: 'Arriving: a day earlier' }).click();
    }
    await sheet.getByRole('textbox', { name: 'A note (optional)' }).fill('Guest room');
    await sheet.getByRole('button', { name: 'Add visitor' }).click();
    await expect(toast(maya, 'Grandma is on the calendar')).toBeVisible();
    await expect(maya.getByText(/Guest room/)).toBeVisible();
    await app.nav(maya, 'Today');
    await expect(
      maya.getByRole('link', { name: /Grandma arrives / }).filter({ visible: true }),
    ).toBeVisible();

    // Removing Theo's away dates gives back what's still ahead.
    await maya.goto('/in-town');
    await maya.getByRole('button', { name: /^Theo’s away/ }).click();
    const edit = maya.getByRole('dialog', { name: 'Away' });
    await edit.getByRole('button', { name: 'Remove' }).click();
    await edit.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await expect(toast(maya, 'Removed')).toBeVisible();
    await expect.poll(async () => (await mayaApi.item(TASK)).ownerMemberId).toBe(theo.id);
  });
});
