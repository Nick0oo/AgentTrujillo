begin;
create extension if not exists pgtap with schema extensions;
create schema tap_capture;

create function tap_capture.assert_tap(line text)
returns text
language plpgsql
as $$
begin
  if line like 'not ok %' then
    raise exception 'tap_assertion_failed: %', line using errcode = 'P0001';
  end if;
  return line;
end;
$$;

create function tap_capture.ok(value boolean, description text)
returns text
language sql
as $$ select tap_capture.assert_tap(extensions.ok(value, description)) $$;

create function tap_capture.has_column(schema_name name, table_name name, column_name name, description text)
returns text
language sql
as $$ select tap_capture.assert_tap(extensions.has_column(schema_name, table_name, column_name, description)) $$;

create function tap_capture.throws_ok(sql_text text, expected_state character, expected_message text, description text)
returns text
language sql
as $$ select tap_capture.assert_tap(extensions.throws_ok(sql_text, expected_state, expected_message, description)) $$;

grant usage on schema tap_capture to authenticated;
grant execute on all functions in schema tap_capture to authenticated;

set local search_path = public, extensions, pg_catalog;
select plan(35);

select tap_capture.has_column('public', 'development_observations', 'idempotency_key', 'observation idempotency key exists');
select tap_capture.has_column('public', 'development_observations', 'input_sha256', 'observation input digest exists');
select tap_capture.has_column('public', 'development_observations', 'confirmation_sha256', 'observation confirmation digest exists');
select tap_capture.has_column('public', 'development_observations', 'payload_sha256', 'server-derived payload digest exists');
select tap_capture.has_column('public', 'development_observations', 'confirmed_at', 'confirmation instant exists');
select tap_capture.has_column('public', 'development_observations', 'supersedes_observation_id', 'supersession relation exists');
select tap_capture.ok((select count(*) = 1 from pg_constraint where conname = 'development_observations_scope_id_unique'), 'observation exposes a scoped identity');
select tap_capture.ok((select count(*) = 1 from pg_constraint where conname = 'development_observations_supersedes_scope_fk'), 'supersession keeps the same care-space and child');
select tap_capture.ok(to_regclass('public.development_observations_actor_key_unique') is not null, 'actor and child scoped replay key is unique');
select tap_capture.ok(to_regclass('public.development_observations_supersedes_unique') is not null, 'one immutable successor may supersede an observation');
select tap_capture.ok((select count(*) = 1 from pg_trigger where tgname = 'development_observations_immutable'), 'observation rows are immutable');
select tap_capture.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.development_observations'::regclass), 'observations keep forced RLS');
select tap_capture.ok(not has_table_privilege('authenticated', 'public.development_observations', 'INSERT'), 'authenticated direct insert is denied');
select tap_capture.ok(not has_table_privilege('authenticated', 'public.development_observations', 'UPDATE'), 'authenticated direct update is denied');
select tap_capture.ok(not has_table_privilege('authenticated', 'public.development_observations', 'DELETE'), 'authenticated direct delete is denied');
select tap_capture.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'development_observations'
    and column_name ~ '(ead|screen|score|puntaje|diagnos|classification|delay)'
), 'observation schema contains no diagnosis or professional-screening fields');
select tap_capture.ok(to_regprocedure('public.record_development_observation(uuid,uuid,uuid,text,text,text,date,text,text,text,text,text,uuid,uuid[])') is not null, 'observation RPC signature exists');
select tap_capture.ok(not has_function_privilege('anon', 'public.record_development_observation(uuid,uuid,uuid,text,text,text,date,text,text,text,text,text,uuid,uuid[])', 'execute'), 'anonymous RPC execution is denied');
select tap_capture.ok(has_function_privilege('authenticated', 'public.record_development_observation(uuid,uuid,uuid,text,text,text,date,text,text,text,text,text,uuid,uuid[])', 'execute'), 'authenticated RPC execution is granted');
select tap_capture.ok(not has_function_privilege('authenticated', 'app_private.development_observation_payload_sha256(jsonb)', 'execute'), 'payload helper remains private');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('80000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'development-owner@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('80000000-0000-4000-8000-000000000002', 'Development observation space', '80000000-0000-4000-8000-000000000001');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, country_of_care, created_by)
values
  ('80000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000002', 'Development Fixture A', '2020-01-01', 'female', 'CO', '80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000002', 'Development Fixture B', '2021-01-01', 'male', 'CO', '80000000-0000-4000-8000-000000000001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status)
values ('80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', array['read', 'record'], 'active');
insert into public.documents (
  id, care_space_id, child_id, bucket_id, object_path, document_type, detected_mime_type,
  size_bytes, sha256, processing_status, retention_until, provenance_type, uploaded_by
) values
  ('80000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', 'clinical-attachments', 'development/fixture-a.txt', 'development_observation', 'text/plain', 12, repeat('a', 64), 'clean', '2027-08-23', 'guardian', '80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004', 'clinical-attachments', 'development/fixture-b.txt', 'development_observation', 'text/plain', 12, repeat('b', 64), 'clean', '2027-08-23', 'guardian', '80000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table first_observation as
select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('2', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
);

select tap_capture.ok((select outcome = 'created' and observation_id is not null from first_observation), 'authorized confirmed observation is created');
select tap_capture.ok((select recorded_by = '80000000-0000-4000-8000-000000000001' and idempotency_key = 'development-observation-key' and input_sha256 = repeat('1', 64) and confirmation_sha256 = repeat('2', 64) and payload_sha256 ~ '^[a-f0-9]{64}$' from public.development_observations where id = (select observation_id from first_observation)), 'stored observation binds actor, key, confirmation, input, and server payload');
select tap_capture.ok((select count(*) = 1 from public.document_links where document_id = '80000000-0000-4000-8000-000000000005' and resource_type = 'development_observation' and resource_id = (select observation_id from first_observation)), 'same-child private attachment is linked exactly once');
select tap_capture.ok((select outcome = 'idempotent_replay' and observation_id = (select observation_id from first_observation) from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('2', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
)), 'identical replay returns the original observation');
select tap_capture.ok((select count(*) = 1 from public.development_observations where idempotency_key = 'development-observation-key'), 'identical replay creates one durable effect');

select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('3', 64), repeat('2', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
)
$sql$, '23505', null, 'changed input digest conflicts');
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('4', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
)
$sql$, '23505', null, 'changed confirmation digest conflicts');
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'Changed observation', 'Different factual text.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('2', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
)
$sql$, '23505', null, 'changed payload conflicts even when caller digests are reused');
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('2', 64), null, '{}'::uuid[]
)
$sql$, '23505', null, 'changed attachment set conflicts');
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'general', null, 'Attached a sibling document.', '2026-08-22',
  'observed', 'guardian', 'cross-child-attachment', repeat('5', 64), repeat('6', 64), null,
  array['80000000-0000-4000-8000-000000000006'::uuid]
)
$sql$, '23503', null, 'cross-child attachment is rejected');

create temp table corrected_observation as
select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'Correction', 'Correction: the gesture happened at lunch.', '2026-08-22',
  'observed', 'guardian', 'development-observation-correction', repeat('7', 64), repeat('8', 64),
  (select observation_id from first_observation), '{}'::uuid[]
);
select tap_capture.ok((select outcome = 'created' from corrected_observation), 'correction creates a new immutable observation');
select tap_capture.ok((select supersedes_observation_id = (select observation_id from first_observation) from public.development_observations where id = (select observation_id from corrected_observation)), 'correction points to the same-scope predecessor');
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'Forked correction', 'A second forked correction.', '2026-08-22',
  'observed', 'guardian', 'development-observation-fork', repeat('9', 64), repeat('a', 64),
  (select observation_id from first_observation), '{}'::uuid[]
)
$sql$, '23505', null, 'a predecessor cannot acquire an ambiguous correction fork');

select tap_capture.throws_ok($sql$insert into public.development_observations (
  care_space_id, child_id, domain, observation, observed_on, status, provenance_type, recorded_by
) values (
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003',
  'general', 'Bypass', '2026-08-22', 'observed', 'guardian', '80000000-0000-4000-8000-000000000001'
)$sql$, '42501', null, 'authenticated direct write is rejected');

set local role postgres;
update public.child_access set status = 'revoked', revoked_at = now()
where care_space_id = '80000000-0000-4000-8000-000000000002'
  and child_id = '80000000-0000-4000-8000-000000000003'
  and user_id = '80000000-0000-4000-8000-000000000001';
set local role authenticated;
select tap_capture.throws_ok($sql$select * from public.record_development_observation(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', null,
  'language', 'First observation', 'Used a gesture while asking for water.', '2026-08-22',
  'observed', 'guardian', 'development-observation-key', repeat('1', 64), repeat('2', 64), null,
  array['80000000-0000-4000-8000-000000000005'::uuid]
)
$sql$, '42501', null, 'revoked access blocks replay before the existing row is inspected');

select * from finish(true);
rollback;
