-- Serialize medication mutations at their trusted boundary and keep the
-- pre-package validation path abstention-only. This migration activates no
-- formulary, dose limit, medication concept, or clinical rule package.

create or replace function app_private.medication_lock_key(p_key text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0))
$$;

revoke all on function app_private.medication_lock_key(text) from public, anon, authenticated;

alter function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb)
  rename to record_dose_validation_impl_20260821;
alter function public.record_dose_validation_impl_20260821(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb)
  set schema app_private;

alter function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text)
  rename to record_medication_schedule_occurrences_impl_20260821;
alter function public.record_medication_schedule_occurrences_impl_20260821(uuid, uuid, uuid, integer, jsonb, text, text)
  set schema app_private;

alter function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb)
  rename to correct_medication_intake_impl_20260821;
alter function public.correct_medication_intake_impl_20260821(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb)
  set schema app_private;

alter function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb)
  rename to supersede_medication_plan_impl_20260821;
alter function public.supersede_medication_plan_impl_20260821(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb)
  set schema app_private;

alter function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb)
  rename to record_medication_intake_impl_20260821;
alter function public.record_medication_intake_impl_20260821(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb)
  set schema app_private;

alter function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb)
  rename to record_medication_plan_impl_20260821;
alter function public.record_medication_plan_impl_20260821(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb)
  set schema app_private;

alter function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb)
  rename to transition_medication_plan_impl_20260821;
alter function public.transition_medication_plan_impl_20260821(uuid, uuid, uuid, text, text, text, jsonb)
  set schema app_private;

revoke all on function app_private.record_dose_validation_impl_20260821(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function app_private.record_medication_schedule_occurrences_impl_20260821(uuid, uuid, uuid, integer, jsonb, text, text) from public, anon, authenticated;
revoke all on function app_private.correct_medication_intake_impl_20260821(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.supersede_medication_plan_impl_20260821(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.record_medication_intake_impl_20260821(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.record_medication_plan_impl_20260821(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.transition_medication_plan_impl_20260821(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

create function public.record_dose_validation(
  p_care_space_id uuid,
  p_child_id uuid,
  p_request_id text,
  p_declared_input jsonb,
  p_result text,
  p_explanation_codes text[],
  p_package_version text,
  p_algorithm_version text,
  p_vocabulary_version text,
  p_artifact_sha256 text,
  p_input_digest text,
  p_decision_digest text,
  p_source_evidence jsonb,
  p_ingredients jsonb
)
returns table (validation_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_result not in ('insufficient_data', 'requires_professional_review')
    or p_package_version is distinct from 'unavailable'
    or p_artifact_sha256 is not null
    or coalesce(cardinality(p_explanation_codes), 0) = 0
    or coalesce(length(trim(p_algorithm_version)), 0) = 0
    or coalesce(length(trim(p_vocabulary_version)), 0) = 0
    or p_source_evidence is null
    or jsonb_typeof(p_source_evidence) <> 'array'
    or jsonb_array_length(p_source_evidence) = 0
  then raise exception 'dose_validation_governed_package_required' using errcode = '22023'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_source_evidence) source(
      "sourceId" text,
      "sourceVersion" text,
      "sourceKind" text,
      "sourceUri" text,
      "artifactSha256" text
    )
    where not exists (
      select 1
      from public.clinical_sources registered
      where registered.source_uri = source."sourceUri"
        and registered.artifact_sha256 = source."artifactSha256"
        and registered.status in ('reviewed', 'approved')
    )
  ) then raise exception 'dose_validation_source_unregistered' using errcode = '22023'; end if;

  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'validation', p_care_space_id, p_child_id, actor, p_request_id));
  return query
  select * from app_private.record_dose_validation_impl_20260821(
    p_care_space_id, p_child_id, p_request_id, p_declared_input, p_result,
    p_explanation_codes, p_package_version, p_algorithm_version,
    p_vocabulary_version, p_artifact_sha256, p_input_digest,
    p_decision_digest, p_source_evidence, p_ingredients
  );
end;
$$;

create function public.record_medication_schedule_occurrences(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_plan_id uuid,
  p_plan_version integer,
  p_occurrences jsonb,
  p_input_digest text,
  p_idempotency_key text
)
returns table (saved_count integer, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_plan public.medication_plans%rowtype;
  current_schedule public.medication_schedules%rowtype;
  schedule_count integer;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_occurrences is null or jsonb_typeof(p_occurrences) <> 'array' or jsonb_array_length(p_occurrences) > 1000
  then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;

  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'plan', p_care_space_id, p_child_id, p_medication_plan_id));
  select * into current_plan
  from public.medication_plans plan
  where plan.id = p_medication_plan_id
    and plan.care_space_id = p_care_space_id
    and plan.child_id = p_child_id
    and plan.version = p_plan_version
    and plan.status = 'active';
  if current_plan.id is null then return; end if;

  select count(*) into schedule_count
  from public.medication_schedules schedule
  where schedule.medication_plan_id = p_medication_plan_id
    and schedule.care_space_id = p_care_space_id
    and schedule.child_id = p_child_id
    and schedule.plan_version = p_plan_version;
  if schedule_count <> 1 then raise exception 'medication_schedule_definition_invalid' using errcode = '22023'; end if;
  select * into current_schedule
  from public.medication_schedules schedule
  where schedule.medication_plan_id = p_medication_plan_id
    and schedule.care_space_id = p_care_space_id
    and schedule.child_id = p_child_id
    and schedule.plan_version = p_plan_version;

  if current_schedule.frequency_kind = 'as_needed' and jsonb_array_length(p_occurrences) > 0
  then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;
  if (select count(*) from jsonb_to_recordset(p_occurrences) row(occurrence_key text))
      <> (select count(distinct row.occurrence_key) from jsonb_to_recordset(p_occurrences) row(occurrence_key text))
  then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_occurrences) occurrence(
      occurrence_key text,
      scheduled_for timestamptz,
      local_date date,
      time_zone text,
      source text
    )
    where occurrence.time_zone is distinct from current_schedule.time_zone
      or occurrence.local_date is distinct from (occurrence.scheduled_for at time zone current_schedule.time_zone)::date
      or occurrence.source is distinct from current_schedule.frequency_kind
      or occurrence.scheduled_for < current_plan.starts_at
      or (current_plan.ends_at is not null and occurrence.scheduled_for >= current_plan.ends_at)
      or occurrence.occurrence_key is distinct from encode(extensions.digest(convert_to(
        p_medication_plan_id::text || '|' || p_plan_version::text || '|' ||
        to_char(occurrence.scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'UTF8'
      ), 'sha256'), 'hex')
      or (
        current_schedule.frequency_kind = 'interval'
        and (
          extract(epoch from (occurrence.scheduled_for - current_plan.starts_at)) < 0
          or mod(
            extract(epoch from (occurrence.scheduled_for - current_plan.starts_at))::numeric,
            current_schedule.interval_hours * 3600
          ) <> 0
        )
      )
      or (
        current_schedule.frequency_kind = 'times_of_day'
        and (
          not ((occurrence.scheduled_for at time zone current_schedule.time_zone)::time = any(current_schedule.times_of_day))
          or exists (
            select 1
            from generate_series(-180, 180) delta
            where delta <> 0
              and ((occurrence.scheduled_for + delta * interval '1 minute') at time zone current_schedule.time_zone)
                = (occurrence.scheduled_for at time zone current_schedule.time_zone)
          )
        )
      )
  ) then raise exception 'medication_occurrence_not_declared' using errcode = '22023'; end if;

  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'materialize_schedule', p_idempotency_key));
  return query
  select * from app_private.record_medication_schedule_occurrences_impl_20260821(
    p_care_space_id, p_child_id, p_medication_plan_id, p_plan_version,
    p_occurrences, p_input_digest, p_idempotency_key
  );
end;
$$;

create function public.record_medication_intake(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_plan_id uuid,
  p_medication_schedule_occurrence_id uuid,
  p_scheduled_for timestamptz,
  p_taken_at timestamptz,
  p_status text,
  p_actual_quantity_lexeme text,
  p_actual_unit text,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (intake_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_scheduled_for > statement_timestamp() or p_taken_at > statement_timestamp()
  then raise exception 'medication_future_intake_invalid' using errcode = '22023'; end if;
  if p_medication_schedule_occurrence_id is not null then
    perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'occurrence', p_care_space_id, p_child_id, p_medication_schedule_occurrence_id));
    if not exists (
      select 1 from public.medication_schedule_occurrences occurrence
      where occurrence.id = p_medication_schedule_occurrence_id
        and occurrence.care_space_id = p_care_space_id
        and occurrence.child_id = p_child_id
        and occurrence.medication_plan_id = p_medication_plan_id
        and occurrence.scheduled_for = p_scheduled_for
    ) then return; end if;
  end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'record_intake', p_idempotency_key));
  return query
  select * from app_private.record_medication_intake_impl_20260821(
    p_care_space_id, p_child_id, p_medication_plan_id,
    p_medication_schedule_occurrence_id, p_scheduled_for, p_taken_at,
    p_status, p_actual_quantity_lexeme, p_actual_unit, p_input_fingerprint,
    p_idempotency_key, p_input_payload
  );
end;
$$;

create function public.correct_medication_intake(
  p_care_space_id uuid,
  p_child_id uuid,
  p_original_intake_id uuid,
  p_medication_plan_id uuid,
  p_medication_schedule_occurrence_id uuid,
  p_scheduled_for timestamptz,
  p_taken_at timestamptz,
  p_status text,
  p_actual_quantity_lexeme text,
  p_actual_unit text,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (intake_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_scheduled_for > statement_timestamp() or p_taken_at > statement_timestamp()
  then raise exception 'medication_future_intake_invalid' using errcode = '22023'; end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'intake', p_care_space_id, p_child_id, p_original_intake_id));
  if p_medication_schedule_occurrence_id is not null then
    perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'occurrence', p_care_space_id, p_child_id, p_medication_schedule_occurrence_id));
    if not exists (
      select 1 from public.medication_schedule_occurrences occurrence
      where occurrence.id = p_medication_schedule_occurrence_id
        and occurrence.care_space_id = p_care_space_id
        and occurrence.child_id = p_child_id
        and occurrence.medication_plan_id = p_medication_plan_id
        and occurrence.scheduled_for = p_scheduled_for
    ) then return; end if;
  end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'correct_intake', p_idempotency_key));
  return query
  select * from app_private.correct_medication_intake_impl_20260821(
    p_care_space_id, p_child_id, p_original_intake_id, p_medication_plan_id,
    p_medication_schedule_occurrence_id, p_scheduled_for, p_taken_at,
    p_status, p_actual_quantity_lexeme, p_actual_unit, p_input_fingerprint,
    p_idempotency_key, p_input_payload
  );
end;
$$;

create function public.record_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_concept_id uuid,
  p_medication_presentation_id uuid,
  p_display_name text,
  p_declared_indication text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (plan_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'create_plan', p_idempotency_key));
  return query
  select * from app_private.record_medication_plan_impl_20260821(
    p_care_space_id, p_child_id, p_medication_concept_id,
    p_medication_presentation_id, p_display_name, p_declared_indication,
    p_starts_at, p_ends_at, p_input_fingerprint, p_idempotency_key,
    p_input_payload
  );
end;
$$;

create function public.transition_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_plan_id uuid,
  p_target_status text,
  p_idempotency_key text,
  p_input_fingerprint text,
  p_input_payload jsonb
)
returns table (plan_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'plan', p_care_space_id, p_child_id, p_plan_id));
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'transition_plan', p_idempotency_key));
  return query
  select * from app_private.transition_medication_plan_impl_20260821(
    p_care_space_id, p_child_id, p_plan_id, p_target_status,
    p_idempotency_key, p_input_fingerprint, p_input_payload
  );
end;
$$;

create function public.supersede_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_plan_id uuid,
  p_medication_concept_id uuid,
  p_medication_presentation_id uuid,
  p_display_name text,
  p_declared_indication text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (plan_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'plan', p_care_space_id, p_child_id, p_plan_id));
  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'operation', p_care_space_id, p_child_id, actor, 'supersede_plan', p_idempotency_key));
  return query
  select * from app_private.supersede_medication_plan_impl_20260821(
    p_care_space_id, p_child_id, p_plan_id, p_medication_concept_id,
    p_medication_presentation_id, p_display_name, p_declared_indication,
    p_starts_at, p_ends_at, p_input_fingerprint, p_idempotency_key,
    p_input_payload
  );
end;
$$;

revoke all on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) from public, anon;
revoke all on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) from public, anon;

grant execute on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) to authenticated;
grant execute on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
