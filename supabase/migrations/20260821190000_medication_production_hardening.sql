-- Module 07 production closure: source locators, normalized validation evidence,
-- and server-derived replay identity. This activates no formulary or dose rule.

insert into public.clinical_sources (
  id, authority, jurisdiction, title, source_uri, retrieved_at, license,
  artifact_sha256, status
)
values
  ('70000000-0000-4000-8000-000000000101', 'INVIMA', 'CO', 'INVIMA sanitary register lookup - retrieval 2026-08-21', 'https://www.invima.gov.co/consulta-registros-sanitarios', '2026-08-21T23:00:00Z', 'Official public registry locator; reuse terms not asserted', '88c29bedd81f9ab0d1a01fe9a5e9d191b67601f7780e742ea52070c12f5c13f7', 'reviewed'),
  ('70000000-0000-4000-8000-000000000102', 'INVIMA', 'CO', 'INVIMA medicine commercialization authorization - retrieval 2026-08-21', 'https://www.invima.gov.co/productos-vigilados/medicamentos-y-productos-biologicos/autorizacion-de-comercializacion-registros', '2026-08-21T23:00:00Z', 'Official public regulator locator; reuse terms not asserted', '2dbc9e2fc7b43862aaee94428b7645c67eab3a574dc17655f6879e97f8f3ebc9', 'reviewed'),
  ('70000000-0000-4000-8000-000000000201', 'NLM_RXNORM', 'US', 'NLM RxNorm overview - retrieval 2026-08-21', 'https://www.nlm.nih.gov/research/umls/rxnorm/overview.html', '2026-08-21T23:00:00Z', 'Official NLM terminology locator; license governed by source terms', 'fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c', 'reviewed'),
  ('70000000-0000-4000-8000-000000000202', 'NLM_RXNORM', 'US', 'NLM RxNorm API documentation - retrieval 2026-08-21', 'https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html', '2026-08-21T23:00:00Z', 'Official NLM API locator; license governed by source terms', 'd037f07cac2e2f18225cff27f792c2d0133d945d67b175108d0866d4acfd49d8', 'reviewed'),
  ('70000000-0000-4000-8000-000000000203', 'NLM_DAILYMED', 'US', 'DailyMed web services - retrieval 2026-08-21', 'https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm', '2026-08-21T23:00:00Z', 'Official NLM label-service locator; license governed by source terms', '3fbe63342062c085fcbb85f1431f6c1614bbacc6b2ade5adc21de8eba3c4327e', 'reviewed'),
  ('70000000-0000-4000-8000-000000000204', 'FDA', 'US', 'FDA pediatric labeling changes - retrieval 2026-08-21', 'https://www.fda.gov/science-research/pediatrics/pediatric-labeling-changes', '2026-08-21T23:00:00Z', 'Official FDA locator; reuse terms governed by source terms', 'a46ec23c96d76c3c39bd37bdd10e25a1e6cabcde99fb03406aecb2080700ec09', 'reviewed')
on conflict (id) do nothing;

alter table public.dose_validations
  drop constraint if exists dose_validations_source_object_check;
alter table public.dose_validations
  drop constraint if exists dose_validations_source_array_check;
alter table public.dose_validations
  alter column source_evidence drop default;
alter table public.dose_validations
  add constraint dose_validations_source_array_check
  check (jsonb_typeof(source_evidence) = 'array' and jsonb_array_length(source_evidence) > 0) not valid;
alter table public.dose_validations validate constraint dose_validations_source_array_check;

create unique index if not exists dose_validation_sources_exact_unique
  on public.dose_validation_sources(validation_id, source_id, source_version);

create or replace function app_private.medication_domain_digest(p_payload jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$$;

revoke all on function app_private.medication_domain_digest(jsonb) from public, anon, authenticated;

create or replace function public.record_dose_validation(
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
  existing public.dose_validations%rowtype;
  created_id uuid;
  derived_input_digest text;
  derived_decision_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_request_id is null or length(p_request_id) not between 1 and 200
    or p_result not in ('within_reference_limits', 'outside_reference_limits', 'insufficient_data', 'requires_professional_review')
    or p_declared_input is null or jsonb_typeof(p_declared_input) <> 'object'
    or p_declared_input ?| array['safe', 'unsafe', 'safeToAdminister', 'recommendedDose', 'alternativeDose', 'prescribed']
    or p_source_evidence is null or jsonb_typeof(p_source_evidence) <> 'array' or jsonb_array_length(p_source_evidence) = 0
    or p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
    or (p_artifact_sha256 is not null and p_artifact_sha256 !~ '^[a-f0-9]{64}$')
    or exists (
      select 1 from jsonb_array_elements(p_source_evidence) source
      where jsonb_typeof(source) <> 'object'
        or source ?| array['safe', 'unsafe', 'recommendedDose', 'alternativeDose', 'prescribed']
        or not (source ?& array['sourceId', 'sourceVersion', 'sourceKind', 'sourceUri', 'artifactSha256'])
        or (select count(*) from jsonb_object_keys(source)) <> 5
        or source->>'sourceKind' not in ('identity', 'label', 'formulary', 'algorithm')
        or source->>'sourceUri' !~ '^https://'
        or source->>'artifactSha256' !~ '^[a-f0-9]{64}$'
        or length(source->>'sourceId') = 0
        or length(source->>'sourceVersion') = 0
    )
  then raise exception 'dose_validation_input_invalid' using errcode = '22023'; end if;

  derived_input_digest := app_private.medication_domain_digest(p_declared_input);
  derived_decision_digest := app_private.medication_domain_digest(jsonb_build_object(
    'result', p_result,
    'explanation_codes', to_jsonb(coalesce(p_explanation_codes, '{}'::text[])),
    'package_version', p_package_version,
    'algorithm_version', p_algorithm_version,
    'vocabulary_version', p_vocabulary_version,
    'artifact_sha256', p_artifact_sha256,
    'sources', p_source_evidence,
    'ingredients', p_ingredients
  ));

  select * into existing from public.dose_validations
  where care_space_id = p_care_space_id and child_id = p_child_id and validated_by = actor and request_id = p_request_id;
  if existing.id is not null then
    if existing.input_digest is distinct from derived_input_digest or existing.decision_digest is distinct from derived_decision_digest
      then raise exception 'dose_validation_idempotency_conflict' using errcode = '23505'; end if;
    validation_id := existing.id; outcome := 'idempotent_replay'; return next; return;
  end if;

  insert into public.dose_validations (
    care_space_id, child_id, declared_input, result, explanation_codes, validated_at,
    request_id, validated_by, package_version, algorithm_version, vocabulary_version,
    artifact_sha256, input_digest, decision_digest, source_evidence
  ) values (
    p_care_space_id, p_child_id, p_declared_input, p_result, coalesce(p_explanation_codes, '{}'::text[]), now(),
    p_request_id, actor, p_package_version, p_algorithm_version, p_vocabulary_version,
    p_artifact_sha256, derived_input_digest, derived_decision_digest, p_source_evidence
  ) returning id into created_id;

  insert into public.dose_validation_ingredients (
    validation_id, care_space_id, child_id, ingredient_code, declared_amount_lexeme,
    declared_unit, converted_amount_lexeme, converted_unit, arithmetic_trace
  )
  select created_id, p_care_space_id, p_child_id, row.ingredient_code,
    row.declared_amount_lexeme, row.declared_unit, row.converted_amount_lexeme,
    row.converted_unit, coalesce(row.arithmetic_trace, '{}'::jsonb)
  from jsonb_to_recordset(p_ingredients) as row(
    ingredient_code text, declared_amount_lexeme text, declared_unit text,
    converted_amount_lexeme text, converted_unit text, arithmetic_trace jsonb
  );

  insert into public.dose_validation_sources (
    validation_id, care_space_id, child_id, source_id, source_version,
    source_kind, source_uri, artifact_sha256
  )
  select created_id, p_care_space_id, p_child_id, row."sourceId", row."sourceVersion",
    row."sourceKind", row."sourceUri", row."artifactSha256"
  from jsonb_to_recordset(p_source_evidence) as row(
    "sourceId" text, "sourceVersion" text, "sourceKind" text,
    "sourceUri" text, "artifactSha256" text
  );

  validation_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'dose_validation_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.record_medication_schedule_occurrences(
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
  existing app_private.medication_operation_ledger%rowtype;
  saved integer := 0;
  domain_payload jsonb;
  derived_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_digest !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
    or p_occurrences is null or jsonb_typeof(p_occurrences) <> 'array' or jsonb_array_length(p_occurrences) > 1000
    or exists (
      select 1 from jsonb_array_elements(p_occurrences) occurrence
      where jsonb_typeof(occurrence) <> 'object'
        or not (occurrence ?& array['occurrence_key', 'scheduled_for', 'local_date', 'time_zone', 'source'])
        or occurrence->>'source' not in ('interval', 'times_of_day')
        or length(occurrence->>'occurrence_key') not between 1 and 200
        or length(occurrence->>'time_zone') not between 1 and 100
    )
  then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.medication_plans p
    where p.id = p_medication_plan_id and p.care_space_id = p_care_space_id
      and p.child_id = p_child_id and p.version = p_plan_version and p.status = 'active'
  ) then return; end if;

  domain_payload := jsonb_build_object(
    'medication_plan_id', p_medication_plan_id,
    'plan_version', p_plan_version,
    'occurrences', p_occurrences
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'materialize_schedule' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    saved_count := coalesce((existing.payload->>'saved_count')::integer, 0);
    outcome := 'idempotent_replay'; return next; return;
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_occurrences) as row(occurrence_key text, scheduled_for timestamptz, local_date date, time_zone text, source text)
    join public.medication_schedule_occurrences existing_occurrence
      on existing_occurrence.care_space_id = p_care_space_id
      and existing_occurrence.child_id = p_child_id
      and existing_occurrence.occurrence_key = row.occurrence_key
    where existing_occurrence.medication_plan_id <> p_medication_plan_id
      or existing_occurrence.plan_version <> p_plan_version
      or existing_occurrence.scheduled_for <> row.scheduled_for
      or existing_occurrence.local_date <> row.local_date
      or existing_occurrence.time_zone <> row.time_zone
      or existing_occurrence.source <> row.source
  ) then raise exception 'medication_occurrence_conflict' using errcode = '23505'; end if;
  insert into public.medication_schedule_occurrences (
    care_space_id, child_id, medication_plan_id, plan_version, occurrence_key,
    scheduled_for, local_date, time_zone, source
  )
  select p_care_space_id, p_child_id, p_medication_plan_id, p_plan_version,
    row.occurrence_key, row.scheduled_for, row.local_date, row.time_zone, row.source
  from jsonb_to_recordset(p_occurrences) as row(
    occurrence_key text, scheduled_for timestamptz, local_date date, time_zone text, source text
  )
  on conflict (care_space_id, child_id, occurrence_key) do nothing;
  get diagnostics saved = row_count;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'materialize_schedule', p_idempotency_key,
    derived_digest, 'medication_schedule_occurrence', domain_payload || jsonb_build_object('saved_count', saved)
  );
  saved_count := saved; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.correct_medication_intake(
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
  existing app_private.medication_operation_ledger%rowtype;
  created_id uuid;
  domain_payload jsonb;
  derived_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_status not in ('taken', 'skipped', 'unknown')
    or ((p_status = 'taken') <> (p_taken_at is not null))
    or ((p_actual_quantity_lexeme is null) <> (p_actual_unit is null))
    or (p_actual_quantity_lexeme is not null and p_actual_quantity_lexeme !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$')
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
  then raise exception 'medication_intake_input_invalid' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.medication_intakes i
    where i.id = p_original_intake_id and i.care_space_id = p_care_space_id
      and i.child_id = p_child_id and i.medication_plan_id = p_medication_plan_id
      and not exists (select 1 from public.medication_intakes correction where correction.supersedes_intake_id = i.id)
  ) then return; end if;
  if p_medication_schedule_occurrence_id is not null and not exists (
    select 1 from public.medication_schedule_occurrences o
    where o.id = p_medication_schedule_occurrence_id and o.care_space_id = p_care_space_id
      and o.child_id = p_child_id and o.medication_plan_id = p_medication_plan_id
  ) then return; end if;
  domain_payload := jsonb_build_object(
    'original_intake_id', p_original_intake_id,
    'medication_plan_id', p_medication_plan_id,
    'medication_schedule_occurrence_id', p_medication_schedule_occurrence_id,
    'scheduled_for', p_scheduled_for,
    'taken_at', p_taken_at,
    'status', p_status,
    'actual_quantity_lexeme', p_actual_quantity_lexeme,
    'actual_unit', p_actual_unit
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'correct_intake' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    intake_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.medication_intakes (
    care_space_id, child_id, medication_plan_id, medication_schedule_occurrence_id,
    scheduled_for, taken_at, status, actual_quantity, actual_unit,
    idempotency_key, recorded_by, input_fingerprint, supersedes_intake_id
  ) values (
    p_care_space_id, p_child_id, p_medication_plan_id, p_medication_schedule_occurrence_id,
    p_scheduled_for, p_taken_at, p_status,
    case when p_actual_quantity_lexeme is null then null else p_actual_quantity_lexeme::numeric end,
    p_actual_unit, p_idempotency_key, actor, derived_digest, p_original_intake_id
  ) returning id into created_id;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'correct_intake', p_idempotency_key,
    derived_digest, 'medication_intake', created_id, domain_payload
  );
  intake_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.supersede_medication_plan(
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
  existing app_private.medication_operation_ledger%rowtype;
  previous public.medication_plans%rowtype;
  created_id uuid;
  domain_payload jsonb;
  derived_digest text;
  frequency_kind text := p_input_payload#>>'{frequency,kind}';
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_payload is null or jsonb_typeof(p_input_payload) <> 'object'
    or p_input_payload ?| array['care_space_id', 'child_id', 'guardian_id', 'safe', 'safeToAdminister', 'recommendedDose', 'alternativeDose', 'prescribed']
    or p_display_name is null or length(p_display_name) not between 1 and 200
    or p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at)
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'medication_supersession_input_invalid' using errcode = '22023'; end if;
  if p_medication_presentation_id is not null and not exists (
    select 1 from public.medication_presentations mp
    where mp.id = p_medication_presentation_id and mp.medication_concept_id = p_medication_concept_id and mp.active
  ) then return; end if;
  if (p_input_payload ? 'dose' or p_input_payload ? 'frequency' or p_input_payload ? 'route') and (
    not (p_input_payload ?& array['dose', 'frequency', 'route', 'timeZone'])
    or jsonb_typeof(p_input_payload->'dose') <> 'object'
    or jsonb_typeof(p_input_payload->'frequency') <> 'object'
    or p_input_payload#>>'{dose,quantity}' !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$'
    or frequency_kind not in ('interval', 'times_of_day', 'as_needed')
  ) then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;
  domain_payload := jsonb_build_object(
    'supersedes_plan_id', p_plan_id,
    'medication_concept_id', p_medication_concept_id,
    'medication_presentation_id', p_medication_presentation_id,
    'display_name', p_display_name,
    'declared_indication', p_declared_indication,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'dose', p_input_payload->'dose',
    'route', p_input_payload->'route',
    'frequency', p_input_payload->'frequency',
    'instructions', p_input_payload->'instructions',
    'time_zone', p_input_payload->'timeZone'
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'supersede_plan' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  select * into previous from public.medication_plans
  where id = p_plan_id and care_space_id = p_care_space_id and child_id = p_child_id for update;
  if previous.id is null or previous.status not in ('draft', 'active', 'paused') then return; end if;
  update public.medication_plans set status = 'superseded', supersession_reason = 'caregiver_declared_replacement' where id = previous.id;
  insert into public.medication_plans (
    care_space_id, child_id, medication_concept_id, medication_presentation_id,
    display_name, declared_indication, provenance_type, starts_at, ends_at,
    status, recorded_by, version, supersedes_plan_id, supersession_reason, input_fingerprint
  ) values (
    p_care_space_id, p_child_id, p_medication_concept_id, p_medication_presentation_id,
    p_display_name, p_declared_indication, 'guardian', p_starts_at, p_ends_at,
    'draft', actor, previous.version + 1, previous.id,
    'caregiver_declared_replacement', derived_digest
  ) returning id into created_id;
  if p_input_payload ?& array['dose', 'frequency', 'route', 'timeZone'] then
    insert into public.medication_schedules (
      medication_plan_id, dose_quantity, dose_unit, route, frequency_kind,
      interval_hours, times_of_day, time_zone, instructions,
      care_space_id, child_id, plan_version, idempotency_key, input_fingerprint
    ) values (
      created_id, (p_input_payload#>>'{dose,quantity}')::numeric,
      p_input_payload#>>'{dose,unit}', p_input_payload->>'route', frequency_kind,
      case when frequency_kind = 'interval' then (p_input_payload#>>'{frequency,everyHours}')::numeric else null end,
      case when frequency_kind = 'times_of_day' then array(select value::time from jsonb_array_elements_text(p_input_payload#>'{frequency,times}')) else '{}'::time[] end,
      p_input_payload->>'timeZone', p_input_payload->>'instructions',
      p_care_space_id, p_child_id, previous.version + 1,
      p_idempotency_key, derived_digest
    );
  end if;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'supersede_plan', p_idempotency_key,
    derived_digest, 'medication_plan', created_id, domain_payload
  );
  plan_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) from public, anon;
revoke all on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) to authenticated;
grant execute on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;

create or replace function public.record_medication_intake(
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
  existing app_private.medication_operation_ledger%rowtype;
  created_id uuid;
  domain_payload jsonb;
  derived_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_status not in ('taken', 'skipped', 'unknown')
    or ((p_status = 'taken') <> (p_taken_at is not null))
    or ((p_actual_quantity_lexeme is null) <> (p_actual_unit is null))
    or (p_actual_quantity_lexeme is not null and p_actual_quantity_lexeme !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$')
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
  then raise exception 'medication_intake_input_invalid' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.medication_plans p where p.id = p_medication_plan_id
      and p.care_space_id = p_care_space_id and p.child_id = p_child_id
  ) then return; end if;
  if p_medication_schedule_occurrence_id is not null and not exists (
    select 1 from public.medication_schedule_occurrences o
    where o.id = p_medication_schedule_occurrence_id and o.care_space_id = p_care_space_id
      and o.child_id = p_child_id and o.medication_plan_id = p_medication_plan_id
  ) then return; end if;
  if p_medication_schedule_occurrence_id is not null and exists (
    select 1 from public.medication_intakes i
    where i.care_space_id = p_care_space_id and i.child_id = p_child_id
      and i.medication_schedule_occurrence_id = p_medication_schedule_occurrence_id
      and not exists (select 1 from public.medication_intakes correction where correction.supersedes_intake_id = i.id)
  ) then raise exception 'medication_occurrence_fact_conflict' using errcode = '23505'; end if;

  domain_payload := jsonb_build_object(
    'medication_plan_id', p_medication_plan_id,
    'medication_schedule_occurrence_id', p_medication_schedule_occurrence_id,
    'scheduled_for', p_scheduled_for,
    'taken_at', p_taken_at,
    'status', p_status,
    'actual_quantity_lexeme', p_actual_quantity_lexeme,
    'actual_unit', p_actual_unit
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'record_intake' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    intake_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.medication_intakes (
    care_space_id, child_id, medication_plan_id, medication_schedule_occurrence_id,
    scheduled_for, taken_at, status, actual_quantity, actual_unit,
    idempotency_key, recorded_by, input_fingerprint
  ) values (
    p_care_space_id, p_child_id, p_medication_plan_id, p_medication_schedule_occurrence_id,
    p_scheduled_for, p_taken_at, p_status,
    case when p_actual_quantity_lexeme is null then null else p_actual_quantity_lexeme::numeric end,
    p_actual_unit, p_idempotency_key, actor, derived_digest
  ) returning id into created_id;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'record_intake', p_idempotency_key,
    derived_digest, 'medication_intake', created_id, domain_payload
  );
  intake_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) to authenticated;

create or replace function public.record_medication_plan(
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
  existing app_private.medication_operation_ledger%rowtype;
  created_id uuid;
  domain_payload jsonb;
  derived_digest text;
  frequency_kind text := p_input_payload#>>'{frequency,kind}';
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_payload is null or jsonb_typeof(p_input_payload) <> 'object'
    or p_input_payload ?| array['care_space_id', 'child_id', 'guardian_id', 'safe', 'safeToAdminister', 'recommendedDose', 'alternativeDose', 'prescribed']
    or p_display_name is null or length(p_display_name) not between 1 and 200
    or p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at)
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'medication_plan_input_invalid' using errcode = '22023'; end if;
  if p_medication_presentation_id is not null and not exists (
    select 1 from public.medication_presentations mp
    where mp.id = p_medication_presentation_id and mp.medication_concept_id = p_medication_concept_id and mp.active
  ) then return; end if;
  if (p_input_payload ? 'dose' or p_input_payload ? 'frequency' or p_input_payload ? 'route') and (
    not (p_input_payload ?& array['dose', 'frequency', 'route', 'timeZone'])
    or jsonb_typeof(p_input_payload->'dose') <> 'object'
    or jsonb_typeof(p_input_payload->'frequency') <> 'object'
    or p_input_payload#>>'{dose,quantity}' !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$'
    or frequency_kind not in ('interval', 'times_of_day', 'as_needed')
    or (frequency_kind = 'interval' and p_input_payload#>>'{frequency,everyHours}' !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$')
    or (frequency_kind = 'times_of_day' and (jsonb_typeof(p_input_payload#>'{frequency,times}') <> 'array' or jsonb_array_length(p_input_payload#>'{frequency,times}') = 0))
  ) then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;

  domain_payload := jsonb_build_object(
    'medication_concept_id', p_medication_concept_id,
    'medication_presentation_id', p_medication_presentation_id,
    'display_name', p_display_name,
    'declared_indication', p_declared_indication,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'dose', p_input_payload->'dose',
    'route', p_input_payload->'route',
    'frequency', p_input_payload->'frequency',
    'instructions', p_input_payload->'instructions',
    'time_zone', p_input_payload->'timeZone'
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);

  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'create_plan' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;

  insert into public.medication_plans (
    care_space_id, child_id, medication_concept_id, medication_presentation_id,
    display_name, declared_indication, provenance_type, starts_at, ends_at,
    status, recorded_by, version, input_fingerprint, confirmed_at, confirmed_by
  ) values (
    p_care_space_id, p_child_id, p_medication_concept_id, p_medication_presentation_id,
    p_display_name, p_declared_indication, 'guardian', p_starts_at, p_ends_at,
    'draft', actor, 1, derived_digest, null, null
  ) returning id into created_id;

  if p_input_payload ?& array['dose', 'frequency', 'route', 'timeZone'] then
    insert into public.medication_schedules (
      medication_plan_id, dose_quantity, dose_unit, route, frequency_kind,
      interval_hours, times_of_day, time_zone, instructions,
      care_space_id, child_id, plan_version, idempotency_key, input_fingerprint
    ) values (
      created_id, (p_input_payload#>>'{dose,quantity}')::numeric,
      p_input_payload#>>'{dose,unit}', p_input_payload->>'route', frequency_kind,
      case when frequency_kind = 'interval' then (p_input_payload#>>'{frequency,everyHours}')::numeric else null end,
      case when frequency_kind = 'times_of_day' then array(select value::time from jsonb_array_elements_text(p_input_payload#>'{frequency,times}')) else '{}'::time[] end,
      p_input_payload->>'timeZone', p_input_payload->>'instructions',
      p_care_space_id, p_child_id, 1, p_idempotency_key, derived_digest
    );
  end if;

  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'create_plan', p_idempotency_key,
    derived_digest, 'medication_plan', created_id, domain_payload
  );
  plan_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.transition_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_plan_id uuid,
  p_status text,
  p_idempotency_key text,
  p_input_digest text,
  p_input_payload jsonb
)
returns table (plan_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.medication_operation_ledger%rowtype;
  current_plan public.medication_plans%rowtype;
  op_kind text := case when p_status in ('completed', 'cancelled') then 'end_plan' else 'confirm_plan' end;
  domain_payload jsonb := jsonb_build_object('plan_id', p_plan_id, 'status', p_status);
  derived_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_status not in ('active', 'completed', 'cancelled') or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
    or p_input_digest !~ '^[a-f0-9]{64}$' then raise exception 'medication_transition_input_invalid' using errcode = '22023'; end if;
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = op_kind and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  select * into current_plan from public.medication_plans
  where id = p_plan_id and care_space_id = p_care_space_id and child_id = p_child_id for update;
  if current_plan.id is null
    or (p_status = 'active' and current_plan.status <> 'draft')
    or (p_status in ('completed', 'cancelled') and current_plan.status not in ('active', 'paused'))
  then return; end if;
  update public.medication_plans
  set status = p_status,
      confirmed_at = case when p_status = 'active' then now() else confirmed_at end,
      confirmed_by = case when p_status = 'active' then actor else confirmed_by end
  where id = current_plan.id;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, op_kind, p_idempotency_key,
    derived_digest, 'medication_plan', current_plan.id, domain_payload
  );
  plan_id := current_plan.id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;
