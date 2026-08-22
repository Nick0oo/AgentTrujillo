begin;

do $$
declare
  co_rules integer;
  us_rules integer;
  releases integer;
  approvals integer;
begin
  select count(1) into co_rules from public.pediatric_dose_limits
  where formulary_version_id = '70000000-0000-4000-8000-000000009321';
  select count(1) into us_rules from public.pediatric_dose_limits
  where formulary_version_id = '70000000-0000-4000-8000-000000009322';
  if co_rules <> 11 or us_rules <> 5 then
    raise exception 'unexpected medication rule counts CO=% US=%', co_rules, us_rules;
  end if;

  if exists (
    select 1 from public.pediatric_dose_limits
    where formulary_version_id in (
      '70000000-0000-4000-8000-000000009321',
      '70000000-0000-4000-8000-000000009322'
    ) and (
      rule_code is null or medication_presentation_id is null
      or fixed_per_dose_min is distinct from fixed_per_dose_max
      or fixed_per_dose_max is distinct from max_single_dose
      or daily_unit <> 'mg' or cardinality(source_reference_ids) = 0
      or jsonb_typeof(exclusions) <> 'object'
    )
  ) then raise exception 'medication rule lost exact comparison provenance'; end if;

  if (select minimum_weight_kg from public.pediatric_dose_limits where rule_code = 'US-TYLENOL-24-35LB') <> 10.88621688
    or (select maximum_weight_kg from public.pediatric_dose_limits where rule_code = 'US-TYLENOL-72-95LB') <> 43.09127515
  then raise exception 'US exact weight conversion drifted'; end if;

  select count(1) into releases from public.clinical_package_releases
  where rule_pack_id in ('70000000-0000-4000-8000-000000009001','70000000-0000-4000-8000-000000009002')
    and status = 'active' and action = 'release';
  if releases <> 2 then raise exception 'expected two active medication releases, found %', releases; end if;

  select count(1) into approvals from public.clinical_approvals
  where id in ('70000000-0000-4000-8000-000000009101','70000000-0000-4000-8000-000000009201')
    and decision = 'approved' and approval_provenance = 'product_owner_conveyed'
    and approver_subject is null
    and conveyance_record_sha256 = 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42';
  if approvals <> 2 then raise exception 'expected two exact conveyed approvals, found %', approvals; end if;
end;
$$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('78ff0000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm7-package@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('78ff0000-0000-4000-8000-000000000002', 'M7 package rollback fixture', '78ff0000-0000-4000-8000-000000000001');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('78ff0000-0000-4000-8000-000000000002', '78ff0000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, country_of_care, created_by)
values ('78ff0000-0000-4000-8000-000000000003', '78ff0000-0000-4000-8000-000000000002', 'M7 Fixture', '2020-01-01', 'female', 'CO', '78ff0000-0000-4000-8000-000000000001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status)
values ('78ff0000-0000-4000-8000-000000000002', '78ff0000-0000-4000-8000-000000000003', '78ff0000-0000-4000-8000-000000000001', array['read','record'], 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '78ff0000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table governed_validation as
select * from public.record_dose_validation(
  '78ff0000-0000-4000-8000-000000000002', '78ff0000-0000-4000-8000-000000000003',
  'm7-governed-package', '{"quantity":"4.5","unit":"mL"}'::jsonb,
  'within_reference_limits', array['PER_DOSE_WITHIN_REFERENCE','DAILY_WITHIN_REFERENCE'],
  '2026.basic.1', 'medication-declared-dose-basic-1.0.0', 'acetaminophen-160mg-5ml-v1',
  '39628bf866ff3b94b85dfbbb336a8a2600b048415c81afb690718625c6081dd8',
  repeat('1',64), repeat('2',64),
  '[{"sourceId":"invima-cum-2025-08","sourceVersion":"2025-08","sourceKind":"identity","sourceUri":"https://www.invima.gov.co/consulta-registros-sanitarios","artifactSha256":"9a421f308acf1263cfee3149aa350f647eedfd5adb4e29f460edd5283d8c05ae"},{"sourceId":"invima-acta-09-2018","sourceVersion":"2018-09","sourceKind":"label","sourceUri":"https://www.invima.gov.co/invima_website/static/attachments/medicamentos_sala_especializada_medicamentos_sintesis/Acta-No-09-de-2018-SEM.pdf","artifactSha256":"81cb94ff9f3856e804957a8588fd4f0dff35af45e5532917572121d11f6e8b01"}]'::jsonb,
  '[{"ingredient_code":"ACETAMINOPHEN","declared_amount_lexeme":"4.5","declared_unit":"mL","converted_amount_lexeme":"144","converted_unit":"mg","arithmetic_trace":{"quantity":"4.5","denominator":"5","numerator":"160"}}]'::jsonb
);

set local role postgres;
do $$
begin
  if (select count(1) from governed_validation where outcome = 'created') <> 1 then
    raise exception 'governed package validation did not persist';
  end if;
end;
$$;

rollback;
