-- Serialize authorization validation with session mutations.

create or replace function public.create_owned_agent_session(
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_authorization_expires_at timestamptz,
  p_channel text,
  p_initial_model text,
  p_initial_configuration jsonb default '{}'::jsonb
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
  created public.agent_sessions;
begin
  if target_owner is null
    or p_channel not in ('creciendo_mobile', 'operator_cli', 'evaluation')
    or p_initial_model is null
    or p_initial_model not in ('gemini-3.6-flash')
    or p_initial_configuration is null
    or jsonb_typeof(p_initial_configuration) <> 'object'
    or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$'
    or p_authorization_expires_at <= now()
    or p_authorization_expires_at > now() + interval '5 minutes'
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
        and (m.valid_until is null or p_authorization_expires_at <= m.valid_until)
        and (a.valid_until is null or p_authorization_expires_at <= a.valid_until)
        and p_authorization_version = format('m:%s:a:%s', m.authorization_version, a.authorization_version)
      for share
    ) then
    return;
  end if;

  insert into public.agent_sessions (care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model, initial_configuration)
  values (p_care_space_id, p_child_id, target_owner, p_authorization_version, p_authorization_expires_at, p_channel, p_initial_model, p_initial_configuration)
  returning * into created;

  return query select created.id, created.eve_session_id, created.owner_user_id, created.care_space_id, created.child_id,
    created.authorization_version, created.authorization_expires_at, created.status, created.last_sequence;
end;
$$;

create or replace function public.refresh_owned_agent_session_lease(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_authorization_expires_at timestamptz
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
  refreshed public.agent_sessions;
begin
  if target_owner is null
    or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$'
    or p_authorization_expires_at <= now()
    or p_authorization_expires_at > now() + interval '5 minutes'
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
        and 'read' = any(a.permissions)
        and (m.valid_until is null or p_authorization_expires_at <= m.valid_until)
        and (a.valid_until is null or p_authorization_expires_at <= a.valid_until)
        and p_authorization_version = format('m:%s:a:%s', m.authorization_version, a.authorization_version)
      for share
    ) then
    return;
  end if;

  perform set_config('app_private.session_lease_refresh', '1', true);
  update public.agent_sessions s
  set authorization_version = p_authorization_version,
      authorization_expires_at = p_authorization_expires_at
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version
  returning s.* into refreshed;

  if refreshed.id is null then
    return;
  end if;

  return query select refreshed.id, refreshed.eve_session_id, refreshed.owner_user_id, refreshed.care_space_id, refreshed.child_id,
    refreshed.authorization_version, refreshed.authorization_expires_at, refreshed.status, refreshed.last_sequence;
end;
$$;

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
      for share
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

revoke all on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) to authenticated;
revoke all on function public.refresh_owned_agent_session_lease(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_owned_agent_session_lease(uuid, uuid, uuid, text, timestamptz) to authenticated;
revoke all on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) to authenticated;
