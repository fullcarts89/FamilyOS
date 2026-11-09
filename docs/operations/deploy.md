# Private deploy runbook (M4)

**Status:** ready for the founder's setup. Nothing in this runbook has been created or deployed yet. Every step marked **You** needs your own account, payment details or secrets; nobody else does them.
**Decision 3 (2026-11-08):** Railway Hobby for the API and the worker. Supabase as a new project in your existing organisation. The iPhone app goes out through TestFlight. A subdomain you own serves the app and sends sign-in email.

## What runs where

| Piece | Where | Reaches |
|---|---|---|
| Web app and API, one service (`deploy/api.Dockerfile`) | Railway service `api`, on your subdomain | Supabase Postgres as `familyos_api_login`; Supabase Auth |
| Worker (`deploy/worker.Dockerfile`) | Railway service `worker`, no public address | Supabase Postgres as `familyos_worker_login` |
| Database, sign-in and daily backups | Supabase project `familyos` | — |
| Sign-in email | Postmark, through Supabase's custom SMTP setting | — |
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
  - Email OTP: 6 digits, expiring after 600 seconds.
- **Auth → Emails → Magic link template:** paste `supabase/templates/magic-link.html`, with the subject "Your FamilyOS sign-in code".
- **Auth → URL Configuration:** set the Site URL to `https://<app subdomain>`.
- **Connect (top bar) → Session pooler:** copy the connection string for `postgres`. This is the *admin URL* used below. It goes over IPv4, which Railway and GitHub can reach.
- **API keys:** note the project URL, the publishable key and a secret key.

**4. Email sender (You).**
- **Postmark:**
  - Create a Postmark account.
  - Add a sender for `<app subdomain>`. New accounts may need Postmark's approval before they can email outside addresses.
- **DNS:** add Postmark's DKIM and Return-Path records at your DNS provider.
- **Supabase → Auth → SMTP settings:**
  - Host `smtp.postmarkapp.com`, port 587.
  - Username and password: the Postmark server token.
  - Sender: `FamilyOS <signin@<app subdomain>>`.
- **Test:** without custom SMTP, Supabase sends only to organisation members, at about 2 emails an hour. Send a code to each adult's address and check that it arrives.

**5. Backup key (You).** On your laptop:
```bash
gpg --quick-gen-key 'FamilyOS backups <you@example.com>' default default never
```
```bash
gpg --armor --export 'FamilyOS backups' > familyos-backup-public.asc
```
Store the private key and its passphrase in your password manager. Without them the backups can't be read, by anyone, you included.

**6. GitHub settings (You).**
- **Create the environment:** Settings → Environments → New environment `production`. Add yourself as required reviewer if your plan offers it for private repositories.
- **Secrets in `production`:**
  - `MIGRATION_DATABASE_URL`: the admin URL.
  - `BACKUP_DATABASE_URL`: the admin URL.
- **Repository variables:**
  - `BACKUP_PUBLIC_KEY`: the contents of `familyos-backup-public.asc`.
  - `APP_URL`: `https://<app subdomain>`.
  - Leave `PRODUCTION_ENABLED` and `BACKUPS_ENABLED` unset for now.

**7. Database.**
- **Migrate:** set `PRODUCTION_ENABLED` to `true`, then run Actions → *Migrate production* on `main`, typing `migrate production`. It backs up, then applies the migrations. Its readiness step fails until step 9; that is expected the first time.
- **Turn on the two logins** (on your laptop, with `ADMIN_DATABASE_URL` set to the admin URL). Each command prints its connection string once.
  ```bash
  node scripts/ops/enable-login.mjs familyos_api_login
  ```
  ```bash
  node scripts/ops/enable-login.mjs familyos_worker_login
  ```
- **Create your household and owner account:**
  ```bash
  DATABASE_URL="$ADMIN_DATABASE_URL" SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> pnpm --filter @familyos/api household:bootstrap --name "<household>" --timezone <IANA zone> --owner-email <your email> --owner-name <your name>
  ```

**8. Railway (You).**
- **Account and project:** sign up for Hobby, create a project, and connect the GitHub repository.
- **Service `api`:** deploy from `main`. Set these variables:

  | Variable | Value |
  |---|---|
  | `RAILWAY_DOCKERFILE_PATH` | `deploy/api.Dockerfile` |
  | `DATABASE_URL` | the `familyos_api_login` string |
  | `SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
  | `SUPABASE_SECRET_KEY` | the secret key |
  | `INVITE_LINK_BASE` | `https://<app subdomain>/invite` |
  | `EXPO_PUBLIC_SUPABASE_URL` | the project URL (build time) |
  | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (build time) |

  Then, in the service settings:
  - Healthcheck path `/api/health`.
  - Restart policy "On failure".
  - Turn on "Wait for CI".
  - Add your subdomain as a custom domain, and create the CNAME Railway shows.
- **Service `worker`:** deploy from the same repository. Set these variables:

  | Variable | Value |
  |---|---|
  | `RAILWAY_DOCKERFILE_PATH` | `deploy/worker.Dockerfile` |
  | `DATABASE_URL` | the `familyos_worker_login` string |

  Then, in the service settings:
  - Restart policy "On failure".
  - Turn on "Wait for CI".
  - Give it no public domain.

Railway's config-file format is deprecated and stops being read on 2026-12-01, so these settings live in the dashboard, not in a file.

**9. First deploy (needs your approval), then checks.**
- **Readiness:** `https://<app subdomain>/api/health/ready` returns `"status":"ok"`, which means the database answered through the API's own login and the worker reported in during the last 30 minutes.
- **Sign in:** sign in on the web app.
- **Invite the second adult:** use Household → Invite. The second adult accepts from the link and signs in.
- **Turn on daily backups:** set `BACKUPS_ENABLED` to `true`, then run *Production backup* once by hand.

**10. Gate G4 evidence (You, with me).**
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

**11. iPhone (You).** In `apps/mobile`:
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
- **Is the worker running?** Check `/api/health/ready`: `"worker":"stale"` means no heartbeat for 30 minutes. Then look at the worker's logs in Railway.

## Cost

| Item | Cost |
|---|---|
| Railway Hobby (two small services) | about $5/month, including $5 of usage |
| Supabase project in an existing Pro organisation | about $10/month of compute, if the org's included $10 credit is already used |
| Postmark | free tier (100 emails/month) is enough for sign-in codes |
| Apple Developer | $99/year, if you don't already have it |
| GitHub Actions (private repository) | within the free minutes and storage |

Check current prices before signing up.
