-- M3: routines and chores (plan M3; PRD WF-02; ADR-001 §3.3).
--
-- A routine is a work_item of type 'routine' that holds the title, owner and visibility. Its
-- schedule lives in recurrence_rule. Each occurrence is an ordinary task row pointing back at
-- the rule with its index in the series. Skips and one-off owner changes are
-- occurrence_exception rows keyed by that index, so they never edit the rule.

create table app.recurrence_rule (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  routine_id uuid not null,
  -- The constrained rule subset (packages/domain/src/recurrence.ts). Validated by the API.
  rule jsonb not null check (jsonb_typeof(rule) = 'object' and rule ? 'freq'),
  timezone text not null check (char_length(timezone) between 1 and 64),
  start_on date not null,
  -- Local wall-clock time; null means the occurrence is due all day.
  local_time time(0),
  -- Members taking turns, in order. Empty when the routine's owner does every occurrence.
  rotation uuid[] not null default '{}' check (cardinality(rotation) <= 6),
  paused_at timestamptz,
  -- Occurrences before this date are never created (set on creation and on resume).
  generate_from date not null,
  -- The latest occurrence date already created, so the scheduler resumes where it stopped.
  materialized_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, routine_id) references app.work_item (household_id, id) on delete cascade,
  unique (routine_id),
  unique (household_id, id)
);

alter table app.work_item
  add column recurrence_rule_id uuid,
  add column occurrence_index integer check (occurrence_index >= 0),
  add column occurrence_on date,
  -- Who closed it and when, for Handled attribution and the fairness view (J3b).
  add column completed_at timestamptz,
  add column completed_by_member_id uuid,
  add constraint work_item_occurrence_rule
    foreign key (household_id, recurrence_rule_id) references app.recurrence_rule (household_id, id),
  add constraint work_item_completed_by
    foreign key (household_id, completed_by_member_id) references app.member (household_id, id),
  add constraint work_item_occurrence_fields check (
    (recurrence_rule_id is null and occurrence_index is null and occurrence_on is null)
    or (recurrence_rule_id is not null and occurrence_index is not null and occurrence_on is not null
        and type = 'task' and parent_id is null)
  );

-- One row per occurrence, however many times the scheduler runs.
create unique index work_item_occurrence_unique
  on app.work_item (recurrence_rule_id, occurrence_index) where recurrence_rule_id is not null;
create index work_item_occurrence_on
  on app.work_item (household_id, recurrence_rule_id, occurrence_on) where recurrence_rule_id is not null;
create index work_item_completed
  on app.work_item (household_id, completed_at) where completed_at is not null;

create table app.occurrence_exception (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  recurrence_rule_id uuid not null,
  occurrence_index integer not null check (occurrence_index >= 0),
  kind text not null check (kind in ('skip', 'owner')),
  -- Why a skip exists: a member chose it, or the routine was paused.
  reason text check (reason in ('member', 'paused')),
  owner_member_id uuid,
  -- Null when the system wrote it (pausing writes skips on behalf of whoever paused).
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  foreign key (household_id, recurrence_rule_id)
    references app.recurrence_rule (household_id, id) on delete cascade,
  foreign key (household_id, owner_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  check ((kind = 'skip') = (reason is not null)),
  check (kind = 'owner' or owner_member_id is null),
  unique (recurrence_rule_id, occurrence_index, kind)
);

grant select, insert, update on app.recurrence_rule to familyos_api;
grant select, insert, delete on app.occurrence_exception to familyos_api;
-- Swapping turns again replaces an existing owner override.
grant update (owner_member_id, created_by_member_id) on app.occurrence_exception to familyos_api;

alter table app.recurrence_rule enable row level security;
alter table app.recurrence_rule force row level security;
alter table app.occurrence_exception enable row level security;
alter table app.occurrence_exception force row level security;

-- A rule is visible exactly when its routine is: the subquery runs under the caller's own
-- work_item policy, so a private routine's schedule stays private too.
create policy recurrence_rule_with_routine on app.recurrence_rule
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.work_item w
      where w.id = recurrence_rule.routine_id and w.household_id = recurrence_rule.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.work_item w
      where w.id = recurrence_rule.routine_id and w.household_id = recurrence_rule.household_id
    )
  );

create policy occurrence_exception_with_rule on app.occurrence_exception
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.recurrence_rule r
      where r.id = occurrence_exception.recurrence_rule_id
        and r.household_id = occurrence_exception.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.recurrence_rule r
      where r.id = occurrence_exception.recurrence_rule_id
        and r.household_id = occurrence_exception.household_id
    )
  );
