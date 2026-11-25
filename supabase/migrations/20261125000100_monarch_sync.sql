-- Monarch budget sync (owner decisions 2026-11-25). A scheduled Claude task, using the owner's
-- Monarch connector, reads the household's budget from Monarch and posts it here with a sync key,
-- and takes the plans the adults set in FamilyOS to Monarch, reporting back what happened.
-- FamilyOS's own servers never connect to Monarch (Monarch's terms forbid automated access by
-- other apps). Still category-level numbers only: never transactions, merchants or accounts.
--
-- * budget_snapshot gains the category's type (only expenses are spending; income and transfers
--   are shown apart or not at all), Monarch's category id (to send a plan back to the right
--   category) and where the row came from (a CSV import or the sync).
-- * monarch_sync: the household's sync key, stored only as its SHA-256 hash, with the last four
--   characters to tell keys apart. One live key per household. A key acts as the adult who made
--   it: if they stop being an active owner or adult, it stops working. The API role can write a
--   key's hash but never read it back; app.monarch_sync_for_key finds a key by its hash.
-- * budget_plan_change: a plan an adult set in FamilyOS for one category and month, on its way to
--   Monarch. It waits until a sync takes it, then is saved (Monarch confirmed the new amount),
--   conflict (Monarch's plan had changed since it was made; nothing was overwritten), failed
--   (Monarch refused it three times) or cancelled (by an adult). One waiting change per category
--   and month: a new one replaces it.

alter table app.budget_snapshot
  add column category_type text not null default 'expense'
    check (category_type in ('expense', 'income', 'transfer')),
  add column monarch_category_id text check (monarch_category_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  add column source text not null default 'csv' check (source in ('csv', 'monarch'));

-- The sync replaces a month and records a plan Monarch confirmed.
grant update (budgeted) on app.budget_snapshot to familyos_api;

create table app.monarch_sync (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  key_hash bytea not null unique check (octet_length(key_hash) = 32),
  key_hint text not null check (key_hint ~ '^[0-9A-Za-z_-]{4}$'),
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- The last time the sync posted a budget.
  last_synced_at timestamptz,
  revoked_at timestamptz,
  revoked_by_member_id uuid,
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  foreign key (household_id, revoked_by_member_id) references app.member (household_id, id)
);

create unique index monarch_sync_one_live on app.monarch_sync (household_id)
  where revoked_at is null;

-- Every column but the hash can be read; only the hash and who made it are written on insert.
grant select (id, household_id, key_hint, created_by_member_id, created_at, last_used_at,
              last_synced_at, revoked_at, revoked_by_member_id)
  on app.monarch_sync to familyos_api;
grant insert (household_id, key_hash, key_hint, created_by_member_id)
  on app.monarch_sync to familyos_api;
grant update (last_used_at, last_synced_at, revoked_at, revoked_by_member_id)
  on app.monarch_sync to familyos_api;

alter table app.monarch_sync enable row level security;
alter table app.monarch_sync force row level security;

create policy monarch_sync_adult_access on app.monarch_sync
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

-- The live key with this hash, and the adult it acts as. Nothing for a revoked key, or one whose
-- maker is no longer an active owner or adult.
create or replace function app.monarch_sync_for_key(p_key_hash bytea)
  returns table (sync_id uuid, household_id uuid, member_id uuid, user_id uuid)
  language sql stable security definer
  set search_path = ''
  as $$
    select s.id, s.household_id, m.id, m.user_id
    from app.monarch_sync s
    join app.member m on m.household_id = s.household_id and m.id = s.created_by_member_id
    where s.key_hash = p_key_hash
      and s.revoked_at is null
      and m.status = 'active'
      and m.role in ('owner', 'adult')
      and m.user_id is not null
  $$;

revoke all on function app.monarch_sync_for_key(bytea) from public;
grant execute on function app.monarch_sync_for_key(bytea) to familyos_api;

create table app.budget_plan_change (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  -- The first day of the month.
  month date not null check (extract(day from month) = 1),
  category text not null check (char_length(category) between 1 and 80),
  monarch_category_id text not null check (monarch_category_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  -- Monarch's plan when the change was made (null: none), so the sync can tell if it changed.
  from_amount numeric(12, 2),
  to_amount numeric(12, 2) not null check (to_amount >= 0 and to_amount < 10000000),
  -- Also this category's plan for every later month.
  apply_to_future boolean not null default false,
  status text not null default 'waiting'
    check (status in ('waiting', 'saved', 'conflict', 'failed', 'cancelled')),
  -- Monarch's plan when the change met a conflict.
  monarch_amount numeric(12, 2),
  -- Tries that Monarch refused, and the sync's short reason for the last one.
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_failure text check (char_length(last_failure) between 1 and 200),
  requested_by_member_id uuid not null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Who cancelled it (a change the sync resolves has none).
  resolved_by_member_id uuid,
  foreign key (household_id, requested_by_member_id) references app.member (household_id, id),
  foreign key (household_id, resolved_by_member_id) references app.member (household_id, id),
  constraint budget_plan_change_resolved check ((status = 'waiting') = (resolved_at is null))
);

create unique index budget_plan_change_one_waiting
  on app.budget_plan_change (household_id, month, monarch_category_id)
  where status = 'waiting';
create index budget_plan_change_month on app.budget_plan_change (household_id, month);

grant select, insert on app.budget_plan_change to familyos_api;
grant update (status, monarch_amount, attempts, last_failure, resolved_at, resolved_by_member_id)
  on app.budget_plan_change to familyos_api;

alter table app.budget_plan_change enable row level security;
alter table app.budget_plan_change force row level security;

create policy budget_plan_change_adult_access on app.budget_plan_change
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision', 'meal', 'grocery_item', 'weekly_plan',
                         'budget', 'away_period', 'visitor', 'monarch_sync'));
