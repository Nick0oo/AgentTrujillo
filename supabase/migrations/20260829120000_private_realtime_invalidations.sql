-- Realtime exposes only child-scoped invalidation metadata. Clients refetch
-- authorized resources; clinical payloads never cross the publication boundary.

create table public.realtime_invalidations (
  id bigint generated always as identity primary key,
  care_space_id uuid not null,
  child_id uuid not null,
  session_id uuid,
  resource_kind text not null check (resource_kind in (
    'child', 'dashboard', 'growth', 'immunization', 'medication',
    'development', 'document', 'conversation', 'nutrition', 'settings'
  )),
  resource_id uuid not null,
  resource_version bigint not null check (resource_version > 0),
  source_event_id uuid not null,
  sequence bigint not null check (sequence > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint realtime_invalidations_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint realtime_invalidations_session_fk foreign key (session_id, care_space_id, child_id)
    references public.agent_sessions(id, care_space_id, child_id) on delete restrict,
  constraint realtime_invalidations_source_unique unique (source_event_id),
  constraint realtime_invalidations_resource_version_unique
    unique (care_space_id, child_id, resource_kind, resource_id, resource_version),
  constraint realtime_invalidations_sequence_unique
    unique (care_space_id, child_id, sequence),
  constraint realtime_invalidations_expiry_bounded
    check (expires_at > created_at and expires_at <= created_at + interval '8 days')
);

create index realtime_invalidations_child_version_idx
  on public.realtime_invalidations (care_space_id, child_id, resource_version, sequence);

create index realtime_invalidations_expiry_idx
  on public.realtime_invalidations (expires_at);

create or replace function app_private.prevent_realtime_invalidation_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'realtime invalidations are append-only';
end;
$$;

revoke all on function app_private.prevent_realtime_invalidation_mutation() from public, anon, authenticated;

create trigger realtime_invalidations_append_only
before update or delete on public.realtime_invalidations
for each row execute function app_private.prevent_realtime_invalidation_mutation();

create or replace function public.append_realtime_invalidation(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_resource_kind text,
  p_resource_id uuid,
  p_resource_version bigint,
  p_source_event_id uuid
)
returns table (
  outcome text,
  invalidation_id bigint,
  invalidation_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.realtime_invalidations%rowtype;
  next_sequence bigint;
begin
  if p_care_space_id is null
    or p_child_id is null
    or p_resource_kind is null
    or p_resource_id is null
    or p_resource_version is null
    or p_source_event_id is null then
    raise exception using errcode = '22004', message = 'invalidation identifiers are required';
  end if;

  if p_resource_kind not in (
    'child', 'dashboard', 'growth', 'immunization', 'medication',
    'development', 'document', 'conversation', 'nutrition', 'settings'
  ) then
    raise exception using errcode = '23514', message = 'resource kind is not allowed';
  end if;

  if p_resource_version <= 0 then
    raise exception using errcode = '23514', message = 'resource version must be positive';
  end if;

  if not exists (
    select 1
    from public.children c
    where c.care_space_id = p_care_space_id
      and c.id = p_child_id
      and c.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'child scope is not active';
  end if;

  if p_session_id is not null and not exists (
    select 1
    from public.agent_sessions s
    where s.id = p_session_id
      and s.care_space_id = p_care_space_id
      and s.child_id = p_child_id
  ) then
    raise exception using errcode = '42501', message = 'session scope is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_care_space_id::text || ':' || p_child_id::text || ':'
        || p_resource_kind || ':' || p_resource_id::text,
      1200
    )
  );

  select * into existing
  from public.realtime_invalidations i
  where i.source_event_id = p_source_event_id;

  if found then
    if existing.care_space_id = p_care_space_id
      and existing.child_id = p_child_id
      and existing.session_id is not distinct from p_session_id
      and existing.resource_kind = p_resource_kind
      and existing.resource_id = p_resource_id
      and existing.resource_version = p_resource_version then
      return query select 'idempotent_replay', existing.id, existing.sequence;
      return;
    end if;

    return query select 'conflict', existing.id, existing.sequence;
    return;
  end if;

  if exists (
    select 1
    from public.realtime_invalidations i
    where i.care_space_id = p_care_space_id
      and i.child_id = p_child_id
      and i.resource_kind = p_resource_kind
      and i.resource_id = p_resource_id
      and i.resource_version >= p_resource_version
  ) then
    return query select 'version_conflict', null::bigint, null::bigint;
    return;
  end if;

  select coalesce(max(i.sequence), 0) + 1 into next_sequence
  from public.realtime_invalidations i
  where i.care_space_id = p_care_space_id
    and i.child_id = p_child_id;

  insert into public.realtime_invalidations (
    care_space_id,
    child_id,
    session_id,
    resource_kind,
    resource_id,
    resource_version,
    source_event_id,
    sequence
  )
  values (
    p_care_space_id,
    p_child_id,
    p_session_id,
    p_resource_kind,
    p_resource_id,
    p_resource_version,
    p_source_event_id,
    next_sequence
  )
  returning id, sequence into invalidation_id, invalidation_sequence;

  return query select 'created', invalidation_id, invalidation_sequence;
end;
$$;

revoke all on function public.append_realtime_invalidation(uuid, uuid, uuid, text, uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.append_realtime_invalidation(uuid, uuid, uuid, text, uuid, bigint, uuid)
  to service_role;

alter table public.realtime_invalidations enable row level security;
alter table public.realtime_invalidations force row level security;

create policy realtime_invalidations_authorized_select
on public.realtime_invalidations
for select to authenticated
using (
  expires_at > now()
  and app_private.has_child_permission(care_space_id, child_id, 'read')
  and (
    session_id is null
    or exists (
      select 1
      from public.agent_sessions s
      where s.id = session_id
        and s.care_space_id = realtime_invalidations.care_space_id
        and s.child_id = realtime_invalidations.child_id
        and s.owner_user_id = (select auth.uid())
    )
  )
);

revoke all on table public.realtime_invalidations from public, anon, authenticated;
grant select on table public.realtime_invalidations to authenticated;

alter publication supabase_realtime add table public.realtime_invalidations;
