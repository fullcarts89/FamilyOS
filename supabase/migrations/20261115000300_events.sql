-- Family Rhythm: events (plan "Data additions": Events; milestone 2).
--
-- An event is one occurrence, or a series when it has a recurrence rule. Rules use the same
-- constrained subset as routines (packages/domain/src/recurrence.ts), calendar kinds only, and
-- are validated by the API. starts_at/ends_at are the first occurrence; later ones keep its
-- local wall-clock times in the event's timezone. Series expand on read, never as rows.
--
-- Care handoffs: an event can be about a child or pet (care_member_id). A drop-off leaves them at
-- care_place; a pick-up brings them home. Exceptions change one occurrence without editing the
-- series: skip it, or cover it (a different adult handles that one).

create type app.event_kind as enum (
  'appointment', 'childcare', 'work', 'family', 'home', 'meal', 'other'
);
create type app.care_action as enum ('drop_off', 'pick_up');

create table app.event (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- All-day events start at local midnight and end at local midnight after their last day.
  all_day boolean not null default false,
  location text check (char_length(location) between 1 and 200),
  notes text check (char_length(notes) between 1 and 2000),
  kind app.event_kind not null default 'other',
  recurrence jsonb check (
    recurrence is null
    or (jsonb_typeof(recurrence) = 'object' and recurrence ? 'freq'
        and recurrence ->> 'freq' <> 'after_completion')
  ),
  -- Last local date a series may occur on; null runs without end.
  recurs_until date,
  timezone text not null check (char_length(timezone) between 1 and 64),
  care_member_id uuid,
  care_action app.care_action,
  care_place text check (char_length(care_place) between 1 and 120),
  created_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, care_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  constraint event_ends_after_start check (ends_at >= starts_at),
  constraint event_until_needs_rule check (recurs_until is null or recurrence is not null),
  constraint event_care_needs_member check (
    care_member_id is not null or (care_action is null and care_place is null)
  ),
  unique (household_id, id)
);

create index event_household_starts on app.event (household_id, starts_at);
create index event_household_series on app.event (household_id) where recurrence is not null;

-- Who attends or is responsible. Any member: adults, children and pets.
create table app.event_member (
  household_id uuid not null references app.household (id) on delete cascade,
  event_id uuid not null,
  member_id uuid not null,
  primary key (event_id, member_id),
  foreign key (household_id, event_id) references app.event (household_id, id) on delete cascade,
  foreign key (household_id, member_id) references app.member (household_id, id)
);

create index event_member_member on app.event_member (household_id, member_id);

create table app.event_exception (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  event_id uuid not null,
  -- The occurrence's own local start date (its key in the series).
  occurrence_date date not null,
  kind text not null check (kind in ('skip', 'cover')),
  -- Covering: the adult who handles this one occurrence instead.
  cover_member_id uuid,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (household_id, event_id) references app.event (household_id, id) on delete cascade,
  foreign key (household_id, cover_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  check ((kind = 'cover') = (cover_member_id is not null)),
  -- One change per occurrence: skipping a covered one replaces the cover.
  unique (event_id, occurrence_date)
);

-- The member an event is about must be a child or pet in the same household.
create or replace function app.check_event_care_member() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  if new.care_member_id is null then
    return new;
  end if;
  select role into v_role from app.member
    where id = new.care_member_id and household_id = new.household_id;
  if v_role is null or v_role not in ('child', 'pet') then
    raise exception 'care member must be a child or pet' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger event_care_member_rules
  before insert or update of care_member_id on app.event
  for each row execute function app.check_event_care_member();

-- A cover is always an account-holding adult (or caregiver), never a child or pet.
create or replace function app.check_event_cover_member() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  if new.cover_member_id is null then
    return new;
  end if;
  select role into v_role from app.member
    where id = new.cover_member_id and household_id = new.household_id;
  if v_role is null or v_role in ('child', 'pet') then
    raise exception 'cover must be an adult' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger event_exception_cover_rules
  before insert or update of cover_member_id on app.event_exception
  for each row execute function app.check_event_cover_member();

-- ---------------------------------------------------------------------------------------------
-- Grants and row-level security: active members of the request household read and write.
-- The scheduler has no access.
-- ---------------------------------------------------------------------------------------------

grant select, insert, update, delete on app.event to familyos_api;
grant select, insert, delete on app.event_member to familyos_api;
grant select, insert, update, delete on app.event_exception to familyos_api;

alter table app.event enable row level security;
alter table app.event force row level security;
alter table app.event_member enable row level security;
alter table app.event_member force row level security;
alter table app.event_exception enable row level security;
alter table app.event_exception force row level security;

create policy event_household_access on app.event
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy event_member_household_access on app.event_member
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy event_exception_household_access on app.event_exception
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

-- Audit rows may now describe events.
alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event'));
