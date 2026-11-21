-- Family Rhythm: household decisions (plan "Data additions": Decisions; milestone 4, Weekly
-- Reset). A question with options; each adult votes once (and can change it). It is decided when
-- every adult has voted for the same option, or when an owner or adult makes the call. Decisions
-- are between the adults: caregivers neither see nor vote on them.

create type app.decision_status as enum ('open', 'decided', 'dropped');

create table app.decision (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  context text check (char_length(context) between 1 and 1000),
  due_on date,
  status app.decision_status not null default 'open',
  decided_option_id uuid,
  decided_at timestamptz,
  -- 'agreement': every adult voted for it; 'call': an adult decided.
  decided_via text check (decided_via in ('agreement', 'call')),
  decided_by_member_id uuid,
  created_by_member_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  foreign key (household_id, decided_by_member_id) references app.member (household_id, id),
  constraint decision_decided_fields check (
    (status = 'decided') = (decided_option_id is not null)
    and (status = 'decided') = (decided_at is not null)
    and (status = 'decided') = (decided_via is not null)
    and (status = 'decided') = (decided_by_member_id is not null)
  ),
  unique (household_id, id)
);

create index decision_household_status on app.decision (household_id, status, due_on);

create table app.decision_option (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  decision_id uuid not null,
  label text not null check (char_length(label) between 1 and 80),
  detail text check (char_length(detail) between 1 and 200),
  position smallint not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  foreign key (household_id, decision_id) references app.decision (household_id, id) on delete cascade,
  unique (household_id, id),
  unique (decision_id, id)
);

-- The decided option belongs to the decision itself.
alter table app.decision
  add constraint decision_decided_option
    foreign key (id, decided_option_id) references app.decision_option (decision_id, id);

create table app.decision_vote (
  household_id uuid not null references app.household (id) on delete cascade,
  decision_id uuid not null,
  member_id uuid not null,
  option_id uuid not null,
  voted_at timestamptz not null default now(),
  -- One vote per adult per decision.
  primary key (decision_id, member_id),
  foreign key (household_id, decision_id) references app.decision (household_id, id) on delete cascade,
  foreign key (household_id, member_id) references app.member (household_id, id),
  -- The option is one of this decision's; removing it removes its votes.
  foreign key (decision_id, option_id) references app.decision_option (decision_id, id) on delete cascade
);

-- Only owners and adults vote.
create or replace function app.check_decision_voter() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  select role into v_role from app.member
    where id = new.member_id and household_id = new.household_id;
  if v_role is null or v_role not in ('owner', 'adult') then
    raise exception 'only adults vote' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger decision_vote_voter_rules
  before insert or update of member_id on app.decision_vote
  for each row execute function app.check_decision_voter();

grant select, insert, update, delete on app.decision to familyos_api;
grant select, insert, update, delete on app.decision_option to familyos_api;
grant select, insert, update, delete on app.decision_vote to familyos_api;

alter table app.decision enable row level security;
alter table app.decision force row level security;
alter table app.decision_option enable row level security;
alter table app.decision_option force row level security;
alter table app.decision_vote enable row level security;
alter table app.decision_vote force row level security;

create policy decision_adult_access on app.decision
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

create policy decision_option_adult_access on app.decision_option
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());

-- Everyone's votes are visible to the adults; each adult casts and changes only their own.
create policy decision_vote_adult_read on app.decision_vote
  for select to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult());

create policy decision_vote_own_write on app.decision_vote
  for insert to familyos_api
  with check (
    app.in_request_household(household_id)
    and app.request_member_is_adult()
    and member_id = app.current_member_id()
  );

create policy decision_vote_own_update on app.decision_vote
  for update to familyos_api
  using (
    app.in_request_household(household_id)
    and app.request_member_is_adult()
    and member_id = app.current_member_id()
  )
  with check (
    app.in_request_household(household_id)
    and app.request_member_is_adult()
    and member_id = app.current_member_id()
  );

create policy decision_vote_own_delete on app.decision_vote
  for delete to familyos_api
  using (
    app.in_request_household(household_id)
    and app.request_member_is_adult()
    and member_id = app.current_member_id()
  );

alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision'));
