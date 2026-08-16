-- Narrow owner-scoped session RPCs and immutable authorization lease.

alter table public.agent_sessions
  add column authorization_version text not null default 'm:1:a:1'
  constraint agent_sessions_authorization_version_check check (authorization_version ~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$');

alter table public.agent_sessions
  add column authorization_expires_at timestamptz not null default (now() + interval '5 minutes')
  constraint agent_sessions_authorization_expiry_check check (authorization_expires_at > started_at);

create or replace function app_private.prevent_agent_session_lease_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.authorization_version is distinct from old.authorization_version
    or new.authorization_expires_at is distinct from old.authorization_expires_at then
    raise exception using errcode = '42501', message = 'agent session authorization lease is immutable';
  end if;
  return new;
end;
$$;

revoke all on function app_private.prevent_agent_session_lease_change() from public, anon, authenticated;
create trigger agent_sessions_lease_immutable
before update on public.agent_sessions
for each row execute function app_private.prevent_agent_session_lease_change();

create index agent_sessions_authorization_lookup_idx
  on public.agent_sessions(owner_user_id, care_space_id, child_id, authorization_version, updated_at desc);

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
        and p_authorization_version = format('m:%s:a:%s', m.authorization_version, a.authorization_version)
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
language sql
security definer
set search_path = ''
as $$
  update public.agent_sessions s
  set eve_session_id = p_eve_session_id,
      eve_session_bound_at = coalesce(s.eve_session_bound_at, now())
  where s.id = p_product_session_id
    and s.owner_user_id = (select auth.uid())
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version
    and p_eve_session_id is not null
    and char_length(p_eve_session_id) between 1 and 200
    and (s.eve_session_id is null or s.eve_session_id = p_eve_session_id)
  returning s.id, s.eve_session_id, s.owner_user_id, s.care_space_id, s.child_id,
    s.authorization_version, s.authorization_expires_at, s.status, s.last_sequence;
$$;

revoke all on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.bind_owned_eve_session(uuid, uuid, uuid, text, text) to authenticated;
