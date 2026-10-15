-- Module 12 projection inbox, checkpoints, and quarantine.
-- Forward-only and additive. The tables are private job state; mobile roles
-- never read or write them directly.

begin;

create table public.projection_inbox (
  id bigint generated always as identity primary key,
  projector_name text not null check (projector_name ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  projector_version text not null check (projector_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_event_id text not null check (source_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_event_version text not null check (source_event_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_sequence bigint not null check (source_sequence > 0),
  owner_user_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  product_session_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  result_sha256 text check (result_sha256 is null or result_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'claimed' check (status in ('claimed', 'completed', 'failed', 'quarantined')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9._-]{0,63}$'),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projection_inbox_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint projection_inbox_source_unique unique (
    projector_name, projector_version, owner_user_id, care_space_id, child_id,
    product_session_id, source_event_id
  )
);

create table public.projection_checkpoints (
  projector_name text not null check (projector_name ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  projector_version text not null check (projector_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  owner_user_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  product_session_id uuid not null,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (projector_name, projector_version, owner_user_id, care_space_id, child_id, product_session_id),
  constraint projection_checkpoint_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.projection_quarantine (
  id bigint generated always as identity primary key,
  projector_name text not null check (projector_name ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  projector_version text not null check (projector_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_event_id text not null check (source_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_event_version text not null check (source_event_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  source_sequence bigint not null check (source_sequence > 0),
  owner_user_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  product_session_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('invalid_event', 'source_conflict', 'projection_failed', 'scope_mismatch', 'checkpoint_gap')),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9._-]{0,63}$'),
  metadata_redacted jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_redacted) = 'object'),
  created_at timestamptz not null default now(),
  constraint projection_quarantine_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint projection_quarantine_replay_unique unique (
    projector_name, projector_version, owner_user_id, care_space_id, child_id,
    product_session_id, source_event_id, input_sha256, reason
  )
);

create index projection_inbox_pending_idx
  on public.projection_inbox(projector_name, projector_version, status, source_sequence);
create index projection_inbox_scope_idx
  on public.projection_inbox(care_space_id, child_id, product_session_id, source_sequence);
create index projection_quarantine_scope_idx
  on public.projection_quarantine(care_space_id, child_id, created_at desc);

create or replace function app_private.prevent_projection_quarantine_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'projection quarantine is append-only';
end;
$$;

create trigger projection_quarantine_append_only
before update or delete on public.projection_quarantine
for each row execute function app_private.prevent_projection_quarantine_mutation();

create or replace function public.claim_projection_source(
  p_projector_name text,
  p_projector_version text,
  p_source_event_id text,
  p_source_event_version text,
  p_source_sequence bigint,
  p_owner_user_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_product_session_id uuid,
  p_input_sha256 text
)
returns table (inbox_id bigint, claim_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.projection_inbox;
begin
  select * into existing
  from public.projection_inbox
  where projector_name = p_projector_name
    and projector_version = p_projector_version
    and source_event_id = p_source_event_id
    and owner_user_id = p_owner_user_id
    and care_space_id = p_care_space_id
    and child_id = p_child_id
    and product_session_id = p_product_session_id
  for update;

  if found then
    inbox_id := existing.id;
    if existing.input_sha256 <> p_input_sha256 then
      claim_status := 'conflict';
    elsif existing.status = 'completed' then
      claim_status := 'completed';
    elsif existing.status = 'quarantined' then
      claim_status := 'quarantined';
    else
      update public.projection_inbox
      set status = 'claimed', attempt_count = existing.attempt_count + 1,
          claimed_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
      where id = existing.id;
      claim_status := 'claimed';
    end if;
    return next;
    return;
  end if;

  insert into public.projection_inbox (
    projector_name, projector_version, source_event_id, source_event_version,
    source_sequence, owner_user_id, care_space_id, child_id, product_session_id,
    input_sha256
  ) values (
    p_projector_name, p_projector_version, p_source_event_id, p_source_event_version,
    p_source_sequence, p_owner_user_id, p_care_space_id, p_child_id, p_product_session_id,
    p_input_sha256
  ) returning id into inbox_id;
  claim_status := 'claimed';
  return next;
end;
$$;

create or replace function public.complete_projection_source(
  p_inbox_id bigint,
  p_result_sha256 text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projection_inbox;
begin
  select * into target from public.projection_inbox where id = p_inbox_id for update;
  if not found then return false; end if;
  if target.status = 'completed' then return target.result_sha256 is not distinct from p_result_sha256; end if;
  if target.status <> 'claimed' then return false; end if;
  update public.projection_inbox
  set status = 'completed', result_sha256 = p_result_sha256,
      completed_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where id = p_inbox_id;
  insert into public.projection_checkpoints (
    projector_name, projector_version, owner_user_id, care_space_id, child_id,
    product_session_id, last_sequence
  ) values (
    target.projector_name, target.projector_version, target.owner_user_id, target.care_space_id,
    target.child_id, target.product_session_id, target.source_sequence
  ) on conflict (projector_name, projector_version, owner_user_id, care_space_id, child_id, product_session_id)
  do update set last_sequence = greatest(public.projection_checkpoints.last_sequence, excluded.last_sequence),
                updated_at = pg_catalog.clock_timestamp();
  return true;
end;
$$;

create or replace function public.fail_projection_source(p_inbox_id bigint, p_error_code text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.projection_inbox
  set status = 'failed', last_error_code = p_error_code, updated_at = pg_catalog.clock_timestamp()
  where id = p_inbox_id and status = 'claimed'
  returning true;
$$;

create or replace function public.quarantine_projection_source(
  p_inbox_id bigint,
  p_reason text,
  p_error_code text default null,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.projection_inbox;
begin
  select * into target from public.projection_inbox where id = p_inbox_id for update;
  if not found or target.status = 'completed' then return false; end if;
  insert into public.projection_quarantine (
    projector_name, projector_version, source_event_id, source_event_version, source_sequence,
    owner_user_id, care_space_id, child_id, product_session_id, input_sha256, reason,
    error_code, metadata_redacted
  ) values (
    target.projector_name, target.projector_version, target.source_event_id, target.source_event_version,
    target.source_sequence, target.owner_user_id, target.care_space_id, target.child_id,
    target.product_session_id, target.input_sha256, p_reason, p_error_code, p_metadata_redacted
  ) on conflict do nothing;
  update public.projection_inbox
  set status = 'quarantined', last_error_code = p_error_code, updated_at = pg_catalog.clock_timestamp()
  where id = p_inbox_id;
  return true;
end;
$$;

alter table public.projection_inbox enable row level security;
alter table public.projection_inbox force row level security;
alter table public.projection_checkpoints enable row level security;
alter table public.projection_checkpoints force row level security;
alter table public.projection_quarantine enable row level security;
alter table public.projection_quarantine force row level security;

revoke all on public.projection_inbox from public, anon, authenticated;
revoke all on public.projection_checkpoints from public, anon, authenticated;
revoke all on public.projection_quarantine from public, anon, authenticated;
revoke all on function public.claim_projection_source(text,text,text,text,bigint,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.complete_projection_source(bigint,text) from public, anon, authenticated;
revoke all on function public.fail_projection_source(bigint,text) from public, anon, authenticated;
revoke all on function public.quarantine_projection_source(bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_projection_source(text,text,text,text,bigint,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.complete_projection_source(bigint,text) to service_role;
grant execute on function public.fail_projection_source(bigint,text) to service_role;
grant execute on function public.quarantine_projection_source(bigint,text,text,jsonb) to service_role;

commit;
