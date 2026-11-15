# E2E journeys (Family Rhythm)

Playwright journeys through the real app against a real local stack: the Supabase stack
(Postgres + Auth on ports 553xx), the API serving the web export under `/api` exactly like
production (`apps/api/src/web.ts`), and Chromium at **desktop 1440×900** and **phone 390×844**.

## Run

```bash
pnpm stack:up   # once: the local Supabase stack
pnpm e2e
```

`pnpm e2e` needs the stack's two keys. It reads them from the environment
(`SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`), else from the repository's `.env`
(`.env.example` explains it), else from `supabase status`. Nothing else to set up: the defaults
point at `127.0.0.1:55321` (Auth) and `127.0.0.1:55322` (Postgres), and the suite refuses to run
against anything that isn't on this machine.

What one run does (`support/global-setup.ts`):

1. Checks the stack answers; removes accounts a previous run left (`e2e-…@familyos.test`) and
   the households they were in.
2. Resets the demo household with `pnpm demo:seed` (idempotent: it replaces only the Rivera
   household, found by name and Maya's or Theo's account).
3. Builds the web app with `expo export --platform web` (`EXPO_PUBLIC_API_URL=/api`, the local
   Supabase URL and publishable key) into `e2e/.cache/web-dist`.
4. Starts the API on port **8799** with `WEB_DIST_DIR`, a generated `CALENDAR_ENCRYPTION_KEY`,
   the local JWKS URL and invite links pointing at itself. Its log is `e2e/.cache/api.log`.
5. Every test reseeds the demo household first, so journeys never depend on each other (one
   worker, in order). Each journey opens fresh browser contexts, signs in on the real sign-in
   screen and fails on any error-level console message or uncaught page error.
6. Afterwards: stops the server it started (only that process group), removes its accounts and
   reseeds the demo household for local development.

Note: the stack is shared. A run replaces the Rivera household many times, so anyone else signed
in to the demo on the same stack will be signed out of a household that no longer exists and
needs to reload.

Useful variations (arguments after `pnpm e2e` go to `playwright test`):

```bash
pnpm e2e --project desktop                 # or phone
pnpm e2e journeys/tasks.spec.ts -g undo    # one journey
pnpm e2e --trace on                        # traces are off by default
E2E_SKIP_BUILD=1 pnpm e2e                  # reuse the last web export (app unchanged)
E2E_REUSE_SERVER=1 pnpm e2e                # use a server you already run on 8799 (left running)
E2E_PORT=8800 pnpm e2e                     # another port
```

## Recordings (acceptance GIFs)

```bash
E2E_RECORD=1 pnpm e2e
```

records video of every context and cuts the marked acceptance interactions into GIFs with
ffmpeg (`FFMPEG=/path/to/ffmpeg` to override), written to `e2e/artifacts/` (gitignored), one per
project:

| GIF | Journey |
|---|---|
| `complete-a-task-{desktop,phone}.gif` | tasks.spec.ts: complete, then undo |
| `complete-pet-care-routine-*.gif` | routines.spec.ts: Biscuit's flea meds |
| `take-off-partners-plate-*.gif` | tasks.spec.ts: "Taken off Theo's plate" |
| `resolve-childcare-conflict-*.gif` | rhythm.spec.ts: "Ask Theo to cover", "Pickup covered" |
| `complete-project-milestone-*.gif` | tasks.spec.ts: "Halfway through Hall bathroom renovation" |
| `return-home-after-plan-changed-*.gif` | return-home.spec.ts: "Since you last looked" |
| `weekly-reset-full-session-*.gif` | planning.spec.ts: opening to “Your week has a plan” |
| `decision-resolved-together-*.gif` | planning.spec.ts: Theo's vote settles it |
| `check-off-groceries-*.gif` | planning.spec.ts: check off, change your mind |
| `add-a-contact-*.gif` | planning.spec.ts: the electrician, added |
| `link-a-contact-to-a-task-*.gif` | planning.spec.ts: the plumber, linked from the task |

In CI, run the **E2E** workflow by hand with *Record* on; the GIFs are an artifact.

## Journeys

| File | What it proves (UI, then re-read through the API or a reload) |
|---|---|
| `sign-in.spec.ts` | redirect to sign-in, wrong password message, sign in as Maya, session survives reload |
| `capture.spec.ts` | "Call the plumber tomorrow @theo #reno": preview, saved as Theo's, due tomorrow, a step of the renovation |
| `tasks.spec.ts` | complete + undo restores status/owner/due; "I'll take it"; take it off Theo's plate; project halfway milestone |
| `routines.spec.ts` | Biscuit's monthly flea meds done, next turn the 1st of the following month |
| `rhythm.spec.ts` | Thursday's pickup clash resolved from Today ("Ask Theo to cover") and covered on the Week; a weekly event with a pickup handoff, this week and next |
| `household.spec.ts` | add a pet, then its monthly care routine; invite an adult, claim with a password in a fresh browser, sign out and in; the link works once |
| `isolation.spec.ts` | a second household's owner sees nothing of the Riveras in the app; their API calls get 404 |
| `return-home.spec.ts` | Theo completes something on his device; Maya returns to Today and reads it in "Since you last looked" |
| `planning.spec.ts` | the full Weekly Reset (loose ends kept, June's week covered with the board updating, dinners, the commit, open decisions marked); a decision settled by Theo's vote, acknowledged once; groceries checked, unchecked, seen on Theo's phone, cleared; a contact added, searched and shown with its linked task; a contact linked from a task (picked, then a new one added inline), with Call and Text on the task; the Monarch CSV import (`fixtures/monarch-budget.csv`) with a transactions export refused first |

The journeys hold under any time of day: they never depend on what "now" is beyond what the seed
makes relative to today. One exception is skipped with a reason: Thursday after 5:30pm, when
that day's pickup clash has already passed.

## Hooks and findings for the app

Selectors are roles, labels and visible text; there are no test IDs. The findings from the first
run (checked/selected state not exposed on web, the routine card stuck after an early Done,
owned project steps missing from the owner's list, the error on another household's item) are
fixed; `routines.spec.ts` now asserts the routine card moves on to the next turn.
