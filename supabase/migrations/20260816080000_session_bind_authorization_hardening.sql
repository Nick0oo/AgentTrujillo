-- Revalidate authorization before binding an Eve session to a durable session.

create or replace function public.bind_owned_eve_session(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_eve_session_id text
)
returns table (
  product_session_id uuid,
  eve_session_id text,
  owner_user_id uuid,
  care_space_id uuid,
  child_id uuid,
  authorization_version text,
  authorization_expires_at timestamptz,
  status text,
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
begin
  if target_owner is null
    or p_eve_session_id is null
    or char_length(p_eve_session_id) not between 1 and 200
    or not exists (
      select 1
      from public.children c
      join public.care_space_members m on m.care_space_id = c.care_space_id and m.user_id = target_owner
      join public.child_access a on a.care_space_id = c.care_space_id and a.child_id = c.id and a.user_id = target_owner
      where c.id = p_child_id
        and c.care_space_id = p_care_space_id
        and c.status = 'active'
        and m.status = 'active' and m.revoked_at is null and m.valid_from <= now() and (m.valid_until is null or m.valid_until > now())
        and a.status = 'active' and a.revoked_at is null and a.valid_from <= now() and (a.valid_until is null or a.valid_until > now())
        and 'record' = any(a.permissions)
        and p_authorization_version = format('m:%s:a:%s', m.authorization_version, a.authorization_version)
    ) then
    return;
  end if;

  return query update public.agent_sessions s
  set eve_session_id = p_eve_session_id,
      eve_session_bound_at = coalesce(s.eve_session_bound_at, now())
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version
    and s.authorization_expires_at > clock_timestamp()
    and s.status = 'active'
    and not exists (
      select 1
      from public.care_space_members m
      join public.child_access a on a.care_space_id = m.care_space_id and a.child_id = s.child_id and a.user_id = m.user_id
      where m.care_space_id = s.care_space_id
        and m.user_id = target_owner
        and (m.valid_until is not null and s.authorization_expires_at > m.valid_until
          or a.valid_until is not null and s.authorization_expires_at > a.valid_until)
    )
    and (s.eve_session_id is null or s.eve_session_id = p_eve_session_id)
  returning s.id, s.eve_session_id, s.owner_user_id, s.care_space_id, s.child_id,
    s.authorization_version, s.authorization_expires_at, s.status, s.last_sequence;
end;
$$;

revoke all on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) to authenticated;
