#!/usr/bin/env bash
# Rehearses the production upgrade on a throwaway database in the local Supabase cluster:
# the migrations on origin/main (what production runs) → a realistic household → fingerprint →
# every newer migration → proves each pre-existing row is unchanged. Drops the database after.
# Run before applying new migrations to production:  bash scripts/ops/upgrade-rehearsal.sh
# REHEARSAL_SERVER_URL points it at another Postgres server (no database name; the login needs
# CREATEDB), for example postgresql://postgres:postgres@127.0.0.1:55460. Default: the local stack.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=familyos_upgrade_rehearsal
SERVER=${REHEARSAL_SERVER_URL:-postgresql://postgres:postgres@127.0.0.1:55322}
ADMIN=$SERVER/postgres
URL=$SERVER/$DB
q() { psql "$URL" -v ON_ERROR_STOP=1 -qAt "$@"; }

psql "$ADMIN" -qc "drop database if exists $DB" -c "create database $DB"
trap 'psql "$ADMIN" -qc "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT

echo "== production's migrations (as on main)"
for f in $(git ls-tree --name-only origin/main supabase/migrations/ | sort); do
  git show "origin/main:$f" | q -f - >/dev/null && echo "  applied $(basename "$f")"
done
OLD=$(git ls-tree --name-only origin/main supabase/migrations/ | xargs -n1 basename | sort)

echo "== realistic household (like production today)"
q <<'SQL'
-- Owner joined from the owner invite; partner joined from a normal invite.
select app.create_household_with_owner_invite('Our Home', 'America/Los_Angeles', 'owner@example.test',
  decode(md5('owner-token') || md5('owner-token'), 'hex'), now() + interval '2 days');
SQL
HH=$(q -c "select id from app.household limit 1")
OWNER_USER=$(q -c "select gen_random_uuid()")
PARTNER_USER=$(q -c "select gen_random_uuid()")
q -c "select * from app.accept_invite(decode(md5('owner-token') || md5('owner-token'), 'hex'), '$OWNER_USER', 'owner@example.test', 'Alex', 'req-1')" >/dev/null
OWNER=$(q -c "select id from app.member where user_id = '$OWNER_USER'")
q <<SQL
insert into app.invite (household_id, email, role, token_hash, invited_by_member_id, expires_at)
  values ('$HH', 'partner@example.test', 'adult', decode(md5('p') || md5('p'), 'hex'), '$OWNER', now() + interval '2 days');
SQL
q -c "select * from app.accept_invite(decode(md5('p') || md5('p'), 'hex'), '$PARTNER_USER', 'partner@example.test', 'Sam', 'req-2')" >/dev/null
PARTNER=$(q -c "select id from app.member where user_id = '$PARTNER_USER'")
q <<SQL
insert into app.member (household_id, display_name, role) values ('$HH', 'Kid', 'child');
insert into app.work_item (household_id, type, title, status, owner_member_id, created_by_member_id, due_at, priority)
  values ('$HH', 'task', 'Pay daycare', 'ready', '$OWNER', '$OWNER', now() + interval '1 day', 1),
         ('$HH', 'task', 'Fix the door', 'new', null, '$PARTNER', null, null),
         ('$HH', 'task', 'Done thing', 'verified_complete', '$PARTNER', '$PARTNER', now() - interval '1 day', null),
         ('$HH', 'project', 'Bathroom', 'in_progress', '$OWNER', '$OWNER', null, null);
insert into app.comment (household_id, work_item_id, author_member_id, body)
  select '$HH', id, '$OWNER', 'A note' from app.work_item where title = 'Pay daycare';
SQL
q -c "select count(*) from app.audit_event" | sed 's/^/  audit rows: /'

TABLES=$(q -c "select string_agg(format('%I.%I', schemaname, tablename), ' ' order by tablename) from pg_tables where schemaname = 'app'")
fingerprint() {
  for t in $TABLES; do
    # Only the columns that exist before the upgrade, so new columns don't change the hash.
    cols=$(q -c "select string_agg(quote_ident(column_name), ',' order by ordinal_position) from information_schema.columns
                 where table_schema = 'app' and table_name = split_part('$t', '.', 2) and column_name = any(string_to_array('$(cat ${TMPDIR:-/tmp}/cols-$t.txt 2>/dev/null)', ','))")
    [ -z "$cols" ] && continue
    echo "$t $(q -c "select count(*) || ' ' || coalesce(md5(string_agg(r::text, '|' order by r::text)), '') from (select $cols from $t) r")"
  done
}
for t in $TABLES; do
  q -c "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'app' and table_name = split_part('$t', '.', 2)" \
    > "${TMPDIR:-/tmp}/cols-$t.txt"
done
BEFORE=$(fingerprint)

echo "== the redesign's new migrations"
for f in $(ls supabase/migrations/*.sql | sort); do
  b=$(basename "$f"); grep -qx "$b" <<<"$OLD" && continue
  q -f "$f" >/dev/null && echo "  applied $b"
done

AFTER=$(fingerprint)
if [ "$BEFORE" == "$AFTER" ]; then echo "== every pre-existing row unchanged ($(wc -l <<<"$BEFORE") tables)"; else
  echo "!! differences:"; diff <(echo "$BEFORE") <(echo "$AFTER") || true; exit 1; fi

echo "== new defaults on existing rows"
q -c "select role || ': ' || display_name || ' color=' || coalesce(color, 'NULL') || ' version=' || version from app.member order by role"
q -c "select 'members without color: ' || count(*) from app.member where color is null"
q -c "select 'member_state rows: ' || count(*) from app.member_state"
rm -f ${TMPDIR:-/tmp}/cols-*.txt
echo "REHEARSAL PASSED"
