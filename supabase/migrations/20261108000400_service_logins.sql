-- M4: least-privilege logins for the hosted API and worker (plan M4; ADR-001 §3.4, §7).
--
-- Until now both services connected as `postgres`. In production each gets its own login:
--
-- * familyos_api_login (NOINHERIT): may `set role familyos_api` and nothing else. Outside a
--   request transaction it can't read or write a single app row.
-- * familyos_worker_login: owns the job queue's schema (graphile_worker, created by the worker on
--   first start, hence CREATE on the database) and may `set role familyos_scheduler` without
--   inheriting it, so its app access is always an explicit, household-scoped switch.
-- * familyos_scheduler (NOLOGIN, no BYPASSRLS): what the scheduler acts as. It sees one household
--   per transaction (`app.household_id`), never a member's private view, and has only the grants
--   the scheduler needs. Listing households returns their IDs and timezones only.
--
-- Both logins are created NOLOGIN without a password. The operator enables them with a generated
-- password after migrating (docs/operations/deploy.md); no credential is ever in a migration.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'familyos_scheduler') then
    create role familyos_scheduler nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'familyos_api_login') then
    create role familyos_api_login nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'familyos_worker_login') then
    create role familyos_worker_login nologin inherit nobypassrls;
  end if;
end
$$;

grant familyos_api to familyos_api_login with inherit false, set true;
grant familyos_scheduler to familyos_worker_login with inherit false, set true;
-- The migration login (and tests, which connect as it) can act as the scheduler too.
grant familyos_scheduler to postgres;

-- graphile-worker runs `create schema if not exists graphile_worker` on start, which needs CREATE
-- on the database even when the schema exists. It grants no access to schema `app`.
do $$
begin
  execute format('grant create on database %I to familyos_worker_login', current_database());
end
$$;

-- Supabase's own schemas stay out of reach; app access is only through the roles above.
revoke all on schema public from familyos_api_login, familyos_worker_login;

-- ---------------------------------------------------------------------------------------------
-- Scheduler role: grants and household-scoped policies
-- ---------------------------------------------------------------------------------------------

grant usage on schema app to familyos_scheduler;
grant execute on function app.current_household_id() to familyos_scheduler;

grant select (id, timezone) on app.household to familyos_scheduler;
grant select (id, household_id, status, role) on app.member to familyos_scheduler;
grant select, insert on app.work_item to familyos_scheduler;
grant select, update (materialized_through) on app.recurrence_rule to familyos_scheduler;
grant select on app.occurrence_exception to familyos_scheduler;
grant insert on app.audit_event to familyos_scheduler;

-- Listing households to schedule is the one cross-household read; it exposes IDs and timezones.
create policy household_scheduler_list on app.household
  for select to familyos_scheduler
  using (true);

create policy member_scheduler_access on app.member
  for select to familyos_scheduler
  using (household_id = app.current_household_id());

create policy work_item_scheduler_access on app.work_item
  for all to familyos_scheduler
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

create policy recurrence_rule_scheduler_access on app.recurrence_rule
  for all to familyos_scheduler
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

create policy occurrence_exception_scheduler_read on app.occurrence_exception
  for select to familyos_scheduler
  using (household_id = app.current_household_id());

create policy audit_event_scheduler_insert on app.audit_event
  for insert to familyos_scheduler
  with check (household_id = app.current_household_id());

-- ---------------------------------------------------------------------------------------------
-- Service heartbeat: lets the API's readiness check report whether the worker is running
-- ---------------------------------------------------------------------------------------------

create table app.service_heartbeat (
  service text primary key check (service in ('worker')),
  seen_at timestamptz not null default now()
);

alter table app.service_heartbeat enable row level security;
alter table app.service_heartbeat force row level security;

grant select, insert, update on app.service_heartbeat to familyos_scheduler;

create policy service_heartbeat_scheduler on app.service_heartbeat
  for all to familyos_scheduler
  using (true)
  with check (true);

-- The API reads only the timestamp, through this function, without seeing any household data.
create or replace function app.worker_last_seen() returns timestamptz
  language sql stable security definer
  set search_path = ''
  as $$ select seen_at from app.service_heartbeat where service = 'worker' $$;

revoke all on function app.worker_last_seen() from public;
grant execute on function app.worker_last_seen() to familyos_api;
