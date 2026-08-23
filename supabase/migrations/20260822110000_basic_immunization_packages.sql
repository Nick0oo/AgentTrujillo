-- Module 06 conservative production packages. These rows support informational
-- routine-age comparison only. Review-only rules must never be presented as a
-- vaccination recommendation, medical decision, or booking action.

create or replace function app_private.is_calendar_interval(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null or (
    jsonb_typeof(value) = 'object'
    and value ?& array['unit', 'value']
    and value->>'unit' in ('days', 'calendar_months', 'calendar_years')
    and value->>'value' ~ '^[0-9]+$'
  )
$$;
revoke all on function app_private.is_calendar_interval(jsonb) from public, anon, authenticated;

alter table public.immunization_rules
  add column rule_code text,
  add column rule_kind text,
  add column minimum_age_interval jsonb,
  add column target_age_interval jsonb,
  add column target_age_until_interval jsonb,
  add column minimum_interval jsonb,
  add column recommended_interval jsonb,
  add column grace_period jsonb,
  add column source_reference_ids text[] not null default '{}';

alter table public.immunization_rules
  add constraint immunization_rules_code_required check (rule_code is not null and length(rule_code) between 1 and 200),
  add constraint immunization_rules_kind_check check (rule_kind in ('routine', 'catch_up', 'special_population', 'campaign', 'outbreak', 'review_only')),
  add constraint immunization_rules_minimum_age_interval_check check (app_private.is_calendar_interval(minimum_age_interval)),
  add constraint immunization_rules_target_age_interval_check check (app_private.is_calendar_interval(target_age_interval)),
  add constraint immunization_rules_target_age_until_interval_check check (app_private.is_calendar_interval(target_age_until_interval)),
  add constraint immunization_rules_minimum_interval_check check (app_private.is_calendar_interval(minimum_interval)),
  add constraint immunization_rules_recommended_interval_check check (app_private.is_calendar_interval(recommended_interval)),
  add constraint immunization_rules_grace_period_check check (app_private.is_calendar_interval(grace_period)),
  add constraint immunization_rules_sources_required check (cardinality(source_reference_ids) > 0);
create unique index immunization_rules_schedule_code_idx on public.immunization_rules(schedule_id, rule_code);

insert into public.clinical_sources (
  id, authority, jurisdiction, title, source_uri, published_at, retrieved_at,
  effective_from, license, artifact_sha256, status
) values
  ('60000000-0000-4000-8000-000000000106', 'MINSALUD_PAI', 'CO', 'Lineamientos para la gestión y administración del PAI 2026 v12', 'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lineamientos-gestion-administracion-pai-2026.pdf', '2026-01-01', '2026-08-22T12:00:00Z', '2026-01-01', 'Official public-health artifact', '9c9957034a7716092f696f702219d9a496ab12339d95eb00f957c8441283e34e', 'approved'),
  ('60000000-0000-4000-8000-000000000204', 'CDC_ACIP', 'US', 'Child and Adolescent Immunization Schedule by Age', 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-age.html', '2025-07-02', '2026-08-22T12:00:00Z', '2025-07-02', 'Official public-health live page', '5033ce27b6c114148e35c7c255da0ae00cc2fc5b8f68d74a20595537af42664a', 'approved'),
  ('60000000-0000-4000-8000-000000000205', 'CDC_ACIP', 'US', 'Child Immunization Schedule Notes', 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html', '2025-07-02', '2026-08-22T12:00:00Z', '2025-07-02', 'Official public-health live page', 'd0cfe078b519b0e4bb0938ba2a5cd4cf8607bb5b71e4f4bd901027334b57c688', 'approved')
on conflict (id) do update set
  artifact_sha256 = excluded.artifact_sha256,
  status = excluded.status,
  retrieved_at = excluded.retrieved_at,
  license = excluded.license;

update public.clinical_sources set status = 'approved'
where id = '60000000-0000-4000-8000-000000000102';
update public.clinical_sources set
  status = 'approved', artifact_sha256 = '42c1fee6cc65a2fe51ac7708e566428a693fc14b3568685bee777c76f0803fda', retrieved_at = '2026-08-22T12:00:00Z'
where id = '60000000-0000-4000-8000-000000000201';
update public.clinical_sources set
  status = 'approved', artifact_sha256 = '090e13f99d2b478581a86cfb3508f14237981e0e85f6a34d06a42e78f72f9ad4', retrieved_at = '2026-08-22T12:00:00Z'
where id = '60000000-0000-4000-8000-000000000202';

insert into public.clinical_algorithms (
  id, algorithm_key, version, domain, implementation_sha256, artifact_schema_versions,
  entrypoint, runtime, test_vector_sha256, status, approved_at, activated_at
) values (
  '60000000-0000-4000-8000-000000009000', 'immunization-basic-informational', '1.0.0', 'immunization',
  '90bb839bb32a415a9b625769bc5d14b4926b1152180b159615aa98c2822c9f0b', array['1'],
  'immunization.classifyDoseStatus', 'node24',
  '74348feb9d6f08da6ef02300b6fa2496d1dd026a316c914dc6c5c4128f6f20ad', 'active',
  '2026-08-22T12:00:00Z', '2026-08-22T12:00:00Z'
) on conflict (id) do nothing;

insert into public.clinical_rule_packs (
  id, domain, country_code, version, locale, status, effective_from, effective_until, artifact_uri, artifact_sha256
) values
  ('60000000-0000-4000-8000-000000009001', 'immunization', 'CO', '2026.basic.1', 'es-CO', 'active', '2026-01-01', null, 'v1/immunization/CO/60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d.json', '60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d'),
  ('60000000-0000-4000-8000-000000009002', 'immunization', 'US', '2025.07.02.basic.1', 'en-US', 'active', '2025-07-02', null, 'v1/immunization/US/381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae.json', '381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae')
on conflict (id) do update set status = excluded.status, artifact_uri = excluded.artifact_uri, artifact_sha256 = excluded.artifact_sha256;

insert into public.clinical_rule_pack_sources (rule_pack_id, source_id, purpose) values
  ('60000000-0000-4000-8000-000000009001', '60000000-0000-4000-8000-000000000102', 'routine schedule'),
  ('60000000-0000-4000-8000-000000009001', '60000000-0000-4000-8000-000000000106', 'review boundary and program context'),
  ('60000000-0000-4000-8000-000000009002', '60000000-0000-4000-8000-000000000201', 'catch-up review boundary'),
  ('60000000-0000-4000-8000-000000009002', '60000000-0000-4000-8000-000000000202', 'medical-indication review boundary'),
  ('60000000-0000-4000-8000-000000009002', '60000000-0000-4000-8000-000000000204', 'routine schedule'),
  ('60000000-0000-4000-8000-000000009002', '60000000-0000-4000-8000-000000000205', 'routine notes')
on conflict (rule_pack_id, source_id) do update set purpose = excluded.purpose;

insert into public.immunization_schedules (
  id, rule_pack_id, country_code, schedule_key, display_name, version, effective_from, status
) values
  ('60000000-0000-4000-8000-000000009011', '60000000-0000-4000-8000-000000009001', 'CO', 'pai-basic-informational', 'PAI Colombia — comparación informativa básica', '2026.basic.1', '2026-01-01', 'active'),
  ('60000000-0000-4000-8000-000000009012', '60000000-0000-4000-8000-000000009002', 'US', 'acip-hepb-basic-informational', 'CDC/ACIP United States — basic HepB informational comparison', '2025.07.02.basic.1', '2025-07-02', 'active')
on conflict (id) do update set status = excluded.status, display_name = excluded.display_name;

with rule_data(country_code, antigen_code, rule_code, rule_kind, series_code, dose_code, dose_number,
  minimum_age_interval, target_age_interval, target_age_until_interval, minimum_interval,
  recommended_interval, grace_period, catch_up, eligibility_criteria,
  contraindication_review_required, source_reference_ids) as (values
  ('CO','BCG','CO-PAI-BCG-RN','routine','BCG','D1',1,null,'{"unit":"days","value":0}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-HEPB-RN','routine','HEP_B','D1',1,null,'{"unit":"days","value":0}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","label":"within_first_12_hours"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','DIPHTHERIA','CO-PAI-DIPHTHERIA-2M','routine','DIPHTHERIA','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','TETANUS','CO-PAI-TETANUS-2M','routine','TETANUS','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PERTUSSIS','CO-PAI-PERTUSSIS-2M','routine','PERTUSSIS','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HIB','CO-PAI-HIB-2M','routine','HIB','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-HEPB-2M','routine','HEP_B','D2',2,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','POLIO_IPV','CO-PAI-IPV-2M','routine','POLIO_IPV','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','ROTAVIRUS','CO-PAI-ROTAVIRUS-2M','routine','ROTAVIRUS','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PNEUMOCOCCAL','CO-PAI-PNEUMO-2M','routine','PNEUMOCOCCAL','D1',1,null,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','DIPHTHERIA','CO-PAI-DIPHTHERIA-4M','routine','DIPHTHERIA','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','TETANUS','CO-PAI-TETANUS-4M','routine','TETANUS','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PERTUSSIS','CO-PAI-PERTUSSIS-4M','routine','PERTUSSIS','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HIB','CO-PAI-HIB-4M','routine','HIB','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-HEPB-4M','routine','HEP_B','D3',3,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','POLIO_IPV','CO-PAI-IPV-4M','routine','POLIO_IPV','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','ROTAVIRUS','CO-PAI-ROTAVIRUS-4M','routine','ROTAVIRUS','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PNEUMOCOCCAL','CO-PAI-PNEUMO-4M','routine','PNEUMOCOCCAL','D2',2,null,'{"unit":"calendar_months","value":4}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','DIPHTHERIA','CO-PAI-DIPHTHERIA-6M','routine','DIPHTHERIA','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','TETANUS','CO-PAI-TETANUS-6M','routine','TETANUS','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PERTUSSIS','CO-PAI-PERTUSSIS-6M','routine','PERTUSSIS','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HIB','CO-PAI-HIB-6M','routine','HIB','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-HEPB-6M','routine','HEP_B','D4',4,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','POLIO_IPV','CO-PAI-IPV-6M','routine','POLIO_IPV','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','INFLUENZA','CO-PAI-INFLUENZA-6M','routine','INFLUENZA','D1',1,null,'{"unit":"calendar_months","value":6}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','INFLUENZA','CO-PAI-INFLUENZA-7M','routine','INFLUENZA','D2',2,null,'{"unit":"calendar_months","value":7}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','MEASLES','CO-PAI-MEASLES-12M','routine','MEASLES','D1',1,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"triple_viral"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','MUMPS','CO-PAI-MUMPS-12M','routine','MUMPS','D1',1,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"triple_viral"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','RUBELLA','CO-PAI-RUBELLA-12M','routine','RUBELLA','D1',1,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"triple_viral"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','VARICELLA','CO-PAI-VARICELLA-12M','routine','VARICELLA','D1',1,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PNEUMOCOCCAL','CO-PAI-PNEUMO-12M','routine','PNEUMOCOCCAL','D3',3,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","label":"booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_A','CO-PAI-HEPA-12M','routine','HEP_A','D1',1,null,'{"unit":"calendar_months","value":12}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','POLIO_IPV','CO-PAI-IPV-18M','routine','POLIO_IPV','D4',4,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','DIPHTHERIA','CO-PAI-DIPHTHERIA-18M','routine','DIPHTHERIA','D4',4,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','TETANUS','CO-PAI-TETANUS-18M','routine','TETANUS','D4',4,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PERTUSSIS','CO-PAI-PERTUSSIS-18M','routine','PERTUSSIS','D4',4,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HIB','CO-PAI-HIB-18M','routine','HIB','D4',4,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-HEPB-18M','routine','HEP_B','D5',5,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"pentavalent","label":"first_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','MEASLES','CO-PAI-MEASLES-18M','routine','MEASLES','D2',2,null,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"triple_viral"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','DIPHTHERIA','CO-PAI-DIPHTHERIA-5Y','routine','DIPHTHERIA','D5',5,null,'{"unit":"calendar_years","value":5}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"dpt","label":"second_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','TETANUS','CO-PAI-TETANUS-5Y','routine','TETANUS','D5',5,null,'{"unit":"calendar_years","value":5}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"dpt","label":"second_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','PERTUSSIS','CO-PAI-PERTUSSIS-5Y','routine','PERTUSSIS','D5',5,null,'{"unit":"calendar_years","value":5}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","productLabel":"dpt","label":"second_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','POLIO_IPV','CO-PAI-IPV-5Y','routine','POLIO_IPV','D5',5,null,'{"unit":"calendar_years","value":5}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","label":"second_booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','VARICELLA','CO-PAI-VARICELLA-5Y','routine','VARICELLA','D2',2,null,'{"unit":"calendar_years","value":5}'::jsonb,null,null,null,null,false,'{"scope":"routine_poster_age_only","label":"booster"}'::jsonb,false,'{co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-CATCHUP-REVIEW','catch_up','REVIEW_CATCH_UP_HEP_B','REVIEW',1,null,null,null,null,null,null,true,'{"scope":"professional_interpretation_required","reason":"incomplete_or_interrupted_series"}'::jsonb,true,'{co-pai-management-2026-v12,co-pai-schedule-current-2026-08-21}'),
  ('CO','HPV','CO-PAI-SPECIAL-REVIEW','special_population','REVIEW_SPECIAL_HPV','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"special_population"}'::jsonb,true,'{co-pai-management-2026-v12,co-pai-schedule-current-2026-08-21}'),
  ('CO','MEASLES','CO-PAI-CAMPAIGN-REVIEW','campaign','REVIEW_CAMPAIGN_MEASLES','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"campaign_or_zero_dose"}'::jsonb,true,'{co-pai-management-2026-v12}'),
  ('CO','YELLOW_FEVER','CO-PAI-OUTBREAK-REVIEW','outbreak','REVIEW_OUTBREAK_YF','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"emergency_or_risk_area"}'::jsonb,true,'{co-pai-management-2026-v12,co-pai-schedule-current-2026-08-21}'),
  ('CO','HEP_B','CO-PAI-UNCERTAIN-REVIEW','review_only','REVIEW_UNCERTAIN_EVIDENCE','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"uncertain_contradictory_or_contraindication"}'::jsonb,true,'{co-pai-management-2026-v12}'),
  ('US','HEP_B','US-ACIP-HEPB-BIRTH','routine','HEP_B','D1',1,null,'{"unit":"days","value":0}'::jsonb,null,null,null,null,false,'{"scope":"routine_age_only","requiresReviewIf":["birth_weight_under_2000g","maternal_hbsag_positive_or_unknown","medical_instability"]}'::jsonb,false,'{us-acip-child-age-2025,us-acip-child-notes-2025}'),
  ('US','HEP_B','US-ACIP-HEPB-1-2M','routine','HEP_B','D2',2,null,'{"unit":"calendar_months","value":1}'::jsonb,'{"unit":"calendar_months","value":2}'::jsonb,null,null,null,false,'{"scope":"routine_age_only"}'::jsonb,false,'{us-acip-child-age-2025,us-acip-child-notes-2025}'),
  ('US','HEP_B','US-ACIP-HEPB-6-18M','routine','HEP_B','D3',3,null,'{"unit":"calendar_months","value":6}'::jsonb,'{"unit":"calendar_months","value":18}'::jsonb,null,null,null,false,'{"scope":"routine_age_only"}'::jsonb,false,'{us-acip-child-age-2025,us-acip-child-notes-2025}'),
  ('US','HEP_B','US-ACIP-HEPB-CATCHUP-REVIEW','catch_up','REVIEW_CATCH_UP_HEP_B','REVIEW',1,null,null,null,null,null,null,true,'{"scope":"professional_interpretation_required","reason":"catch_up_or_minimum_intervals"}'::jsonb,true,'{us-acip-child-catch-up-2025,us-acip-child-notes-2025}'),
  ('US','HEP_B','US-ACIP-HEPB-SPECIAL-REVIEW','special_population','REVIEW_SPECIAL_HEP_B','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"birth_weight_maternal_status_hbig_or_medical_indication"}'::jsonb,true,'{us-acip-child-medical-indication-2025,us-acip-child-notes-2025}'),
  ('US','HEP_B','US-ACIP-HEPB-UNCERTAIN-REVIEW','review_only','REVIEW_UNCERTAIN_HEP_B','REVIEW',1,null,null,null,null,null,null,false,'{"scope":"professional_interpretation_required","reason":"uncertain_contradictory_or_contraindication"}'::jsonb,true,'{us-acip-child-medical-indication-2025,us-acip-child-notes-2025}')
)
insert into public.immunization_rules (
  schedule_id, antigen_id, rule_code, rule_kind, series_code, dose_code, dose_number,
  minimum_age_days, target_age_days, target_age_end_days, minimum_interval_days,
  recommended_interval_days, catch_up, eligibility_criteria, contraindication_review_required,
  minimum_age_interval, target_age_interval, target_age_until_interval, minimum_interval,
  recommended_interval, grace_period, source_reference_ids
)
select
  case r.country_code when 'CO' then '60000000-0000-4000-8000-000000009011'::uuid else '60000000-0000-4000-8000-000000009012'::uuid end,
  a.id, r.rule_code, r.rule_kind, r.series_code, r.dose_code, r.dose_number,
  case when (r.minimum_age_interval::jsonb)->>'unit' = 'days' then ((r.minimum_age_interval::jsonb)->>'value')::integer end,
  case when r.target_age_interval->>'unit' = 'days' then (r.target_age_interval->>'value')::integer end,
  case when r.target_age_until_interval->>'unit' = 'days' then (r.target_age_until_interval->>'value')::integer end,
  case when (r.minimum_interval::jsonb)->>'unit' = 'days' then ((r.minimum_interval::jsonb)->>'value')::integer end,
  case when (r.recommended_interval::jsonb)->>'unit' = 'days' then ((r.recommended_interval::jsonb)->>'value')::integer end,
  r.catch_up, r.eligibility_criteria, r.contraindication_review_required,
  r.minimum_age_interval::jsonb, r.target_age_interval, r.target_age_until_interval, r.minimum_interval::jsonb,
  r.recommended_interval::jsonb, r.grace_period::jsonb, r.source_reference_ids::text[]
from rule_data r
join public.vaccine_antigens a on a.antigen_code = r.antigen_code and a.active
on conflict (schedule_id, series_code, dose_code) do update set
  rule_code = excluded.rule_code,
  rule_kind = excluded.rule_kind,
  eligibility_criteria = excluded.eligibility_criteria,
  contraindication_review_required = excluded.contraindication_review_required,
  minimum_age_interval = excluded.minimum_age_interval,
  target_age_interval = excluded.target_age_interval,
  target_age_until_interval = excluded.target_age_until_interval,
  minimum_interval = excluded.minimum_interval,
  recommended_interval = excluded.recommended_interval,
  grace_period = excluded.grace_period,
  source_reference_ids = excluded.source_reference_ids;

insert into public.clinical_approvals (
  id, rule_pack_id, artifact_sha256, approver_name, approver_user_id, decision, notes, decided_at,
  attestation_version, algorithm_id, algorithm_implementation_sha256, source_set_sha256,
  manifest_sha256, approver_subject, approver_role, request_id,
  approval_provenance, conveyance_record_sha256
) values
  ('60000000-0000-4000-8000-000000009101', '60000000-0000-4000-8000-000000009001', '60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d', 'product_owner_conveyed', null, 'approved', 'Conservative informational subset; no signature or personal identity', '2026-08-22T12:00:00Z', 1, '60000000-0000-4000-8000-000000009000', '90bb839bb32a415a9b625769bc5d14b4926b1152180b159615aa98c2822c9f0b', '18d65992e8b98abc4647c9534b152b8aa47ba255bdc9259f62527c4ab33a54de', '035f06c18623ea91b462a29754edbd11cde26f2cecad7c52b54b6ecd53b82886', null, 'clinical_approver', '60000000-0000-4000-8000-000000009501', 'product_owner_conveyed', 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42'),
  ('60000000-0000-4000-8000-000000009201', '60000000-0000-4000-8000-000000009002', '381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae', 'product_owner_conveyed', null, 'approved', 'Conservative informational HepB subset; no signature or personal identity', '2026-08-22T12:00:00Z', 1, '60000000-0000-4000-8000-000000009000', '90bb839bb32a415a9b625769bc5d14b4926b1152180b159615aa98c2822c9f0b', '59260d05a6eea3eb8fc9b6ff9ee01fe5763def5d1072ae109d90a951e35e3ffa', 'aa6ff74da24bc2d6cc0fa9b28ad80bfda7138348d1c611be524f85b3ec038c13', null, 'clinical_approver', '60000000-0000-4000-8000-000000009502', 'product_owner_conveyed', 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42')
on conflict (id) do nothing;

do $$
begin
  perform app_private.activate_clinical_package(
    '60000000-0000-4000-8000-000000009001', '60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d',
    '60000000-0000-4000-8000-000000009000', '60000000-0000-4000-8000-000000009101',
    'immunization', 'CO', 'es-CO', '2026-08-22T12:00:00Z', null,
    '74348feb9d6f08da6ef02300b6fa2496d1dd026a316c914dc6c5c4128f6f20ad',
    '60000000-0000-4000-8000-000000009999', '60000000-0000-4000-8000-000000009401',
    'release', '60a13e8aef485edd0d517ce83c4d52aad0a262807aa42574f33111470a01f32d'
  );
  perform app_private.activate_clinical_package(
    '60000000-0000-4000-8000-000000009002', '381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae',
    '60000000-0000-4000-8000-000000009000', '60000000-0000-4000-8000-000000009201',
    'immunization', 'US', 'en-US', '2026-08-22T12:00:00Z', null,
    '74348feb9d6f08da6ef02300b6fa2496d1dd026a316c914dc6c5c4128f6f20ad',
    '60000000-0000-4000-8000-000000009999', '60000000-0000-4000-8000-000000009402',
    'release', '381dc06532d97948063d43a1c4fd7a0639c89398785b2ba45a3a45f91f7f22ae'
  );
end;
$$;
