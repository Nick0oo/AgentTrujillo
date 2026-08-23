begin;
select '1..20';
create temp table tap_results (n integer primary key, line text not null) on commit drop;
create or replace function pg_temp.tap(p_ok boolean, p_name text, p_number integer)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare line text;
begin line := case when p_ok then 'ok ' else 'not ok ' end || p_number || ' - ' || p_name;
  insert into pg_temp.tap_results values (p_number, line); return line; end;
$$;

select pg_temp.tap(to_regprocedure('public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)') is not null, 'reservation RPC exists', 1);
select pg_temp.tap((select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid='public.documents'::regclass), 'documents force RLS', 2);
select pg_temp.tap(has_function_privilege('authenticated','public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)','execute'), 'authenticated has exact RPC grant', 3);
select pg_temp.tap(not has_table_privilege('authenticated','public.documents','insert'), 'authenticated cannot insert documents directly', 4);
set local role authenticated;
do $$ begin
  begin
    insert into storage.objects(bucket_id,name) values ('vaccine-documents','forged/direct-upload');
    perform pg_temp.tap(false,'authenticated cannot bypass signed upload',5);
  exception when insufficient_privilege then perform pg_temp.tap(true,'authenticated cannot bypass signed upload',5); end;
end $$;
set local role postgres;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000001301','authenticated','authenticated','document-storage@example.invalid','fixture',now(),'{}','{}',now(),now());
insert into public.care_spaces(id,name,created_by) values
 ('00000000-0000-0000-0000-000000001311','Document Space','00000000-0000-0000-0000-000000001301'),
 ('00000000-0000-0000-0000-000000001312','Foreign Space','00000000-0000-0000-0000-000000001301');
insert into public.care_space_members(care_space_id,user_id,member_role,status) values
 ('00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001301','owner','active');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values
 ('00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001311','Document Child','2020-01-01','female','00000000-0000-0000-0000-000000001301'),
 ('00000000-0000-0000-0000-000000001322','00000000-0000-0000-0000-000000001312','Foreign Child','2020-01-01','male','00000000-0000-0000-0000-000000001301');
insert into public.child_access(care_space_id,child_id,user_id,permissions,status,valid_from) values
 ('00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001301',array['read','manage_documents'],'active',now()-interval '1 minute');
insert into public.agent_sessions(id,care_space_id,child_id,owner_user_id,authorization_version,authorization_expires_at,channel,initial_model) values
 ('00000000-0000-0000-0000-000000001331','00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001301','m:1:a:1',now()+interval '4 minutes','evaluation','fixture');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table reservation_one on commit drop as
select * from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','carnet.pdf','application/pdf',1024,repeat('a',64),'child_record','upload-1',repeat('b',64));
select pg_temp.tap((select outcome='created' and bucket_id='vaccine-documents' and storage_status='reserved' from reservation_one), 'authorized reservation is created', 6);
select pg_temp.tap((select object_path ~ ('^00000000-0000-0000-0000-000000001311/00000000-0000-0000-0000-000000001321/' || document_id::text || '/v1$') from reservation_one), 'server path is child-scoped and opaque', 7);
select pg_temp.tap((select expected_size_bytes=1024 and declared_mime_type='application/pdf' and expected_sha256=repeat('a',64) from public.documents where id=(select document_id from reservation_one)), 'expected metadata is bound', 8);
select pg_temp.tap((select outcome='idempotent_replay' and document_id=(select document_id from reservation_one) from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','carnet.pdf','application/pdf',1024,repeat('a',64),'child_record','upload-1',repeat('b',64))), 'exact replay converges', 9);
select pg_temp.tap((select outcome='conflict' from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','changed.pdf','application/pdf',1024,repeat('a',64),'child_record','upload-1',repeat('c',64))), 'changed replay conflicts', 10);
select pg_temp.tap((select outcome='conflict' from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','changed.pdf','application/pdf',1024,repeat('a',64),'child_record','upload-1',repeat('b',64))), 'same caller digest cannot hide changed metadata', 19);
select pg_temp.tap((select count(*)=0 from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001312','00000000-0000-0000-0000-000000001322','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','carnet.pdf','application/pdf',1024,repeat('a',64),'child_record','cross-child',repeat('d',64))), 'cross-child reservation is hidden', 11);
select pg_temp.tap((select outcome='invalid' from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','carnet.pdf','image/png',1024,repeat('a',64),'child_record','bad-mime',repeat('e',64))), 'purpose MIME mismatch fails closed', 12);
select pg_temp.tap((select outcome='invalid' from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'generated_report','report.pdf','application/pdf',1024,repeat('a',64),'generated_artifact','client-report',repeat('f',64))), 'guardian cannot reserve server-generated purpose', 13);
select pg_temp.tap((select outcome='invalid' from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'clinical_attachment','attachment.pdf','image/png',1024,repeat('a',64),'child_record','clinical-mime',repeat('2',64))), 'all purposes enforce MIME extension agreement', 20);

set local role postgres;
select pg_temp.tap((select count(*)=1 from public.documents where care_space_id='00000000-0000-0000-0000-000000001311' and child_id='00000000-0000-0000-0000-000000001321'), 'failed attempts create no orphan rows', 14);
select pg_temp.tap((select count(*)=1 from pg_indexes where schemaname='public' and indexname='documents_reservation_replay_idx'), 'replay index exists', 15);
select pg_temp.tap((select count(*)=1 from pg_trigger where tgrelid='public.documents'::regclass and tgname='documents_immutable_storage_identity'), 'immutable identity trigger exists', 16);
do $$ begin
  begin
    update public.documents set object_path='forged/path' where id=(select document_id from reservation_one);
    perform pg_temp.tap(false,'object identity cannot be changed',17);
  exception when check_violation then perform pg_temp.tap(true,'object identity cannot be changed',17); end;
end $$;
update public.child_access set status='revoked',revoked_at=clock_timestamp() where child_id='00000000-0000-0000-0000-000000001321';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select pg_temp.tap((select count(*)=0 from public.reserve_document_object(
  '00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001321','00000000-0000-0000-0000-000000001331','m:1:a:1',statement_timestamp(),
  'vaccine_record','other.pdf','application/pdf',1024,repeat('a',64),'child_record','revoked',repeat('1',64))), 'revocation blocks later reservation', 18);

set local role postgres;
select string_agg(line,E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
