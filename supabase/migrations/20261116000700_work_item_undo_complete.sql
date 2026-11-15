-- Undo a completion: finishing a task or routine occurrence remembers the status it had, so
-- "undo" puts it back exactly there (not a generic "in progress"). Cleared on reopen.

alter table app.work_item
  add column completed_from_status app.work_item_status,
  add constraint work_item_completed_from_open check (
    completed_from_status is null
    or completed_from_status not in ('verified_complete', 'done_unverified', 'cancelled')
  );
