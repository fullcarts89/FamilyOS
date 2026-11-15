-- Personal state per member (plan "Emotional design and interaction quality"): when they last
-- looked, notification and feedback preferences, and which one-time moments (milestone
-- celebrations) they have already seen, so refreshes and other devices never replay them.
-- Each member reads and writes only their own rows.

-- Known notification switches, booleans only.
create or replace function app.valid_notification_prefs(prefs jsonb) returns boolean
  language sql immutable
  as $$
    select jsonb_typeof(prefs) = 'object'
      and prefs - array['morning_checkin', 'handoff_reminders', 'partner_changes',
                        'weekly_reset_reminder'] = '{}'::jsonb
      and coalesce((select bool_and(jsonb_typeof(v) = 'boolean') from jsonb_each(prefs) as e (k, v)),
                   true)
  $$;

grant execute on function app.valid_notification_prefs(jsonb) to familyos_api;

create table app.member_state (
  member_id uuid primary key,
  household_id uuid not null references app.household (id) on delete cascade,
  last_seen_at timestamptz,
  notifications jsonb not null
    default '{"morning_checkin": true, "handoff_reminders": true, "partner_changes": true, "weekly_reset_reminder": true}'
    check (app.valid_notification_prefs(notifications)),
  -- Local wall-clock times in the household's timezone; both or neither.
  quiet_hours_start time(0),
  quiet_hours_end time(0),
  haptics boolean not null default true,
  sound boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (household_id, member_id) references app.member (household_id, id),
  constraint member_state_quiet_hours check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create table app.member_acknowledgment (
  member_id uuid not null,
  household_id uuid not null references app.household (id) on delete cascade,
  -- A key the app chooses, e.g. 'milestone:project_done:<uuid>'; never free text.
  key text not null check (key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$'),
  acknowledged_at timestamptz not null default now(),
  primary key (member_id, key),
  foreign key (household_id, member_id) references app.member (household_id, id)
);

grant select, insert, update on app.member_state to familyos_api;
grant select, insert on app.member_acknowledgment to familyos_api;

alter table app.member_state enable row level security;
alter table app.member_state force row level security;
alter table app.member_acknowledgment enable row level security;
alter table app.member_acknowledgment force row level security;

create policy member_state_own on app.member_state
  for all to familyos_api
  using (app.in_request_household(household_id) and member_id = app.current_member_id())
  with check (app.in_request_household(household_id) and member_id = app.current_member_id());

create policy member_acknowledgment_own on app.member_acknowledgment
  for all to familyos_api
  using (app.in_request_household(household_id) and member_id = app.current_member_id())
  with check (app.in_request_household(household_id) and member_id = app.current_member_id());
