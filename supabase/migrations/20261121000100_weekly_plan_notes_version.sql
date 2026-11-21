-- Weekly Reset notes saved as they're typed (P2-5): both adults can have the Reset open, so a
-- save names the notes version it was based on and a stale one is refused instead of quietly
-- replacing the other adult's words. Separate from the row's version, which committing also
-- bumps: committing never makes a notes save look stale. Additive: existing rows start at 0.

alter table app.weekly_plan
  add column notes_version integer not null default 0 check (notes_version >= 0);
