-- Module 11 Creciendo command and event ledger.
-- Forward-only, additive, transactional, and safe for the shared Cloud project.
-- Durable payloads contain only the bounded public mobile projection.

begin;

do $$
begin
  if to_regclass('public.agent_sessions') is null
    or to_regclass('public.messages') is null
    or to_regprocedure('public.create_owned_agent_session(uuid,uuid,text,timestamptz,text,text,jsonb)') is null then
    raise exception 'AT-11-10 preflight failed: session foundation is incomplete';
  end if;

  if exists (
    select 1
    from public.agent_sessions s
    where s.last_sequence < 0 or s.last_sequence > 9007199254740991
  ) then
    raise exception 'AT-11-10 preflight failed: session sequence exceeds the mobile integer boundary';
  end if;

  if exists (
    select 1
    from public.agent_sessions s
    where s.channel = 'creciendo_mobile'
      and s.initial_configuration ->> 'create_idempotency_sha256' ~ '^[a-f0-9]{64}$'
    group by s.owner_user_id, s.care_space_id, s.child_id,
      s.initial_configuration ->> 'create_idempotency_sha256'
    having count(*) > 1
  ) then
    raise exception 'AT-11-10 preflight failed: duplicate Creciendo create binding';
  end if;
end;
$$;

create or replace function app_private.creciendo_jsonb_has_exact_keys(
  target jsonb,
  expected_keys text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(target) = 'object'
    and coalesce(
      (select pg_catalog.array_agg(key_name order by key_name)
       from pg_catalog.jsonb_object_keys(target) as key_name),
      '{}'::text[]
    ) = coalesce(
      (select pg_catalog.array_agg(expected_key order by expected_key)
       from pg_catalog.unnest(expected_keys) as expected_key),
      '{}'::text[]
    );
$$;

create or replace function app_private.creciendo_json_sha256(target jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(target::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function app_private.creciendo_channel_payload_is_safe(
  target jsonb,
  depth integer default 0
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item record;
  scalar_text text;
  forbidden_keys constant text[] := array[
    '__proto__', 'prototype', 'constructor',
    'reasoning', 'chain_of_thought', 'chainofthought', 'thoughts',
    'prompt', 'system_prompt', 'systemprompt', 'instructions',
    'args', 'arguments', 'tool_arguments', 'toolarguments',
    'result', 'tool_result', 'toolresult', 'raw', 'raw_payload', 'rawpayload',
    'provider_frame', 'providerframe', 'provider_metadata', 'providermetadata',
    'authorization', 'bearer', 'access_token', 'accesstoken',
    'refresh_token', 'refreshtoken', 'service_role', 'servicerole',
    'secret', 'password', 'credential', 'credentials',
    'child_id', 'childid', 'care_space_id', 'carespaceid',
    'owner_user_id', 'owneruserid', 'permissions', 'security_version',
    'securityversion', 'continuation_token', 'continuationtoken'
  ];
begin
  if target is null or depth > 24 then
    return false;
  end if;

  case pg_catalog.jsonb_typeof(target)
    when 'object' then
      for item in select key, value from pg_catalog.jsonb_each(target) loop
        if pg_catalog.char_length(item.key) > 128
          or item.key !~ '^[A-Za-z][A-Za-z0-9._-]{0,127}$'
          or pg_catalog.lower(item.key) = any(forbidden_keys)
          or not app_private.creciendo_channel_payload_is_safe(item.value, depth + 1) then
          return false;
        end if;
      end loop;
      return true;
    when 'array' then
      if pg_catalog.jsonb_array_length(target) > 2048 then
        return false;
      end if;
      for item in select value from pg_catalog.jsonb_array_elements(target) loop
        if not app_private.creciendo_channel_payload_is_safe(item.value, depth + 1) then
          return false;
        end if;
      end loop;
      return true;
    when 'string' then
      scalar_text := target #>> '{}';
      return pg_catalog.octet_length(scalar_text) <= 262144
        and pg_catalog.regexp_replace(scalar_text, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]';
    when 'number', 'boolean', 'null' then
      return true;
    else
      return false;
  end case;
end;
$$;

create or replace function app_private.creciendo_emergency_widget_is_valid(widget jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  data_value jsonb;
  copy_value jsonb;
  locale_value text;
  expected_copy_id text;
  expected_text text;
begin
  if not app_private.creciendo_jsonb_has_exact_keys(widget, array['kind', 'version', 'data'])
    or widget ->> 'kind' <> 'emergency_recommendation'
    or widget ->> 'version' <> 'emergency.recommendation.v1' then
    return false;
  end if;

  data_value := widget -> 'data';
  if not app_private.creciendo_jsonb_has_exact_keys(
      data_value,
      array['contentType', 'terminal', 'locale', 'copy', 'text', 'screenReaderText', 'fallbackText']
    )
    or data_value ->> 'contentType' <> 'text/emergency.recommendation.v1'
    or data_value -> 'terminal' <> 'true'::jsonb then
    return false;
  end if;

  locale_value := data_value ->> 'locale';
  if locale_value = 'es-CO' then
    expected_copy_id := 'emergency-es-co';
    expected_text := 'Acudan directamente al servicio de urgencias.';
  elsif locale_value = 'en-US' then
    expected_copy_id := 'emergency-en-us';
    expected_text := 'Go directly to the emergency department.';
  else
    return false;
  end if;

  copy_value := data_value -> 'copy';
  return app_private.creciendo_jsonb_has_exact_keys(copy_value, array['id', 'version'])
    and copy_value ->> 'id' = expected_copy_id
    and copy_value ->> 'version' = 'emergency-copy-v1'
    and data_value ->> 'text' = expected_text
    and data_value ->> 'screenReaderText' = expected_text
    and data_value ->> 'fallbackText' = expected_text;
end;
$$;

create or replace function app_private.creciendo_widget_reference_is_registered(widget jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select app_private.creciendo_jsonb_has_exact_keys(widget, array['kind', 'version', 'data'])
    and (widget ->> 'kind', widget ->> 'version') in (
      ('growth_summary', 'growth.summary.v1'),
      ('vaccination_status', 'vaccination.status.v1'),
      ('medication_schedule_preview', 'medication.schedule-preview.v1'),
      ('development_observation_preview', 'development.observation-preview.v1'),
      ('nutrition_guidance', 'nutrition.guidance.v1'),
      ('guardian_confirmation', 'guardian.confirmation.v1'),
      ('professional_recommendation', 'professional.recommendation.v1'),
      ('source_list', 'sources.list.v1'),
      ('dose_validation', 'medication.dose-validation.v1')
    );
$$;

create or replace function app_private.creciendo_event_payload_matches_type(
  event_kind text,
  payload_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  widget jsonb;
  error_value jsonb;
  retryable_value boolean;
  resumable_value boolean;
  retry_after integer;
begin
  if pg_catalog.jsonb_typeof(payload_value) <> 'object' then
    return false;
  end if;

  if event_kind = 'text-delta' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['text'])
      and pg_catalog.jsonb_typeof(payload_value -> 'text') = 'string'
      and pg_catalog.char_length(payload_value ->> 'text') between 1 and 4096;
  elsif event_kind = 'tool-state' then
    widget := payload_value -> 'widget';
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['widget'])
      and pg_catalog.jsonb_typeof(widget) = 'object'
      and widget ->> 'kind' = 'tool_state'
      and widget ->> 'version' = 'tool.state.v1';
  elsif event_kind = 'ui-part' then
    widget := payload_value -> 'widget';
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['widget'])
      and app_private.creciendo_widget_reference_is_registered(widget);
  elsif event_kind = 'citation' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['citationId', 'label', 'href'])
      and pg_catalog.char_length(payload_value ->> 'citationId') between 1 and 200
      and payload_value ->> 'citationId' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      and pg_catalog.char_length(payload_value ->> 'label') between 1 and 256
      and pg_catalog.char_length(payload_value ->> 'href') between 9 and 2048
      and payload_value ->> 'href' ~ '^https://[^[:space:]?#]+(/[^[:space:]?#]*)?$';
  elsif event_kind = 'heartbeat' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['observedAt'])
      and payload_value ->> 'observedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}';
  elsif event_kind = 'message-complete' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['messageId', 'outcome', 'effectState'])
      and payload_value ->> 'messageId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and payload_value ->> 'outcome' in ('completed', 'abstained')
      and payload_value ->> 'effectState' in ('none', 'committed', 'unknown');
  elsif event_kind = 'session-cancelled' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['outcome', 'effectState'])
      and (
        (payload_value ->> 'outcome' = 'requested' and payload_value ->> 'effectState' = 'unknown')
        or (payload_value ->> 'outcome' = 'already_terminal' and payload_value ->> 'effectState' = 'committed')
        or (payload_value ->> 'outcome' = 'cancelled_before_effect' and payload_value ->> 'effectState' = 'none')
        or (payload_value ->> 'outcome' = 'effect_may_have_committed' and payload_value ->> 'effectState' = 'unknown')
      );
  elsif event_kind = 'emergency-recommendation' then
    return app_private.creciendo_jsonb_has_exact_keys(payload_value, array['widget'])
      and app_private.creciendo_emergency_widget_is_valid(payload_value -> 'widget');
  elsif event_kind = 'stream-error' then
    error_value := payload_value -> 'error';
    if not app_private.creciendo_jsonb_has_exact_keys(payload_value, array['error'])
      or not app_private.creciendo_jsonb_has_exact_keys(
        error_value,
        array['version', 'code', 'retryable', 'retryAfterSeconds', 'effectState', 'resumable']
      )
      or error_value ->> 'version' <> 'creciendo.error.v1'
      or error_value ->> 'code' not in (
        'AUTHENTICATION_REQUIRED', 'ACCESS_DENIED', 'REQUEST_INVALID', 'VERSION_UNSUPPORTED',
        'RATE_LIMITED', 'CONFLICT', 'RETENTION_GAP', 'PROVIDER_UNAVAILABLE',
        'PERSISTENCE_UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'INTERNAL_UNAVAILABLE'
      )
      or error_value ->> 'effectState' not in ('none', 'committed', 'unknown')
      or pg_catalog.jsonb_typeof(error_value -> 'retryable') <> 'boolean'
      or pg_catalog.jsonb_typeof(error_value -> 'resumable') <> 'boolean'
      or pg_catalog.jsonb_typeof(error_value -> 'retryAfterSeconds') not in ('number', 'null') then
      return false;
    end if;
    retryable_value := (error_value ->> 'retryable')::boolean;
    resumable_value := (error_value ->> 'resumable')::boolean;
    retry_after := case when error_value -> 'retryAfterSeconds' = 'null'::jsonb
      then null else (error_value ->> 'retryAfterSeconds')::integer end;
    return (not retryable_value or (
        error_value ->> 'effectState' = 'none'
        and error_value ->> 'code' in ('RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PERSISTENCE_UNAVAILABLE', 'TIMEOUT')
      ))
      and (retry_after is null or (
        retryable_value and error_value ->> 'code' = 'RATE_LIMITED' and retry_after between 1 and 300
      ))
      and (not resumable_value or error_value ->> 'code' not in (
        'AUTHENTICATION_REQUIRED', 'ACCESS_DENIED', 'RETENTION_GAP', 'CANCELLED'
      ));
  end if;

  return false;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function app_private.creciendo_message_parts_are_valid(parts_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(parts_value) = 'array'
    and pg_catalog.jsonb_array_length(parts_value) between 1 and 8
    and coalesce((
      select pg_catalog.bool_and(
        app_private.creciendo_jsonb_has_exact_keys(part, array['type', 'text'])
        and part ->> 'type' = 'text'
        and pg_catalog.jsonb_typeof(part -> 'text') = 'string'
        and pg_catalog.char_length(part ->> 'text') between 1 and 8000
        and pg_catalog.regexp_replace(part ->> 'text', E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]'
      )
      from pg_catalog.jsonb_array_elements(parts_value) as part
    ), false)
    and coalesce((
      select sum(pg_catalog.char_length(part ->> 'text')) <= 16000
      from pg_catalog.jsonb_array_elements(parts_value) as part
    ), false);
$$;

create or replace function app_private.creciendo_session_access_is_live(
  target_owner uuid,
  target_care_space uuid,
  target_child uuid,
  target_authorization_version text,
  required_permission text
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select target_owner is not null
    and required_permission in ('read', 'record')
    and exists (
      select 1
      from public.children c
      join public.care_space_members m
        on m.care_space_id = c.care_space_id
       and m.user_id = target_owner
      join public.child_access a
        on a.care_space_id = c.care_space_id
       and a.child_id = c.id
       and a.user_id = target_owner
      where c.id = target_child
        and c.care_space_id = target_care_space
        and c.status = 'active'
        and m.status = 'active'
        and m.revoked_at is null
        and m.valid_from <= pg_catalog.clock_timestamp()
        and (m.valid_until is null or m.valid_until > pg_catalog.clock_timestamp())
        and a.status = 'active'
        and a.revoked_at is null
        and a.valid_from <= pg_catalog.clock_timestamp()
        and (a.valid_until is null or a.valid_until > pg_catalog.clock_timestamp())
        and required_permission = any(a.permissions)
        and target_authorization_version = pg_catalog.format(
          'm:%s:a:%s', m.authorization_version, a.authorization_version
        )
    );
$$;

revoke all on function app_private.creciendo_jsonb_has_exact_keys(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_json_sha256(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_channel_payload_is_safe(jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_emergency_widget_is_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_widget_reference_is_registered(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_event_payload_matches_type(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_message_parts_are_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.creciendo_session_access_is_live(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;

alter table public.agent_sessions
  add column channel_terminal_sequence bigint,
  add column channel_terminal_event_id uuid,
  add column channel_retained_from_sequence bigint not null default 1,
  add column channel_cancel_operation_id uuid,
  add constraint agent_sessions_channel_sequence_boundary
    check (last_sequence <= 9007199254740991),
  add constraint agent_sessions_channel_retention_boundary
    check (channel_retained_from_sequence between 1 and last_sequence + 1),
  add constraint agent_sessions_channel_terminal_shape
    check (
      (channel_terminal_sequence is null and channel_terminal_event_id is null)
      or (
        channel_terminal_sequence between 1 and last_sequence
        and channel_terminal_event_id is not null
      )
    ),
  add constraint agent_sessions_channel_full_scope_identity
    unique (id, care_space_id, child_id, owner_user_id);

create unique index agent_sessions_creciendo_create_idempotency_unique
  on public.agent_sessions(
    owner_user_id,
    care_space_id,
    child_id,
    (initial_configuration ->> 'create_idempotency_sha256')
  )
  where channel = 'creciendo_mobile'
    and initial_configuration ->> 'create_idempotency_sha256' ~ '^[a-f0-9]{64}$';

create table public.creciendo_channel_events (
  id uuid primary key default gen_random_uuid(),
  agent_session_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  owner_user_id uuid not null,
  turn_id uuid not null,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  event_version text not null default 'creciendo.channel-event.v1'
    check (event_version = 'creciendo.channel-event.v1'),
  event_type text not null check (event_type in (
    'text-delta', 'tool-state', 'ui-part', 'citation', 'heartbeat',
    'message-complete', 'session-cancelled', 'emergency-recommendation', 'stream-error'
  )),
  terminal boolean not null,
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_kind text not null check (source_kind in ('eve_event', 'channel_projection', 'channel_command', 'channel_cancel')),
  source_id text not null check (
    pg_catalog.char_length(source_id) between 1 and 200
    and source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint creciendo_channel_events_session_scope_fk
    foreign key (agent_session_id, care_space_id, child_id, owner_user_id)
    references public.agent_sessions(id, care_space_id, child_id, owner_user_id)
    on delete restrict,
  constraint creciendo_channel_events_sequence_unique
    unique (agent_session_id, sequence),
  constraint creciendo_channel_events_source_unique
    unique (agent_session_id, source_kind, source_id),
  constraint creciendo_channel_events_full_identity
    unique (id, agent_session_id),
  constraint creciendo_channel_events_terminal_kind
    check (terminal = (event_type in (
      'message-complete', 'session-cancelled', 'emergency-recommendation', 'stream-error'
    ))),
  constraint creciendo_channel_events_payload_object
    check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint creciendo_channel_events_payload_size
    check (pg_catalog.octet_length(payload::text) <= 307200),
  constraint creciendo_channel_events_payload_digest
    check (payload_sha256 = app_private.creciendo_json_sha256(payload)),
  constraint creciendo_channel_events_payload_safe
    check (app_private.creciendo_channel_payload_is_safe(payload)),
  constraint creciendo_channel_events_payload_contract
    check (app_private.creciendo_event_payload_matches_type(event_type, payload))
);

create index creciendo_channel_events_resume_idx
  on public.creciendo_channel_events(agent_session_id, sequence)
  include (id, event_type, terminal, occurred_at);
create index creciendo_channel_events_scope_idx
  on public.creciendo_channel_events(owner_user_id, care_space_id, child_id, agent_session_id, sequence);

create table public.creciendo_session_commands (
  id uuid primary key default gen_random_uuid(),
  agent_session_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  owner_user_id uuid not null,
  message_id uuid not null unique,
  turn_id uuid not null,
  command_kind text not null check (command_kind in ('continue', 'emergency')),
  idempotency_key_sha256 text not null check (idempotency_key_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  parts_sha256 text check (parts_sha256 is null or parts_sha256 ~ '^[a-f0-9]{64}$'),
  safety_receipt_sha256 text check (safety_receipt_sha256 is null or safety_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  terminal_payload_sha256 text check (terminal_payload_sha256 is null or terminal_payload_sha256 ~ '^[a-f0-9]{64}$'),
  terminal_event_id uuid,
  accepted_at timestamptz not null default now(),
  constraint creciendo_session_commands_session_scope_fk
    foreign key (agent_session_id, care_space_id, child_id, owner_user_id)
    references public.agent_sessions(id, care_space_id, child_id, owner_user_id)
    on delete restrict,
  constraint creciendo_session_commands_event_fk
    foreign key (terminal_event_id, agent_session_id)
    references public.creciendo_channel_events(id, agent_session_id)
    on delete restrict,
  constraint creciendo_session_commands_idempotency_unique
    unique (agent_session_id, owner_user_id, idempotency_key_sha256),
  constraint creciendo_session_commands_kind_shape
    check (
      (command_kind = 'continue'
        and parts_sha256 is not null
        and safety_receipt_sha256 is null
        and terminal_payload_sha256 is null
        and terminal_event_id is null)
      or
      (command_kind = 'emergency'
        and parts_sha256 is null
        and safety_receipt_sha256 is not null
        and terminal_payload_sha256 is not null
        and terminal_event_id is not null)
    )
);

create index creciendo_session_commands_turn_idx
  on public.creciendo_session_commands(agent_session_id, accepted_at desc, turn_id);

create table public.creciendo_cancel_commands (
  operation_id uuid primary key,
  agent_session_id uuid not null,
  care_space_id uuid not null,
  child_id uuid not null,
  owner_user_id uuid not null,
  target_turn_id uuid not null,
  reason text not null check (reason in ('user_requested', 'navigation', 'session_closed')),
  idempotency_key_sha256 text not null check (idempotency_key_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'accepted' check (status in ('accepted', 'finalized')),
  final_outcome text check (final_outcome is null or final_outcome in (
    'requested', 'already_terminal', 'cancelled_before_effect', 'effect_may_have_committed'
  )),
  final_effect_state text check (final_effect_state is null or final_effect_state in ('none', 'committed', 'unknown')),
  terminal_event_id uuid,
  accepted_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint creciendo_cancel_commands_session_scope_fk
    foreign key (agent_session_id, care_space_id, child_id, owner_user_id)
    references public.agent_sessions(id, care_space_id, child_id, owner_user_id)
    on delete restrict,
  constraint creciendo_cancel_commands_event_fk
    foreign key (terminal_event_id, agent_session_id)
    references public.creciendo_channel_events(id, agent_session_id)
    on delete restrict,
  constraint creciendo_cancel_commands_idempotency_unique
    unique (agent_session_id, owner_user_id, idempotency_key_sha256),
  constraint creciendo_cancel_commands_operation_scope_unique
    unique (operation_id, agent_session_id),
  constraint creciendo_cancel_commands_state_shape
    check (
      (status = 'accepted'
        and final_outcome is null
        and final_effect_state is null
        and terminal_event_id is null
        and finalized_at is null)
      or
      (status = 'finalized'
        and final_outcome is not null
        and final_effect_state is not null
        and terminal_event_id is not null
        and finalized_at is not null)
    ),
  constraint creciendo_cancel_commands_effect_shape
    check (
      final_outcome is null
      or (final_outcome = 'requested' and final_effect_state = 'unknown')
      or (final_outcome = 'already_terminal' and final_effect_state = 'committed')
      or (final_outcome = 'cancelled_before_effect' and final_effect_state = 'none')
      or (final_outcome = 'effect_may_have_committed' and final_effect_state = 'unknown')
    )
);

alter table public.agent_sessions
  add constraint agent_sessions_channel_terminal_event_fk
    foreign key (channel_terminal_event_id, id)
    references public.creciendo_channel_events(id, agent_session_id)
    on delete restrict,
  add constraint agent_sessions_channel_cancel_operation_fk
    foreign key (channel_cancel_operation_id, id)
    references public.creciendo_cancel_commands(operation_id, agent_session_id)
    on delete restrict;

create or replace function app_private.prevent_creciendo_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Creciendo ledger row is immutable';
end;
$$;

create trigger creciendo_channel_events_immutable
before update or delete on public.creciendo_channel_events
for each row execute function app_private.prevent_creciendo_ledger_mutation();

create trigger creciendo_session_commands_immutable
before update or delete on public.creciendo_session_commands
for each row execute function app_private.prevent_creciendo_ledger_mutation();

create or replace function app_private.protect_creciendo_cancel_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.operation_id is distinct from old.operation_id
    or new.agent_session_id is distinct from old.agent_session_id
    or new.care_space_id is distinct from old.care_space_id
    or new.child_id is distinct from old.child_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.target_turn_id is distinct from old.target_turn_id
    or new.reason is distinct from old.reason
    or new.idempotency_key_sha256 is distinct from old.idempotency_key_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.accepted_at is distinct from old.accepted_at
    or old.status = 'finalized'
    or new.status <> 'finalized' then
    raise exception using errcode = '42501', message = 'Creciendo cancel command is immutable';
  end if;
  return new;
end;
$$;

create trigger creciendo_cancel_commands_protected
before update on public.creciendo_cancel_commands
for each row execute function app_private.protect_creciendo_cancel_command();

create trigger creciendo_cancel_commands_no_delete
before delete on public.creciendo_cancel_commands
for each row execute function app_private.prevent_creciendo_ledger_mutation();

revoke all on function app_private.prevent_creciendo_ledger_mutation() from public, anon, authenticated, service_role;
revoke all on function app_private.protect_creciendo_cancel_command() from public, anon, authenticated, service_role;

alter table public.creciendo_channel_events enable row level security;
alter table public.creciendo_channel_events force row level security;
alter table public.creciendo_session_commands enable row level security;
alter table public.creciendo_session_commands force row level security;
alter table public.creciendo_cancel_commands enable row level security;
alter table public.creciendo_cancel_commands force row level security;

create policy creciendo_channel_events_owner_select
on public.creciendo_channel_events
for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and app_private.has_child_permission(care_space_id, child_id, 'read')
  and exists (
    select 1
    from public.agent_sessions s
    where s.id = agent_session_id
      and s.care_space_id = creciendo_channel_events.care_space_id
      and s.child_id = creciendo_channel_events.child_id
      and s.owner_user_id = (select auth.uid())
  )
);

revoke all on public.creciendo_channel_events from public, anon, authenticated;
revoke all on public.creciendo_session_commands from public, anon, authenticated;
revoke all on public.creciendo_cancel_commands from public, anon, authenticated;
grant select on public.creciendo_channel_events to authenticated;

create or replace function app_private.append_creciendo_channel_event_locked(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_owner_user_id uuid,
  p_turn_id uuid,
  p_source_kind text,
  p_source_id text,
  p_event_type text,
  p_terminal boolean,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns table (
  outcome text,
  event_id uuid,
  cursor text,
  sequence bigint,
  occurred_at timestamptz,
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.agent_sessions%rowtype;
  existing public.creciendo_channel_events%rowtype;
  created public.creciendo_channel_events%rowtype;
  next_sequence bigint;
  payload_digest text;
begin
  if p_product_session_id is null
    or p_care_space_id is null
    or p_child_id is null
    or p_owner_user_id is null
    or p_turn_id is null
    or p_source_kind not in ('eve_event', 'channel_projection', 'channel_command', 'channel_cancel')
    or p_source_id is null
    or pg_catalog.char_length(p_source_id) not between 1 and 200
    or p_source_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or p_event_type not in (
      'text-delta', 'tool-state', 'ui-part', 'citation', 'heartbeat',
      'message-complete', 'session-cancelled', 'emergency-recommendation', 'stream-error'
    )
    or p_terminal is distinct from (p_event_type in (
      'message-complete', 'session-cancelled', 'emergency-recommendation', 'stream-error'
    ))
    or p_payload is null
    or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or pg_catalog.octet_length(p_payload::text) > 307200
    or not app_private.creciendo_channel_payload_is_safe(p_payload)
    or not app_private.creciendo_event_payload_matches_type(p_event_type, p_payload)
    or p_occurred_at is null
    or not pg_catalog.isfinite(p_occurred_at) then
    outcome := 'conflict';
    return next;
    return;
  end if;

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.owner_user_id = p_owner_user_id
    and s.channel = 'creciendo_mobile'
  for update;

  if target.id is null
    or p_occurred_at < target.started_at - interval '5 minutes'
    or p_occurred_at > pg_catalog.clock_timestamp() + interval '5 minutes' then
    outcome := 'conflict';
    return next;
    return;
  end if;

  payload_digest := app_private.creciendo_json_sha256(p_payload);
  select e.* into existing
  from public.creciendo_channel_events e
  where e.agent_session_id = target.id
    and e.source_kind = p_source_kind
    and e.source_id = p_source_id;

  if existing.id is not null then
    if existing.turn_id = p_turn_id
      and existing.event_type = p_event_type
      and existing.terminal = p_terminal
      and existing.payload_sha256 = payload_digest then
      outcome := 'idempotent_replay';
      event_id := existing.id;
      cursor := existing.id::text;
      sequence := existing.sequence;
      occurred_at := existing.occurred_at;
      last_sequence := target.last_sequence;
    else
      outcome := 'conflict';
    end if;
    return next;
    return;
  end if;

  if target.channel_terminal_event_id is not null
    or target.last_sequence >= 9007199254740991 then
    outcome := 'terminal_conflict';
    return next;
    return;
  end if;

  next_sequence := target.last_sequence + 1;
  insert into public.creciendo_channel_events (
    agent_session_id, care_space_id, child_id, owner_user_id,
    turn_id, sequence, event_type, terminal, payload, payload_sha256,
    source_kind, source_id, occurred_at
  ) values (
    target.id, target.care_space_id, target.child_id, target.owner_user_id,
    p_turn_id, next_sequence, p_event_type, p_terminal, p_payload, payload_digest,
    p_source_kind, p_source_id, p_occurred_at
  ) returning * into created;

  update public.agent_sessions as s
  set last_sequence = next_sequence,
      channel_terminal_sequence = case when p_terminal then next_sequence else s.channel_terminal_sequence end,
      channel_terminal_event_id = case when p_terminal then created.id else s.channel_terminal_event_id end
  where s.id = target.id
  returning s.last_sequence into last_sequence;

  outcome := 'created';
  event_id := created.id;
  cursor := created.id::text;
  sequence := created.sequence;
  occurred_at := created.occurred_at;
  return next;
end;
$$;

revoke all on function app_private.append_creciendo_channel_event_locked(uuid, uuid, uuid, uuid, uuid, text, text, text, boolean, jsonb, timestamptz) from public, anon, authenticated, service_role;

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
  existing public.agent_sessions;
  is_creciendo boolean := p_channel = 'creciendo_mobile';
  create_key_sha256 text := p_initial_configuration ->> 'create_idempotency_sha256';
begin
  if target_owner is null
    or p_channel not in ('creciendo_mobile', 'operator_cli', 'evaluation')
    or p_initial_model is null
    or p_initial_model not in ('gemini-3.6-flash')
    or p_initial_configuration is null
    or pg_catalog.jsonb_typeof(p_initial_configuration) <> 'object'
    or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$'
    or p_authorization_expires_at <= now()
    or p_authorization_expires_at > now() + interval '5 minutes'
    or (is_creciendo and (
      not app_private.creciendo_jsonb_has_exact_keys(
        p_initial_configuration,
        array['version', 'channel_version', 'locale', 'create_idempotency_sha256', 'create_request_sha256']
      )
      or p_initial_configuration ->> 'version' <> 'creciendo.session-create.v1'
      or p_initial_configuration ->> 'channel_version' <> 'creciendo.channel.v1'
      or p_initial_configuration ->> 'locale' not in ('es-CO', 'en-US')
      or create_key_sha256 !~ '^[a-f0-9]{64}$'
      or p_initial_configuration ->> 'create_request_sha256' !~ '^[a-f0-9]{64}$'
    ))
    or not exists (
      select 1
      from public.children c
      join public.care_space_members m
        on m.care_space_id = c.care_space_id and m.user_id = target_owner
      join public.child_access a
        on a.care_space_id = c.care_space_id and a.child_id = c.id and a.user_id = target_owner
      where c.id = p_child_id
        and c.care_space_id = p_care_space_id
        and c.status = 'active'
        and m.status = 'active' and m.revoked_at is null
        and m.valid_from <= now() and (m.valid_until is null or m.valid_until > now())
        and a.status = 'active' and a.revoked_at is null
        and a.valid_from <= now() and (a.valid_until is null or a.valid_until > now())
        and 'record' = any(a.permissions)
        and (m.valid_until is null or p_authorization_expires_at <= m.valid_until)
        and (a.valid_until is null or p_authorization_expires_at <= a.valid_until)
        and p_authorization_version = pg_catalog.format(
          'm:%s:a:%s', m.authorization_version, a.authorization_version
        )
      for share
    ) then
    return;
  end if;

  if is_creciendo then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', 'creciendo-session-create-v1', target_owner, p_care_space_id, p_child_id, create_key_sha256),
      0
    ));
    select s.* into existing
    from public.agent_sessions s
    where s.owner_user_id = target_owner
      and s.care_space_id = p_care_space_id
      and s.child_id = p_child_id
      and s.channel = 'creciendo_mobile'
      and s.initial_configuration ->> 'create_idempotency_sha256' = create_key_sha256
    limit 1;

    if existing.id is not null then
      if existing.initial_model = p_initial_model
        and existing.initial_configuration = p_initial_configuration
        and existing.status = 'active' then
        return query select existing.id, existing.eve_session_id, existing.owner_user_id,
          existing.care_space_id, existing.child_id, existing.authorization_version,
          existing.authorization_expires_at, existing.status, existing.last_sequence;
      end if;
      return;
    end if;
  end if;

  insert into public.agent_sessions (
    care_space_id, child_id, owner_user_id, authorization_version,
    authorization_expires_at, channel, initial_model, initial_configuration
  ) values (
    p_care_space_id, p_child_id, target_owner, p_authorization_version,
    p_authorization_expires_at, p_channel, p_initial_model, p_initial_configuration
  ) returning * into created;

  return query select created.id, created.eve_session_id, created.owner_user_id,
    created.care_space_id, created.child_id, created.authorization_version,
    created.authorization_expires_at, created.status, created.last_sequence;
end;
$$;

revoke all on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_owned_agent_session(uuid, uuid, text, timestamptz, text, text, jsonb) to authenticated;

create or replace function public.accept_creciendo_session_message(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_client_message_id uuid,
  p_idempotency_key_sha256 text,
  p_request_sha256 text,
  p_proposed_turn_id uuid,
  p_command_kind text,
  p_parts jsonb,
  p_safety_receipt_sha256 text,
  p_terminal_event jsonb
)
returns table (
  outcome text,
  dispatch_required boolean,
  message_id uuid,
  turn_id uuid,
  accepted_at timestamptz,
  cursor text,
  last_sequence bigint,
  eve_session_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
  target public.agent_sessions%rowtype;
  existing public.creciendo_session_commands%rowtype;
  appended record;
  parts_digest text;
  terminal_digest text;
  accepted_instant timestamptz := pg_catalog.clock_timestamp();
  current_cursor text;
  next_message_sequence bigint;
begin
  if target_owner is null
    or p_product_session_id is null
    or p_care_space_id is null
    or p_child_id is null
    or p_client_message_id is null
    or p_proposed_turn_id is null
    or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$'
    or p_idempotency_key_sha256 !~ '^[a-f0-9]{64}$'
    or p_request_sha256 !~ '^[a-f0-9]{64}$'
    or p_command_kind not in ('continue', 'emergency') then
    return;
  end if;

  if p_command_kind = 'continue' then
    if not app_private.creciendo_message_parts_are_valid(p_parts)
      or p_safety_receipt_sha256 is not null
      or p_terminal_event is not null then
      return;
    end if;
    parts_digest := app_private.creciendo_json_sha256(p_parts);
  else
    if p_parts is not null
      or p_safety_receipt_sha256 !~ '^[a-f0-9]{64}$'
      or not app_private.creciendo_jsonb_has_exact_keys(p_terminal_event, array['type', 'terminal', 'data'])
      or p_terminal_event ->> 'type' <> 'emergency-recommendation'
      or p_terminal_event -> 'terminal' <> 'true'::jsonb
      or not app_private.creciendo_jsonb_has_exact_keys(p_terminal_event -> 'data', array['widget'])
      or not app_private.creciendo_emergency_widget_is_valid(p_terminal_event #> '{data,widget}') then
      return;
    end if;
    terminal_digest := app_private.creciendo_json_sha256(p_terminal_event);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(':', 'creciendo-message-v1', target_owner, p_product_session_id, p_idempotency_key_sha256),
    0
  ));

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile'
  for update;

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or not app_private.creciendo_session_access_is_live(
      target_owner, p_care_space_id, p_child_id, p_authorization_version, 'record'
    ) then
    return;
  end if;

  select c.* into existing
  from public.creciendo_session_commands c
  where c.agent_session_id = target.id
    and c.owner_user_id = target_owner
    and c.idempotency_key_sha256 = p_idempotency_key_sha256;

  if existing.id is not null then
    if existing.request_sha256 <> p_request_sha256
      or existing.message_id <> p_client_message_id
      or existing.command_kind <> p_command_kind
      or existing.parts_sha256 is distinct from parts_digest
      or existing.safety_receipt_sha256 is distinct from p_safety_receipt_sha256
      or existing.terminal_payload_sha256 is distinct from terminal_digest then
      return query select 'conflict'::text, false, null::uuid, null::uuid,
        null::timestamptz, null::text, null::bigint, null::text;
      return;
    end if;

    select coalesce(
      (select e.id::text from public.creciendo_channel_events e
       where e.agent_session_id = target.id order by e.sequence desc limit 1),
      'creciendo.initial-cursor.v1'
    ) into current_cursor;
    return query select 'idempotent_replay'::text, false, existing.message_id,
      existing.turn_id, existing.accepted_at, current_cursor, target.last_sequence,
      target.eve_session_id;
    return;
  end if;

  if target.channel_terminal_event_id is not null
    or target.channel_cancel_operation_id is not null
    or exists (select 1 from public.messages m where m.id = p_client_message_id) then
    return query select 'conflict'::text, false, null::uuid, null::uuid,
      null::timestamptz, null::text, null::bigint, null::text;
    return;
  end if;

  if p_command_kind = 'continue' then
    select coalesce(max(m.sequence), 0) + 1 into next_message_sequence
    from public.messages m
    where m.agent_session_id = target.id;
    if next_message_sequence > 9007199254740991 then
      return;
    end if;

    insert into public.messages (
      id, care_space_id, child_id, agent_session_id, sequence,
      actor_type, actor_user_id, parts, status
    ) values (
      p_client_message_id, target.care_space_id, target.child_id, target.id,
      next_message_sequence, 'guardian', target_owner, p_parts, 'completed'
    );
    insert into public.creciendo_session_commands (
      agent_session_id, care_space_id, child_id, owner_user_id,
      message_id, turn_id, command_kind, idempotency_key_sha256,
      request_sha256, parts_sha256, accepted_at
    ) values (
      target.id, target.care_space_id, target.child_id, target_owner,
      p_client_message_id, p_proposed_turn_id, 'continue', p_idempotency_key_sha256,
      p_request_sha256, parts_digest, accepted_instant
    );
    select coalesce(
      (select e.id::text from public.creciendo_channel_events e
       where e.agent_session_id = target.id order by e.sequence desc limit 1),
      'creciendo.initial-cursor.v1'
    ) into current_cursor;
    return query select 'created'::text, true, p_client_message_id,
      p_proposed_turn_id, accepted_instant, current_cursor, target.last_sequence,
      target.eve_session_id;
    return;
  end if;

  select * into appended
  from app_private.append_creciendo_channel_event_locked(
    target.id, target.care_space_id, target.child_id, target_owner,
    p_proposed_turn_id, 'channel_command', p_client_message_id::text,
    'emergency-recommendation', true, p_terminal_event -> 'data', accepted_instant
  );
  if appended.outcome not in ('created', 'idempotent_replay') then
    return query select 'conflict'::text, false, null::uuid, null::uuid,
      null::timestamptz, null::text, null::bigint, null::text;
    return;
  end if;

  insert into public.creciendo_session_commands (
    agent_session_id, care_space_id, child_id, owner_user_id,
    message_id, turn_id, command_kind, idempotency_key_sha256,
    request_sha256, safety_receipt_sha256, terminal_payload_sha256,
    terminal_event_id, accepted_at
  ) values (
    target.id, target.care_space_id, target.child_id, target_owner,
    p_client_message_id, p_proposed_turn_id, 'emergency', p_idempotency_key_sha256,
    p_request_sha256, p_safety_receipt_sha256, terminal_digest,
    appended.event_id, accepted_instant
  );

  return query select 'created'::text, false, p_client_message_id,
    p_proposed_turn_id, accepted_instant, appended.cursor, appended.last_sequence,
    target.eve_session_id;
end;
$$;

revoke all on function public.accept_creciendo_session_message(uuid, uuid, uuid, text, uuid, text, text, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.accept_creciendo_session_message(uuid, uuid, uuid, text, uuid, text, text, uuid, text, jsonb, text, jsonb) to authenticated;

create or replace function public.resolve_owned_creciendo_cursor(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_cursor text
)
returns table (
  outcome text,
  after_sequence bigint,
  first_available_sequence bigint,
  last_sequence bigint,
  terminal_event_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
  target public.agent_sessions%rowtype;
  cursor_sequence bigint;
  first_sequence bigint;
begin
  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile';

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or not app_private.creciendo_session_access_is_live(
      target_owner, p_care_space_id, p_child_id, p_authorization_version, 'read'
    ) then
    return;
  end if;

  select coalesce(min(e.sequence), target.last_sequence + 1) into first_sequence
  from public.creciendo_channel_events e
  where e.agent_session_id = target.id
    and e.sequence >= target.channel_retained_from_sequence;

  if p_cursor is null or p_cursor = 'creciendo.initial-cursor.v1' then
    outcome := case when target.channel_retained_from_sequence > 1 then 'retention_gap' else 'valid' end;
    after_sequence := 0;
  elsif p_cursor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select e.sequence into cursor_sequence
    from public.creciendo_channel_events e
    where e.agent_session_id = target.id
      and e.id = p_cursor::uuid;
    if cursor_sequence is null then
      outcome := 'invalid';
      after_sequence := null;
    elsif cursor_sequence < target.channel_retained_from_sequence then
      outcome := 'retention_gap';
      after_sequence := cursor_sequence;
    else
      outcome := 'valid';
      after_sequence := cursor_sequence;
    end if;
  else
    outcome := 'invalid';
    after_sequence := null;
  end if;

  first_available_sequence := first_sequence;
  last_sequence := target.last_sequence;
  terminal_event_id := target.channel_terminal_event_id;
  return next;
end;
$$;

create or replace function public.read_owned_creciendo_events(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_after_sequence bigint,
  p_limit integer default 128
)
returns table (
  event_id uuid,
  version text,
  type text,
  terminal boolean,
  turn_id uuid,
  sequence bigint,
  occurred_at timestamptz,
  cursor text,
  data jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
  target public.agent_sessions%rowtype;
begin
  if p_after_sequence is null
    or p_after_sequence not between 0 and 9007199254740991
    or p_limit not between 1 and 256 then
    return;
  end if;

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile';

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or p_after_sequence < target.channel_retained_from_sequence - 1
    or not app_private.creciendo_session_access_is_live(
      target_owner, p_care_space_id, p_child_id, p_authorization_version, 'read'
    ) then
    return;
  end if;

  return query
  select e.id, e.event_version, e.event_type, e.terminal, e.turn_id,
    e.sequence, e.occurred_at, e.id::text, e.payload
  from public.creciendo_channel_events e
  where e.agent_session_id = target.id
    and e.sequence > p_after_sequence
    and e.sequence >= target.channel_retained_from_sequence
  order by e.sequence
  limit p_limit;
end;
$$;

revoke all on function public.resolve_owned_creciendo_cursor(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_owned_creciendo_cursor(uuid, uuid, uuid, text, text) to authenticated;
revoke all on function public.read_owned_creciendo_events(uuid, uuid, uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.read_owned_creciendo_events(uuid, uuid, uuid, text, bigint, integer) to authenticated;

create or replace function public.append_creciendo_channel_event(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_owner_user_id uuid,
  p_authorization_version text,
  p_turn_id uuid,
  p_source_kind text,
  p_source_id text,
  p_event_type text,
  p_terminal boolean,
  p_payload jsonb,
  p_occurred_at timestamptz default now()
)
returns table (
  outcome text,
  event_id uuid,
  cursor text,
  sequence bigint,
  occurred_at timestamptz,
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.agent_sessions%rowtype;
begin
  if p_event_type in ('emergency-recommendation', 'session-cancelled')
    or p_source_kind not in ('eve_event', 'channel_projection') then
    return;
  end if;

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = p_owner_user_id
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile'
  for update;

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or not app_private.creciendo_session_access_is_live(
      p_owner_user_id, p_care_space_id, p_child_id, p_authorization_version, 'record'
    ) then
    return;
  end if;

  return query
  select a.outcome, a.event_id, a.cursor, a.sequence, a.occurred_at, a.last_sequence
  from app_private.append_creciendo_channel_event_locked(
    target.id, target.care_space_id, target.child_id, target.owner_user_id,
    p_turn_id, p_source_kind, p_source_id, p_event_type, p_terminal,
    p_payload, p_occurred_at
  ) as a;
end;
$$;

revoke all on function public.append_creciendo_channel_event(uuid, uuid, uuid, uuid, text, uuid, text, text, text, boolean, jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.append_creciendo_channel_event(uuid, uuid, uuid, uuid, text, uuid, text, text, text, boolean, jsonb, timestamptz) to service_role;

create or replace function public.accept_creciendo_session_cancel(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_operation_id uuid,
  p_idempotency_key_sha256 text,
  p_request_sha256 text,
  p_reason text
)
returns table (
  outcome text,
  finalize_required boolean,
  operation_id uuid,
  turn_id uuid,
  accepted_at timestamptz,
  cancellation_outcome text,
  effect_state text,
  cursor text,
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
  target public.agent_sessions%rowtype;
  existing public.creciendo_cancel_commands%rowtype;
  accepted_instant timestamptz := pg_catalog.clock_timestamp();
  target_turn uuid;
  current_cursor text;
begin
  if target_owner is null
    or p_operation_id is null
    or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$'
    or p_idempotency_key_sha256 !~ '^[a-f0-9]{64}$'
    or p_request_sha256 !~ '^[a-f0-9]{64}$'
    or p_reason not in ('user_requested', 'navigation', 'session_closed') then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(':', 'creciendo-cancel-v1', target_owner, p_product_session_id, p_idempotency_key_sha256),
    0
  ));

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile'
  for update;

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or not app_private.creciendo_session_access_is_live(
      target_owner, p_care_space_id, p_child_id, p_authorization_version, 'record'
    ) then
    return;
  end if;

  select c.* into existing
  from public.creciendo_cancel_commands c
  where c.agent_session_id = target.id
    and c.owner_user_id = target_owner
    and c.idempotency_key_sha256 = p_idempotency_key_sha256;

  select coalesce(
    (select e.id::text from public.creciendo_channel_events e
     where e.agent_session_id = target.id order by e.sequence desc limit 1),
    'creciendo.initial-cursor.v1'
  ) into current_cursor;

  if existing.operation_id is not null then
    if existing.operation_id <> p_operation_id
      or existing.request_sha256 <> p_request_sha256
      or existing.reason <> p_reason then
      return query select 'conflict'::text, false, null::uuid, null::uuid,
        null::timestamptz, null::text, null::text, null::text, null::bigint;
      return;
    end if;
    return query select 'idempotent_replay'::text, existing.status = 'accepted',
      existing.operation_id, existing.target_turn_id, existing.accepted_at,
      existing.final_outcome, existing.final_effect_state, current_cursor,
      target.last_sequence;
    return;
  end if;

  if exists (select 1 from public.creciendo_cancel_commands c where c.operation_id = p_operation_id)
    or (target.channel_cancel_operation_id is not null
      and target.channel_cancel_operation_id <> p_operation_id) then
    return query select 'conflict'::text, false, null::uuid, null::uuid,
      null::timestamptz, null::text, null::text, null::text, null::bigint;
    return;
  end if;

  select coalesce(
    (select e.turn_id from public.creciendo_channel_events e
      where e.id = target.channel_terminal_event_id),
    (select c.turn_id from public.creciendo_session_commands c
      where c.agent_session_id = target.id order by c.accepted_at desc limit 1),
    p_operation_id
  ) into target_turn;

  if target.channel_terminal_event_id is not null then
    insert into public.creciendo_cancel_commands (
      operation_id, agent_session_id, care_space_id, child_id, owner_user_id,
      target_turn_id, reason, idempotency_key_sha256, request_sha256,
      status, final_outcome, final_effect_state, terminal_event_id,
      accepted_at, finalized_at
    ) values (
      p_operation_id, target.id, target.care_space_id, target.child_id, target_owner,
      target_turn, p_reason, p_idempotency_key_sha256, p_request_sha256,
      'finalized', 'already_terminal', 'committed', target.channel_terminal_event_id,
      accepted_instant, accepted_instant
    );
    return query select 'created'::text, false, p_operation_id, target_turn,
      accepted_instant, 'already_terminal'::text, 'committed'::text,
      current_cursor, target.last_sequence;
    return;
  end if;

  insert into public.creciendo_cancel_commands (
    operation_id, agent_session_id, care_space_id, child_id, owner_user_id,
    target_turn_id, reason, idempotency_key_sha256, request_sha256, accepted_at
  ) values (
    p_operation_id, target.id, target.care_space_id, target.child_id, target_owner,
    target_turn, p_reason, p_idempotency_key_sha256, p_request_sha256, accepted_instant
  );
  update public.agent_sessions s
  set channel_cancel_operation_id = p_operation_id
  where s.id = target.id;

  return query select 'created'::text, true, p_operation_id, target_turn,
    accepted_instant, null::text, null::text, current_cursor, target.last_sequence;
end;
$$;

create or replace function public.finalize_creciendo_session_cancel(
  p_product_session_id uuid,
  p_care_space_id uuid,
  p_child_id uuid,
  p_authorization_version text,
  p_operation_id uuid,
  p_cancellation_outcome text,
  p_effect_state text
)
returns table (
  outcome text,
  operation_id uuid,
  turn_id uuid,
  cancellation_outcome text,
  effect_state text,
  occurred_at timestamptz,
  cursor text,
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid := (select auth.uid());
  target public.agent_sessions%rowtype;
  command_row public.creciendo_cancel_commands%rowtype;
  appended record;
  finalized_instant timestamptz := pg_catalog.clock_timestamp();
  current_cursor text;
begin
  if target_owner is null or p_operation_id is null then
    return;
  end if;

  select s.* into target
  from public.agent_sessions s
  where s.id = p_product_session_id
    and s.owner_user_id = target_owner
    and s.care_space_id = p_care_space_id
    and s.child_id = p_child_id
    and s.channel = 'creciendo_mobile'
  for update;

  if target.id is null
    or target.status <> 'active'
    or target.authorization_version <> p_authorization_version
    or target.authorization_expires_at <= pg_catalog.clock_timestamp()
    or not app_private.creciendo_session_access_is_live(
      target_owner, p_care_space_id, p_child_id, p_authorization_version, 'record'
    ) then
    return;
  end if;

  select c.* into command_row
  from public.creciendo_cancel_commands c
  where c.operation_id = p_operation_id
    and c.agent_session_id = target.id
    and c.owner_user_id = target_owner
  for update;

  if command_row.operation_id is null then
    return;
  end if;

  select coalesce(
    (select e.id::text from public.creciendo_channel_events e
     where e.agent_session_id = target.id order by e.sequence desc limit 1),
    'creciendo.initial-cursor.v1'
  ) into current_cursor;

  if command_row.status = 'finalized' then
    return query select 'idempotent_replay'::text, command_row.operation_id,
      command_row.target_turn_id, command_row.final_outcome,
      command_row.final_effect_state, command_row.finalized_at,
      current_cursor, target.last_sequence;
    return;
  end if;

  if target.channel_terminal_event_id is not null then
    update public.creciendo_cancel_commands c
    set status = 'finalized', final_outcome = 'already_terminal',
      final_effect_state = 'committed', terminal_event_id = target.channel_terminal_event_id,
      finalized_at = finalized_instant
    where c.operation_id = command_row.operation_id;
    return query select 'created'::text, command_row.operation_id,
      command_row.target_turn_id, 'already_terminal'::text, 'committed'::text,
      finalized_instant, current_cursor, target.last_sequence;
    return;
  end if;

  if not (
    (p_cancellation_outcome = 'requested' and p_effect_state = 'unknown')
    or (p_cancellation_outcome = 'cancelled_before_effect' and p_effect_state = 'none')
    or (p_cancellation_outcome = 'effect_may_have_committed' and p_effect_state = 'unknown')
  ) then
    return query select 'conflict'::text, null::uuid, null::uuid,
      null::text, null::text, null::timestamptz, null::text, null::bigint;
    return;
  end if;

  select * into appended
  from app_private.append_creciendo_channel_event_locked(
    target.id, target.care_space_id, target.child_id, target_owner,
    command_row.target_turn_id, 'channel_cancel', command_row.operation_id::text,
    'session-cancelled', true,
    pg_catalog.jsonb_build_object('outcome', p_cancellation_outcome, 'effectState', p_effect_state),
    finalized_instant
  );
  if appended.outcome not in ('created', 'idempotent_replay') then
    return query select 'conflict'::text, null::uuid, null::uuid,
      null::text, null::text, null::timestamptz, null::text, null::bigint;
    return;
  end if;

  update public.creciendo_cancel_commands c
  set status = 'finalized', final_outcome = p_cancellation_outcome,
    final_effect_state = p_effect_state, terminal_event_id = appended.event_id,
    finalized_at = appended.occurred_at
  where c.operation_id = command_row.operation_id;

  return query select 'created'::text, command_row.operation_id,
    command_row.target_turn_id, p_cancellation_outcome, p_effect_state,
    appended.occurred_at, appended.cursor, appended.last_sequence;
end;
$$;

revoke all on function public.accept_creciendo_session_cancel(uuid, uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.accept_creciendo_session_cancel(uuid, uuid, uuid, text, uuid, text, text, text) to authenticated;
revoke all on function public.finalize_creciendo_session_cancel(uuid, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_creciendo_session_cancel(uuid, uuid, uuid, text, uuid, text, text) to authenticated;

commit;
