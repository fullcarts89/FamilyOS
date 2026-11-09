-- M2: projects with subtasks, all-day due dates, comments (plan M2; PRD WF-01, WF-05).

-- Subtasks: one level, under a project, in the same household.
alter table app.work_item
  add column parent_id uuid,
  add column due_on date,
  add constraint work_item_parent_same_household
    foreign key (household_id, parent_id) references app.work_item (household_id, id),
  add constraint work_item_not_own_parent check (parent_id is null or parent_id <> id),
  -- A task has either an all-day due date or a timed one, never both.
  add constraint work_item_single_due check (due_on is null or due_at is null);

create index work_item_parent on app.work_item (household_id, parent_id) where parent_id is not null;
create index work_item_due_on on app.work_item (household_id, due_on) where due_on is not null;

-- Parent must be a project, and projects don't nest.
create or replace function app.check_work_item_parent() returns trigger
  language plpgsql
  as $$
declare
  v_parent_type app.work_item_type;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.type = 'project' then
    raise exception 'projects cannot be subtasks' using errcode = 'check_violation';
  end if;
  select type into v_parent_type from app.work_item where id = new.parent_id and household_id = new.household_id;
  if v_parent_type is distinct from 'project' then
    raise exception 'parent must be a project' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger work_item_parent_rules
  before insert or update of parent_id, type on app.work_item
  for each row execute function app.check_work_item_parent();

-- Comments live with their work item. A comment is visible exactly when its item is: the policy
-- checks the item under the caller's own row-level security, so private items' comments stay private.
create table app.comment (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.household (id) on delete cascade,
  work_item_id uuid not null,
  author_member_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (household_id, work_item_id) references app.work_item (household_id, id) on delete cascade,
  foreign key (household_id, author_member_id) references app.member (household_id, id)
);

create index comment_item on app.comment (household_id, work_item_id, created_at);

alter table app.comment enable row level security;
alter table app.comment force row level security;

grant select, insert on app.comment to familyos_api;

create policy comment_visible_with_item on app.comment
  for select to familyos_api
  using (
    app.in_request_household(household_id)
    and exists (
      select 1 from app.work_item w
      where w.id = comment.work_item_id and w.household_id = comment.household_id
    )
  );

create policy comment_insert_on_visible_item on app.comment
  for insert to familyos_api
  with check (
    app.in_request_household(household_id)
    and author_member_id = app.current_member_id()
    and exists (
      select 1 from app.work_item w
      where w.id = comment.work_item_id and w.household_id = comment.household_id
    )
  );

-- Audit rows may now describe comments.
alter table app.audit_event drop constraint audit_event_entity_type_check;
alter table app.audit_event add constraint audit_event_entity_type_check
  check (entity_type in ('household', 'member', 'invite', 'work_item', 'source', 'comment'));
