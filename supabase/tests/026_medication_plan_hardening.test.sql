begin;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000002001', 'authenticated', 'authenticated', 'medication-owner@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by) values ('00000000-0000-0000-0000-000000002002', 'Medication Space', '00000000-0000-0000-0000-000000002001');
insert into public.care_space_members (care_space_id, user_id, member_role, status) values ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002001', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by) values ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002002', 'Medication Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000002001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status) values ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002001', array['read', 'record', 'manage_medication'], 'active');
insert into public.medication_concepts (id, concept_code, coding_system, ingredient_name, display_name_es, display_name_en) values ('00000000-0000-0000-0000-000000002004', 'SYN-CO-001', 'INVIMA', 'Synthetic ingredient', 'Producto sintético', 'Synthetic product');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.medication_plans'::regclass), 'plans keep forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.medication_schedules'::regclass), 'schedules keep forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.medication_intakes'::regclass), 'intakes keep forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.medication_schedule_occurrences'::regclass), 'occurrences keep forced RLS');
select ok((select pg_get_constraintdef(oid) not like '%rule_unavailable%' from pg_constraint where conname = 'dose_validations_result_check'), 'old unavailable validation outcome is not part of the public union');
select ok(not has_table_privilege('authenticated', 'public.medication_plans', 'INSERT'), 'plans have no generic insert grant');
select ok(not has_table_privilege('authenticated', 'public.medication_intakes', 'INSERT'), 'intakes have no generic insert grant');
select ok(to_regprocedure('public.record_medication_plan(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)') is not null, 'plan RPC signature exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
create temp table first_plan as
select * from public.record_medication_plan(
  '00000000-0000-0000-0000-000000002002',
  '00000000-0000-0000-0000-000000002003',
  '00000000-0000-0000-0000-000000002004', null,
  'Synthetic declared plan', null, now(), null,
  repeat('a', 64), 'medication-plan-key', '{"declared":true}'::jsonb
);
select ok((select outcome = 'created' and plan_id is not null from first_plan), 'authorized caregiver can create a declared draft');
select ok((select provenance_type = 'guardian' and status = 'draft' from public.medication_plans where id = (select plan_id from first_plan)), 'plan is stored as a guardian declaration, not an order');
select ok((select count(*) = 1 from public.record_medication_plan('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002004', null, 'Synthetic declared plan', null, now(), null, repeat('a', 64), 'medication-plan-key', '{"declared":true}'::jsonb)), 'same key and digest replays');
select throws_ok($sql$select * from public.record_medication_plan('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002004', null, 'Synthetic declared plan', null, now(), null, repeat('b', 64), 'medication-plan-key', '{"declared":true}'::jsonb)$sql$, '23505', null, 'changed digest conflicts');
select ok((select count(*) = 0 from public.record_medication_plan('00000000-0000-0000-0000-000000009999', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002004', null, 'Cross scope', null, now(), null, repeat('c', 64), 'cross-key', '{}'::jsonb)), 'foreign scope is denied without revealing a row');

set local role postgres;
select ok(not has_function_privilege('anon', 'public.record_medication_plan(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)', 'execute'), 'anonymous plan write is denied');
select ok(to_regclass('app_private.medication_operation_ledger') is not null, 'operation ledger exists in private schema');
select ok((select count(*) = 1 from app_private.medication_operation_ledger where operation_kind = 'create_plan'), 'ledger stores one atomic plan operation');
select ok((select count(*) = 0 from public.medication_plans where supersedes_plan_id is not null), 'no silent supersession was created');

select * from finish();
rollback;
