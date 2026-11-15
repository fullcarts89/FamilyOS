-- Family Rhythm: the Weekly Reset's plan (plan "Data additions": Weekly Reset; milestone 4).
-- One row per household and week (starting Monday, in the household's timezone). Carry-forward,
-- coverage and assignments write to tasks and events directly; this records the notes and that
-- the adults committed to the plan. Adults only.

create table app.weekly_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  notes text check (char_length(notes) between 1 and 2000),
  committed_at timestamptz,
  committed_by_member_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, committed_by_member_id) references app.member (household_id, id),
  constraint weekly_plan_committed_fields
    check ((committed_at is null) = (committed_by_member_id is null)),
  unique (household_id, week_start),
  unique (household_id, id)
);

grant select, insert, update on app.weekly_plan to familyos_api;

alter table app.weekly_plan enable row level security;
alter table app.weekly_plan force row level security;

create policy weekly_plan_adult_access on app.weekly_plan
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision', 'meal', 'grocery_item', 'weekly_plan'));
