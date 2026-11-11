-- Password sign-in (founder decision, 2026-11-11): FamilyOS signs in with email and password, so
-- no email provider is needed. An invitee without an account creates one from the invite link.
-- The API checks the link with this function first, before anyone is signed in, so an account is
-- only ever created for the invited email of a pending invite. Acceptance itself still goes
-- through app.accept_invite, with all of its checks.

create or replace function app.invite_claimable(p_token_hash bytea, p_email text) returns boolean
  language sql stable security definer
  set search_path = ''
  as $$
    select exists (
      select 1 from app.invite i
      where i.token_hash = p_token_hash
        and i.revoked_at is null
        and i.accepted_at is null
        and i.expires_at > now()
        and i.email = lower(p_email)
    )
  $$;

revoke all on function app.invite_claimable(bytea, text) from public;
grant execute on function app.invite_claimable(bytea, text) to familyos_api;
