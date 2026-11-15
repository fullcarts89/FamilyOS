-- Notifications (plan "Emotional design and interaction quality": healthy reasons to return).
--
-- Timely, actionable and controllable; none exist to drive engagement. Four kinds, each behind
-- the member's own switch in member_state: a morning check-in, a reminder before a care handoff
-- they cover, meaningful partner changes (batched at most hourly), and a Weekly Reset reminder
-- when the week isn't planned yet. Quiet hours are always respected.
--
-- * device_push_token: a member's Expo push tokens (iPhone). A token is one device, so it
--   belongs to one member at a time. Registered through app.register_push_token().
-- * notification_log: one row per notification considered for a member, keyed so the same one
--   is never sent twice. No notification text is stored anywhere.
-- * familyos_notifier: what the worker acts as when it sends. Like familyos_scheduler it sees
--   one household per transaction and only the columns it uses: tokens, preferences, the log,
--   and the rhythm's inputs (care events, the members' own tasks, tonight's dinner, decisions
--   and votes, whether the week is planned, and the audit trail's IDs). It never sees members'
--   imported calendars, event notes or locations, contacts, budgets or groceries.

-- ---------------------------------------------------------------------------------------------
-- Preferences: when the morning check-in and the Weekly Reset reminder come, lock-screen text
-- ---------------------------------------------------------------------------------------------

alter table app.member_state
  -- Local wall-clock times in the household's timezone.
  add column morning_time time(0) not null default '07:30',
  -- ISO weekday (1 = Monday … 7 = Sunday).
  add column weekly_reset_day smallint not null default 7 check (weekly_reset_day between 1 and 7),
  add column weekly_reset_time time(0) not null default '19:00',
  -- Generic text ("Your morning check-in is ready") instead of names and titles.
  add column hide_details boolean not null default false;

-- Partner changes are opt-in.
alter table app.member_state
  alter column notifications set default
    '{"morning_checkin": true, "handoff_reminders": true, "partner_changes": false, "weekly_reset_reminder": true}';

-- ---------------------------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------------------------

create table app.device_push_token (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  household_id uuid not null references app.household (id) on delete cascade,
  expo_push_token text not null unique
    check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  platform text not null check (platform in ('ios')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  foreign key (household_id, member_id) references app.member (household_id, id)
);

create index device_push_token_member on app.device_push_token (household_id, member_id);

alter table app.device_push_token enable row level security;
alter table app.device_push_token force row level security;

-- The API reads and removes the caller's own tokens; it adds them only through the function
-- below, which can move a token from another member.
grant select (id, member_id, household_id, expo_push_token, platform, created_at, last_used_at),
      delete
  on app.device_push_token to familyos_api;

create policy device_push_token_own on app.device_push_token
  for all to familyos_api
  using (app.in_request_household(household_id) and member_id = app.current_member_id())
  with check (app.in_request_household(household_id) and member_id = app.current_member_id());

-- Keeps a member's five most recently used devices.
create or replace function app.register_push_token(p_token text, p_platform text)
  returns table (token_id uuid, created boolean)
  language plpgsql volatile security definer
  set search_path = ''
  as $$
declare
  v_member uuid := app.current_member_id();
  v_household uuid := app.current_household_id();
  v_user uuid := app.current_user_id();
  v_existing record;
  v_id uuid;
begin
  -- Only an active member with an account, acting in the request household, registers.
  if v_member is null or v_household is null or v_user is null or not exists (
    select 1 from app.member m
    where m.id = v_member and m.household_id = v_household and m.user_id = v_user
      and m.status = 'active' and m.role not in ('child', 'pet')
  ) then
    raise exception 'not an active member' using errcode = 'insufficient_privilege';
  end if;

  select t.id, t.member_id, t.household_id, m.user_id
    into v_existing
    from app.device_push_token t
    join app.member m on m.id = t.member_id and m.household_id = t.household_id
    where t.expo_push_token = p_token
    for update of t;

  if found then
    if v_existing.member_id = v_member then
      update app.device_push_token
        set last_used_at = now(), platform = p_platform
        where id = v_existing.id;
      return query select v_existing.id, false;
      return;
    end if;
    -- A device changes hands within a household, or its user switches household. A token
    -- someone else holds in another household is refused, so no request reaches across.
    if v_existing.household_id <> v_household and v_existing.user_id is distinct from v_user then
      raise exception 'push token in use' using errcode = 'unique_violation';
    end if;
    delete from app.device_push_token where id = v_existing.id;
  end if;

  insert into app.device_push_token (member_id, household_id, expo_push_token, platform)
    values (v_member, v_household, p_token, p_platform)
    returning id into v_id;

  delete from app.device_push_token
    where member_id = v_member and household_id = v_household
      and id not in (
        select t.id from app.device_push_token t
        where t.member_id = v_member and t.household_id = v_household
        order by t.last_used_at desc, t.created_at desc
        limit 5
      );

  return query select v_id, true;
end
$$;

revoke all on function app.register_push_token(text, text) from public;
grant execute on function app.register_push_token(text, text) to familyos_api;

-- ---------------------------------------------------------------------------------------------
-- What was sent: never twice
-- ---------------------------------------------------------------------------------------------

create table app.notification_log (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  household_id uuid not null references app.household (id) on delete cascade,
  kind text not null
    check (kind in ('morning_checkin', 'handoff_reminder', 'partner_changes', 'weekly_reset_reminder')),
  -- e.g. 'morning_checkin:2026-11-16' or 'partner_changes:1234' (the last audit row included).
  dedupe_key text not null check (dedupe_key ~ '^[a-z_]+:[A-Za-z0-9:._-]{1,140}$'),
  sent_at timestamptz not null default now(),
  -- pending: claimed, being sent; skipped: considered, nothing relevant (or already planned).
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  unique (member_id, dedupe_key),
  foreign key (household_id, member_id) references app.member (household_id, id)
);

create index notification_log_member_kind on app.notification_log (household_id, member_id, kind, sent_at);

alter table app.notification_log enable row level security;
alter table app.notification_log force row level security;

-- ---------------------------------------------------------------------------------------------
-- The notifier role
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'familyos_notifier') then
    create role familyos_notifier nologin noinherit nobypassrls;
  end if;
end
$$;

grant familyos_notifier to familyos_worker_login with inherit false, set true;
grant familyos_notifier to postgres;

grant usage on schema app to familyos_notifier;
grant execute on function app.current_household_id() to familyos_notifier;

-- Listing households to notify is the one cross-household read: IDs and timezones.
grant select (id, timezone) on app.household to familyos_notifier;
create policy household_notifier_list on app.household
  for select to familyos_notifier
  using (true);

grant select (id, household_id, status, role, display_name) on app.member to familyos_notifier;
create policy member_notifier_read on app.member
  for select to familyos_notifier
  using (household_id = app.current_household_id());

grant select (member_id, household_id, notifications, quiet_hours_start, quiet_hours_end,
              morning_time, weekly_reset_day, weekly_reset_time, hide_details)
  on app.member_state to familyos_notifier;
create policy member_state_notifier_read on app.member_state
  for select to familyos_notifier
  using (household_id = app.current_household_id());

grant select (id, member_id, household_id, expo_push_token), update (last_used_at), delete
  on app.device_push_token to familyos_notifier;
create policy device_push_token_notifier on app.device_push_token
  for all to familyos_notifier
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

grant select, insert, update (status) on app.notification_log to familyos_notifier;
create policy notification_log_notifier on app.notification_log
  for all to familyos_notifier
  using (household_id = app.current_household_id())
  with check (household_id = app.current_household_id());

-- Tasks: what's due and who has it, and titles for partner changes (shown only to a member
-- who can see the item; see packages/domain/src/notifications.ts). No descriptions.
grant select (id, household_id, type, title, status, owner_member_id, subject_member_id,
              created_by_member_id, visibility, due_on, due_at, recurrence_rule_id)
  on app.work_item to familyos_notifier;
create policy work_item_notifier_read on app.work_item
  for select to familyos_notifier
  using (household_id = app.current_household_id());

-- Care handoffs only: never members' other events, imported calendars, titles, notes or places
-- beyond the care place.
grant select (id, household_id, kind, starts_at, ends_at, all_day, timezone, recurrence,
              recurs_until, care_member_id, care_action, care_place, source_calendar_id)
  on app.event to familyos_notifier;
create policy event_notifier_care on app.event
  for select to familyos_notifier
  using (
    household_id = app.current_household_id()
    and care_member_id is not null
    and source_calendar_id is null
  );

-- Attendance and covers of those events alone: the subquery runs under the policy above.
grant select (household_id, event_id, member_id) on app.event_member to familyos_notifier;
create policy event_member_notifier_care on app.event_member
  for select to familyos_notifier
  using (
    household_id = app.current_household_id()
    and exists (
      select 1 from app.event e
      where e.id = event_member.event_id and e.household_id = event_member.household_id
    )
  );

grant select (household_id, event_id, occurrence_date, kind, cover_member_id)
  on app.event_exception to familyos_notifier;
create policy event_exception_notifier_care on app.event_exception
  for select to familyos_notifier
  using (
    household_id = app.current_household_id()
    and exists (
      select 1 from app.event e
      where e.id = event_exception.event_id and e.household_id = event_exception.household_id
    )
  );

-- Tonight's dinner and who's cooking.
grant select (household_id, on_date, slot, title, cook_member_id) on app.meal to familyos_notifier;
create policy meal_notifier_read on app.meal
  for select to familyos_notifier
  using (household_id = app.current_household_id());

-- A decision someone settled, and who voted on it.
grant select (id, household_id, question, status) on app.decision to familyos_notifier;
create policy decision_notifier_read on app.decision
  for select to familyos_notifier
  using (household_id = app.current_household_id());

grant select (household_id, decision_id, member_id) on app.decision_vote to familyos_notifier;
create policy decision_vote_notifier_read on app.decision_vote
  for select to familyos_notifier
  using (household_id = app.current_household_id());

-- Whether the week is planned; not its notes.
grant select (household_id, week_start, committed_at) on app.weekly_plan to familyos_notifier;
create policy weekly_plan_notifier_read on app.weekly_plan
  for select to familyos_notifier
  using (household_id = app.current_household_id());

-- Partner changes come from the audit trail (IDs, statuses and field names; never free text).
grant select (id, household_id, actor_member_id, entity_type, entity_id, action, payload,
              created_at)
  on app.audit_event to familyos_notifier;
create policy audit_event_notifier_read on app.audit_event
  for select to familyos_notifier
  using (household_id = app.current_household_id());
