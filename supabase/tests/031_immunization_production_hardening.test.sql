begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('6fff0000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm6-cloud-rpc@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('6fff0000-0000-4000-8000-000000000002', 'M6 rollback fixture', '6fff0000-0000-4000-8000-000000000001');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('6fff0000-0000-4000-8000-000000000002', '6fff0000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('6fff0000-0000-4000-8000-000000000003', '6fff0000-0000-4000-8000-000000000002', 'M6 Fixture', '2020-01-01', 'female', '6fff0000-0000-4000-8000-000000000001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status)
values ('6fff0000-0000-4000-8000-000000000002', '6fff0000-0000-4000-8000-000000000003', '6fff0000-0000-4000-8000-000000000001', array['read', 'record'], 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '6fff0000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table first_administration as
select * from public.record_confirmed_vaccine_administration(
  '6fff0000-0000-4000-8000-000000000002',
  '6fff0000-0000-4000-8000-000000000003',
  'm6-antigen-only-rollback',
  '2026-08-20',
  null,
  '["60000000-0000-4000-8000-000000001002"]'::jsonb,
  'declared dose', null, null, null,
  'CO', 'guardian', repeat('a', 64), repeat('b', 64), repeat('c', 64), null, null
);
create temp table replay_administration as
select * from public.record_confirmed_vaccine_administration(
  '6fff0000-0000-4000-8000-000000000002',
  '6fff0000-0000-4000-8000-000000000003',
  'm6-antigen-only-rollback',
  '2026-08-20',
  null,
  '["60000000-0000-4000-8000-000000001002"]'::jsonb,
  'declared dose', null, null, null,
  'CO', 'guardian', repeat('a', 64), repeat('b', 64), repeat('c', 64), null, null
);

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

select result
from (
  select 0 as position, '1..11' as result
  union all
  select 1, case when count(*) = 24 then 'ok 1 - approved antigen reference catalog has 24 concepts' else 'not ok 1 - approved antigen reference catalog has 24 concepts' end
    from public.vaccine_antigens where catalog_version = '2026-08-21-source-bound' and active
  union all
  select 2, case when count(*) = 24 then 'ok 2 - every antigen reference has exact catalog provenance' else 'not ok 2 - every antigen reference has exact catalog provenance' end
    from public.vaccine_antigens where catalog_version = '2026-08-21-source-bound' and source_digest = '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d'
  union all
  select 3, case when count(*) = 5 then 'ok 3 - five current Colombia artifacts are registered with SHA-256' else 'not ok 3 - five current Colombia artifacts are registered with SHA-256' end
    from public.clinical_sources where id in ('60000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000102', '60000000-0000-4000-8000-000000000103', '60000000-0000-4000-8000-000000000104', '60000000-0000-4000-8000-000000000105') and artifact_sha256 ~ '^[a-f0-9]{64}$'
  union all
  select 4, case when count(*) = 3 then 'ok 4 - missing US schedule components are registered as live status locators' else 'not ok 4 - missing US schedule components are registered as live status locators' end
    from public.clinical_sources where id in ('60000000-0000-4000-8000-000000000201', '60000000-0000-4000-8000-000000000202', '60000000-0000-4000-8000-000000000203') and status = 'reviewed'
  union all
  select 5, case when position('p_vaccine_product_id is not null' in pg_get_functiondef('public.record_confirmed_vaccine_administration(uuid,uuid,text,date,uuid,jsonb,text,text,text,text,text,text,text,text,text,uuid,text)'::regprocedure)) > 0
    then 'ok 5 - antigen-only confirmation is an explicit RPC branch' else 'not ok 5 - antigen-only confirmation is an explicit RPC branch' end
  union all
  select 6, case when position('immunization_product_antigen_mismatch' in pg_get_functiondef('public.record_confirmed_vaccine_administration(uuid,uuid,text,date,uuid,jsonb,text,text,text,text,text,text,text,text,text,uuid,text)'::regprocedure)) > 0
    then 'ok 6 - supplied products require exact component antigens' else 'not ok 6 - supplied products require exact component antigens' end
  union all
  select 7, case when position('evidence_id uuid;' in pg_get_functiondef('public.persist_country_change_reassessment(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure)) = 0
    then 'ok 7 - country-change RPC has no unused declaration' else 'not ok 7 - country-change RPC has no unused declaration' end
  union all
  select 8, case when not exists (select 1 from public.clinical_rule_packs where domain = 'immunization')
    and not exists (select 1 from public.immunization_schedules)
    and not exists (select 1 from public.immunization_rules)
    then 'ok 8 - source and antigen population fabricates no clinical package' else 'not ok 8 - source and antigen population fabricates no clinical package' end
  union all
  select 9, case when (select outcome from first_administration) = 'created'
    then 'ok 9 - authenticated antigen-only confirmation succeeds' else 'not ok 9 - authenticated antigen-only confirmation succeeds' end
  union all
  select 10, case when exists (
      select 1 from public.vaccine_administrations a
      join first_administration f on f.administration_id = a.id
      where a.vaccine_product_id is null
        and a.catalog_version = '2026-08-21-source-bound'
        and a.catalog_digest = '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d'
    ) then 'ok 10 - antigen-only fact stores exact catalog provenance' else 'not ok 10 - antigen-only fact stores exact catalog provenance' end
  union all
  select 11, case when (select outcome from replay_administration) = 'idempotent_replay'
      and (select administration_id from replay_administration) = (select administration_id from first_administration)
    then 'ok 11 - antigen-only confirmation is replay safe' else 'not ok 11 - antigen-only confirmation is replay safe' end
) as checks
order by position;

rollback;
