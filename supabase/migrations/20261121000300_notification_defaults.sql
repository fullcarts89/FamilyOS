-- Accurate notification defaults (P2-9).
--
-- * Quiet hours are on by default, 22:00–06:00 in the household's timezone. A member can change
--   them or turn them off (both null). Additive: rows already saved keep what they have.
-- * The notifier reads when each member last looked, so their first partner-changes batch
--   covers what happened since then (at most a day) instead of only the last hour.
-- * A removed member's devices are forgotten: the API removes them with the member, through a
--   function, because each member can otherwise touch only their own tokens.

alter table app.member_state
  alter column quiet_hours_start set default '22:00',
  alter column quiet_hours_end set default '06:00';

grant select (last_seen_at) on app.member_state to familyos_notifier;

create or replace function app.forget_removed_member_devices(p_member_id uuid) returns integer
  language plpgsql volatile security definer
  set search_path = ''
  as $$
declare
  v_household uuid := app.current_household_id();
  v_count integer;
begin
  -- Only an active member of the request household, and only for someone removed from it.
  if v_household is null or not app.is_active_member_of(v_household) or not exists (
    select 1 from app.member m
    where m.id = p_member_id and m.household_id = v_household and m.status = 'removed'
  ) then
    raise exception 'not a removed member of this household' using errcode = 'insufficient_privilege';
  end if;
  delete from app.device_push_token t
    where t.member_id = p_member_id and t.household_id = v_household;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function app.forget_removed_member_devices(uuid) from public;
grant execute on function app.forget_removed_member_devices(uuid) to familyos_api;
