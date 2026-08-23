-- Module 07 minimal, country-separated acetaminophen packages. These rows only
-- compare a caregiver-declared regimen with an exact label band. They do not
-- select a medicine or dose and do not authorize administration.

alter table public.medication_concepts
  add column country_code text check (country_code in ('CO', 'US')),
  add column catalog_version text,
  add column source_artifact_sha256 text check (source_artifact_sha256 is null or source_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  add column source_reference_ids text[] not null default '{}';

alter table public.medication_presentations
  add column dosage_form text,
  add column release_type text check (release_type in ('immediate', 'extended', 'delayed', 'unknown')),
  add column source_reference_ids text[] not null default '{}';

alter table public.pediatric_dose_limits
  alter column minimum_weight_kg type numeric(12,8),
  alter column maximum_weight_kg type numeric(12,8),
  add column rule_code text,
  add column medication_presentation_id uuid references public.medication_presentations(id) on delete restrict,
  add column fixed_per_dose_min numeric(12,4),
  add column fixed_per_dose_max numeric(12,4),
  add column daily_unit text,
  add column source_reference_ids text[] not null default '{}',
  add column source_weight_unit text,
  add column source_minimum_weight numeric(12,4),
  add column source_maximum_weight numeric(12,4);

alter table public.pediatric_dose_limits
  add constraint pediatric_dose_fixed_range check (fixed_per_dose_max is null or fixed_per_dose_min is null or fixed_per_dose_max >= fixed_per_dose_min),
  add constraint pediatric_dose_source_weight_range check (source_maximum_weight is null or source_minimum_weight is null or source_maximum_weight >= source_minimum_weight);
create unique index pediatric_dose_limits_formulary_rule_idx on public.pediatric_dose_limits(formulary_version_id, rule_code);

insert into public.clinical_sources (
  id, authority, jurisdiction, title, source_uri, citation, retrieved_at,
  effective_from, license, artifact_sha256, status
) values
  ('70000000-0000-4000-8000-000000000103', 'INVIMA', 'CO', 'INVIMA CUM — Dolex Niños 3.2% jarabe', 'https://www.invima.gov.co/consulta-registros-sanitarios', 'CUM 20164282-1; IUM 1P1019281000104; INVIMA 2019M-0019412', '2026-08-22T13:00:00Z', null, 'Official public regulatory dataset', '9a421f308acf1263cfee3149aa350f647eedfd5adb4e29f460edd5283d8c05ae', 'approved'),
  ('70000000-0000-4000-8000-000000000104', 'INVIMA', 'CO', 'INVIMA Acta 09 de 2018 — Dolex Niños label table', 'https://www.invima.gov.co/invima_website/static/attachments/medicamentos_sala_especializada_medicamentos_sintesis/Acta-No-09-de-2018-SEM.pdf', 'Exact 160 mg/5 mL product label weight bands', '2026-08-22T13:00:00Z', null, 'Official public regulatory artifact', '81cb94ff9f3856e804957a8588fd4f0dff35af45e5532917572121d11f6e8b01', 'approved'),
  ('70000000-0000-4000-8000-000000000205', 'NLM_DAILYMED', 'US', 'DailyMed SPL — Children''s Tylenol 160 mg/5 mL', 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/46ddbfde-54ab-4373-b832-b9c0620b1e9d.xml', 'SPL set 46ddbfde-54ab-4373-b832-b9c0620b1e9d; RxCUI 307668; NDC 50580-170', '2026-08-22T13:00:00Z', '2024-11-07', 'Official U.S. public label artifact', '1052c04560eae49ba2f319c68d53d1905a3f7997a24396f272cba64beda1d01f', 'approved')
on conflict (id) do nothing;

insert into public.clinical_algorithms (
  id, algorithm_key, version, domain, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status, approved_at, activated_at
) values (
  '70000000-0000-4000-8000-000000009000', 'medication-declared-dose-basic', '1.0.0', 'medication',
  '407e1b6caf7f9d70aab23a108c8399b889c47fdc748009cdcbf8d20ebc631554', array['1'],
  'medication.compareDeclaredDose', 'node24',
  'c6351213ff8667721c64f220e9e7328eef9faabb9a92f8adfcaad83ded106992', 'active',
  '2026-08-22T13:00:00Z', '2026-08-22T13:00:00Z'
) on conflict (id) do nothing;

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, artifact_uri, artifact_sha256
) values
  ('70000000-0000-4000-8000-000000009001', 'medication', 'CO', '2026.basic.1', 'es-CO', 'active', '2026-08-22', 'v1/medication/CO/39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8.json', '39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8'),
  ('70000000-0000-4000-8000-000000009002', 'medication', 'US', '2024.11.07.basic.1', 'en-US', 'active', '2024-11-07', 'v1/medication/US/7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0.json', '7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0')
on conflict (id) do nothing;

insert into public.clinical_rule_pack_sources (rule_pack_id, source_id, purpose) values
  ('70000000-0000-4000-8000-000000009001', '70000000-0000-4000-8000-000000000103', 'exact product identity'),
  ('70000000-0000-4000-8000-000000009001', '70000000-0000-4000-8000-000000000104', 'exact label comparison bands'),
  ('70000000-0000-4000-8000-000000009002', '70000000-0000-4000-8000-000000000205', 'exact product identity and label bands')
on conflict (rule_pack_id, source_id) do update set purpose = excluded.purpose;

insert into public.medication_concepts (
  id, concept_code, coding_system, ingredient_name, display_name_es, display_name_en,
  country_code, catalog_version, source_artifact_sha256, source_reference_ids
) values
  ('70000000-0000-4000-8000-000000009301', '1P1019281000104', 'IUM', 'Acetaminofén', 'Dolex Niños 3.2% jarabe', null, 'CO', '2025-08', '9a421f308acf1263cfee3149aa350f647eedfd5adb4e29f460edd5283d8c05ae', array['invima-cum-2025-08']),
  ('70000000-0000-4000-8000-000000009302', '307668', 'RxNorm', 'Acetaminophen', 'Children''s Tylenol 160 mg/5 mL', 'Children''s Tylenol 160 mg/5 mL', 'US', '2024-11-07', '1052c04560eae49ba2f319c68d53d1905a3f7997a24396f272cba64beda1d01f', array['dailymed-spl-46ddbfde-2024-11-07'])
on conflict (id) do nothing;

insert into public.medication_presentations (
  id, medication_concept_id, country_code, presentation_name,
  concentration_numerator, concentration_numerator_unit, concentration_denominator,
  concentration_denominator_unit, route, regulatory_identifier, dosage_form, release_type, source_reference_ids
) values
  ('70000000-0000-4000-8000-000000009311', '70000000-0000-4000-8000-000000009301', 'CO', 'Dolex Niños 3.2% jarabe — 160 mg/5 mL', 160, 'mg', 5, 'mL', 'oral', 'INVIMA 2019M-0019412|CUM 20164282-1|IUM 1P1019281000104', 'solution', 'immediate', array['invima-cum-2025-08','invima-acta-09-2018']),
  ('70000000-0000-4000-8000-000000009312', '70000000-0000-4000-8000-000000009302', 'US', 'Children''s Tylenol — 160 mg/5 mL', 160, 'mg', 5, 'mL', 'oral', 'SPL 46ddbfde-54ab-4373-b832-b9c0620b1e9d|RxCUI 307668|NDC 50580-170', 'suspension', 'immediate', array['dailymed-spl-46ddbfde-2024-11-07'])
on conflict (id) do nothing;

insert into public.pediatric_formulary_versions (
  id, rule_pack_id, country_code, version, effective_from, status
) values
  ('70000000-0000-4000-8000-000000009321', '70000000-0000-4000-8000-000000009001', 'CO', '2026.basic.1', '2026-08-22', 'active'),
  ('70000000-0000-4000-8000-000000009322', '70000000-0000-4000-8000-000000009002', 'US', '2024.11.07.basic.1', '2024-11-07', 'active')
on conflict (id) do nothing;

with rule_data(country_code, rule_code, minimum_weight_kg, maximum_weight_kg, dose_mg, daily_mg, source_weight_unit, source_minimum_weight, source_maximum_weight) as (values
  ('CO','CO-DOLEX-12-14KG',12::numeric,14::numeric,144::numeric,576::numeric,'kg',12::numeric,14::numeric),
  ('CO','CO-DOLEX-14.1-16KG',14.1,16,176,704,'kg',14.1,16),
  ('CO','CO-DOLEX-16.1-18.1KG',16.1,18.1,192,768,'kg',16.1,18.1),
  ('CO','CO-DOLEX-18.2-20.1KG',18.2,20.1,208,832,'kg',18.2,20.1),
  ('CO','CO-DOLEX-20.2-22.2KG',20.2,22.2,224,896,'kg',20.2,22.2),
  ('CO','CO-DOLEX-22.3-25KG',22.3,25,256,1024,'kg',22.3,25),
  ('CO','CO-DOLEX-25.1-28.1KG',25.1,28.1,288,1152,'kg',25.1,28.1),
  ('CO','CO-DOLEX-28.2-31.7KG',28.2,31.7,320,1280,'kg',28.2,31.7),
  ('CO','CO-DOLEX-31.8-36KG',31.8,36,368,1472,'kg',31.8,36),
  ('CO','CO-DOLEX-36.1-41KG',36.1,41,416,1664,'kg',36.1,41),
  ('CO','CO-DOLEX-41.1-45KG',41.1,45,464,1856,'kg',41.1,45),
  ('US','US-TYLENOL-24-35LB',10.88621688,15.87573295,160,800,'lb',24,35),
  ('US','US-TYLENOL-36-47LB',16.32932532,21.31884139,240,1200,'lb',36,47),
  ('US','US-TYLENOL-48-59LB',21.77243376,26.76194983,320,1600,'lb',48,59),
  ('US','US-TYLENOL-60-71LB',27.21554220,32.20505827,400,2000,'lb',60,71),
  ('US','US-TYLENOL-72-95LB',32.65865064,43.09127515,480,2400,'lb',72,95)
)
insert into public.pediatric_dose_limits (
  formulary_version_id, medication_concept_id, medication_presentation_id, rule_code,
  indication_code, route, minimum_age_days, maximum_age_days, minimum_weight_kg,
  maximum_weight_kg, dose_unit, max_single_dose, max_daily_dose, minimum_interval_hours,
  fixed_per_dose_min, fixed_per_dose_max, daily_unit, exclusions, source_reference_ids,
  source_weight_unit, source_minimum_weight, source_maximum_weight
)
select
  case r.country_code when 'CO' then '70000000-0000-4000-8000-000000009321'::uuid else '70000000-0000-4000-8000-000000009322'::uuid end,
  case r.country_code when 'CO' then '70000000-0000-4000-8000-000000009301'::uuid else '70000000-0000-4000-8000-000000009302'::uuid end,
  case r.country_code when 'CO' then '70000000-0000-4000-8000-000000009311'::uuid else '70000000-0000-4000-8000-000000009312'::uuid end,
  r.rule_code, null, 'oral', 730, 4381, r.minimum_weight_kg, r.maximum_weight_kg,
  'mg', r.dose_mg, r.daily_mg, 4, r.dose_mg, r.dose_mg, 'mg',
  case r.country_code
    when 'CO' then '{"reviewRequired":["under_2_years","liver_disease","renal_disease","duplicate_acetaminophen","overdose_or_urgent_symptoms","prn_frequency","duration_question","ambiguous_identity"]}'::jsonb
    else '{"reviewRequired":["under_2_years","liver_disease","warfarin_or_coumarin_use","duplicate_acetaminophen","overdose_or_urgent_symptoms","prn_frequency","ambiguous_identity"]}'::jsonb
  end,
  case r.country_code when 'CO' then array['invima-acta-09-2018'] else array['dailymed-spl-46ddbfde-2024-11-07'] end,
  r.source_weight_unit, r.source_minimum_weight, r.source_maximum_weight
from rule_data r
on conflict (formulary_version_id, rule_code) do nothing;

insert into public.clinical_approvals (
  id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, notes, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, request_id,
  approval_provenance, conveyance_record_sha256
) values
  ('70000000-0000-4000-8000-000000009101', '70000000-0000-4000-8000-000000009001', '39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8', 'product_owner_conveyed', null, 'approved', 'Exact basic informational declared-dose comparison package; no signature or personal identity', '2026-08-22T13:00:00Z', 1, '70000000-0000-4000-8000-000000009000', '407e1b6caf7f9d70aab23a108c8399b889c47fdc748009cdcbf8d20ebc631554', '80c5360c7cdd5e2861ddb925b799cd566dd8e416f3fd685d1dc5dcc755aa97f5', 'ab9759c6aaae3b99f6a588da911b42598def4cfe556eb7af27e454621291620c', null, 'clinical_approver', '70000000-0000-4000-8000-000000009501', 'product_owner_conveyed', 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42'),
  ('70000000-0000-4000-8000-000000009201', '70000000-0000-4000-8000-000000009002', '7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0', 'product_owner_conveyed', null, 'approved', 'Exact basic informational declared-dose comparison package; no signature or personal identity', '2026-08-22T13:00:00Z', 1, '70000000-0000-4000-8000-000000009000', '407e1b6caf7f9d70aab23a108c8399b889c47fdc748009cdcbf8d20ebc631554', '3f37dc9cec51ce25732d1a2fd5b3e4e37eeea35dc57306e04819f97f036f34f4', 'bfb0551e200ca67d3aad1ee6711f0458b6c20cc3186aafbec152444a1b36060a', null, 'clinical_approver', '70000000-0000-4000-8000-000000009502', 'product_owner_conveyed', 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42')
on conflict (id) do nothing;

do $$
begin
  perform app_private.activate_clinical_package(
    '70000000-0000-4000-8000-000000009001', '39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8',
    '70000000-0000-4000-8000-000000009000', '70000000-0000-4000-8000-000000009101',
    'medication', 'CO', 'es-CO', '2026-08-22T13:00:00Z', null,
    'c6351213ff8667721c64f220e9e7328eef9faabb9a92f8adfcaad83ded106992',
    '70000000-0000-4000-8000-000000009999', '70000000-0000-4000-8000-000000009401',
    'release', '39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8'
  );
  perform app_private.activate_clinical_package(
    '70000000-0000-4000-8000-000000009002', '7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0',
    '70000000-0000-4000-8000-000000009000', '70000000-0000-4000-8000-000000009201',
    'medication', 'US', 'en-US', '2026-08-22T13:00:00Z', null,
    'c6351213ff8667721c64f220e9e7328eef9faabb9a92f8adfcaad83ded106992',
    '70000000-0000-4000-8000-000000009999', '70000000-0000-4000-8000-000000009402',
    'release', '7877724c3978955e9e44e92b6d5bacec49464fbe52190b4dbe16e389d05d5db0'
  );
end;
$$;

create or replace function public.record_dose_validation(
  p_care_space_id uuid, p_child_id uuid, p_request_id text, p_declared_input jsonb,
  p_result text, p_explanation_codes text[], p_package_version text,
  p_algorithm_version text, p_vocabulary_version text, p_artifact_sha256 text,
  p_input_digest text, p_decision_digest text, p_source_evidence jsonb, p_ingredients jsonb
)
returns table (validation_id uuid, outcome text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  governed boolean;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_result not in ('within_reference_limits', 'outside_reference_limits', 'insufficient_data', 'requires_professional_review')
    or coalesce(cardinality(p_explanation_codes), 0) = 0
    or coalesce(length(trim(p_algorithm_version)), 0) = 0
    or coalesce(length(trim(p_vocabulary_version)), 0) = 0
    or p_source_evidence is null or jsonb_typeof(p_source_evidence) <> 'array' or jsonb_array_length(p_source_evidence) = 0
  then raise exception 'dose_validation_governed_package_required' using errcode = '22023'; end if;

  governed := p_package_version = 'unavailable' and p_artifact_sha256 is null
    and p_result in ('insufficient_data', 'requires_professional_review');

  if not governed then
    select exists (
      select 1
      from public.pediatric_formulary_versions f
      join public.clinical_rule_packs pack on pack.id = f.rule_pack_id
      join public.clinical_package_releases release on release.rule_pack_id = pack.id and release.status = 'active'
      join public.clinical_approvals approval on approval.id = release.approval_id and approval.decision = 'approved'
      join public.clinical_algorithms algorithm on algorithm.id = release.algorithm_id and algorithm.status = 'active'
      join public.children child on child.id = p_child_id and child.care_space_id = p_care_space_id
      where f.status = 'active' and f.version = p_package_version
        and f.country_code = child.country_of_care and pack.domain = 'medication'
        and pack.country_code = child.country_of_care and pack.artifact_sha256 = p_artifact_sha256
        and release.artifact_sha256 = p_artifact_sha256
        and algorithm.algorithm_key || '-' || algorithm.version = p_algorithm_version
        and p_vocabulary_version = 'acetaminophen-160mg-5ml-v1'
        and not exists (
          select 1
          from public.clinical_rule_pack_sources link
          join public.clinical_sources registered on registered.id = link.source_id
          where link.rule_pack_id = pack.id and not exists (
            select 1 from jsonb_to_recordset(p_source_evidence) source(
              "sourceId" text, "sourceVersion" text, "sourceKind" text, "sourceUri" text, "artifactSha256" text
            ) where source."sourceUri" = registered.source_uri
              and source."artifactSha256" = registered.artifact_sha256
          )
        )
        and not exists (
          select 1 from jsonb_to_recordset(p_source_evidence) source(
            "sourceId" text, "sourceVersion" text, "sourceKind" text, "sourceUri" text, "artifactSha256" text
          ) where not exists (
            select 1
            from public.clinical_rule_pack_sources link
            join public.clinical_sources registered on registered.id = link.source_id
            where link.rule_pack_id = pack.id and source."sourceUri" = registered.source_uri
              and source."artifactSha256" = registered.artifact_sha256
              and registered.status = 'approved'
          )
        )
    ) into governed;
  end if;
  if not governed then raise exception 'dose_validation_governed_package_required' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_source_evidence) source(
      "sourceId" text, "sourceVersion" text, "sourceKind" text, "sourceUri" text, "artifactSha256" text
    ) where not exists (
      select 1 from public.clinical_sources registered
      where registered.source_uri = source."sourceUri" and registered.artifact_sha256 = source."artifactSha256"
        and registered.status in ('reviewed', 'approved')
    )
  ) then raise exception 'dose_validation_source_unregistered' using errcode = '22023'; end if;

  perform app_private.medication_lock_key(pg_catalog.concat_ws(':', 'medication', 'validation', p_care_space_id, p_child_id, actor, p_request_id));
  return query select * from app_private.record_dose_validation_impl_20260821(
    p_care_space_id, p_child_id, p_request_id, p_declared_input, p_result,
    p_explanation_codes, p_package_version, p_algorithm_version, p_vocabulary_version,
    p_artifact_sha256, p_input_digest, p_decision_digest, p_source_evidence, p_ingredients
  );
end;
$$;
revoke all on function public.record_dose_validation(uuid,uuid,text,jsonb,text,text[],text,text,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.record_dose_validation(uuid,uuid,text,jsonb,text,text[],text,text,text,text,text,text,jsonb,jsonb) to authenticated;
