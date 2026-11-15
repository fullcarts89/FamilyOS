-- Family Rhythm: imported calendar events are the adults' own schedules (work meetings, personal
-- appointments), so only owners and adults see them. Caregivers still see the household's own
-- events, care handoffs included. Calendar subscriptions themselves are adults-only too.

-- The caller is an active owner or adult of the request household. Used by policies on tables a
-- sitter has no reason to see (imported events, decisions, budgets, the weekly plan).
create or replace function app.request_member_is_adult() returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
    select exists (
      select 1 from app.member m
      where m.id = app.current_member_id()
        and m.household_id = app.current_household_id()
        and m.user_id = app.current_user_id()
        and m.status = 'active'
        and m.role in ('owner', 'adult')
    )
  $$;

revoke all on function app.request_member_is_adult() from public;
grant execute on function app.request_member_is_adult() to familyos_api;

drop policy event_household_access on app.event;
create policy event_household_access on app.event
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and (source_calendar_id is null or app.request_member_is_adult())
  )
  with check (
    app.in_request_household(household_id)
    and (source_calendar_id is null or app.request_member_is_adult())
  );

-- Attendance and exceptions are visible exactly when their event is: the subquery runs under the
-- caller's own event policy.
drop policy event_member_household_access on app.event_member;
create policy event_member_household_access on app.event_member
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = event_member.event_id and e.household_id = event_member.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = event_member.event_id and e.household_id = event_member.household_id
    )
  );

drop policy event_exception_household_access on app.event_exception;
create policy event_exception_household_access on app.event_exception
  for all to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = event_exception.event_id and e.household_id = event_exception.household_id
    )
  )
  with check (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.event e
      where e.id = event_exception.event_id and e.household_id = event_exception.household_id
    )
  );

drop policy calendar_source_household_access on app.calendar_source;
create policy calendar_source_household_access on app.calendar_source
  for all to familyos_api
  using (app.in_request_household(household_id) and app.request_member_is_adult())
  with check (app.in_request_household(household_id) and app.request_member_is_adult());
