# Switch-over: Family Rhythm to production

Only after the founder approves the integrated redesign. Production keeps running the current
app until step 4. Every step is reversible except applying migrations, which are additive and
rehearsed (step 2), so the previous release still works on the new schema.

## 0. Before

- `redesign/family-rhythm` is green: `pnpm typecheck lint format:check licenses:check test` and
  `pnpm e2e` (desktop and phone).
- The founder has reviewed the screens and recordings and approved the switch-over.

## 1. Merge

Open the PR `redesign/family-rhythm` → `main`, CI green, merge. **This deploys:** Railway builds
`main` automatically. So do steps 2–3 first, then merge.

## 2. Rehearse the migrations

`bash scripts/ops/upgrade-rehearsal.sh` must end with `REHEARSAL PASSED`: production's schema
plus a realistic household, every pre-existing row unchanged after the new migrations.

## 3. Prepare production (before merging)

1. **Migrations:** apply the new migrations to the production database through the Supabase
   API, the route the founder approved on 2026-11-14. Each is recorded in
   `supabase_migrations.schema_migrations` exactly as `supabase db push` would, so the
   *Migrate production* workflow stays in sync. Check with `list_migrations` and the security
   advisor.
2. **Railway variables on the app service** (secrets go straight from a private file to
   Railway, never displayed):
   - `CALENDAR_ENCRYPTION_KEY`: a new random 32-byte key (base64). Losing it means re-adding
     calendar addresses; it isn't needed for anything else.
   - `WORKER_DATABASE_URL` and `WORKER_DATABASE_PASSWORD`: the worker's own login, so
     `deploy/start.mjs` runs the worker inside the app service (routines, calendar sync,
     notifications). The worker login was enabled at first setup.
3. The old empty `worker` service in Railway is unused and can be deleted later.

## 4. Deploy and verify

1. Merge the PR. Railway builds and deploys.
2. `/api/health/ready` shows `"status":"ok"` and `"worker":"ok"` within about 10 minutes.
3. Founder signs in on phone and desktop: Today, Week, Tasks, Weekly Reset, Household load with
   the real household; pets and colors appear; existing tasks and routines are intact.
4. Add the first calendar subscription and see it sync.

## Roll back

- **Code:** in Railway, redeploy the previous deployment. The schema change is additive, so the
  previous release runs on it unchanged.
- **Data:** Supabase daily backups (Pro). Nothing in this switch-over deletes data.

## After

- The iPhone app and widget: `docs/operations/iphone.md` (founder steps with Expo and Apple).
- Monarch budgets: export the budget CSV from Monarch, then Budgets → Import.
