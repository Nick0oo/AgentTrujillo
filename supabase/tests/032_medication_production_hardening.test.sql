begin;

create temp table m7_conflicts (kind text primary key, caught boolean not null default false);
grant select, insert, update on m7_conflicts to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('7fff0000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm7-cloud-rpc@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('7fff0000-0000-4000-8000-000000000002', 'M7 rollback fixture', '7fff0000-0000-4000-8000-000000000001');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('7fff0000-0000-4000-8000-000000000003', '7fff0000-0000-4000-8000-000000000002', 'M7 Fixture', '2020-01-01', 'female', '7fff0000-0000-4000-8000-000000000001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status)
values ('7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003', '7fff0000-0000-4000-8000-000000000001', array['read', 'record', 'manage_medication'], 'active');
insert into public.medication_concepts (id, concept_code, coding_system, ingredient_name, display_name_es, active)
values ('7fff0000-0000-4000-8000-000000000004', 'SYN-M7', 'INVIMA', 'Synthetic ingredient', 'Synthetic medication', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '7fff0000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table first_plan as
select * from public.record_medication_plan(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  '7fff0000-0000-4000-8000-000000000004', null,
  'Synthetic medication', null,
  '2026-08-21T08:00:00Z', null,
  repeat('a', 64), 'm7-plan',
  '{"displayName":"Synthetic medication","conceptCode":"SYN-M7","codingSystem":"INVIMA","startsAt":"2026-08-21T08:00:00Z","dose":{"quantity":"1","unit":"mL"},"route":"oral","frequency":{"kind":"interval","everyHours":"8"},"timeZone":"America/Bogota"}'::jsonb
);
create temp table replay_plan as
select * from public.record_medication_plan(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  '7fff0000-0000-4000-8000-000000000004', null,
  'Synthetic medication', null,
  '2026-08-21T08:00:00Z', null,
  repeat('b', 64), 'm7-plan',
  '{"displayName":"Synthetic medication","conceptCode":"SYN-M7","codingSystem":"INVIMA","startsAt":"2026-08-21T08:00:00Z","dose":{"quantity":"1","unit":"mL"},"route":"oral","frequency":{"kind":"interval","everyHours":"8"},"timeZone":"America/Bogota"}'::jsonb
);

insert into m7_conflicts(kind) values ('plan');
do $$
begin
  perform * from public.record_medication_plan(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    '7fff0000-0000-4000-8000-000000000004', null, 'Changed medication', null,
    '2026-08-21T08:00:00Z', null, repeat('a', 64), 'm7-plan',
    '{"displayName":"Changed medication","conceptCode":"SYN-M7","codingSystem":"INVIMA","startsAt":"2026-08-21T08:00:00Z","dose":{"quantity":"1","unit":"mL"},"route":"oral","frequency":{"kind":"interval","everyHours":"8"},"timeZone":"America/Bogota"}'::jsonb
  );
exception when unique_violation then update m7_conflicts set caught = true where kind = 'plan';
end;
$$;

create temp table confirmed_plan as
select * from public.transition_medication_plan(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select plan_id from first_plan), 'active', 'm7-confirm', repeat('c', 64), '{}'::jsonb
);

create temp table occurrence_fixture as
select encode(extensions.digest(convert_to(
  (select plan_id::text from first_plan) || '|1|2026-08-21T16:00:00.000Z',
  'UTF8'
), 'sha256'), 'hex') as occurrence_key;

create temp table saved_occurrences as
select * from public.record_medication_schedule_occurrences(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select plan_id from first_plan), 1,
  jsonb_build_array(jsonb_build_object(
    'occurrence_key', (select occurrence_key from occurrence_fixture),
    'scheduled_for', '2026-08-21T16:00:00.000Z',
    'local_date', '2026-08-21',
    'time_zone', 'America/Bogota',
    'source', 'interval'
  )),
  repeat('d', 64), 'm7-occurrences'
);

create temp table first_intake as
select * from public.record_medication_intake(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select plan_id from first_plan),
  (select id from public.medication_schedule_occurrences where occurrence_key = (select occurrence_key from occurrence_fixture)),
  '2026-08-21T16:00:00Z', '2026-08-21T16:01:00Z', 'taken', null, null,
  repeat('e', 64), 'm7-intake', '{}'::jsonb
);
create temp table replay_intake as
select * from public.record_medication_intake(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select plan_id from first_plan),
  (select id from public.medication_schedule_occurrences where occurrence_key = (select occurrence_key from occurrence_fixture)),
  '2026-08-21T16:00:00Z', '2026-08-21T16:01:00Z', 'taken', null, null,
  repeat('f', 64), 'm7-intake', '{}'::jsonb
);

create temp table first_correction as
select * from public.correct_medication_intake(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select intake_id from first_intake),
  (select plan_id from first_plan),
  (select id from public.medication_schedule_occurrences where occurrence_key = (select occurrence_key from occurrence_fixture)),
  '2026-08-21T16:00:00Z', null, 'skipped', null, null,
  repeat('4', 64), 'm7-correction', '{}'::jsonb
);
create temp table replay_correction as
select * from public.correct_medication_intake(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  (select intake_id from first_intake),
  (select plan_id from first_plan),
  (select id from public.medication_schedule_occurrences where occurrence_key = (select occurrence_key from occurrence_fixture)),
  '2026-08-21T16:00:00Z', null, 'skipped', null, null,
  repeat('5', 64), 'm7-correction', '{}'::jsonb
);

insert into m7_conflicts(kind) values ('correction');
do $$
begin
  perform * from public.correct_medication_intake(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    (select intake_id from first_intake), (select plan_id from first_plan),
    (select id from public.medication_schedule_occurrences where occurrence_key = (select occurrence_key from occurrence_fixture)),
    '2026-08-21T16:00:00Z', '2026-08-21T16:02:00Z', 'taken', null, null,
    repeat('4', 64), 'm7-correction', '{}'::jsonb
  );
exception when unique_violation then update m7_conflicts set caught = true where kind = 'correction';
end;
$$;

create temp table first_validation as
select * from public.record_dose_validation(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  'm7-validation', '{"quantity":"1","unit":"mL"}'::jsonb,
  'insufficient_data', array['RULE_UNAVAILABLE'],
  'unavailable', 'medication-1', 'medication-1', null,
  repeat('0', 64), repeat('1', 64),
  '[{"sourceId":"rxnorm","sourceVersion":"2026-08-21","sourceKind":"identity","sourceUri":"https://www.nlm.nih.gov/research/umls/rxnorm/overview.html","artifactSha256":"fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c"}]'::jsonb,
  '[{"ingredient_code":"SYN-ING","declared_amount_lexeme":"1","declared_unit":"mL","converted_amount_lexeme":null,"converted_unit":null,"arithmetic_trace":{}}]'::jsonb
);
create temp table replay_validation as
select * from public.record_dose_validation(
  '7fff0000-0000-4000-8000-000000000002',
  '7fff0000-0000-4000-8000-000000000003',
  'm7-validation', '{"quantity":"1","unit":"mL"}'::jsonb,
  'insufficient_data', array['RULE_UNAVAILABLE'],
  'unavailable', 'medication-1', 'medication-1', null,
  repeat('2', 64), repeat('3', 64),
  '[{"sourceId":"rxnorm","sourceVersion":"2026-08-21","sourceKind":"identity","sourceUri":"https://www.nlm.nih.gov/research/umls/rxnorm/overview.html","artifactSha256":"fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c"}]'::jsonb,
  '[{"ingredient_code":"SYN-ING","declared_amount_lexeme":"1","declared_unit":"mL","converted_amount_lexeme":null,"converted_unit":null,"arithmetic_trace":{}}]'::jsonb
);

insert into m7_conflicts(kind) values ('validation');
do $$
begin
  perform * from public.record_dose_validation(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    'm7-validation', '{"quantity":"2","unit":"mL"}'::jsonb,
    'insufficient_data', array['RULE_UNAVAILABLE'], 'unavailable', 'medication-1', 'medication-1', null,
    repeat('0', 64), repeat('1', 64),
    '[{"sourceId":"rxnorm","sourceVersion":"2026-08-21","sourceKind":"identity","sourceUri":"https://www.nlm.nih.gov/research/umls/rxnorm/overview.html","artifactSha256":"fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c"}]'::jsonb,
    '[]'::jsonb
  );
exception when unique_violation then update m7_conflicts set caught = true where kind = 'validation';
end;
$$;

insert into m7_conflicts(kind) values ('governed_validation'), ('forged_occurrence'), ('future_intake');
do $$
begin
  perform * from public.record_dose_validation(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    'm7-forged-within', '{"quantity":"1","unit":"mL"}'::jsonb,
    'within_reference_limits', array['FORGED_PASS'], 'unavailable', 'medication-1', 'medication-1', null,
    repeat('0', 64), repeat('1', 64),
    '[{"sourceId":"rxnorm","sourceVersion":"2026-08-21","sourceKind":"identity","sourceUri":"https://www.nlm.nih.gov/research/umls/rxnorm/overview.html","artifactSha256":"fdc2e6e6859d8867b4a6fe7b9c0a1e897d0c4a6b66f74a0ecf79deb22918f18c"}]'::jsonb,
    '[]'::jsonb
  );
exception when others then update m7_conflicts set caught = true where kind = 'governed_validation';
end;
$$;
do $$
begin
  perform * from public.record_medication_schedule_occurrences(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    (select plan_id from first_plan), 1,
    '[{"occurrence_key":"forged-occurrence-key","scheduled_for":"2026-08-21T17:00:00.000Z","local_date":"2026-08-21","time_zone":"America/Bogota","source":"interval"}]'::jsonb,
    repeat('6', 64), 'm7-forged-occurrence'
  );
exception when others then update m7_conflicts set caught = true where kind = 'forged_occurrence';
end;
$$;
do $$
begin
  perform * from public.record_medication_intake(
    '7fff0000-0000-4000-8000-000000000002', '7fff0000-0000-4000-8000-000000000003',
    (select plan_id from first_plan), null, statement_timestamp() + interval '1 day', null,
    'skipped', null, null, repeat('7', 64), 'm7-future-intake', '{}'::jsonb
  );
exception when others then update m7_conflicts set caught = true where kind = 'future_intake';
end;
$$;

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

select result from (
  select 0 position, '1..25' result
  union all select 1, case when count(*) = 6 then 'ok 1 - six official medication locators are reviewed' else 'not ok 1 - six official medication locators are reviewed' end from public.clinical_sources where id::text like '70000000-0000-4000-8000-000000000%'
  union all select 2, case when not exists (select 1 from public.pediatric_formulary_versions) and not exists (select 1 from public.pediatric_dose_limits) then 'ok 2 - no formulary or pediatric dose rule was fabricated' else 'not ok 2 - no formulary or pediatric dose rule was fabricated' end
  union all select 3, case when (select outcome from first_plan) = 'created' then 'ok 3 - authenticated plan create succeeds' else 'not ok 3 - authenticated plan create succeeds' end
  union all select 4, case when (select outcome from replay_plan) = 'idempotent_replay' and (select plan_id from replay_plan) = (select plan_id from first_plan) then 'ok 4 - caller digest changes do not alter replay identity' else 'not ok 4 - caller digest changes do not alter replay identity' end
  union all select 5, case when (select caught from m7_conflicts where kind = 'plan') then 'ok 5 - changed plan domain input conflicts under the same key' else 'not ok 5 - changed plan domain input conflicts under the same key' end
  union all select 6, case when exists (select 1 from public.medication_schedules where medication_plan_id = (select plan_id from first_plan) and interval_hours = 8 and time_zone = 'America/Bogota') then 'ok 6 - declared schedule fields persist with the plan' else 'not ok 6 - declared schedule fields persist with the plan' end
  union all select 7, case when (select outcome from confirmed_plan) = 'created' and exists (select 1 from public.medication_plans where id = (select plan_id from first_plan) and status = 'active') then 'ok 7 - plan confirmation state transition succeeds' else 'not ok 7 - plan confirmation state transition succeeds' end
  union all select 8, case when (select saved_count from saved_occurrences) = 1 then 'ok 8 - scoped occurrence materialization succeeds' else 'not ok 8 - scoped occurrence materialization succeeds' end
  union all select 9, case when (select outcome from first_intake) = 'created' then 'ok 9 - factual intake recording succeeds' else 'not ok 9 - factual intake recording succeeds' end
  union all select 10, case when (select outcome from replay_intake) = 'idempotent_replay' and (select intake_id from replay_intake) = (select intake_id from first_intake) then 'ok 10 - intake replay ignores caller-selected fingerprints' else 'not ok 10 - intake replay ignores caller-selected fingerprints' end
  union all select 11, case when (select outcome from first_validation) = 'created' then 'ok 11 - validation decision persists' else 'not ok 11 - validation decision persists' end
  union all select 12, case when exists (select 1 from public.dose_validation_sources where validation_id = (select validation_id from first_validation) and source_id = 'rxnorm') then 'ok 12 - normalized validation source persists atomically' else 'not ok 12 - normalized validation source persists atomically' end
  union all select 13, case when exists (select 1 from public.dose_validation_ingredients where validation_id = (select validation_id from first_validation) and ingredient_code = 'SYN-ING') then 'ok 13 - normalized ingredient trace persists atomically' else 'not ok 13 - normalized ingredient trace persists atomically' end
  union all select 14, case when (select outcome from replay_validation) = 'idempotent_replay' and (select validation_id from replay_validation) = (select validation_id from first_validation) then 'ok 14 - server-derived validation digests replay identically' else 'not ok 14 - server-derived validation digests replay identically' end
  union all select 15, case when (select caught from m7_conflicts where kind = 'validation') then 'ok 15 - changed declared input conflicts despite reused caller digests' else 'not ok 15 - changed declared input conflicts despite reused caller digests' end
  union all select 16, case when position('medication_domain_digest' in pg_get_functiondef('app_private.record_medication_plan_impl_20260821(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)'::regprocedure)) > 0 then 'ok 16 - plan RPC derives its digest at the server boundary' else 'not ok 16 - plan RPC derives its digest at the server boundary' end
  union all select 17, case when not has_table_privilege('authenticated', 'public.dose_validation_sources', 'INSERT') and not has_table_privilege('authenticated', 'public.medication_schedule_occurrences', 'INSERT') then 'ok 17 - normalized and lifecycle writes remain RPC-only' else 'not ok 17 - normalized and lifecycle writes remain RPC-only' end
  union all select 18, case when (select outcome from first_correction) = 'created' then 'ok 18 - factual intake correction succeeds' else 'not ok 18 - factual intake correction succeeds' end
  union all select 19, case when (select outcome from replay_correction) = 'idempotent_replay' and (select intake_id from replay_correction) = (select intake_id from first_correction) then 'ok 19 - correction replay resolves before active-fact checks' else 'not ok 19 - correction replay resolves before active-fact checks' end
  union all select 20, case when (select caught from m7_conflicts where kind = 'correction') then 'ok 20 - changed correction input conflicts under the same key' else 'not ok 20 - changed correction input conflicts under the same key' end
  union all select 21, case when (select caught from m7_conflicts where kind = 'governed_validation') then 'ok 21 - ungoverned reassuring validation cannot persist' else 'not ok 21 - ungoverned reassuring validation cannot persist' end
  union all select 22, case when (select caught from m7_conflicts where kind = 'forged_occurrence') then 'ok 22 - occurrence must mirror the declared schedule' else 'not ok 22 - occurrence must mirror the declared schedule' end
  union all select 23, case when (select caught from m7_conflicts where kind = 'future_intake') then 'ok 23 - future intake facts are rejected' else 'not ok 23 - future intake facts are rejected' end
  union all select 24, case when position('medication_lock_key' in pg_get_functiondef('public.record_medication_plan(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)'::regprocedure)) > 0 then 'ok 24 - public lifecycle wrapper serializes replay keys' else 'not ok 24 - public lifecycle wrapper serializes replay keys' end
  union all select 25, case when to_regprocedure('app_private.record_medication_plan_impl_20260821(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)') is not null and not has_function_privilege('authenticated', to_regprocedure('app_private.record_medication_plan_impl_20260821(uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)'), 'EXECUTE') then 'ok 25 - unlocked implementation is private' else 'not ok 25 - unlocked implementation is private' end
) checks order by position;

rollback;
