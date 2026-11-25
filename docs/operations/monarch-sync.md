# Monarch budget sync

**Decided 2026-11-25 by the owner:** budgets only; sync at 7am, 12pm, 6pm and 9pm household time;
keep every category group (Galveston included); both adults can change plans; offer "this month"
and "this month and after".

FamilyOS's servers never connect to Monarch: Monarch's terms forbid automated access by other
apps. Instead a **scheduled Claude task**, using the owner's own Monarch connector in Claude (the
official one, `https://api.monarch.com/mcp`), reads the budget and posts it to FamilyOS with a
**sync key**, and takes the plans the adults set in FamilyOS to Monarch.

```
Monarch ──(owner's Monarch connector)──▶ scheduled Claude task ──(sync key)──▶ FamilyOS API
        ◀── SetBudgetAmount ──────────────          ◀── waiting plan changes ──
```

## What crosses, and what doesn't

- **Into FamilyOS:** for each month, every budget category Monarch reports: Monarch's category id,
  name, group, type (expense, income or transfer), planned and actual. Nothing else: the API refuses
  a body with any other field (`apps/api/src/routes/monarch-sync.ts`).
- **Into Monarch:** only a category's planned amount for a month (optionally "and after"), and only
  one an adult set in FamilyOS. The task uses Monarch's `GetCategories`, `GetBudget` and
  `SetBudgetAmount`, nothing else.
- **Never:** transactions, merchants, accounts, balances, goals.

Budgets stay adults-only. The page shows spending only (income on its own line, transfers left
out).

## The sync key

- An adult makes it on **Budgets → Set up Monarch sync → Make a key**. It is shown once; FamilyOS
  keeps its SHA-256 hash and last four characters.
- It acts as the adult who made it. If that member stops being an active owner or adult, the key
  stops working. **Replace the key** stops the old one at once; **Turn off** stops it and leaves the
  budgets as they are.
- It is saved in Claude as a **network secret** for the FamilyOS host on the cloud environment the
  task runs in, entered in Claude's secure form (never pasted into a chat). The proxy adds it to
  requests to that host, so the task never sees it.

## Setting it up (after the release is deployed)

1. **Monarch connector:** connected on claude.ai (Settings → Connectors), with Write allowed so the
   task can set plans. Done 2026-11-25.
2. **Key:** Budgets → **Set up Monarch sync** → **Make a key** → **Copy the key**.
3. **Secret:** in a Claude Code session, ask Claude to set up the Monarch sync. It asks for the key
   with the secure credential form for the FamilyOS host (header `Authorization`, prefix `Bearer`).
4. **Scheduled task:** Claude creates it, firing a fresh session at 7am, 12pm, 6pm and 9pm in the
   household's time zone (`GET /api/sync/monarch/run` returns it), with the Monarch connector and
   the prompt below. Times are moved a few minutes earlier than the hour so they don't queue behind
   everyone else's.
5. **Check:** the Budgets page shows "Synced …" after the first run.

## The scheduled task's prompt

Replace `<APP_ADDRESS>` with the app's address (the `APP_URL` repository variable, without
`https://`).

```text
You are the FamilyOS ↔ Monarch budget sync for one household. Do one run, then stop.

FamilyOS API: https://<APP_ADDRESS>/api. Call it with curl. The network proxy adds the household's
sync key to every request to that host, so never ask for a key, print one, or add an Authorization
header yourself. If any FamilyOS request returns 401, stop and say only: "The sync key was replaced
or turned off."

Monarch: use only the Monarch tools GetCategories, GetBudget and SetBudgetAmount, always with intent
"budgeting". Never call any other Monarch tool. Call SetBudgetAmount only in step 2d.

1. GET /sync/monarch/run. It returns {timeZone, months, changes}.
2. If there are changes, call GetCategories once, then for each change in order:
   a. Call GetBudget with start_date and end_date both the change's month. Monarch's planned amount
      for the category is budget_amount on the line whose category is the change's category (0 if
      there is no such line). Check the change's monarchCategoryId is that category's id in
      GetCategories; if not, report failed with reason "Category not found in Monarch".
   b. If the planned amount already equals toAmount, report saved.
   c. Otherwise, if it differs from fromAmount (treat null as 0), report conflict with
      monarchAmount set to the planned amount. Do not change anything in Monarch.
   d. Otherwise call SetBudgetAmount with category_id = monarchCategoryId, month = the change's
      month, amount = toAmount and apply_to_future = applyToFuture. Then call GetBudget for the month
      again: if the planned amount is now toAmount, report saved; if not, or if SetBudgetAmount
      returned an error, report failed with a reason of at most 200 characters that names no
      amounts.
   Report with POST /sync/monarch/changes/{id} and a JSON body of exactly one of:
   {"outcome":"saved"}, {"outcome":"conflict","monarchAmount":<number or null>},
   {"outcome":"failed","reason":"<short reason>"}. A 409 answer means an adult cancelled the change
   meanwhile: go on to the next one.
3. For each month in months: call GetBudget with start_date and end_date both that month and
   include_actuals true. Build one entry per budget line that is a category (skip group lines,
   flex lines and lines with no category):
   {"id": the category's id from GetCategories (call it once per run, matching by category name and
   group), "name": category, "group": category_group, "type": category_type, "budgeted":
   budget_amount, "actual": actual_amount}. Skip a line whose id you can't find. Then
   PUT /sync/monarch/budgets/{month} with {"categories": [...]} and nothing else in the body: no
   transactions, accounts, merchants, notes or other fields.
4. Finish with one line: how many months were posted and how many changes were saved, conflicted
   or failed. Never write amounts, category names, account names or any other Monarch data in that
   line.
```

## Troubleshooting

- **"Waiting for Monarch" never clears:** the task isn't running or its key was replaced. Check the
  scheduled task's last run in Claude; a 401 there means make a new key and update the secret.
- **"Monarch's plan changed … before yours went":** someone changed the plan in Monarch after the
  plan was set in FamilyOS. Nothing was overwritten; choose Send or Keep.
- **"Monarch didn't take the new plan":** Monarch refused it three times (the reason is shown).
  Usually the Monarch connector needs a fresh sign-in, or Write isn't allowed on it.
- **Turn it off:** Budgets → the sync button → **Turn off**, and pause or delete the scheduled task.
  A CSV import still works.
