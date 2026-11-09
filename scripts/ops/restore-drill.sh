#!/usr/bin/env bash
# Restore drill (plan M4, gate G4), against the local Supabase stack only:
#   1. make sure there is synthetic data (bootstraps a household if there is none)
#   2. back it up with scripts/ops/backup.mjs, encrypted to a throwaway GPG key
#   3. wipe the database (`supabase db reset`) and restore the backup with restore.mjs,
#      which fails unless every table's row count and checksum match the backup
#   4. re-run the row-level security and service-login tests on the restored database
#
# Destroys local data, so it asks for --yes. CI runs it on every pull request.
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "This wipes your local FamilyOS database. Run again with --yes." >&2
  exit 2
fi

cd "$(dirname "$0")/../.."
container=supabase_db_familyos
admin_url=postgresql://postgres:postgres@127.0.0.1:55322/postgres
# Postgres 17 client tools run inside the database container, which sees the server on 5432.
inside_url=postgresql://postgres:postgres@127.0.0.1:5432/postgres
inside_superuser_url=postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export GNUPGHOME="$work/gnupg"
mkdir -m 700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-gen-key 'FamilyOS restore drill <drill@familyos.test>' default default 1d
gpg --batch --quiet --armor --export drill@familyos.test > "$work/drill-public.asc"

households=$(psql "$admin_url" -Atqc 'select count(*) from app.household')
if [[ "$households" == "0" ]]; then
  echo "drill: no household found; bootstrapping a synthetic one"
  : "${SUPABASE_URL:=http://127.0.0.1:55321}"
  : "${SUPABASE_SECRET_KEY:=$(supabase status -o json | jq -r .SECRET_KEY)}"
  DATABASE_URL="$admin_url" SUPABASE_URL="$SUPABASE_URL" SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" \
    pnpm --silent --filter @familyos/api household:bootstrap --name 'Drill Home' \
    --timezone America/Los_Angeles --owner-email drill-owner@familyos.test --owner-name Drill
  psql "$admin_url" -q -v ON_ERROR_STOP=1 -f scripts/ops/drill-seed.sql
fi

echo "drill: backing up"
BACKUP_DATABASE_URL="$admin_url" BACKUP_PUBLIC_KEY="$work/drill-public.asc" \
  PG_DUMP="docker exec -i $container pg_dump" PG_DUMP_DATABASE_URL="$inside_url" \
  node scripts/ops/backup.mjs "$work"
backup=$(ls "$work"/familyos-*.tar.gpg)

echo "drill: wiping the database"
supabase db reset >/dev/null 2>&1

echo "drill: restoring"
RESTORE_DATABASE_URL="$admin_url" \
  PG_RESTORE="docker exec -i $container pg_restore" PG_RESTORE_DATABASE_URL="$inside_superuser_url" \
  node scripts/ops/restore.mjs "$backup"

echo "drill: checking access control on the restored data"
DATABASE_URL="$admin_url" pnpm --silent exec vitest run \
  packages/db/src/rls.test.ts packages/db/src/logins.test.ts apps/api/src/security.test.ts

echo "drill: passed"
