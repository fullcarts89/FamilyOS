-- Family Rhythm: key contacts (plan "Data additions": Contacts; milestone 5). The people the
-- household calls: the pediatrician, the vet, the plumber, daycare. A contact can be for one
-- member ("vet for Biscuit"), and a task or project can link to one ("plumber" on the renovation).

create type app.contact_category as enum (
  'health', 'childcare', 'home', 'services', 'school', 'family', 'pets', 'other'
);

create table app.contact (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category app.contact_category not null default 'other',
  -- What they are to the household, e.g. 'Pediatrician'.
  role text check (char_length(role) between 1 and 80),
  organization text check (char_length(organization) between 1 and 120),
  phone text check (char_length(phone) between 1 and 40),
  email text check (email = lower(email) and char_length(email) between 3 and 254),
  address text check (char_length(address) between 1 and 300),
  notes text check (char_length(notes) between 1 and 2000),
  -- The member it's for (a child, pet or adult), in the same household.
  for_member_id uuid,
  created_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, for_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  unique (household_id, id)
);

create index contact_household_category on app.contact (household_id, category, name);

-- A task or project can name the contact it involves. Removing the contact unlinks it.
alter table app.work_item
  add column contact_id uuid,
  add constraint work_item_contact_same_household
    foreign key (household_id, contact_id) references app.contact (household_id, id)
    on delete set null (contact_id);

create index work_item_contact on app.work_item (household_id, contact_id)
  where contact_id is not null;

grant select, insert, update, delete on app.contact to familyos_api;

alter table app.contact enable row level security;
alter table app.contact force row level security;

create policy contact_household_access on app.contact
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact'));
