-- Family Rhythm: Monarch budgets by CSV upload (plan "Founder adjustments": Monarch's terms forbid
-- automated access by other apps). One row per household, month and category: the budgeted and
-- actual amounts, nothing else. Never transactions, merchants or accounts. Adults only.

create table app.budget_snapshot (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  -- The first day of the month.
  month date not null check (extract(day from month) = 1),
  category text not null check (char_length(category) between 1 and 80),
  category_group text check (char_length(category_group) between 1 and 80),
  budgeted numeric(12, 2),
  actual numeric(12, 2),
  imported_at timestamptz not null default now(),
  imported_by_member_id uuid not null,
  foreign key (household_id, imported_by_member_id) references app.member (household_id, id),
  unique (household_id, month, category)
);

-- A re-import replaces the month, so the API inserts and deletes; nothing is edited in place.
grant select, insert, delete on app.budget_snapshot to familyos_api;

alter table app.budget_snapshot enable row level security;
alter table app.budget_snapshot force row level security;

create policy budget_snapshot_adult_access on app.budget_snapshot
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision', 'meal', 'grocery_item', 'weekly_plan',
                         'budget'));
