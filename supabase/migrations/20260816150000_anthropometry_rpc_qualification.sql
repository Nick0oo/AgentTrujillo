-- Qualify growth_assessments columns so the RPC passes Supabase schema lint.
create or replace function public.record_confirmed_anthropometry(
  p_care_space_id uuid,
  p_child_id uuid,
  p_idempotency_key text,
  p_input_fingerprint text,
  p_confirmation_sha256 text,
  p_confirmation_expires_at timestamptz,
  p_measurement_type text,
  p_original_value_lexeme text,
  p_original_unit text,
  p_normalized_value_lexeme text,
  p_normalized_unit text,
  p_occurred_at timestamptz,
  p_local_date date,
  p_time_zone text,
  p_measurement_method text,
  p_device text,
  p_provenance_type text,
  p_conversion_version text,
  p_rounding_mode text,
  p_hmac_key_id text,
  p_capture_policy_id text,
  p_capture_policy_version text,
  p_assessments jsonb,
  p_supersedes_measurement_id uuid default null,
  p_supersession_reason text default null
)
returns table (measurement_id uuid, assessment_ids uuid[], outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.anthropometric_measurements;
  created public.anthropometric_measurements;
  ids uuid[];
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'anthropometry_not_authorized' using errcode = '42501';
  end if;
  if p_confirmation_expires_at is null or p_confirmation_expires_at <= now()
    or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or length(p_idempotency_key) = 0 or length(p_idempotency_key) > 200 then
    raise exception 'anthropometry_confirmation_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.anthropometric_measurements
  where care_space_id = p_care_space_id
    and child_id = p_child_id
    and recorded_by = actor
    and idempotency_key = p_idempotency_key
  for update;
  if existing.id is not null then
    if existing.input_fingerprint is distinct from p_input_fingerprint then
      raise exception 'anthropometry_idempotency_conflict' using errcode = '23505';
    end if;
    select coalesce(array_agg(id order by id), '{}'::uuid[]) into ids
    from public.growth_assessments ga where ga.measurement_id = existing.id;
    return query select existing.id, ids, 'idempotent_replay'::text;
    return;
  end if;

  insert into public.anthropometric_measurements (
    care_space_id, child_id, measurement_type, original_value, original_unit,
    normalized_value, normalized_unit, occurred_at, local_date, time_zone,
    measurement_method, device, provenance_type, validation_status,
    idempotency_key, recorded_by, original_value_lexeme, normalized_value_lexeme,
    conversion_version, rounding_mode, input_fingerprint, scope_fingerprint,
    hmac_key_id, capture_policy_id, capture_policy_version, confirmed_at,
    confirmed_by, confirmation_sha256, supersedes_measurement_id, supersession_reason
  ) values (
    p_care_space_id, p_child_id, p_measurement_type, p_original_value_lexeme::numeric,
    p_original_unit, p_normalized_value_lexeme::numeric, p_normalized_unit,
    p_occurred_at, p_local_date, p_time_zone, p_measurement_method, p_device,
    p_provenance_type, 'confirmed', p_idempotency_key, actor, p_original_value_lexeme,
    p_normalized_value_lexeme, p_conversion_version, p_rounding_mode,
    p_input_fingerprint, encode(digest(format('%s:%s', p_care_space_id, p_child_id), 'sha256'), 'hex'),
    p_hmac_key_id, p_capture_policy_id, p_capture_policy_version, now(), actor,
    p_confirmation_sha256, p_supersedes_measurement_id, p_supersession_reason
  ) returning * into created;

  insert into public.growth_assessments (
    care_space_id, child_id, measurement_id, rule_pack_id, algorithm_id,
    standard_key, standard_version, dataset_digest, indicator,
    chronological_age_days, corrected_age_days, correction_applied,
    z_score, z_score_lexeme, percentile, percentile_lexeme, result_status,
    warnings, assessed_at, input_digest, decision_digest, algorithm_version,
    age_basis, age_policy_id, age_policy_version, interpretation, measurement_input_fingerprint, transition_reason
  )
  select
    p_care_space_id, p_child_id, created.id, a.rule_pack_id::uuid, a.algorithm_id::uuid,
    a.standard_key, a.standard_version, a.dataset_digest, a.indicator,
    a.chronological_age_days, a.corrected_age_days, a.correction_applied,
    nullif(a.z_score_lexeme, '')::numeric, nullif(a.z_score_lexeme, ''),
    nullif(a.percentile_lexeme, '')::numeric, nullif(a.percentile_lexeme, ''),
    a.result_status, coalesce(a.warnings, '{}'), coalesce(a.assessed_at, now()),
    a.input_digest, a.decision_digest, a.algorithm_version, a.age_basis,
    a.age_policy_id, a.age_policy_version, a.interpretation, p_input_fingerprint, a.transition_reason
  from jsonb_to_recordset(coalesce(p_assessments, '[]'::jsonb)) as a(
    rule_pack_id text, algorithm_id text, standard_key text, standard_version text,
    dataset_digest text, indicator text, chronological_age_days integer,
    corrected_age_days integer, correction_applied boolean, z_score_lexeme text,
    percentile_lexeme text, result_status text, warnings text[], assessed_at timestamptz,
    input_digest text, decision_digest text, algorithm_version text, age_basis text,
    age_policy_id text, age_policy_version text, interpretation text, transition_reason text
  );

  select coalesce(array_agg(id order by id), '{}'::uuid[]) into ids
  from public.growth_assessments ga where ga.measurement_id = created.id;
  return query select created.id, ids, 'created'::text;
exception when unique_violation then
  raise exception 'anthropometry_idempotency_conflict' using errcode = '23505';
end;
$$;
do $$
declare
  function_signature regprocedure;
begin
  select p.oid::regprocedure
    into function_signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'record_confirmed_anthropometry';

  if function_signature is null then
    raise exception 'record_confirmed_anthropometry was not created';
  end if;

  execute format('revoke all on function %s from public, anon', function_signature);
  execute format('grant execute on function %s to authenticated', function_signature);
end;
$$;
