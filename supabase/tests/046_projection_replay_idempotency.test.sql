-- AT-12-05 replay convergence fixtures use the next available test sequence.
begin;
set local role postgres;
set local search_path = extensions, public, pg_catalog;
select plan(24);

select ok(to_regclass('public.projection_inbox') is not null, 'projection inbox exists');
select ok(to_regclass('public.projection_checkpoints') is not null, 'projection checkpoints exist');
select ok(to_regclass('public.projection_quarantine') is not null, 'projection quarantine exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.projection_inbox'::regclass), 'inbox forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.projection_checkpoints'::regclass), 'checkpoints force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.projection_quarantine'::regclass), 'quarantine forces RLS');
select ok(not has_table_privilege('authenticated', 'public.projection_inbox', 'select'), 'mobile role cannot read inbox');
select ok(not has_table_privilege('authenticated', 'public.projection_quarantine', 'insert'), 'mobile role cannot write quarantine');
select ok(has_function_privilege('service_role', 'public.claim_projection_source(text,text,text,text,bigint,uuid,uuid,uuid,uuid,text)', 'execute'), 'job role can claim source');
select ok(not has_function_privilege('authenticated', 'public.claim_projection_source(text,text,text,text,bigint,uuid,uuid,uuid,uuid,text)', 'execute'), 'mobile role cannot claim source');
select ok(exists(select 1 from pg_constraint where conname = 'projection_inbox_source_unique'), 'source uniqueness is scoped');
select ok(exists(select 1 from pg_trigger where tgname = 'projection_quarantine_append_only'), 'quarantine is append-only');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000120001', 'authenticated', 'authenticated', 'projection@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000120002', 'Projection Fixture', '00000000-0000-0000-0000-000000120001');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-000000120002', 'Synthetic Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000120001');

create temp table first_claim as
select * from public.claim_projection_source(
  'messages', 'v1', 'source-120', 'eve.v1', 1,
  '00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-000000120002',
  '00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-000000120004', repeat('a', 64)
);
select is((select claim_status from first_claim), 'claimed', 'first source is claimed');
select is((select count(*)::integer from public.projection_inbox), 1, 'first claim inserts one inbox row');

create temp table replay_claim as
select * from public.claim_projection_source(
  'messages', 'v1', 'source-120', 'eve.v1', 1,
  '00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-000000120002',
  '00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-000000120004', repeat('a', 64)
);
select is((select claim_status from replay_claim), 'claimed', 'identical pending replay is claimable');
select is((select count(*)::integer from public.projection_inbox), 1, 'identical replay does not duplicate inbox row');

select ok(public.complete_projection_source((select inbox_id from first_claim), repeat('b', 64)), 'completion commits inbox and checkpoint');
select is((select status from public.projection_inbox), 'completed', 'completed status is durable');
select is((select last_sequence from public.projection_checkpoints), 1::bigint, 'checkpoint advances with completion');

create temp table changed_claim as
select * from public.claim_projection_source(
  'messages', 'v1', 'source-120', 'eve.v1', 1,
  '00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-000000120002',
  '00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-000000120004', repeat('c', 64)
);
select is((select claim_status from changed_claim), 'conflict', 'changed replay is rejected');
select ok(not public.quarantine_projection_source((select inbox_id from first_claim), 'source_conflict'), 'completed source cannot be quarantined');
select is((select count(*)::integer from public.projection_quarantine), 0, 'completed source cannot be quarantined');

insert into public.projection_quarantine (
  projector_name, projector_version, source_event_id, source_event_version, source_sequence,
  owner_user_id, care_space_id, child_id, product_session_id, input_sha256, reason
) values (
  'messages', 'v1', 'source-immutable', 'eve.v1', 2,
  '00000000-0000-0000-0000-000000120001', '00000000-0000-0000-0000-000000120002',
  '00000000-0000-0000-0000-000000120003', '00000000-0000-0000-0000-000000120004', repeat('e', 64), 'invalid_event'
);
select throws_ok($sql$update public.projection_quarantine set reason = 'source_conflict' where source_event_id = 'source-immutable'$sql$, '42501', 'projection quarantine is append-only');
select ok((select input_sha256 ~ '^[a-f0-9]{64}$' from public.projection_inbox), 'input digest remains bounded');

select * from finish();
rollback;
