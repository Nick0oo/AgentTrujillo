-- Authorized, request-scoped Cloud boundary for memory decisions.
-- This migration is forward-only and never changes or removes existing data rows.

create unique index clinical_memory_candidate_decisions_scope_identity
  on public.clinical_memory_candidate_decisions(id, care_space_id, child_id);

create table public.clinical_memory_outbox_events (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  candidate_id uuid not null,
  memory_item_id uuid,
  decided_by uuid not null references public.guardian_profiles(user_id) on delete restrict,
  event_kind text not null check (event_kind in (
    'memory_confirmed', 'memory_rejected', 'memory_corrected', 'memory_revoked'
  )),
  event_version smallint not null default 1 check (event_version = 1),
  candidate_input_sha256 text not null check (candidate_input_sha256 ~ '^[a-f0-9]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  confirmation_sha256 text not null check (confirmation_sha256 ~ '^[a-f0-9]{64}$'),
  event_payload_sha256 text not null check (event_payload_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  constraint clinical_memory_outbox_decision_scope_fk
    foreign key (decision_id, care_space_id, child_id)
    references public.clinical_memory_candidate_decisions(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_outbox_candidate_scope_fk
    foreign key (candidate_id, care_space_id, child_id)
    references public.clinical_memory_candidates(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_outbox_memory_scope_fk
    foreign key (memory_item_id, care_space_id, child_id)
    references public.clinical_memory_items(id, care_space_id, child_id) on delete restrict
);

create unique index clinical_memory_outbox_events_replay_unique
  on public.clinical_memory_outbox_events(care_space_id, child_id, decided_by, idempotency_key);

create unique index clinical_memory_outbox_events_decision_unique
  on public.clinical_memory_outbox_events(decision_id);

create index clinical_memory_outbox_events_unpublished_idx
  on public.clinical_memory_outbox_events(occurred_at, id)
  where published_at is null;

create index clinical_memory_outbox_events_scope_idx
  on public.clinical_memory_outbox_events(care_space_id, child_id, occurred_at desc, id);

create or replace function app_private.prevent_clinical_memory_outbox_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'clinical_memory_outbox_immutable' using errcode = '42501';
  end if;

  if (pg_catalog.to_jsonb(new) - 'published_at') is distinct from (pg_catalog.to_jsonb(old) - 'published_at')
    or old.published_at is not null
    or new.published_at is null
    or new.published_at < old.occurred_at
  then
    raise exception 'clinical_memory_outbox_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.prevent_clinical_memory_outbox_mutation() from public, anon, authenticated;

create trigger clinical_memory_outbox_append_only
before update or delete on public.clinical_memory_outbox_events
for each row execute function app_private.prevent_clinical_memory_outbox_mutation();

alter table public.clinical_memory_outbox_events enable row level security;
alter table public.clinical_memory_outbox_events force row level security;
revoke all on public.clinical_memory_outbox_events from public, anon, authenticated;

create or replace function public.decide_memory_candidate(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_cutoff_at timestamptz,
  p_decision text,
  p_candidate_id uuid,
  p_candidate_input_sha256 text,
  p_policy_sha256 text,
  p_confirmation_sha256 text,
  p_idempotency_key text,
  p_memory_item_id uuid,
  p_memory_type text,
  p_structured_content jsonb,
  p_searchable_text text,
  p_provenance_type text,
  p_provenance_source_id text,
  p_provenance_captured_at timestamptz,
  p_source_span_start integer,
  p_source_span_end integer,
  p_source_session_id uuid,
  p_source_message_id uuid,
  p_extraction_confidence numeric,
  p_sensitivity text,
  p_content_sha256 text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_supersedes_id uuid
)
returns table (
  outcome text,
  decision_id uuid,
  event_id uuid,
  event_kind text,
  event_version integer,
  candidate_id uuid,
  memory_item_id uuid,
  care_space_id uuid,
  child_id uuid,
  candidate_input_sha256 text,
  policy_sha256 text,
  content_sha256 text,
  confirmation_sha256 text,
  event_payload_sha256 text,
  memory_type text,
  structured_content jsonb,
  searchable_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  source_span_start integer,
  source_span_end integer,
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric,
  sensitivity text,
  lifecycle text,
  retrieval_eligibility text,
  input_sha256 text,
  confirmed_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_actor uuid := (select auth.uid());
  current_now timestamptz := pg_catalog.clock_timestamp();
  session_valid boolean;
  candidate_row public.clinical_memory_candidates;
  memory_row public.clinical_memory_items;
  superseded_row public.clinical_memory_items;
  existing_decision public.clinical_memory_candidate_decisions;
  existing_event public.clinical_memory_outbox_events;
  decision_row public.clinical_memory_candidate_decisions;
  event_row public.clinical_memory_outbox_events;
  stored_structured_content jsonb;
  stored_searchable_text text;
  stored_valid_from timestamptz;
  stored_valid_until timestamptz;
  stored_content_sha256 text;
  event_payload_sha256 text;
  lock_key text;
begin
  if target_actor is null
    or p_care_space_id is null
    or p_child_id is null
    or p_session_id is null
    or p_authorization_version is null
    or p_cutoff_at is null
    or p_cutoff_at > current_now
    or p_decision is null
    or p_decision not in ('confirm', 'reject', 'correct', 'revoke')
    or p_candidate_id is null
    or p_candidate_input_sha256 is null
    or p_candidate_input_sha256 !~ '^[a-f0-9]{64}$'
    or p_policy_sha256 is null
    or p_policy_sha256 !~ '^[a-f0-9]{64}$'
    or p_confirmation_sha256 is null
    or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or (p_decision in ('confirm', 'correct') and p_memory_item_id is null)
    or (p_decision = 'reject' and p_memory_item_id is not null)
    or (p_decision = 'revoke' and p_memory_item_id is null)
    or (p_content_sha256 is not null and p_content_sha256 !~ '^[a-f0-9]{64}$')
    or (p_decision = 'correct' and (
      p_memory_type is null
      or p_memory_type not in ('symptom', 'history', 'allergy', 'medication', 'vaccine', 'measurement', 'development', 'preference', 'summary')
      or p_structured_content is null
      or pg_catalog.jsonb_typeof(p_structured_content) <> 'object'
      or p_searchable_text is null
      or pg_catalog.char_length(pg_catalog.btrim(p_searchable_text)) not between 1 and 8000
      or p_provenance_type is null
      or p_provenance_type not in ('guardian', 'professional', 'import', 'document', 'chat', 'system')
      or p_provenance_source_id is null
      or pg_catalog.char_length(p_provenance_source_id) not between 1 and 256
      or p_provenance_source_id ~ '^[a-z][a-z0-9+.-]*://'
      or p_provenance_captured_at is null
      or p_source_span_start is null
      or p_source_span_start < 0
      or p_source_span_end is null
      or p_source_span_end <= p_source_span_start
      or p_extraction_confidence is null
      or p_extraction_confidence < 0
      or p_extraction_confidence > 1
      or p_sensitivity is null
      or p_sensitivity not in ('low', 'medium', 'high')
      or p_valid_from is null
      or p_supersedes_id is null
    ))
    or (p_decision in ('confirm', 'correct') and p_valid_from is not null and p_valid_from > current_now)
    or (p_decision in ('confirm', 'correct') and p_valid_until is not null and p_valid_until <= coalesce(p_valid_from, current_now))
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
  for update;

  if not found then
    return;
  end if;

  lock_key := pg_catalog.concat_ws(':', target_actor::text, p_care_space_id::text, p_child_id::text, p_candidate_id::text, p_idempotency_key);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));

  select c.*
    into candidate_row
  from public.clinical_memory_candidates c
  where c.id = p_candidate_id
    and c.care_space_id = p_care_space_id
    and c.child_id = p_child_id
  for update;

  if not found
    or candidate_row.input_sha256 is distinct from p_candidate_input_sha256
  then
    return;
  end if;

  stored_structured_content := case
    when p_decision = 'correct' then p_structured_content
    when p_decision = 'confirm' then pg_catalog.jsonb_build_object('text', candidate_row.candidate_text)
    else null
  end;
  stored_searchable_text := case
    when p_decision = 'correct' then p_searchable_text
    when p_decision = 'confirm' then candidate_row.candidate_text
    else null
  end;
  stored_content_sha256 := case
    when p_decision in ('confirm', 'correct') then pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'searchable_text', stored_searchable_text,
            'structured_content', stored_structured_content
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    else null
  end;

  if p_decision in ('confirm', 'correct')
    and p_content_sha256 is not null
    and p_content_sha256 is distinct from stored_content_sha256
  then
    return;
  end if;

  select d.*
    into existing_decision
  from public.clinical_memory_candidate_decisions d
  where d.care_space_id = p_care_space_id
    and d.child_id = p_child_id
    and d.decided_by = target_actor
    and d.idempotency_key = p_idempotency_key
  for update;

  if found then
    select e.*
      into existing_event
    from public.clinical_memory_outbox_events e
    where e.decision_id = existing_decision.id
    for update;

    if existing_decision.decision = p_decision
      and existing_decision.candidate_id = p_candidate_id
      and existing_decision.candidate_input_sha256 = p_candidate_input_sha256
      and existing_decision.confirmation_sha256 = p_confirmation_sha256
      and existing_decision.memory_item_id is not distinct from (
        case when p_decision = 'reject' then null else p_memory_item_id end
      )
      and existing_event.policy_sha256 = p_policy_sha256
      and (p_decision = 'revoke' or existing_event.content_sha256 is not distinct from stored_content_sha256)
    then
      return query
      select
        'idempotent_replay'::text,
        d.id, e.id, e.event_kind, e.event_version::integer,
        c.id, i.id, c.care_space_id, c.child_id,
        e.candidate_input_sha256, e.policy_sha256, e.content_sha256,
        e.confirmation_sha256, e.event_payload_sha256,
        i.memory_type, i.structured_content, i.searchable_text,
        i.provenance_type, i.provenance_source_id, i.provenance_captured_at,
        i.source_span_start, i.source_span_end, i.source_session_id, i.source_message_id,
        i.extraction_confidence, i.sensitivity, i.lifecycle, i.retrieval_eligibility,
        i.input_sha256, i.confirmed_at, i.valid_from, i.valid_until, i.supersedes_id
      from public.clinical_memory_candidate_decisions d
      join public.clinical_memory_outbox_events e on e.decision_id = d.id
      join public.clinical_memory_candidates c
        on c.id = d.candidate_id and c.care_space_id = d.care_space_id and c.child_id = d.child_id
      left join public.clinical_memory_items i
        on i.id = d.memory_item_id and i.care_space_id = d.care_space_id and i.child_id = d.child_id
      where d.id = existing_decision.id;
      return;
    end if;

    return query
    select
      'conflict'::text, null::uuid, null::uuid, null::text, null::integer,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::text, null::text, null::jsonb, null::text,
      null::text, null::text, null::timestamptz, null::integer, null::integer,
      null::uuid, null::uuid, null::numeric, null::text, null::text, null::text,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::uuid;
    return;
  end if;

  if p_decision in ('confirm', 'reject', 'correct')
    and (
      candidate_row.lifecycle <> 'pending'
      or candidate_row.expires_at <= current_now
      or (p_decision in ('confirm', 'correct') and p_valid_until is not null and p_valid_until > candidate_row.expires_at)
    )
  then
    return;
  end if;

  if p_decision in ('confirm', 'reject', 'correct')
    and exists (
      select 1
      from public.clinical_memory_candidate_decisions d
      where d.care_space_id = p_care_space_id
        and d.child_id = p_child_id
        and d.candidate_id = p_candidate_id
        and d.decision in ('confirm', 'reject', 'correct')
    )
  then
    return query
    select
      'conflict'::text, null::uuid, null::uuid, null::text, null::integer,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::text, null::text, null::jsonb, null::text,
      null::text, null::text, null::timestamptz, null::integer, null::integer,
      null::uuid, null::uuid, null::numeric, null::text, null::text, null::text,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::uuid;
    return;
  end if;

  if p_decision = 'revoke'
    and exists (
      select 1
      from public.clinical_memory_candidate_decisions d
      where d.care_space_id = p_care_space_id
        and d.child_id = p_child_id
        and d.memory_item_id = p_memory_item_id
        and d.decision = 'revoke'
    )
  then
    return query
    select
      'conflict'::text, null::uuid, null::uuid, null::text, null::integer,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::text, null::text, null::jsonb, null::text,
      null::text, null::text, null::timestamptz, null::integer, null::integer,
      null::uuid, null::uuid, null::numeric, null::text, null::text, null::text,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::uuid;
    return;
  end if;

  if p_decision = 'correct' then
    select i.*
      into superseded_row
    from public.clinical_memory_items i
    where i.id = p_supersedes_id
      and i.care_space_id = p_care_space_id
      and i.child_id = p_child_id
    for update;

    if not found
      or superseded_row.lifecycle <> 'active'
      or superseded_row.retrieval_eligibility <> 'eligible'
      or superseded_row.memory_type is distinct from candidate_row.memory_type
    then
      return;
    end if;
  end if;

  if p_decision in ('confirm', 'correct') then
    select i.*
      into memory_row
    from public.clinical_memory_items i
    where i.id = p_memory_item_id
      and i.care_space_id = p_care_space_id
      and i.child_id = p_child_id
    for update;

    if found then
      return query
      select
        'conflict'::text, null::uuid, null::uuid, null::text, null::integer,
        null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
        null::text, null::text, null::text, null::text, null::jsonb, null::text,
        null::text, null::text, null::timestamptz, null::integer, null::integer,
        null::uuid, null::uuid, null::numeric, null::text, null::text, null::text,
        null::text, null::timestamptz, null::timestamptz, null::timestamptz,
        null::uuid;
      return;
    end if;
  elsif p_decision = 'revoke' then
    select i.*
      into memory_row
    from public.clinical_memory_items i
    where i.id = p_memory_item_id
      and i.care_space_id = p_care_space_id
      and i.child_id = p_child_id
    for update;

    if not found
      or memory_row.confirmation_status <> 'confirmed'
      or memory_row.input_sha256 is distinct from candidate_row.input_sha256
      or memory_row.lifecycle = 'deleted'
      or not exists (
        select 1
        from public.clinical_memory_candidate_decisions source_decision
        where source_decision.care_space_id = p_care_space_id
          and source_decision.child_id = p_child_id
          and source_decision.candidate_id = p_candidate_id
          and source_decision.memory_item_id = p_memory_item_id
          and source_decision.decision in ('confirm', 'correct')
      )
    then
      return;
    end if;
  end if;

  if p_decision = 'correct' and p_memory_type is distinct from candidate_row.memory_type then
    return;
  end if;

  stored_valid_from := case
    when p_decision = 'correct' then p_valid_from
    else coalesce(p_valid_from, current_now)
  end;
  stored_valid_until := case
    when p_decision = 'correct' then p_valid_until
    else p_valid_until
  end;
  if p_decision = 'revoke' then
    stored_content_sha256 := memory_row.content_sha256;
  elsif p_decision = 'reject' then
    stored_content_sha256 := null;
  end if;

  if p_decision in ('confirm', 'correct') then
    if stored_valid_from > current_now
      or (stored_valid_until is not null and stored_valid_until <= stored_valid_from)
    then
      return;
    end if;

    insert into public.clinical_memory_items (
      id, care_space_id, child_id, memory_type, structured_content, searchable_text,
      provenance_type, source_session_id, source_message_id, confirmation_status,
      valid_from, valid_until, created_by, lifecycle, retrieval_eligibility,
      provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
      extraction_confidence, sensitivity, input_sha256, content_sha256,
      confirmation_sha256, confirmed_at, supersedes_id
    ) values (
      p_memory_item_id, p_care_space_id, p_child_id, candidate_row.memory_type,
      stored_structured_content, stored_searchable_text,
      candidate_row.provenance_type, candidate_row.source_session_id, candidate_row.source_message_id,
      'confirmed', stored_valid_from, stored_valid_until, target_actor, 'active', 'eligible',
      candidate_row.provenance_source_id, candidate_row.provenance_captured_at,
      candidate_row.source_span_start, candidate_row.source_span_end,
      candidate_row.extraction_confidence, candidate_row.sensitivity,
      candidate_row.input_sha256, stored_content_sha256, p_confirmation_sha256,
      current_now, case when p_decision = 'correct' then p_supersedes_id else null end
    ) returning * into memory_row;

    if p_decision = 'correct' then
      update public.clinical_memory_items as target
      set lifecycle = 'superseded',
          retrieval_eligibility = 'ineligible',
          valid_until = case
            when superseded_row.valid_until is null then current_now
            else least(superseded_row.valid_until, current_now)
          end
      where target.id = superseded_row.id
        and target.care_space_id = p_care_space_id
        and target.child_id = p_child_id;
    end if;
  elsif p_decision = 'revoke' then
    update public.clinical_memory_items as target
    set retrieval_eligibility = 'ineligible',
        valid_until = case
          when memory_row.valid_until is null then current_now
          else least(memory_row.valid_until, current_now)
        end
    where target.id = memory_row.id
      and target.care_space_id = p_care_space_id
      and target.child_id = p_child_id;

    select i.*
      into memory_row
    from public.clinical_memory_items i
    where i.id = p_memory_item_id
      and i.care_space_id = p_care_space_id
      and i.child_id = p_child_id;
  end if;

  event_payload_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'candidate_id', p_candidate_id,
          'candidate_input_sha256', p_candidate_input_sha256,
          'confirmation_sha256', p_confirmation_sha256,
          'content_sha256', stored_content_sha256,
          'decision', p_decision,
          'idempotency_key', p_idempotency_key,
          'memory_item_id', p_memory_item_id,
          'policy_sha256', p_policy_sha256
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.clinical_memory_candidate_decisions (
    candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    p_candidate_id, p_care_space_id, p_child_id, target_actor, p_decision,
    p_candidate_input_sha256, p_confirmation_sha256, p_idempotency_key,
    case when p_decision = 'reject' then null else p_memory_item_id end
  ) returning * into decision_row;

  insert into public.clinical_memory_outbox_events (
    decision_id, care_space_id, child_id, candidate_id, memory_item_id, decided_by,
    event_kind, event_version, candidate_input_sha256, policy_sha256, content_sha256,
    confirmation_sha256, event_payload_sha256, idempotency_key
  ) values (
    decision_row.id, p_care_space_id, p_child_id, p_candidate_id,
    case when p_decision = 'reject' then null else p_memory_item_id end,
    target_actor,
    case p_decision
      when 'confirm' then 'memory_confirmed'
      when 'reject' then 'memory_rejected'
      when 'correct' then 'memory_corrected'
      else 'memory_revoked'
    end,
    1, p_candidate_input_sha256, p_policy_sha256, stored_content_sha256,
    p_confirmation_sha256, event_payload_sha256, p_idempotency_key
  ) returning * into event_row;

  return query
  select
    case p_decision
      when 'confirm' then 'confirmed'
      when 'reject' then 'rejected'
      when 'correct' then 'corrected'
      else 'revoked'
    end::text,
    decision_row.id, event_row.id, event_row.event_kind, event_row.event_version::integer,
    candidate_row.id, case when p_decision = 'reject' then null else memory_row.id end,
    candidate_row.care_space_id, candidate_row.child_id,
    event_row.candidate_input_sha256, event_row.policy_sha256, event_row.content_sha256,
    event_row.confirmation_sha256, event_row.event_payload_sha256,
    memory_row.memory_type, memory_row.structured_content, memory_row.searchable_text,
    memory_row.provenance_type, memory_row.provenance_source_id, memory_row.provenance_captured_at,
    memory_row.source_span_start, memory_row.source_span_end, memory_row.source_session_id,
    memory_row.source_message_id, memory_row.extraction_confidence, memory_row.sensitivity,
    memory_row.lifecycle, memory_row.retrieval_eligibility, memory_row.input_sha256,
    memory_row.confirmed_at, memory_row.valid_from, memory_row.valid_until, memory_row.supersedes_id;
exception
  when unique_violation then
    -- Concurrent callers converge by re-reading the committed idempotency winner.
    select d.*
      into existing_decision
    from public.clinical_memory_candidate_decisions d
    where d.care_space_id = p_care_space_id
      and d.child_id = p_child_id
      and d.decided_by = target_actor
      and d.idempotency_key = p_idempotency_key
    for update;

    if found
      and existing_decision.decision = p_decision
      and existing_decision.candidate_id = p_candidate_id
      and existing_decision.candidate_input_sha256 = p_candidate_input_sha256
      and existing_decision.confirmation_sha256 = p_confirmation_sha256
    then
      select e.* into existing_event
      from public.clinical_memory_outbox_events e
      where e.decision_id = existing_decision.id;
      if existing_event.policy_sha256 = p_policy_sha256
        and (p_decision = 'revoke' or existing_event.content_sha256 is not distinct from stored_content_sha256)
      then
        return query
        select
          'idempotent_replay'::text,
          d.id, e.id, e.event_kind, e.event_version::integer,
          c.id, i.id, c.care_space_id, c.child_id,
          e.candidate_input_sha256, e.policy_sha256, e.content_sha256,
          e.confirmation_sha256, e.event_payload_sha256,
          i.memory_type, i.structured_content, i.searchable_text,
          i.provenance_type, i.provenance_source_id, i.provenance_captured_at,
          i.source_span_start, i.source_span_end, i.source_session_id, i.source_message_id,
          i.extraction_confidence, i.sensitivity, i.lifecycle, i.retrieval_eligibility,
          i.input_sha256, i.confirmed_at, i.valid_from, i.valid_until, i.supersedes_id
        from public.clinical_memory_candidate_decisions d
        join public.clinical_memory_outbox_events e on e.decision_id = d.id
        join public.clinical_memory_candidates c
          on c.id = d.candidate_id and c.care_space_id = d.care_space_id and c.child_id = d.child_id
        left join public.clinical_memory_items i
          on i.id = d.memory_item_id and i.care_space_id = d.care_space_id and i.child_id = d.child_id
        where d.id = existing_decision.id;
        return;
      end if;
    end if;
    return query
    select
      'conflict'::text, null::uuid, null::uuid, null::text, null::integer,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::text, null::text, null::jsonb, null::text,
      null::text, null::text, null::timestamptz, null::integer, null::integer,
      null::uuid, null::uuid, null::numeric, null::text, null::text, null::text,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz,
      null::uuid;
end;
$$;

create or replace function public.get_confirmed_memory(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_cutoff_at timestamptz,
  p_memory_item_id uuid
)
returns table (
  id uuid,
  care_space_id uuid,
  child_id uuid,
  memory_type text,
  structured_content jsonb,
  searchable_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  source_span_start integer,
  source_span_end integer,
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric,
  sensitivity text,
  lifecycle text,
  retrieval_eligibility text,
  input_sha256 text,
  content_sha256 text,
  confirmation_sha256 text,
  confirmed_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_id uuid
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
  if target_actor is null or p_care_space_id is null or p_child_id is null
    or p_session_id is null or p_authorization_version is null
    or p_cutoff_at is null or p_cutoff_at > current_now or p_memory_item_id is null
  then
    return;
  end if;

  select true into session_valid
  from public.agent_sessions s
  join public.children child on child.care_space_id = s.care_space_id and child.id = s.child_id
  join public.care_spaces space on space.id = s.care_space_id
  join public.care_space_members member on member.care_space_id = s.care_space_id and member.user_id = target_actor
  join public.child_access access on access.care_space_id = s.care_space_id and access.child_id = s.child_id and access.user_id = target_actor
  where s.id = p_session_id and s.owner_user_id = target_actor
    and s.care_space_id = p_care_space_id and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version and s.status = 'active'
    and s.authorization_expires_at > current_now and child.status = 'active' and space.status = 'active'
    and member.status = 'active' and member.revoked_at is null and member.valid_from <= current_now
    and (member.valid_until is null or member.valid_until > current_now)
    and access.status = 'active' and access.revoked_at is null and access.valid_from <= current_now
    and (access.valid_until is null or access.valid_until > current_now)
    and 'read' = any(access.permissions)
    and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
    and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
    and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
  for share;
  if not found then return; end if;

  return query
  select i.id, i.care_space_id, i.child_id, i.memory_type, i.structured_content, i.searchable_text,
    i.provenance_type, i.provenance_source_id, i.provenance_captured_at, i.source_span_start,
    i.source_span_end, i.source_session_id, i.source_message_id, i.extraction_confidence, i.sensitivity,
    i.lifecycle, i.retrieval_eligibility, i.input_sha256, i.content_sha256, i.confirmation_sha256,
    i.confirmed_at, i.valid_from, i.valid_until, i.supersedes_id
  from public.clinical_memory_items i
  where i.id = p_memory_item_id and i.care_space_id = p_care_space_id and i.child_id = p_child_id
    and i.confirmation_status = 'confirmed';
end;
$$;

create or replace function public.list_confirmed_memory(
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
  memory_type text,
  structured_content jsonb,
  searchable_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  source_span_start integer,
  source_span_end integer,
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric,
  sensitivity text,
  lifecycle text,
  retrieval_eligibility text,
  input_sha256 text,
  content_sha256 text,
  confirmation_sha256 text,
  confirmed_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes_id uuid
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
  if target_actor is null or p_care_space_id is null or p_child_id is null
    or p_session_id is null or p_authorization_version is null
    or p_cutoff_at is null or p_cutoff_at > current_now
  then
    return;
  end if;

  select true into session_valid
  from public.agent_sessions s
  join public.children child on child.care_space_id = s.care_space_id and child.id = s.child_id
  join public.care_spaces space on space.id = s.care_space_id
  join public.care_space_members member on member.care_space_id = s.care_space_id and member.user_id = target_actor
  join public.child_access access on access.care_space_id = s.care_space_id and access.child_id = s.child_id and access.user_id = target_actor
  where s.id = p_session_id and s.owner_user_id = target_actor
    and s.care_space_id = p_care_space_id and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version and s.status = 'active'
    and s.authorization_expires_at > current_now and child.status = 'active' and space.status = 'active'
    and member.status = 'active' and member.revoked_at is null and member.valid_from <= current_now
    and (member.valid_until is null or member.valid_until > current_now)
    and access.status = 'active' and access.revoked_at is null and access.valid_from <= current_now
    and (access.valid_until is null or access.valid_until > current_now)
    and 'read' = any(access.permissions)
    and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
    and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
    and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
  for share;
  if not found then return; end if;

  return query
  select i.id, i.care_space_id, i.child_id, i.memory_type, i.structured_content, i.searchable_text,
    i.provenance_type, i.provenance_source_id, i.provenance_captured_at, i.source_span_start,
    i.source_span_end, i.source_session_id, i.source_message_id, i.extraction_confidence, i.sensitivity,
    i.lifecycle, i.retrieval_eligibility, i.input_sha256, i.content_sha256, i.confirmation_sha256,
    i.confirmed_at, i.valid_from, i.valid_until, i.supersedes_id
  from public.clinical_memory_items i
  where i.care_space_id = p_care_space_id and i.child_id = p_child_id
    and i.confirmation_status = 'confirmed'
    and i.lifecycle = 'active'
  order by i.valid_from desc, i.id
  limit 1000;
end;
$$;

-- Keep the existing list signature, but hide all terminal decisions.
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
  if target_actor is null or p_care_space_id is null or p_child_id is null
    or p_session_id is null or p_authorization_version is null
    or p_cutoff_at is null or p_cutoff_at > current_now then
    return;
  end if;

  select true into session_valid
  from public.agent_sessions s
  join public.children child on child.care_space_id = s.care_space_id and child.id = s.child_id
  join public.care_spaces space on space.id = s.care_space_id
  join public.care_space_members member on member.care_space_id = s.care_space_id and member.user_id = target_actor
  join public.child_access access on access.care_space_id = s.care_space_id and access.child_id = s.child_id and access.user_id = target_actor
  where s.id = p_session_id and s.owner_user_id = target_actor
    and s.care_space_id = p_care_space_id and s.child_id = p_child_id
    and s.authorization_version = p_authorization_version and s.status = 'active'
    and s.authorization_expires_at > current_now and child.status = 'active' and space.status = 'active'
    and member.status = 'active' and member.revoked_at is null and member.valid_from <= current_now
    and (member.valid_until is null or member.valid_until > current_now)
    and access.status = 'active' and access.revoked_at is null and access.valid_from <= current_now
    and (access.valid_until is null or access.valid_until > current_now)
    and 'read' = any(access.permissions)
    and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
    and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
    and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
  for share;
  if not found then return; end if;

  return query
  select c.id, c.care_space_id, c.child_id, c.created_by, c.memory_type, c.candidate_text,
    c.provenance_type, c.provenance_source_id, c.provenance_captured_at, c.source_span_start,
    c.source_span_end, c.source_session_id, c.source_message_id, c.extraction_confidence,
    c.sensitivity, c.input_sha256, c.idempotency_key, c.lifecycle, c.expires_at, c.created_at
  from public.clinical_memory_candidates c
  where c.care_space_id = p_care_space_id and c.child_id = p_child_id
    and c.lifecycle = 'pending' and c.expires_at > current_now
    and not exists (
      select 1 from public.clinical_memory_candidate_decisions d
      where d.candidate_id = c.id and d.care_space_id = c.care_space_id and d.child_id = c.child_id
        and d.decision in ('confirm', 'reject', 'correct')
    )
  order by c.created_at, c.id
  limit 1000;
end;
$$;

revoke all on function public.decide_memory_candidate(
  uuid, uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, uuid,
  text, jsonb, text, text, text, timestamptz, integer, integer, uuid, uuid, numeric,
  text, text, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.decide_memory_candidate(
  uuid, uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, uuid,
  text, jsonb, text, text, text, timestamptz, integer, integer, uuid, uuid, numeric,
  text, text, timestamptz, timestamptz, uuid
) to authenticated;

revoke all on function public.get_confirmed_memory(uuid, uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_confirmed_memory(uuid, uuid, uuid, text, timestamptz, uuid) to authenticated;
revoke all on function public.list_confirmed_memory(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.list_confirmed_memory(uuid, uuid, uuid, text, timestamptz) to authenticated;
revoke all on function public.list_pending_memory_candidates(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.list_pending_memory_candidates(uuid, uuid, uuid, text, timestamptz) to authenticated;
