# Private deploy runbook (M4)

**Status:** in progress. Steps 1–3 are done; the database is not migrated and nothing is deployed yet. Every step marked **You** needs your own account, payment details or secrets; nobody else does them.
**Decision 3 (2026-11-08):** Railway Hobby for the API and the worker. Supabase as a new project in your existing organisation. The iPhone app goes out through TestFlight. A subdomain you own serves the app.
**Decision 4 (2026-11-11):** sign-in is email and password, not an emailed code, so there is no email provider. The owner's password is set by the household bootstrap; the second adult chooses theirs when opening the invite link. A forgotten password is reset by the operator command in Everyday operations.
**Decision 5 (2026-11-11):** first get a working web app with the least setup: the setup commands run in GitHub Actions, the app starts on Railway's own address, and the custom domain, second backup copy and iPhone app come later.

## What runs where

| Piece | Where | Reaches |
|---|---|---|
| Web app and API, one service (`deploy/api.Dockerfile`) | Railway service `api`, on your subdomain | Supabase Postgres as `familyos_api_login`; Supabase Auth |
| Worker (`deploy/worker.Dockerfile`) | Railway service `worker`, no public address | Supabase Postgres as `familyos_worker_login` |
| Database, sign-in and daily backups | Supabase project `familyos` | — |
| Second backup copy (encrypted) | GitHub Actions artifacts, kept 30 days | — |
| iPhone app | TestFlight, built by EAS | The same API and Supabase |

The browser loads the app and calls the API at `/api` on the same address, so CORS is not needed. Logs carry IDs, status codes and timings only, never household content; Railway's log view is the error report.

### Database logins

Each service gets its own login, and each login can do only what that service needs. `supabase/migrations/20261108000400_service_logins.sql` creates them with login turned off; `packages/db/src/logins.test.ts` checks what each can reach.

- **`familyos_api_login`** can do nothing on its own. Each request switches to `familyos_api`, which row-level security limits to the signed-in member's household.
- **`familyos_worker_login`** owns only the job queue's own schema. For household work it switches to `familyos_scheduler`, which sees one household per transaction and can only add occurrences.
- **`postgres`** is used only for migrations, backups and the one-off setup commands, from GitHub Actions or your laptop. It never goes into Railway.

## One-time setup

Do the steps in order. Every value you create goes into your password manager and the service that needs it, never into the repository or a chat.

**1. Confirm three things (You).**
- **Supabase plan:** the existing organisation must be on Pro. Free projects pause after a week without use and have no backups.
- **Organisation members:** everyone in that organisation can open the FamilyOS database. If anyone besides you is a member, create a separate organisation instead.
- **Apple Developer:** you need a membership ($99/year) for TestFlight.

**2. Merge (needs your approval).** Merge PRs #2–#6 into `main` in order.

**3. Supabase project (You).**
- **Create the project:**
  - Name it `familyos`.
  - Pick the region nearest home.
  - Generate a database password and save it.
- **Auth → Sign In / Providers:**
  - Turn off "Allow new users to sign up". Accounts are created only by the household bootstrap and by invites.
  - Leave the Email provider on: it carries password sign-in.
  - Email: set "Minimum password length" to 12, and turn on "Prevent use of leaked passwords".
- **Auth → URL Configuration:** set the Site URL to `https://<app subdomain>`.
- **Connect (top bar) → Session pooler:** copy the connection string for `postgres`. This is the *admin URL* used below. It goes over IPv4, which Railway and GitHub can reach.
- **API keys:** note the project URL, the publishable key and a secret key.

**4. Email sender: not needed.** Sign-in is by password (decision 4), so Supabase sends no email and there is no custom SMTP to set up.

**5. Backup key: later.** Until it exists, *Migrate production* skips its own backup and relies on Supabase's daily backups (7 days on Pro). To add the second, encrypted copy, see "Later" below.

**6. GitHub settings (You).**
- **Create the environment:** Settings → Environments → New environment `production`.
- **Secrets in `production`:**
  - `MIGRATION_DATABASE_URL`: the admin URL.
  - `BACKUP_DATABASE_URL`: the admin URL.
  - `SUPABASE_SECRET_KEY`: the secret key.
  - `API_DB_PASSWORD` and `WORKER_DB_PASSWORD`: two new passwords from your password manager, 16 or more characters each. They become the two services' database passwords.
  - `OWNER_PASSWORD`: the password you will sign in with, at least 12 characters. Delete this secret after step 7.
- **Repository variables:** set `PRODUCTION_ENABLED` to `true`. Leave `APP_URL`, `BACKUP_PUBLIC_KEY` and `BACKUPS_ENABLED` unset for now.

**7. Database (in GitHub Actions, no laptop needed).**
- **Migrate:** run Actions → *Migrate production* on `main`, typing `migrate production`. A merge that adds migrations runs it automatically.
- **Or, without `OWNER_PASSWORD`:** create the household with a one-time link for its owner, who opens it and chooses their own password, like every other adult:
  ```bash
  DATABASE_URL="$ADMIN_DATABASE_URL" pnpm --filter @familyos/api household:invite-owner --name "<household>" --timezone <IANA zone> --owner-email <your email> --link-base https://<app address>/invite
  ```
- **Set up:** run Actions → *Production setup* on `main`, with the household name, its time zone, your email and your first name, typing `set up production`. It turns on the API's and the worker's database logins with `API_DB_PASSWORD` and `WORKER_DB_PASSWORD`, then creates the household and your account with `OWNER_PASSWORD`. Running it again changes nothing.

**8. Railway (You).**
- **Account and project:** sign up for Hobby, create a project from the GitHub repository, and add a second service from the same repository. Name them `api` and `worker`.
- **Service `api`:** in Variables → Raw Editor, paste the following. Fill in only the two secrets.

  ```
  RAILWAY_DOCKERFILE_PATH=deploy/api.Dockerfile
  DATABASE_URL=postgresql://familyos_api_login.<ref>@<pooler host>:5432/postgres
  DATABASE_PASSWORD=<API_DB_PASSWORD>
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
  SUPABASE_SECRET_KEY=<the secret key>
  EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the publishable key>
  ```

  The pooler host is the one in the admin URL, for example `aws-0-us-west-2.pooler.supabase.com`. Invite links point at the service's own address unless `INVITE_LINK_BASE` is set.

  Then, in the service settings:
  - Networking → Generate Domain.
  - Healthcheck path `/api/health`.
  - Restart policy "On failure".
  - Turn on "Wait for CI".
- **Service `worker`:** paste the following.

  ```
  RAILWAY_DOCKERFILE_PATH=deploy/worker.Dockerfile
  DATABASE_URL=postgresql://familyos_worker_login.<ref>@<pooler host>:5432/postgres
  DATABASE_PASSWORD=<WORKER_DB_PASSWORD>
  ```

  Then, in the service settings:
  - Restart policy "On failure".
  - Turn on "Wait for CI".
  - Give it no public domain.
- **GitHub:** set the repository variable `APP_URL` to `https://<the generated domain>`, so *Migrate production* checks readiness again.

Railway's config-file format is deprecated and stops being read on 2026-12-01, so these settings live in the dashboard, not in a file.

**9. First deploy (needs your approval), then checks.**
- **Readiness:** `https://<app address>/api/health/ready` returns `"status":"ok"`, which means the database answered through the API's own login and the worker reported in during the last 30 minutes.
- **Sign in:** sign in on the web app with your email and password.
- **Invite the second adult:** use Household → Invite with their email, and send them the link it shows. They open it, enter their name, that email and a new password, and are signed in.
- **On your iPhone:** open the address in Safari, then Share → Add to Home Screen.

## Later

These make the deploy sturdier but aren't needed to use FamilyOS.

- **Custom address:** add `familyos.fullcarts.org` as a custom domain on the `api` service, create the CNAME Railway shows in Squarespace (Domains → fullcarts.org → DNS), then set `APP_URL` to it.
- **Second backup copy:** create the backup key below, set `BACKUP_PUBLIC_KEY`, set `BACKUPS_ENABLED` to `true`, then run *Production backup* once by hand.

**Backup key (You).** On your laptop:
```bash
gpg --quick-gen-key 'FamilyOS backups <you@example.com>' default default never
```
```bash
gpg --armor --export 'FamilyOS backups' > familyos-backup-public.asc
```
Store the private key and its passphrase in your password manager. Without them the backups can't be read, by anyone, you included. `BACKUP_PUBLIC_KEY` is the contents of `familyos-backup-public.asc`.

**10. Gate G4 evidence (You, with me), after the backup key.**
- **Restore test:** download the backup artifact. On your laptop, at the same commit as production, run:
  ```bash
  supabase db reset
  ```
  ```bash
  RESTORE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres PG_RESTORE="docker exec -i supabase_db_familyos pg_restore" PG_RESTORE_DATABASE_URL=postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres node scripts/ops/restore.mjs familyos-<stamp>.tar.gpg
  ```
  It must print `restore verified`. That proves every row and every checksum matches, and it keeps your real data on your own machine. Afterwards, wipe the local copy:
  ```bash
  supabase db reset
  ```
- **Rollback rehearsal:**
  1. In Railway, open `api` → Deployments and choose **Redeploy** on the previous deployment.
  2. Check that `/api/health` shows the older `version`.
  3. Redeploy the latest one.
- **Baseline questions:** both adults answer the five-minute questions (contract §7). Keep the answers out of the repository.

**11. iPhone app (You), optional: needs an Apple Developer membership.** In `apps/mobile`:
- **Set up EAS:**
  ```bash
  npx eas-cli login
  ```
  ```bash
  npx eas-cli init
  ```
  The second command records the EAS project ID in `app.json`; commit that change.
- **Add the EAS `production` environment variables:**
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `EXPO_PUBLIC_API_URL=https://<app subdomain>/api`. It must be a full URL; the app refuses a relative one.
- **Build and submit:**
  ```bash
  npx eas-cli build -p ios --profile production
  ```
  ```bash
  npx eas-cli submit -p ios --profile production
  ```
- **Install:** add both adults as internal testers in App Store Connect.

## Everyday operations

- **Deploy:** merge to `main`. CI runs, and a merge that adds migrations also runs *Migrate production*, which backs up first. Railway waits for those checks, then rebuilds both services.
- **Write migrations that keep the previous release working.** Add columns and tables; rename or drop only in a later release. A code rollback then never needs a schema rollback.
- **Roll back:** in Railway, redeploy the previous deployment of `api`, `worker` or both. If a migration itself was wrong, restore from Supabase's daily backup (Dashboard → Database → Backups) or from the encrypted dump, then fix forward.
- **Backups:** Supabase keeps 7 daily backups. GitHub keeps 30 days of encrypted dumps, plus 90 days of pre-migration dumps. CI runs the restore drill (`scripts/ops/restore-drill.sh`) on every pull request.
- **Rotate a database password:** run `enable-login.mjs` again for that login, then update `DATABASE_URL` on that Railway service.
- **Rotate the Supabase secret key:** create a new key in Supabase, update `SUPABASE_SECRET_KEY` on `api`, then revoke the old key.
- **Reset a forgotten password** (on your laptop, with the admin URL and the secret key). It asks for the new password without showing it.
  ```bash
  DATABASE_URL="$ADMIN_DATABASE_URL" SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> pnpm --filter @familyos/api household:set-password --email <their email>
  ```
- **Is the worker running?** Check `/api/health/ready`: `"worker":"stale"` means no heartbeat for 30 minutes. Then look at the worker's logs in Railway.

## Cost

| Item | Cost |
|---|---|
| Railway Hobby (two small services) | about $5/month, including $5 of usage |
| Supabase project in an existing Pro organisation | about $10/month of compute, if the org's included $10 credit is already used |
| Apple Developer | $99/year, if you don't already have it |
| GitHub Actions (private repository) | within the free minutes and storage |

Check current prices before signing up.
