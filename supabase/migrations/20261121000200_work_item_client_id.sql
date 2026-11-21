-- Duplicate-capture prevention (P2-4): the app gives each capture an ID of its own before
-- sending it, and sends the same ID when it retries (a lost response, a flaky connection). The
-- API keeps one item per ID per household and answers a repeat with the item already made.
-- Additive: existing items have none.

alter table app.work_item add column client_id uuid;

create unique index work_item_client_id_unique
  on app.work_item (household_id, client_id) where client_id is not null;
