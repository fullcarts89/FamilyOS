-- Childcare coverage by request and acceptance (P1-6; owner decision 2026-11-21): asking the
-- other adult to cover one occurrence of an event no longer changes who is responsible. It
-- makes a request; only when the asked adult accepts does the cover (an event_exception of kind
-- 'cover') exist. Covering it yourself stays immediate and doesn't use this table.
--
-- One pending request per occurrence. The asked member must be someone who can cover (an adult
-- or caregiver, as event_exception's rule), never the asker. Requests are visible exactly when
-- their event is (so a caregiver never sees one about an adult's imported calendar), are never
-- deleted by the API, and carry no free text.

create table app.cover_request (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  event_id uuid not null,
  -- The occurrence's own local start date (its key in the series), as event_exception.
  occurrence_date date not null,
  asked_member_id uuid not null,
  asked_by_member_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  version integer not null default 1,
  foreign key (household_id, event_id) references app.event (household_id, id) on delete cascade,
  foreign key (household_id, asked_member_id) references app.member (household_id, id),
  foreign key (household_id, asked_by_member_id) references app.member (household_id, id),
  constraint cover_request_not_self check (asked_member_id <> asked_by_member_id),
  constraint cover_request_responded check ((status = 'pending') = (responded_at is null)),
  unique (household_id, id)
);

create unique index cover_request_one_pending
  on app.cover_request (event_id, occurrence_date) where status = 'pending';
create index cover_request_household_date on app.cover_request (household_id, occurrence_date);

-- The same rule as a cover (app.check_event_cover_member): an adult or caregiver, never a child
-- or pet.
create or replace function app.check_cover_request_member() returns trigger
  language plpgsql
  as $$
declare
  v_role app.member_role;
begin
  select role into v_role from app.member
    where id = new.asked_member_id and household_id = new.household_id;
  if v_role is null or v_role in ('child', 'pet') then
    raise exception 'cover must be an adult' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger cover_request_member_rules
  before insert or update of asked_member_id on app.cover_request
  for each row execute function app.check_cover_request_member();

grant select, insert, update on app.cover_request to familyos_api;

alter table app.cover_request enable row level security;
alter table app.cover_request force row level security;

-- Visible exactly when the event is: the subquery runs under the caller's own event policy.
create policy cover_request_household_access on app.cover_request
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = cover_request.event_id and e.household_id = cover_request.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = cover_request.event_id and e.household_id = cover_request.household_id
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Notifications: the asked adult hears about a request, the asker about the answer. The
-- notifier reads requests of the care events it can already see, and only these columns.
-- ---------------------------------------------------------------------------------------------

grant select (id, household_id, event_id, occurrence_date, asked_member_id, asked_by_member_id,
              status, created_at, responded_at)
  on app.cover_request to familyos_notifier;
create policy cover_request_notifier_care on app.cover_request
  for select to familyos_notifier
  using (
    household_id = app.current_household_id()
    and exists (
      select 1 from app.event e
      where e.id = cover_request.event_id and e.household_id = cover_request.household_id
    )
  );

alter table app.notification_log drop constraint notification_log_kind_check;
alter table app.notification_log add constraint notification_log_kind_check
  check (kind in ('morning_checkin', 'handoff_reminder', 'partner_changes', 'weekly_reset_reminder',
                  'cover_request', 'cover_response'));
