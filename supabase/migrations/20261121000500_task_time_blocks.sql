-- Time blocks for tasks: a task with a time (due_at) can also say how long it takes ("walk the
-- dog, 5:30–6pm"), so Today's day view shows it from start to end. Optional: most tasks have no
-- time, and a task with no time has no length. Routines take the same length beside their time,
-- and the scheduler copies it onto each turn it creates.
--
-- Additive only: existing rows get null and keep working unchanged. The previous release never
-- reads or writes these columns; when it clears a task's time (moving it to an all-day date or
-- no date) the trigger below clears the length with it, so its updates never trip the check.

alter table app.work_item
  add column duration_minutes smallint,
  -- Five minutes to twelve hours (the API also keeps it to steps of five).
  add constraint work_item_duration_range
    check (duration_minutes is null or duration_minutes between 5 and 720),
  -- A length only means something from a start time.
  add constraint work_item_duration_with_time
    check (duration_minutes is null or due_at is not null);

-- Clearing a task's time clears its length, whichever release clears it. An update that sets a
-- length of its own while clearing the time is left for the check above to refuse.
create or replace function app.clear_duration_with_time() returns trigger
  language plpgsql
  as $$
begin
  if new.due_at is null and old.due_at is not null
     and new.duration_minutes is not distinct from old.duration_minutes then
    new.duration_minutes := null;
  end if;
  return new;
end
$$;

create trigger work_item_duration_follows_time
  before update of due_at on app.work_item
  for each row execute function app.clear_duration_with_time();

-- A routine's length goes with its time of day (null local_time means all day: no length).
alter table app.recurrence_rule
  add column duration_minutes smallint,
  add constraint recurrence_rule_duration_range
    check (duration_minutes is null or duration_minutes between 5 and 720),
  add constraint recurrence_rule_duration_with_time
    check (duration_minutes is null or local_time is not null);

-- familyos_api and familyos_scheduler hold table-wide grants on both tables, which cover the new
-- columns. The notifier's grants on work_item are per column: it reads the length so the morning
-- brief's "overdue" count says what Today says (a time block is late only once it has ended).
grant select (duration_minutes) on app.work_item to familyos_notifier;
