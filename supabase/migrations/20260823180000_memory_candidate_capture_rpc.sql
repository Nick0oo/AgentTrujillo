-- Authorized, request-scoped Cloud boundary for pending memory candidates.
-- The candidate table remains append-only and has no direct guardian write grant.

create or replace function public.capture_memory_candidate(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_source_message_id uuid,
  p_cutoff_at timestamptz,
  p_candidate_id uuid,
  p_memory_type text,
  p_candidate_text text,
  p_source_span_start integer,
  p_source_span_end integer,
  p_extraction_confidence numeric,
  p_sensitivity text,
  p_input_sha256 text,
  p_idempotency_key text,
  p_expires_at timestamptz
)
returns table (
  outcome text,
  id uuid,
  care_space_id uuid,
  child_id uuid,
  created_by uuid,
  memory_type text,
  candidate_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  source_span_start integer,
  source_span_end integer,
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric,
  sensitivity text,
  input_sha256 text,
  idempotency_key text,
  lifecycle text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_actor uuid := (select auth.uid());
  current_now timestamptz := pg_catalog.clock_timestamp();
  session_valid boolean;
  source_captured_at timestamptz;
  existing_row public.clinical_memory_candidates;
  inserted_row public.clinical_memory_candidates;
  source_key text;
begin
  if target_actor is null
    or p_care_space_id is null
    or p_child_id is null
    or p_session_id is null
    or p_authorization_version is null
    or p_source_message_id is null
    or p_cutoff_at is null
    or p_cutoff_at > current_now
    or p_candidate_id is null
    or p_memory_type is null
    or p_memory_type not in (
      'symptom', 'history', 'allergy', 'medication', 'vaccine',
      'measurement', 'development', 'preference', 'summary'
    )
    or p_candidate_text is null
    or pg_catalog.char_length(pg_catalog.btrim(p_candidate_text)) not between 1 and 8000
    or p_source_span_start is null
    or p_source_span_start < 0
    or p_source_span_end is null
    or p_source_span_end <= p_source_span_start
    or p_extraction_confidence is null
    or p_extraction_confidence < 0
    or p_extraction_confidence > 1
    or p_sensitivity is null
    or p_sensitivity not in ('low', 'medium', 'high')
    or p_input_sha256 is null
    or p_input_sha256 !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_expires_at is null
    or p_expires_at <= current_now
    or p_expires_at <= p_cutoff_at
    or p_expires_at > p_cutoff_at + interval '365 days'
  then
    return;
  end if;

  select true
    into session_valid
  from public.agent_sessions s
  join public.children child
    on child.care_space_id = s.care_space_id
    and child.id = s.child_id
  join public.care_spaces space
    on space.id = s.care_space_id
  join public.care_space_members member
    on member.care_space_id = s.care_space_id
    and member.user_id = target_actor
  join public.child_access access
    on access.care_space_id = s.care_space_id
    and access.child_id = s.child_id
    and access.user_id = target_actor
  where s.id = p_session_id
    and s.owner_user_id = target_actor
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version
    and s.status = 'active'
    and s.authorization_expires_at > current_now
    and child.status = 'active'
    and space.status = 'active'
    and member.status = 'active'
    and member.revoked_at is null
    and member.valid_from <= current_now
    and (member.valid_until is null or member.valid_until > current_now)
    and access.status = 'active'
    and access.revoked_at is null
    and access.valid_from <= current_now
    and (access.valid_until is null or access.valid_until > current_now)
    and 'record' = any(access.permissions)
    and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
    and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
    and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
  for share;

  if not found then
    return;
  end if;

  select m.created_at
    into source_captured_at
  from public.messages m
  where m.id = p_source_message_id
    and m.agent_session_id = p_session_id
    and m.care_space_id = p_care_space_id
    and m.child_id = p_child_id
    and m.actor_type = 'guardian'
    and m.actor_user_id = target_actor
    and m.status = 'completed'
    and m.created_at <= p_cutoff_at
    and m.created_at <= current_now
  for share;

  if not found then
    return;
  end if;

  -- One actor lock serializes source replay lookup and the insert. This is
  -- deliberately stronger than a row lock because source replays have no
  -- unique index in the existing additive schema.
  source_key := pg_catalog.concat_ws(':', target_actor::text, p_session_id::text, p_source_message_id::text, p_source_span_start::text, p_source_span_end::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_key, 0));

  select c.*
    into existing_row
  from public.clinical_memory_candidates c
  where c.care_space_id = p_care_space_id
    and c.child_id = p_child_id
    and c.created_by = target_actor
    and c.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing_row.id = p_candidate_id
      and existing_row.memory_type = p_memory_type
      and existing_row.candidate_text = p_candidate_text
      and existing_row.provenance_type = 'chat'
      and existing_row.provenance_source_id = p_source_message_id::text
      and existing_row.provenance_captured_at = source_captured_at
      and existing_row.source_span_start = p_source_span_start
      and existing_row.source_span_end = p_source_span_end
      and existing_row.source_session_id = p_session_id
      and existing_row.source_message_id = p_source_message_id
      and existing_row.extraction_confidence = p_extraction_confidence
      and existing_row.sensitivity = p_sensitivity
      and existing_row.input_sha256 = p_input_sha256
      and existing_row.lifecycle = 'pending'
      and existing_row.expires_at = p_expires_at
    then
      return query select
        'idempotent_replay'::text,
        existing_row.id, existing_row.care_space_id, existing_row.child_id, existing_row.created_by,
        existing_row.memory_type, existing_row.candidate_text, existing_row.provenance_type,
        existing_row.provenance_source_id, existing_row.provenance_captured_at,
        existing_row.source_span_start, existing_row.source_span_end,
        existing_row.source_session_id, existing_row.source_message_id,
        existing_row.extraction_confidence, existing_row.sensitivity, existing_row.input_sha256,
        existing_row.idempotency_key, existing_row.lifecycle, existing_row.expires_at, existing_row.created_at;
      return;
    end if;

    return query select
      'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::timestamptz, null::integer, null::integer, null::uuid, null::uuid,
      null::numeric, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select c.*
    into existing_row
  from public.clinical_memory_candidates c
  where c.care_space_id = p_care_space_id
    and c.child_id = p_child_id
    and c.created_by = target_actor
    and c.source_session_id = p_session_id
    and c.source_message_id = p_source_message_id
    and c.source_span_start = p_source_span_start
    and c.source_span_end = p_source_span_end
  order by c.created_at, c.id
  limit 1
  for update;

  if found then
    if existing_row.id = p_candidate_id
      and existing_row.memory_type = p_memory_type
      and existing_row.candidate_text = p_candidate_text
      and existing_row.provenance_type = 'chat'
      and existing_row.provenance_source_id = p_source_message_id::text
      and existing_row.provenance_captured_at = source_captured_at
      and existing_row.source_span_start = p_source_span_start
      and existing_row.source_span_end = p_source_span_end
      and existing_row.source_session_id = p_session_id
      and existing_row.source_message_id = p_source_message_id
      and existing_row.extraction_confidence = p_extraction_confidence
      and existing_row.sensitivity = p_sensitivity
      and existing_row.input_sha256 = p_input_sha256
      and existing_row.lifecycle = 'pending'
      and existing_row.expires_at = p_expires_at
    then
      return query select
        'source_replay'::text,
        existing_row.id, existing_row.care_space_id, existing_row.child_id, existing_row.created_by,
        existing_row.memory_type, existing_row.candidate_text, existing_row.provenance_type,
        existing_row.provenance_source_id, existing_row.provenance_captured_at,
        existing_row.source_span_start, existing_row.source_span_end,
        existing_row.source_session_id, existing_row.source_message_id,
        existing_row.extraction_confidence, existing_row.sensitivity, existing_row.input_sha256,
        existing_row.idempotency_key, existing_row.lifecycle, existing_row.expires_at, existing_row.created_at;
      return;
    end if;

    return query select
      'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::timestamptz, null::integer, null::integer, null::uuid, null::uuid,
      null::numeric, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.clinical_memory_candidates (
    id, care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity, input_sha256, idempotency_key, lifecycle,
    expires_at, created_at
  ) values (
    p_candidate_id, p_care_space_id, p_child_id, target_actor, p_memory_type, p_candidate_text,
    'chat', p_source_message_id::text, source_captured_at,
    p_source_span_start, p_source_span_end, p_session_id, p_source_message_id,
    p_extraction_confidence, p_sensitivity, p_input_sha256, p_idempotency_key, 'pending',
    p_expires_at, current_now
  )
  returning * into inserted_row;

  return query select
    'created'::text,
    inserted_row.id, inserted_row.care_space_id, inserted_row.child_id, inserted_row.created_by,
    inserted_row.memory_type, inserted_row.candidate_text, inserted_row.provenance_type,
    inserted_row.provenance_source_id, inserted_row.provenance_captured_at,
    inserted_row.source_span_start, inserted_row.source_span_end,
    inserted_row.source_session_id, inserted_row.source_message_id,
    inserted_row.extraction_confidence, inserted_row.sensitivity, inserted_row.input_sha256,
    inserted_row.idempotency_key, inserted_row.lifecycle, inserted_row.expires_at, inserted_row.created_at;
exception
  when unique_violation then
    -- A different source key may race on the existing actor/idempotency key.
    -- Re-read the committed winner and converge without exposing its row.
    select c.*
      into existing_row
    from public.clinical_memory_candidates c
    where c.care_space_id = p_care_space_id
      and c.child_id = p_child_id
      and c.created_by = target_actor
      and c.idempotency_key = p_idempotency_key
    for update;

    if found
      and existing_row.id = p_candidate_id
      and existing_row.memory_type = p_memory_type
      and existing_row.candidate_text = p_candidate_text
      and existing_row.provenance_type = 'chat'
      and existing_row.provenance_source_id = p_source_message_id::text
       and existing_row.provenance_captured_at = source_captured_at
      and existing_row.source_span_start = p_source_span_start
      and existing_row.source_span_end = p_source_span_end
      and existing_row.source_session_id = p_session_id
      and existing_row.source_message_id = p_source_message_id
      and existing_row.extraction_confidence = p_extraction_confidence
      and existing_row.sensitivity = p_sensitivity
      and existing_row.input_sha256 = p_input_sha256
      and existing_row.lifecycle = 'pending'
      and existing_row.expires_at = p_expires_at
    then
      return query select
        'idempotent_replay'::text,
        existing_row.id, existing_row.care_space_id, existing_row.child_id, existing_row.created_by,
        existing_row.memory_type, existing_row.candidate_text, existing_row.provenance_type,
        existing_row.provenance_source_id, existing_row.provenance_captured_at,
        existing_row.source_span_start, existing_row.source_span_end,
        existing_row.source_session_id, existing_row.source_message_id,
        existing_row.extraction_confidence, existing_row.sensitivity, existing_row.input_sha256,
        existing_row.idempotency_key, existing_row.lifecycle, existing_row.expires_at, existing_row.created_at;
      return;
    end if;

    return query select
      'conflict'::text,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text,
      null::text, null::timestamptz, null::integer, null::integer, null::uuid, null::uuid,
      null::numeric, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
end;
$$;

create or replace function public.list_pending_memory_candidates(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_cutoff_at timestamptz
)
returns table (
  id uuid,
  care_space_id uuid,
  child_id uuid,
  created_by uuid,
  memory_type text,
  candidate_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  source_span_start integer,
  source_span_end integer,
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric,
  sensitivity text,
  input_sha256 text,
  idempotency_key text,
  lifecycle text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_actor uuid := (select auth.uid());
  current_now timestamptz := pg_catalog.clock_timestamp();
  session_valid boolean;
begin
  if target_actor is null or p_cutoff_at is null or p_cutoff_at > current_now then
    return;
  end if;

  select true
    into session_valid
  from public.agent_sessions s
  join public.children child
    on child.care_space_id = s.care_space_id
    and child.id = s.child_id
  join public.care_spaces space
    on space.id = s.care_space_id
  join public.care_space_members member
    on member.care_space_id = s.care_space_id
    and member.user_id = target_actor
  join public.child_access access
    on access.care_space_id = s.care_space_id
    and access.child_id = s.child_id
    and access.user_id = target_actor
  where s.id = p_session_id
    and s.owner_user_id = target_actor
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version
    and s.status = 'active'
    and s.authorization_expires_at > current_now
    and child.status = 'active'
    and space.status = 'active'
    and member.status = 'active'
    and member.revoked_at is null
    and member.valid_from <= current_now
    and (member.valid_until is null or member.valid_until > current_now)
    and access.status = 'active'
    and access.revoked_at is null
    and access.valid_from <= current_now
    and (access.valid_until is null or access.valid_until > current_now)
    and 'read' = any(access.permissions)
    and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
    and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
    and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
  for share;

  if not found then
    return;
  end if;

  return query
  select
    c.id, c.care_space_id, c.child_id, c.created_by, c.memory_type, c.candidate_text,
    c.provenance_type, c.provenance_source_id, c.provenance_captured_at,
    c.source_span_start, c.source_span_end, c.source_session_id, c.source_message_id,
    c.extraction_confidence, c.sensitivity, c.input_sha256, c.idempotency_key,
    c.lifecycle, c.expires_at, c.created_at
  from public.clinical_memory_candidates c
  where c.care_space_id = p_care_space_id
    and c.child_id = p_child_id
    and c.lifecycle = 'pending'
    and c.expires_at > current_now
  order by c.created_at, c.id
  limit 1000;
end;
$$;

revoke insert, update, delete, truncate, references, trigger
  on public.clinical_memory_candidates from public, anon, authenticated;
grant select on public.clinical_memory_candidates to authenticated;
revoke all on function public.capture_memory_candidate(
  uuid, uuid, uuid, text, uuid, timestamptz, uuid, text, text, integer, integer,
  numeric, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.capture_memory_candidate(
  uuid, uuid, uuid, text, uuid, timestamptz, uuid, text, text, integer, integer,
  numeric, text, text, text, timestamptz
) to authenticated;
revoke all on function public.list_pending_memory_candidates(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_pending_memory_candidates(uuid, uuid, uuid, text, timestamptz)
  to authenticated;
