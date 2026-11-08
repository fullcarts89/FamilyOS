-- Synthetic data for the restore drill (scripts/ops/restore-drill.sh); never real household data.
-- Adds a task, a project with a child task, a comment and a routine to the first household.
do $$
declare
  h uuid;
  owner uuid;
  project uuid;
  task uuid;
  routine uuid;
begin
  select household_id, id into h, owner from app.member where role = 'owner' limit 1;

  insert into app.work_item (household_id, type, title, status, owner_member_id, created_by_member_id)
  values (h, 'task', 'Drill: renew library card', 'ready', owner, owner) returning id into task;

  insert into app.work_item (household_id, type, title, status, created_by_member_id)
  values (h, 'project', 'Drill: spring clean', 'in_progress', owner) returning id into project;
  insert into app.work_item (household_id, type, title, status, parent_id, created_by_member_id)
  values (h, 'task', 'Drill: clear the garage', 'ready', project, owner);

  insert into app.comment (household_id, work_item_id, author_member_id, body)
  values (h, task, owner, 'Drill comment');

  insert into app.work_item (household_id, type, title, status, owner_member_id, created_by_member_id)
  values (h, 'routine', 'Drill: water the plants', 'ready', owner, owner) returning id into routine;
  insert into app.recurrence_rule (household_id, routine_id, rule, timezone, start_on, generate_from)
  values (h, routine, '{"freq": "weekly", "interval": 1, "weekdays": [7]}', 'America/Los_Angeles',
          '2026-11-01', '2026-11-01');
end
$$;
