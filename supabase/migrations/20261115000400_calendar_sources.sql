-- Read-only calendar subscriptions (plan "Founder adjustments": read-only calendar integration).
--
-- Each adult adds the private ICS address of a calendar they want shown and says whose it is.
-- FamilyOS fetches and expands it server-side and never writes to it. The address is a secret
-- (anyone with it can read the calendar), so it is stored only encrypted (AES-256-GCM, key held
-- by the API and worker, never in the database) with a masked hint for display. Imported events
-- reuse app.event, one row per occurrence, keyed by the calendar's UID and RECURRENCE-ID, and
-- are read-only through the API.

create type app.calendar_status as enum ('pending', 'ok', 'error');

create table app.calendar_source (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  -- Whose calendar it is: an adult (or caregiver), never a child or pet.
  member_id uuid not null,
  label text not null check (char_length(label) between 1 and 80),
  url_ciphertext bytea not null check (octet_length(url_ciphertext) between 17 and 4200),
  url_nonce bytea not null check (octet_length(url_nonce) = 12),
  -- e.g. 'calendar.google.com/…': enough to recognise it, useless to read it.
  url_hint text not null check (char_length(url_hint) between 1 and 120),
  color text check (color ~ '^#[0-9A-F]{6}$'),
  status app.calendar_status not null default 'pending',
  last_synced_at timestamptz,
  -- A fixed code (e.g. 'timeout', 'http_404'); never text from the remote server.
  last_error_code text check (last_error_code ~ '^[a-z0-9_]{1,40}$'),
  created_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  unique (household_id, id)
);

create or replace function app.check_calendar_source_member() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  select role into v_role from app.member
    where id = new.member_id and household_id = new.household_id;
  if v_role is null or v_role in ('child', 'pet') then
    raise exception 'a calendar belongs to an adult' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger calendar_source_member_rules
  before insert or update of member_id on app.calendar_source
  for each row execute function app.check_calendar_source_member();

-- Imported occurrences: the calendar, its UID, and the occurrence's RECURRENCE-ID (or 'single').
alter table app.event
  add column source_calendar_id uuid,
  add column external_uid text check (char_length(external_uid) between 1 and 500),
  add column external_recurrence_id text check (char_length(external_recurrence_id) between 1 and 64),
  add constraint event_source_calendar
    foreign key (household_id, source_calendar_id)
    references app.calendar_source (household_id, id) on delete cascade,
  add constraint event_imported_keys check (
    (source_calendar_id is null) = (external_uid is null)
    and (source_calendar_id is null) = (external_recurrence_id is null)
  ),
  -- Imported rows are single occurrences, about nobody in particular.
  add constraint event_imported_shape check (
    source_calendar_id is null or (recurrence is null and care_member_id is null)
  );

create unique index event_imported_unique
  on app.event (source_calendar_id, external_uid, external_recurrence_id)
  where source_calendar_id is not null;

grant select, insert, update, delete on app.calendar_source to familyos_api;

alter table app.calendar_source enable row level security;
alter table app.calendar_source force row level security;

create policy calendar_source_household_access on app.calendar_source
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

-- ---------------------------------------------------------------------------------------------
-- The worker's periodic sync, as familyos_scheduler: one household per transaction, its
-- calendar sources' sync columns, and imported events only. It never sees or changes events
-- members made themselves.
-- ---------------------------------------------------------------------------------------------

grant select (id, household_id, member_id, url_ciphertext, url_nonce, status, last_synced_at,
              created_by_member_id)
  on app.calendar_source to familyos_scheduler;
grant update (status, last_synced_at, last_error_code, updated_at)
  on app.calendar_source to familyos_scheduler;

create policy calendar_source_scheduler_access on app.calendar_source
  for all to familyos_scheduler
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

grant select, insert, delete on app.event to familyos_scheduler;
grant update (title, starts_at, ends_at, all_day, location, version, updated_at)
  on app.event to familyos_scheduler;
grant select, insert, delete on app.event_member to familyos_scheduler;

create policy event_scheduler_imported on app.event
  for all to familyos_scheduler
  using (household_id = app.current_household_id() and source_calendar_id is not null)
  with check (household_id = app.current_household_id() and source_calendar_id is not null);

-- Attendance rows of imported events only: the subquery sees imported events alone.
create policy event_member_scheduler_imported on app.event_member
  for all to familyos_scheduler
  using (
    household_id = app.current_household_id()
    and exists (
      select 1 from app.event e
      where e.id = event_member.event_id and e.household_id = event_member.household_id
    )
  )
  with check (
    household_id = app.current_household_id()
    and exists (
      select 1 from app.event e
      where e.id = event_member.event_id and e.household_id = event_member.household_id
    )
  );

-- Audit rows may now describe calendars.
alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar'));
