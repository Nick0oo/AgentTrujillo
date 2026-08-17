-- Module 05: exact anthropometry provenance and Cloud-backed growth series.

alter table public.anthropometric_measurements
  add column if not exists original_value_lexeme text,
  add column if not exists normalized_value_lexeme text,
  add column if not exists conversion_version text,
  add column if not exists rounding_mode text,
  add column if not exists input_fingerprint text,
  add column if not exists scope_fingerprint text,
  add column if not exists hmac_key_id text,
  add column if not exists capture_policy_id text,
  add column if not exists capture_policy_version text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists confirmation_sha256 text,
  add column if not exists supersedes_measurement_id uuid references public.anthropometric_measurements(id) on delete restrict,
  add column if not exists supersession_reason text;

update public.anthropometric_measurements
set original_value_lexeme = coalesce(original_value_lexeme, original_value::text),
    normalized_value_lexeme = coalesce(normalized_value_lexeme, normalized_value::text)
where original_value_lexeme is null or normalized_value_lexeme is null;

alter table public.anthropometric_measurements
  add constraint anthropometry_lexeme_shape_check check (
    (original_value_lexeme is null or original_value_lexeme ~ '^-?[0-9]+([.][0-9]+)?$')
    and (normalized_value_lexeme is null or normalized_value_lexeme ~ '^-?[0-9]+([.][0-9]+)?$')
  ),
  add constraint anthropometry_rounding_mode_check check (rounding_mode is null or rounding_mode in ('none', 'half_even')),
  add constraint anthropometry_digest_shape_check check (
    (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$')
    and (confirmation_sha256 is null or confirmation_sha256 ~ '^[a-f0-9]{64}$')
  ),
  add constraint anthropometry_supersession_reason_check check (
    supersedes_measurement_id is null or supersession_reason is not null
  );

alter table public.anthropometric_measurements
  add constraint anthropometry_scope_id_unique unique (care_space_id, id);

create unique index if not exists anthropometry_scope_fingerprint_idx
  on public.anthropometric_measurements(care_space_id, input_fingerprint)
  where input_fingerprint is not null;
create index if not exists anthropometry_child_type_time_idx
  on public.anthropometric_measurements(care_space_id, child_id, measurement_type, occurred_at desc);

alter table public.anthropometric_measurements drop constraint if exists anthropometry_idempotent;
create unique index if not exists anthropometry_scoped_idempotency_idx
  on public.anthropometric_measurements(care_space_id, child_id, recorded_by, idempotency_key);

alter table public.growth_assessments
  add column if not exists standard_version text,
  add column if not exists dataset_digest text,
  add column if not exists input_digest text,
  add column if not exists decision_digest text,
  add column if not exists algorithm_version text,
  add column if not exists age_basis text,
  add column if not exists age_policy_id text,
  add column if not exists age_policy_version text,
  add column if not exists interpretation text,
  add column if not exists measurement_input_fingerprint text,
  add column if not exists z_score_lexeme text,
  add column if not exists percentile_lexeme text,
  add column if not exists transition_reason text,
  add column if not exists companion_measurement_id uuid references public.anthropometric_measurements(id) on delete restrict;

alter table public.growth_assessments
  add constraint growth_assessment_digest_shape_check check (
    (dataset_digest is null or dataset_digest ~ '^[a-f0-9]{64}$')
    and (input_digest is null or input_digest ~ '^[a-f0-9]{64}$')
    and (decision_digest is null or decision_digest ~ '^[a-f0-9]{64}$')
  ),
  add constraint growth_assessment_age_basis_check check (age_basis is null or age_basis in ('chronological', 'corrected')),
  add constraint growth_assessment_age_policy_check check (
    (age_policy_id is null) = (age_policy_version is null)
  ),
  add constraint growth_assessment_interpretation_check check (
    interpretation is null or interpretation in ('within_expected', 'review_required', 'urgent_review', 'unavailable')
  ),
  add constraint growth_assessment_lexeme_shape_check check (
    (z_score_lexeme is null or z_score_lexeme ~ '^-?[0-9]+([.][0-9]+)?$')
    and (percentile_lexeme is null or percentile_lexeme ~ '^-?[0-9]+([.][0-9]+)?$')
  );

create index if not exists growth_assessments_child_indicator_time_idx
  on public.growth_assessments(care_space_id, child_id, indicator, assessed_at desc);
create index if not exists growth_assessments_measurement_idx
  on public.growth_assessments(measurement_id, assessed_at desc);

alter table public.growth_assessments
  add constraint growth_assessment_measurement_scope_fk
  foreign key (care_space_id, measurement_id)
  references public.anthropometric_measurements(care_space_id, id)
  on delete restrict;
alter table public.growth_assessments
  add constraint growth_assessment_companion_scope_fk
  foreign key (care_space_id, companion_measurement_id)
  references public.anthropometric_measurements(care_space_id, id)
  on delete restrict;

create or replace view public.growth_series_points
with (security_invoker = true)
as
select
  ga.id as assessment_id,
  ga.care_space_id,
  ga.child_id,
  ga.measurement_id,
  am.occurred_at,
  am.measurement_type,
  am.measurement_method,
  am.validation_status,
  superseded.id as superseded_by_measurement_id,
  ga.indicator,
  ga.standard_key,
  ga.standard_version,
  ga.dataset_digest,
  ga.age_basis,
  ga.chronological_age_days,
  ga.corrected_age_days,
  ga.correction_applied,
  ga.result_status,
  ga.interpretation,
  ga.z_score,
  ga.z_score_lexeme,
  ga.percentile,
  ga.percentile_lexeme,
  ga.warnings,
  ga.transition_reason,
  ga.assessed_at
from public.growth_assessments ga
join public.anthropometric_measurements am on am.id = ga.measurement_id
left join public.anthropometric_measurements superseded on superseded.supersedes_measurement_id = am.id;

grant select on public.growth_series_points to authenticated;

create or replace function app_private.prevent_anthropometry_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'anthropometry_history_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists anthropometric_measurements_set_updated_at on public.anthropometric_measurements;
drop trigger if exists anthropometric_measurements_immutable on public.anthropometric_measurements;
create trigger anthropometric_measurements_immutable
  before update or delete on public.anthropometric_measurements
  for each row execute function app_private.prevent_anthropometry_mutation();

drop trigger if exists growth_assessments_immutable on public.growth_assessments;
create trigger growth_assessments_immutable
  before update or delete on public.growth_assessments
  for each row execute function app_private.prevent_anthropometry_mutation();

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
    p_input_fingerprint, encode(extensions.digest(format('%s:%s', p_care_space_id, p_child_id), 'sha256'), 'hex'),
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
