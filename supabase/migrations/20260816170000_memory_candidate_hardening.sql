-- Separate unconfirmed memory proposals from confirmed facts.
-- This migration deliberately fails closed if the legacy fact table is not empty:
-- an explicit, reviewed backfill must materialize every old row as a confirmed fact.

create table public.clinical_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  created_by uuid not null,
  memory_type text not null check (memory_type in (
    'symptom', 'history', 'allergy', 'medication', 'vaccine',
    'measurement', 'development', 'preference', 'summary'
  )),
  candidate_text text not null check (char_length(candidate_text) between 1 and 8000),
  provenance_type text not null check (provenance_type in (
    'guardian', 'professional', 'import', 'document', 'chat', 'system'
  )),
  provenance_source_id text not null check (
    char_length(provenance_source_id) between 1 and 256
    and provenance_source_id !~ '^[a-z][a-z0-9+.-]*://'
  ),
  provenance_captured_at timestamptz not null,
  source_span_start integer not null check (source_span_start >= 0),
  source_span_end integer not null check (source_span_end > source_span_start),
  source_session_id uuid,
  source_message_id uuid,
  extraction_confidence numeric(4,3) not null check (extraction_confidence between 0 and 1),
  sensitivity text not null check (sensitivity in ('low', 'medium', 'high')),
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  lifecycle text not null default 'pending' check (lifecycle in ('pending', 'rejected', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint clinical_memory_candidates_scope_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint clinical_memory_candidates_created_by_fk foreign key (created_by)
    references public.guardian_profiles(user_id) on delete restrict,
  constraint clinical_memory_candidates_source_session_scope_fk
    foreign key (source_session_id, care_space_id, child_id)
    references public.agent_sessions(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_candidates_source_message_scope_fk
    foreign key (source_message_id, care_space_id, child_id)
    references public.messages(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_candidates_scope_identity unique (id, care_space_id, child_id),
  constraint clinical_memory_candidates_expiry check (expires_at > created_at),
  constraint clinical_memory_candidates_safe_shape check (
    char_length(btrim(candidate_text)) between 1 and 8000
    and source_span_end > source_span_start
    and extraction_confidence between 0 and 1
  )
);

create unique index clinical_memory_candidates_actor_key_unique
  on public.clinical_memory_candidates(care_space_id, child_id, created_by, idempotency_key);

create index clinical_memory_candidates_pending_idx
  on public.clinical_memory_candidates(care_space_id, child_id, lifecycle, expires_at, created_at desc)
  where lifecycle = 'pending';

create index clinical_memory_candidates_digest_idx
  on public.clinical_memory_candidates(care_space_id, child_id, input_sha256);

create index clinical_memory_candidates_source_session_idx
  on public.clinical_memory_candidates(source_session_id, care_space_id, child_id)
  where source_session_id is not null;

create index clinical_memory_candidates_source_message_idx
  on public.clinical_memory_candidates(source_message_id, care_space_id, child_id)
  where source_message_id is not null;

create or replace function app_private.clinical_memory_jsonb_contains_forbidden_key(value jsonb)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(value)
    when 'object' then exists (
      select 1
      from pg_catalog.jsonb_each(value) as pair(key, nested_value)
      where pg_catalog.lower(pair.key) = any (array[
        'diagnosis', 'diagnostic', 'prescription', 'dose', 'safetoadminister',
        'reasoning', 'chainofthought', 'rawprompt'
      ]::text[])
      or app_private.clinical_memory_jsonb_contains_forbidden_key(pair.nested_value)
    )
    when 'array' then exists (
      select 1
      from pg_catalog.jsonb_array_elements(value) as item(nested_value)
      where app_private.clinical_memory_jsonb_contains_forbidden_key(item.nested_value)
    )
    else false
  end;
$$;

revoke all on function app_private.clinical_memory_jsonb_contains_forbidden_key(jsonb)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from public.clinical_memory_items) then
    raise exception 'clinical_memory_items_legacy_rows_require_review'
      using errcode = '55000';
  end if;
end;
$$;

alter table public.clinical_memory_items
  add column lifecycle text not null default 'active',
  add column retrieval_eligibility text not null default 'ineligible',
  add column provenance_source_id text not null,
  add column provenance_captured_at timestamptz not null,
  add column source_span_start integer not null,
  add column source_span_end integer not null,
  add column extraction_confidence numeric(4,3) not null,
  add column sensitivity text not null,
  add column input_sha256 text not null,
  add column content_sha256 text not null,
  add column confirmation_sha256 text not null,
  add column confirmed_at timestamptz not null,
  add column supersedes_id uuid;

alter table public.clinical_memory_items
  drop constraint if exists clinical_memory_items_confirmation_status_check,
  alter column confirmation_status set default 'confirmed',
  add constraint clinical_memory_items_confirmation_status_confirmed
    check (confirmation_status = 'confirmed');

alter table public.clinical_memory_items
  add constraint clinical_memory_items_lifecycle_check
    check (lifecycle in ('active', 'superseded', 'deleted')),
  add constraint clinical_memory_items_retrieval_eligibility_check
    check (retrieval_eligibility in ('eligible', 'ineligible')),
  add constraint clinical_memory_items_provenance_source_check
    check (
      char_length(provenance_source_id) between 1 and 256
      and provenance_source_id !~ '^[a-z][a-z0-9+.-]*://'
    ),
  add constraint clinical_memory_items_provenance_time_check
    check (provenance_captured_at is not null),
  add constraint clinical_memory_items_source_span_check
    check (
      source_span_start >= 0
      and source_span_end > source_span_start
    ),
  add constraint clinical_memory_items_confidence_check
    check (extraction_confidence between 0 and 1),
  add constraint clinical_memory_items_sensitivity_check
    check (sensitivity in ('low', 'medium', 'high')),
  add constraint clinical_memory_items_input_sha256_check
    check (input_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint clinical_memory_items_content_sha256_check
    check (content_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint clinical_memory_items_confirmation_sha256_check
    check (confirmation_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint clinical_memory_items_structured_content_safe
    check (not app_private.clinical_memory_jsonb_contains_forbidden_key(structured_content)),
  add constraint clinical_memory_items_memory_shape
    check (
      confirmation_status = 'confirmed'
      and lifecycle in ('active', 'superseded', 'deleted')
      and retrieval_eligibility in ('eligible', 'ineligible')
      and (lifecycle = 'active' or retrieval_eligibility = 'ineligible')
      and char_length(btrim(searchable_text)) > 0
    );

alter table public.clinical_memory_items
  add constraint clinical_memory_items_supersedes_scope_fk
  foreign key (supersedes_id, care_space_id, child_id)
  references public.clinical_memory_items(id, care_space_id, child_id) on delete restrict;

create unique index clinical_memory_items_supersedes_unique
  on public.clinical_memory_items(care_space_id, child_id, supersedes_id)
  where supersedes_id is not null;

create index clinical_memory_items_retrieval_idx
  on public.clinical_memory_items(
    care_space_id, child_id, lifecycle, retrieval_eligibility, valid_from desc, id
  );

create index clinical_memory_items_input_digest_idx
  on public.clinical_memory_items(care_space_id, child_id, input_sha256)
  where input_sha256 is not null;

create table public.clinical_memory_candidate_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  decided_by uuid not null,
  decision text not null check (decision in ('confirm', 'reject', 'correct', 'revoke')),
  candidate_input_sha256 text not null check (candidate_input_sha256 ~ '^[a-f0-9]{64}$'),
  confirmation_sha256 text not null check (confirmation_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  memory_item_id uuid,
  decided_at timestamptz not null default now(),
  constraint clinical_memory_candidate_decisions_candidate_scope_fk
    foreign key (candidate_id, care_space_id, child_id)
    references public.clinical_memory_candidates(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_candidate_decisions_memory_scope_fk
    foreign key (memory_item_id, care_space_id, child_id)
    references public.clinical_memory_items(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_candidate_decisions_actor_fk
    foreign key (decided_by) references public.guardian_profiles(user_id) on delete restrict,
  constraint clinical_memory_candidate_decisions_action_shape check (
    (decision = 'reject' and memory_item_id is null)
    or (decision in ('confirm', 'correct', 'revoke') and memory_item_id is not null)
  )
);

create unique index clinical_memory_candidate_decisions_actor_key_unique
  on public.clinical_memory_candidate_decisions(care_space_id, child_id, decided_by, idempotency_key);

create unique index clinical_memory_candidate_decisions_terminal_unique
  on public.clinical_memory_candidate_decisions(care_space_id, child_id, candidate_id)
  where decision in ('confirm', 'reject', 'correct');

create unique index clinical_memory_candidate_decisions_revoke_unique
  on public.clinical_memory_candidate_decisions(care_space_id, child_id, memory_item_id)
  where decision = 'revoke' and memory_item_id is not null;

create index clinical_memory_candidate_decisions_candidate_idx
  on public.clinical_memory_candidate_decisions(care_space_id, child_id, candidate_id, decided_at desc);

create index clinical_memory_candidate_decisions_memory_idx
  on public.clinical_memory_candidate_decisions(care_space_id, child_id, memory_item_id, decided_at desc)
  where memory_item_id is not null;

create or replace function app_private.validate_clinical_memory_candidate_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  candidate_input_sha256 text;
  memory_item_input_sha256 text;
begin
  select candidate.input_sha256
    into candidate_input_sha256
  from public.clinical_memory_candidates candidate
  where candidate.id = new.candidate_id
    and candidate.care_space_id = new.care_space_id
    and candidate.child_id = new.child_id;

  if candidate_input_sha256 is null
    or candidate_input_sha256 is distinct from new.candidate_input_sha256
  then
    raise exception 'clinical_memory_candidate_input_digest_mismatch' using errcode = '23514';
  end if;

  if new.decision in ('confirm', 'correct') then
    if exists (
      select 1
      from public.clinical_memory_candidates candidate
      where candidate.id = new.candidate_id
        and candidate.care_space_id = new.care_space_id
        and candidate.child_id = new.child_id
        and (
          candidate.lifecycle <> 'pending'
          or candidate.expires_at <= pg_catalog.statement_timestamp()
        )
    ) then
      raise exception 'clinical_memory_candidate_not_confirmable' using errcode = '23514';
    end if;
  end if;

  if new.memory_item_id is not null then
    select item.input_sha256
      into memory_item_input_sha256
    from public.clinical_memory_items item
    where item.id = new.memory_item_id
      and item.care_space_id = new.care_space_id
      and item.child_id = new.child_id;

    if memory_item_input_sha256 is null
      or memory_item_input_sha256 is distinct from new.candidate_input_sha256
    then
      raise exception 'clinical_memory_decision_item_digest_mismatch' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.validate_clinical_memory_candidate_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lifecycle <> 'pending' then
    raise exception 'clinical_memory_candidate_initial_state_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function app_private.prevent_clinical_memory_candidate_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'clinical_memory_candidate_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app_private.prevent_clinical_memory_candidate_decision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'clinical_memory_candidate_decision_immutable' using errcode = '42501';
end;
$$;

create or replace function app_private.prevent_clinical_memory_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'clinical_memory_item_immutable' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.care_space_id is distinct from old.care_space_id
    or new.child_id is distinct from old.child_id
    or new.memory_type is distinct from old.memory_type
    or new.structured_content is distinct from old.structured_content
    or new.searchable_text is distinct from old.searchable_text
    or new.provenance_type is distinct from old.provenance_type
    or new.source_session_id is distinct from old.source_session_id
    or new.source_message_id is distinct from old.source_message_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.valid_from is distinct from old.valid_from
    or new.provenance_source_id is distinct from old.provenance_source_id
    or new.provenance_captured_at is distinct from old.provenance_captured_at
    or new.source_span_start is distinct from old.source_span_start
    or new.source_span_end is distinct from old.source_span_end
    or new.extraction_confidence is distinct from old.extraction_confidence
    or new.sensitivity is distinct from old.sensitivity
    or new.input_sha256 is distinct from old.input_sha256
    or new.content_sha256 is distinct from old.content_sha256
    or new.confirmation_sha256 is distinct from old.confirmation_sha256
    or new.confirmed_at is distinct from old.confirmed_at
    or new.supersedes_id is distinct from old.supersedes_id
    or (
      new.confirmation_status is distinct from old.confirmation_status
      and old.input_sha256 is not null
    )
  then
    raise exception 'clinical_memory_item_immutable' using errcode = '42501';
  end if;

  if old.lifecycle = 'deleted'
    and new.lifecycle is distinct from 'deleted'
  then
    raise exception 'clinical_memory_item_transition_invalid' using errcode = '42501';
  end if;

  if old.lifecycle = 'superseded'
    and new.lifecycle not in ('superseded', 'deleted')
  then
    raise exception 'clinical_memory_item_transition_invalid' using errcode = '42501';
  end if;

  if new.lifecycle <> 'active' and new.retrieval_eligibility <> 'ineligible' then
    raise exception 'clinical_memory_item_retrieval_state_invalid' using errcode = '23514';
  end if;

  if old.retrieval_eligibility = 'ineligible'
    and new.retrieval_eligibility = 'eligible'
  then
    raise exception 'clinical_memory_item_retrieval_resurrection' using errcode = '42501';
  end if;

  if new.valid_until is distinct from old.valid_until
    and (
      (old.valid_until is not null and new.valid_until is null)
      or (old.valid_until is not null and new.valid_until > old.valid_until)
    )
  then
    raise exception 'clinical_memory_item_validity_extension' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app_private.require_clinical_memory_confirmation_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.input_sha256 is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.clinical_memory_candidate_decisions decision
    where decision.memory_item_id = new.id
      and decision.care_space_id = new.care_space_id
      and decision.child_id = new.child_id
      and decision.decision in ('confirm', 'correct')
      and decision.candidate_input_sha256 = new.input_sha256
      and decision.confirmation_sha256 = new.confirmation_sha256
  ) then
    raise exception 'clinical_memory_confirmation_decision_required' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_clinical_memory_candidate_decision() from public, anon, authenticated;
revoke all on function app_private.validate_clinical_memory_candidate_insert() from public, anon, authenticated;
revoke all on function app_private.prevent_clinical_memory_candidate_mutation() from public, anon, authenticated;
revoke all on function app_private.prevent_clinical_memory_candidate_decision_mutation() from public, anon, authenticated;
revoke all on function app_private.prevent_clinical_memory_item_mutation() from public, anon, authenticated;
revoke all on function app_private.require_clinical_memory_confirmation_decision() from public, anon, authenticated;

create trigger clinical_memory_candidate_decision_validate
before insert on public.clinical_memory_candidate_decisions
for each row execute function app_private.validate_clinical_memory_candidate_decision();

create trigger clinical_memory_candidates_insert_validate
before insert on public.clinical_memory_candidates
for each row execute function app_private.validate_clinical_memory_candidate_insert();

create trigger clinical_memory_candidates_append_only
before update or delete on public.clinical_memory_candidates
for each row execute function app_private.prevent_clinical_memory_candidate_mutation();

create trigger clinical_memory_candidate_decisions_append_only
before update or delete on public.clinical_memory_candidate_decisions
for each row execute function app_private.prevent_clinical_memory_candidate_decision_mutation();

create trigger clinical_memory_items_lifecycle_guard
before update or delete on public.clinical_memory_items
for each row execute function app_private.prevent_clinical_memory_item_mutation();

create constraint trigger clinical_memory_items_confirmation_guard
after insert on public.clinical_memory_items
deferrable initially deferred
for each row execute function app_private.require_clinical_memory_confirmation_decision();

alter table public.clinical_memory_candidates enable row level security;
alter table public.clinical_memory_candidates force row level security;
revoke all on public.clinical_memory_candidates from public, anon, authenticated;
grant select on public.clinical_memory_candidates to authenticated;
create policy clinical_memory_candidates_child_select on public.clinical_memory_candidates
  for select to authenticated
  using ((select app_private.has_child_permission(care_space_id, child_id, 'read')));

alter table public.clinical_memory_candidate_decisions enable row level security;
alter table public.clinical_memory_candidate_decisions force row level security;
revoke all on public.clinical_memory_candidate_decisions from public, anon, authenticated;
