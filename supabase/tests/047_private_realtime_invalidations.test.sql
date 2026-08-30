begin;
set local role postgres;
set local search_path = extensions, public, pg_catalog;
select plan(25);

select ok(to_regclass('public.realtime_invalidations') is not null, 'private invalidation outbox exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.realtime_invalidations'::regclass), 'outbox has forced RLS');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'realtime_invalidations'), 'outbox is published for Realtime');
select ok((select count(*) = 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), 'outbox is the only public Realtime relation');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'realtime_invalidations' and column_name in ('parts', 'payload', 'content', 'message_text', 'clinical_data')), 'outbox has no clinical payload column');
select ok(exists (select 1 from pg_constraint where conname = 'realtime_invalidations_child_fk'), 'outbox has a composite child foreign key');
select ok(exists (select 1 from pg_constraint where conname = 'realtime_invalidations_session_fk'), 'outbox has a composite session foreign key');
select ok(exists (select 1 from pg_constraint where conname = 'realtime_invalidations_source_unique'), 'source event is unique');
select ok(exists (select 1 from pg_constraint where conname = 'realtime_invalidations_resource_version_unique'), 'resource version is unique');
select ok(exists (select 1 from pg_constraint where conname = 'realtime_invalidations_sequence_unique'), 'child sequence is unique');
select ok(has_table_privilege('authenticated', 'public.realtime_invalidations', 'SELECT'), 'authenticated can read through RLS');
select ok(not has_table_privilege('authenticated', 'public.realtime_invalidations', 'INSERT,UPDATE,DELETE'), 'authenticated cannot write the outbox');
select ok(not has_table_privilege('anon', 'public.realtime_invalidations', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous role has no outbox access');
select ok(has_function_privilege('service_role', 'public.append_realtime_invalidation(uuid,uuid,uuid,text,uuid,bigint,uuid)', 'EXECUTE'), 'trusted role can append invalidations');
select ok(not has_function_privilege('authenticated', 'public.append_realtime_invalidation(uuid,uuid,uuid,text,uuid,bigint,uuid)', 'EXECUTE'), 'mobile role cannot append invalidations');
select ok(position('app_private.has_child_permission' in (select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'realtime_invalidations_authorized_select')) > 0, 'select policy checks child authorization');
select ok(position('expires_at' in (select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'realtime_invalidations_authorized_select')) > 0, 'select policy checks retention');
select ok(to_regprocedure('public.append_realtime_invalidation(uuid,uuid,uuid,text,uuid,bigint,uuid)') is not null, 'append function signature is stable');

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000120001','authenticated','authenticated','realtime-owner@example.invalid','fixture',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000120002','authenticated','authenticated','realtime-guardian@example.invalid','fixture',now(),'{}','{}',now(),now());
insert into public.care_spaces (id,name,created_by)
values ('00000000-0000-0000-0000-000000120011','Realtime Space','00000000-0000-0000-0000-000000120001');
insert into public.care_space_members (care_space_id,user_id,member_role,status)
values
  ('00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120001','owner','active'),
  ('00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120002','guardian','active');
insert into public.children (id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by)
values ('00000000-0000-0000-0000-000000120021','00000000-0000-0000-0000-000000120011','Realtime Child','2020-01-01','female','00000000-0000-0000-0000-000000120001');
insert into public.child_access (care_space_id,child_id,user_id,permissions,status)
values
  ('00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120021','00000000-0000-0000-0000-000000120001',array['read','record'],'active'),
  ('00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120021','00000000-0000-0000-0000-000000120002',array['read'],'active');

insert into public.agent_sessions (id,care_space_id,child_id,owner_user_id,channel,initial_model)
values ('00000000-0000-0000-0000-000000120031','00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120021','00000000-0000-0000-0000-000000120001','creciendo_mobile','synthetic-model');

create temp table append_one as
select * from public.append_realtime_invalidation(
  '00000000-0000-0000-0000-000000120011',
  '00000000-0000-0000-0000-000000120021',
  null,
  'dashboard',
  '00000000-0000-0000-0000-000000120041',
  1,
  '00000000-0000-0000-0000-000000120051'
);
create temp table append_replay as
select * from public.append_realtime_invalidation(
  '00000000-0000-0000-0000-000000120011',
  '00000000-0000-0000-0000-000000120021',
  null,
  'dashboard',
  '00000000-0000-0000-0000-000000120041',
  1,
  '00000000-0000-0000-0000-000000120051'
);
create temp table append_conflict as
select * from public.append_realtime_invalidation(
  '00000000-0000-0000-0000-000000120011',
  '00000000-0000-0000-0000-000000120021',
  null,
  'growth',
  '00000000-0000-0000-0000-000000120041',
  2,
  '00000000-0000-0000-0000-000000120051'
);
create temp table append_session as
select * from public.append_realtime_invalidation(
  '00000000-0000-0000-0000-000000120011',
  '00000000-0000-0000-0000-000000120021',
  '00000000-0000-0000-0000-000000120031',
  'conversation',
  '00000000-0000-0000-0000-000000120061',
  1,
  '00000000-0000-0000-0000-000000120071'
);
create temp table append_version_conflict as
select * from public.append_realtime_invalidation(
  '00000000-0000-0000-0000-000000120011',
  '00000000-0000-0000-0000-000000120021',
  null,
  'dashboard',
  '00000000-0000-0000-0000-000000120041',
  1,
  '00000000-0000-0000-0000-000000120081'
);

select ok((select outcome = 'created' and invalidation_sequence = 1 from append_one), 'first invalidation gets child sequence one');
select ok((select outcome = 'idempotent_replay' and invalidation_id = (select invalidation_id from append_one) from append_replay), 'identical source replay is effect-free');
select ok((select outcome = 'conflict' from append_conflict), 'changed source payload is rejected');
select ok((select outcome = 'created' and invalidation_sequence = 2 from append_session), 'session invalidation advances child sequence');
select ok((select outcome = 'version_conflict' from append_version_conflict), 'older resource version is rejected');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000120001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table owner_visible as
select count(*) visible, min(sequence) first_sequence, max(sequence) last_sequence
from public.realtime_invalidations;
select ok((select visible = 2 and first_sequence = 1 and last_sequence = 2 from owner_visible), 'authorized owner sees only scoped invalidations');

select throws_ok(
  $$insert into public.realtime_invalidations (care_space_id,child_id,resource_kind,resource_id,resource_version,source_event_id,sequence) values ('00000000-0000-0000-0000-000000120011','00000000-0000-0000-0000-000000120021','dashboard','00000000-0000-0000-0000-000000120091',1,'00000000-0000-0000-0000-000000120092',3)$$,
  '42501', null, 'authenticated direct insert is denied');

select * from finish();
rollback;
