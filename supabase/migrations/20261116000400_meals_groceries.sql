-- Family Rhythm: meals and the grocery list (plan "Data additions": Meals; milestone 4). One meal
-- per day and slot, optionally with who's cooking; one shared grocery list grouped by aisle.
-- Caregivers can read both (what's for dinner tonight); owners and adults change them.

create type app.meal_slot as enum ('breakfast', 'lunch', 'dinner');
create type app.grocery_aisle as enum (
  'produce', 'dairy_eggs', 'meat_fish', 'bakery', 'pantry', 'frozen', 'household', 'baby', 'pet',
  'other'
);

create table app.meal (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  on_date date not null,
  slot app.meal_slot not null default 'dinner',
  title text not null check (char_length(title) between 1 and 120),
  cook_member_id uuid,
  notes text check (char_length(notes) between 1 and 500),
  created_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, cook_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  unique (household_id, on_date, slot),
  unique (household_id, id)
);

-- The cook is someone with an account, never a child or pet.
create or replace function app.check_meal_cook() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  if new.cook_member_id is null then
    return new;
  end if;
  select role into v_role from app.member
    where id = new.cook_member_id and household_id = new.household_id;
  if v_role is null or v_role in ('child', 'pet') then
    raise exception 'the cook must be an adult' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger meal_cook_rules
  before insert or update of cook_member_id on app.meal
  for each row execute function app.check_meal_cook();

create table app.grocery_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- e.g. 'size 5' or '2 lb'.
  detail text check (char_length(detail) between 1 and 80),
  aisle app.grocery_aisle not null default 'other',
  position integer not null default 0 check (position >= 0),
  checked_at timestamptz,
  checked_by_member_id uuid,
  added_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, checked_by_member_id) references app.member (household_id, id),
  foreign key (household_id, added_by_member_id) references app.member (household_id, id),
  constraint grocery_item_checked_fields check ((checked_at is null) = (checked_by_member_id is null)),
  unique (household_id, id)
);

create index grocery_item_household on app.grocery_item (household_id, aisle, position);

grant select, insert, update, delete on app.meal to familyos_api;
grant select, insert, update, delete on app.grocery_item to familyos_api;

alter table app.meal enable row level security;
alter table app.meal force row level security;
alter table app.grocery_item enable row level security;
alter table app.grocery_item force row level security;

create policy meal_household_access on app.meal
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy grocery_item_household_access on app.grocery_item
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision', 'meal', 'grocery_item'));
