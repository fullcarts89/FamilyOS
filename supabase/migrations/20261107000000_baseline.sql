-- Baseline (M0). Application tables live in schema `app`, which PostgREST does not expose.
-- Clients reach data only through the FamilyOS API (ADR-001 §3.4); the `anon` and
-- `authenticated` roles get no access to `app`, now or for objects created later.

create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon, authenticated;

alter default privileges in schema app revoke all on tables from public, anon, authenticated;
alter default privileges in schema app revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public, anon, authenticated;

-- Records which migration set the database was built from; the M0 smoke test reads it.
create table app.schema_info (
  key text primary key,
  value text not null
);

insert into app.schema_info (key, value) values ('baseline', 'm0');
