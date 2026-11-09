-- M1: household foundation (plan M1; ADR-001 §3.4, §5; threat model T-01 to T-05).
--
-- Access model
-- * The API connects as a privileged login and runs every request inside a transaction that
--   first does `set local role familyos_api` and sets `app.user_id`, `app.household_id` and
--   `app.member_id`. familyos_api has no BYPASSRLS, so every row it touches is filtered by the
--   policies below. RLS is FORCEd so even table owners are filtered.
-- * PostgREST does not expose schema `app`; anon and authenticated have no grants (baseline).
-- * Member user IDs come from Supabase Auth but are not foreign keys to auth.users: removing an
--   auth user must never delete household history.

-- ---------------------------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'familyos_api') then
    create role familyos_api nologin noinherit nobypassrls;
  end if;
end
$$;

-- Lets the connecting login switch into familyos_api with `set local role`.
grant familyos_api to postgres;

grant usage on schema app to familyos_api;

-- ---------------------------------------------------------------------------------------------
-- Request context helpers
-- ---------------------------------------------------------------------------------------------

create or replace function app.current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.current_household_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.household_id', true), '')::uuid $$;

create or replace function app.current_member_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.member_id', true), '')::uuid $$;

grant execute on function app.current_user_id(), app.current_household_id(), app.current_member_id()
  to familyos_api;

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type app.member_role as enum ('owner', 'adult', 'caregiver', 'child');
create type app.member_status as enum ('active', 'removed');
create type app.visibility as enum ('household', 'private');
create type app.work_item_type as enum ('task', 'project', 'routine', 'issue');
create type app.work_item_status as enum (
  'new', 'ready', 'in_progress', 'needs_you', 'waiting_on_others', 'scheduled',
  'awaiting_completion', 'verified_complete', 'done_unverified', 'blocked', 'cancelled'
);
create type app.source_kind as enum ('text', 'photo', 'document', 'email');

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table app.household (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'America/Los_Angeles' check (char_length(timezone) between 1 and 64),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.member (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  user_id uuid,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role app.member_role not null,
  status app.member_status not null default 'active',
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  -- Children are named members without accounts; everyone else signs in.
  constraint member_account_matches_role check ((role = 'child') = (user_id is null)),
  constraint member_removed_at check ((status = 'removed') = (removed_at is not null)),
  unique (household_id, id)
);

-- One active membership per account per household.
create unique index member_active_user_per_household
  on app.member (household_id, user_id) where status = 'active' and user_id is not null;
create index member_user_id on app.member (user_id) where user_id is not null;

create table app.invite (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role app.member_role not null check (role in ('adult', 'caregiver')),
  -- SHA-256 of the invite token. The token itself is shown to the inviter once and never stored.
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by_member_id uuid not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_member_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (household_id, invited_by_member_id) references app.member (household_id, id),
  foreign key (household_id, accepted_member_id) references app.member (household_id, id),
  constraint invite_single_outcome check (not (accepted_at is not null and revoked_at is not null))
);

create index invite_household on app.invite (household_id);

create table app.source (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  kind app.source_kind not null,
  -- Object-storage key for photos and documents (M5). Never a public URL.
  storage_ref text,
  provenance jsonb not null default '{}'::jsonb,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  unique (household_id, id)
);

create table app.work_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  type app.work_item_type not null default 'task',
  title text not null check (char_length(title) between 1 and 500),
  description text check (char_length(description) <= 10000),
  status app.work_item_status not null default 'new',
  owner_member_id uuid,
  due_at timestamptz,
  priority smallint check (priority between 1 and 3),
  visibility app.visibility not null default 'household',
  created_by_member_id uuid not null,
  source_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite keys keep every reference inside the same household.
  foreign key (household_id, owner_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  foreign key (household_id, source_id) references app.source (household_id, id),
  unique (household_id, id)
);

create index work_item_household_status on app.work_item (household_id, status);
create index work_item_owner on app.work_item (household_id, owner_member_id);

-- Append-only audit trail for every write (the PRD's WorkEvent is the entity_type = 'work_item'
-- slice). Payloads carry IDs, statuses and changed field names, never free text.
create table app.audit_event (
  id bigint generated always as identity primary key,
  household_id uuid not null references app.household (id) on delete cascade,
  actor_member_id uuid,
  entity_type text not null check (entity_type in ('household', 'member', 'invite', 'work_item', 'source')),
  entity_id uuid not null,
  action text not null check (char_length(action) between 1 and 64),
  payload jsonb not null default '{}'::jsonb,
  request_id text check (char_length(request_id) <= 128),
  created_at timestamptz not null default now(),
  foreign key (household_id, actor_member_id) references app.member (household_id, id)
);

create index audit_event_entity on app.audit_event (household_id, entity_type, entity_id, id);

create or replace function app.reject_audit_change() returns trigger
  language plpgsql
  as $$
begin
  -- The only permitted change: rows removed while app.purge_household() deletes their household.
  if tg_op = 'DELETE' and current_setting('app.purging_household', true) = old.household_id::text then
    return old;
  end if;
  raise exception 'audit_event is append-only' using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_event_append_only
  before update or delete on app.audit_event
  for each row execute function app.reject_audit_change();

-- Hard delete of a whole household (J5, after the soft-delete window). Not granted to the API;
-- only an operator connection can run it.
create or replace function app.purge_household(p_household_id uuid) returns void
  language plpgsql volatile
  as $$
begin
  perform set_config('app.purging_household', p_household_id::text, true);
  delete from app.household where id = p_household_id;
  perform set_config('app.purging_household', '', true);
end
$$;

revoke all on function app.purge_household(uuid) from public;

-- ---------------------------------------------------------------------------------------------
-- Grants (least privilege; deletes only where the API needs them)
-- ---------------------------------------------------------------------------------------------

grant select, update on app.household to familyos_api;
grant select, insert, update on app.member to familyos_api;
grant select, insert, update on app.invite to familyos_api;
grant select, insert on app.source to familyos_api;
grant select, insert, update on app.work_item to familyos_api;
grant select, insert on app.audit_event to familyos_api;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table app.household enable row level security;
alter table app.household force row level security;
alter table app.member enable row level security;
alter table app.member force row level security;
alter table app.invite enable row level security;
alter table app.invite force row level security;
alter table app.source enable row level security;
alter table app.source force row level security;
alter table app.work_item enable row level security;
alter table app.work_item force row level security;
alter table app.audit_event enable row level security;
alter table app.audit_event force row level security;

-- The household in the request context, and only if the caller is an active member of it.
create or replace function app.is_active_member_of(target uuid) returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
    select exists (
      select 1 from app.member m
      where m.household_id = target
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
  $$;

revoke all on function app.is_active_member_of(uuid) from public;
grant execute on function app.is_active_member_of(uuid) to familyos_api;

create or replace function app.in_request_household(target uuid) returns boolean
  language sql stable
  as $$ select target = app.current_household_id() and app.is_active_member_of(target) $$;

grant execute on function app.in_request_household(uuid) to familyos_api;

create policy household_member_access on app.household
  for all to familyos_api
  using (app.in_request_household(id))
  with check (app.in_request_household(id));

-- Lets a signed-in user list every household they belong to (account-level requests).
create policy household_list_own on app.household
  for select to familyos_api
  using (app.is_active_member_of(id));

-- A signed-in user can always see their own memberships (to list their households);
-- everything else is limited to the request household.
create policy member_own_rows on app.member
  for select to familyos_api
  using (user_id = app.current_user_id());

create policy member_household_access on app.member
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy invite_household_access on app.invite
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy source_household_access on app.source
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

-- Private items are visible only to their creator and owner.
create policy work_item_household_access on app.work_item
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and (visibility = 'household'
         or created_by_member_id = app.current_member_id()
         or owner_member_id = app.current_member_id())
  )
  with check (app.in_request_household(household_id));

create policy audit_event_household_read on app.audit_event
  for select to familyos_api
  using (app.in_request_household(household_id));

create policy audit_event_household_insert on app.audit_event
  for insert to familyos_api
  with check (app.in_request_household(household_id));

-- ---------------------------------------------------------------------------------------------
-- Invite acceptance
-- ---------------------------------------------------------------------------------------------
-- The invitee is not a member yet, so this runs with definer rights and does every check itself:
-- token, expiry, revocation, single use, and that the signed-in email matches the invite.

create or replace function app.accept_invite(
  p_token_hash bytea,
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_request_id text
) returns table (household_id uuid, member_id uuid)
  language plpgsql volatile security definer
  set search_path = ''
  as $$
declare
  v_invite app.invite%rowtype;
  v_member_id uuid;
begin
  select * into v_invite from app.invite i where i.token_hash = p_token_hash for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.accepted_at is not null
     or v_invite.expires_at <= now()
     or v_invite.email <> lower(p_email) then
    -- One error for every failure, so the response never reveals which check failed.
    raise exception 'invite_not_found' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from app.member m
    where m.household_id = v_invite.household_id and m.user_id = p_user_id and m.status = 'active'
  ) then
    raise exception 'already_member' using errcode = 'unique_violation';
  end if;

  insert into app.member (household_id, user_id, display_name, role)
    values (v_invite.household_id, p_user_id, p_display_name, v_invite.role)
    returning id into v_member_id;

  update app.invite
    set accepted_at = now(), accepted_member_id = v_member_id
    where id = v_invite.id;

  insert into app.audit_event (household_id, actor_member_id, entity_type, entity_id, action, payload, request_id)
    values
      (v_invite.household_id, v_member_id, 'invite', v_invite.id, 'invite.accepted', '{}'::jsonb, p_request_id),
      (v_invite.household_id, v_member_id, 'member', v_member_id, 'member.joined',
       jsonb_build_object('role', v_invite.role), p_request_id);

  return query select v_invite.household_id, v_member_id;
end
$$;

revoke all on function app.accept_invite(bytea, uuid, text, text, text) from public;
grant execute on function app.accept_invite(bytea, uuid, text, text, text) to familyos_api;
