-- Who's in town (docs/plan/whos-in-town.md; owner decisions 2026-11-24): members' away periods,
-- the household's visitors, and the hand-overs that route an away member's work to the adult
-- covering for them.
--
-- * away_period: a member is away from starts_on through ends_on (inclusive local dates in the
--   household's timezone), or open-ended while ends_on is null. An account holder's period
--   names who covers: an owner or adult. One member's periods never share a day.
-- * visitor: family or friends staying, with their days and an optional note. Not an account and
--   never an owner: nothing here gives them access to anything.
-- * away_handover: what an away period did with one of the away member's items: moved it to the
--   cover (an adult confirmed, or the scheduler created a routine turn for the cover), kept it
--   with them (an adult chose not to move it), or returned it (the period was shortened or
--   removed). It is visible exactly when its work item is, so a private item's is never seen by
--   someone who can't see the item (and private items are never moved: the API and scheduler
--   only move household-visible ones). payback_index is the cover's later turn the away member
--   takes in return for a routine turn the cover took.
--
-- Care handoffs aren't stored here: an away adult's handoffs are the cover's on read
-- (packages/domain/src/presence.ts), so they follow every change to the away period.

create table app.away_period (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  member_id uuid not null,
  starts_on date not null,
  -- Last day away; null while open-ended.
  ends_on date,
  cover_member_id uuid,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (household_id, member_id) references app.member (household_id, id),
  foreign key (household_id, cover_member_id) references app.member (household_id, id),
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  constraint away_period_dates check (ends_on is null or ends_on >= starts_on),
  constraint away_period_length check (ends_on is null or ends_on - starts_on < 366),
  constraint away_period_not_self check (cover_member_id is null or cover_member_id <> member_id),
  unique (household_id, id)
);

create index away_period_household_dates on app.away_period (household_id, starts_on);
create index away_period_member on app.away_period (household_id, member_id);

-- The cover is an owner or adult (who can work on tasks), and a member's periods don't overlap.
create or replace function app.check_away_period() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  if new.cover_member_id is not null then
    select role into v_role from app.member
      where id = new.cover_member_id and household_id = new.household_id;
    if v_role is null or v_role not in ('owner', 'adult') then
      raise exception 'cover must be an adult' using errcode = 'check_violation';
    end if;
  end if;
  if exists (
    select 1 from app.away_period p
    where p.household_id = new.household_id
      and p.member_id = new.member_id
      and p.id <> new.id
      and (p.ends_on is null or p.ends_on >= new.starts_on)
      and (new.ends_on is null or new.ends_on >= p.starts_on)
  ) then
    raise exception 'away periods overlap' using errcode = 'exclusion_violation';
  end if;
  return new;
end
$$;

create trigger away_period_rules
  before insert or update of member_id, starts_on, ends_on, cover_member_id on app.away_period
  for each row execute function app.check_away_period();

create table app.visitor (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  arrives_on date not null,
  leaves_on date not null,
  -- Where they're staying, flight times.
  notes text check (char_length(notes) between 1 and 500),
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  constraint visitor_dates check (leaves_on >= arrives_on),
  constraint visitor_length check (leaves_on - arrives_on < 366),
  unique (household_id, id)
);

create index visitor_household_dates on app.visitor (household_id, arrives_on);

create table app.away_handover (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  away_period_id uuid not null,
  work_item_id uuid not null,
  from_member_id uuid not null,
  to_member_id uuid not null,
  outcome text not null check (outcome in ('moved', 'kept', 'returned')),
  -- Routine turns: the rule, and the cover's later turn the away member takes in return.
  recurrence_rule_id uuid,
  payback_index integer check (payback_index >= 0),
  -- Null when the scheduler routed a routine turn as it created it.
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, away_period_id)
    references app.away_period (household_id, id) on delete cascade,
  foreign key (household_id, work_item_id) references app.work_item (household_id, id) on delete cascade,
  foreign key (household_id, from_member_id) references app.member (household_id, id),
  foreign key (household_id, to_member_id) references app.member (household_id, id),
  foreign key (household_id, recurrence_rule_id)
    references app.recurrence_rule (household_id, id) on delete cascade,
  foreign key (household_id, created_by_member_id) references app.member (household_id, id),
  constraint away_handover_payback check (payback_index is null or recurrence_rule_id is not null),
  unique (away_period_id, work_item_id)
);

create index away_handover_item on app.away_handover (household_id, work_item_id);
create index away_handover_to on app.away_handover (household_id, to_member_id) where outcome = 'moved';

-- ---------------------------------------------------------------------------------------------
-- Grants and row-level security: active members of the request household. The API decides who
-- may change what (adults); caregivers only read.
-- ---------------------------------------------------------------------------------------------

grant select, insert, update, delete on app.away_period to familyos_api;
grant select, insert, update, delete on app.visitor to familyos_api;
grant select, insert, update on app.away_handover to familyos_api;

alter table app.away_period enable row level security;
alter table app.away_period force row level security;
alter table app.visitor enable row level security;
alter table app.visitor force row level security;
alter table app.away_handover enable row level security;
alter table app.away_handover force row level security;

create policy away_period_household_access on app.away_period
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

create policy visitor_household_access on app.visitor
  for all to familyos_api
  using (app.in_request_household(household_id))
  with check (app.in_request_household(household_id));

-- Visible exactly when the item is: the subquery runs under the caller's own work_item policy.
create policy away_handover_with_item on app.away_handover
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.work_item w
      where w.id = away_handover.work_item_id and w.household_id = away_handover.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.work_item w
      where w.id = away_handover.work_item_id and w.household_id = away_handover.household_id
    )
  );

-- The scheduler creates routine turns for the cover while the owner is away, records the
-- hand-over, and gives the away member a later turn of the cover's in return.
grant select (id, household_id, member_id, starts_on, ends_on, cover_member_id)
  on app.away_period to familyos_scheduler;
create policy away_period_scheduler_read on app.away_period
  for select to familyos_scheduler
  using (household_id = app.current_household_id());
grant select, insert on app.away_handover to familyos_scheduler;
create policy away_handover_scheduler_access on app.away_handover
  for all to familyos_scheduler
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());
grant insert, update (owner_member_id, created_by_member_id) on app.occurrence_exception
  to familyos_scheduler;
create policy occurrence_exception_scheduler_write on app.occurrence_exception
  for insert to familyos_scheduler
  with check (household_id = app.current_household_id());
create policy occurrence_exception_scheduler_update on app.occurrence_exception
  for update to familyos_scheduler
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

-- The notifier: who's away (so an away adult's handoff reminders go to the cover) and how many
-- things each period moved, as counts. No visitors, no notes.
grant select (id, household_id, member_id, starts_on, ends_on, cover_member_id)
  on app.away_period to familyos_notifier;
create policy away_period_notifier_read on app.away_period
  for select to familyos_notifier
  using (household_id = app.current_household_id());
grant select (household_id, away_period_id, from_member_id, to_member_id, outcome,
              created_by_member_id, created_at)
  on app.away_handover to familyos_notifier;
create policy away_handover_notifier_read on app.away_handover
  for select to familyos_notifier
  using (household_id = app.current_household_id());

-- Audit rows may describe away periods and visitors; the notifier has a new kind.
alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment', 'event',
                         'calendar', 'contact', 'decision', 'meal', 'grocery_item', 'weekly_plan',
                         'budget', 'away_period', 'visitor'));

alter table app.notification_log drop constraint notification_log_kind_check;
alter table app.notification_log add constraint notification_log_kind_check
  check (kind in ('morning_checkin', 'handoff_reminder', 'partner_changes', 'weekly_reset_reminder',
                  'cover_request', 'cover_response', 'away_handover'));
