-- The household's first owner joins like every other adult: from a one-time invite link, choosing
-- their own password there, so no password is typed into a terminal or stored as a secret
-- (founder decision, 2026-11-14). The operator creates the household together with an owner
-- invite. Nobody sent that invite, so it has no inviter; every other invite still has one, and
-- the API can still only create adult and caregiver invites.

alter table app.invite alter column invited_by_member_id drop not null;
alter table app.invite drop constraint invite_role_check;
alter table app.invite add constraint invite_role_check check (
  role in ('adult', 'caregiver') or (role = 'owner' and invited_by_member_id is null)
);
alter table app.invite add constraint invite_has_inviter check (
  invited_by_member_id is not null or role = 'owner'
);

-- Operator only (postgres): a new, empty household and the invite for its owner. Accepting the
-- invite, through app.accept_invite as usual, makes the invitee the owner.
create or replace function app.create_household_with_owner_invite(
  p_name text,
  p_timezone text,
  p_owner_email text,
  p_token_hash bytea,
  p_expires_at timestamptz
) returns uuid
  language plpgsql volatile security definer
  set search_path = ''
  as $$
declare
  v_household_id uuid;
  v_invite_id uuid;
begin
  insert into app.household (name, timezone) values (p_name, p_timezone)
    returning id into v_household_id;
  insert into app.invite (household_id, email, role, token_hash, invited_by_member_id, expires_at)
    values (v_household_id, lower(p_owner_email), 'owner', p_token_hash, null, p_expires_at)
    returning id into v_invite_id;
  insert into app.audit_event (household_id, actor_member_id, entity_type, entity_id, action, payload)
    values
      (v_household_id, null, 'household', v_household_id, 'household.created', '{"via":"bootstrap"}'),
      (v_household_id, null, 'invite', v_invite_id, 'invite.created', '{"role":"owner"}');
  return v_household_id;
end
$$;

revoke all on function app.create_household_with_owner_invite(text, text, text, bytea, timestamptz)
  from public;
