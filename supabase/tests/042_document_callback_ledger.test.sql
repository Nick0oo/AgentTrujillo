begin;
select '1..12';
create temp table tap_results (n integer primary key, line text not null) on commit drop;
create or replace function pg_temp.tap(p_ok boolean,p_name text,p_number integer)
returns text language plpgsql volatile security definer set search_path='' as $$
declare line text; begin line:=case when p_ok then 'ok ' else 'not ok ' end||p_number||' - '||p_name;
insert into pg_temp.tap_results values(p_number,line); return line; end $$;

select pg_temp.tap(to_regclass('public.document_callback_events') is not null,'callback ledger exists',1);
select pg_temp.tap((select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid='public.document_callback_events'::regclass),'callback ledger forces RLS',2);
select pg_temp.tap(not has_table_privilege('authenticated','public.document_callback_events','select'),'guardian cannot read callback ledger',3);
select pg_temp.tap(has_table_privilege('service_role','public.document_callback_events','insert'),'service role can ingest verified callback',4);
select pg_temp.tap((select count(*)=1 from pg_constraint where conrelid='public.document_callback_events'::regclass and contype='f'),'ledger has composite document scope FK',5);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000001501','authenticated','authenticated','callback@example.invalid','fixture',now(),'{}','{}',now(),now());
insert into public.care_spaces(id,name,created_by) values('00000000-0000-0000-0000-000000001511','Callback Space','00000000-0000-0000-0000-000000001501');
insert into public.care_space_members(care_space_id,user_id,member_role,status) values('00000000-0000-0000-0000-000000001511','00000000-0000-0000-0000-000000001501','owner','active');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values('00000000-0000-0000-0000-000000001521','00000000-0000-0000-0000-000000001511','Callback Child','2020-01-01','female','00000000-0000-0000-0000-000000001501');
insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
values('00000000-0000-0000-0000-000000001531','00000000-0000-0000-0000-000000001511','00000000-0000-0000-0000-000000001521','vaccine-documents','00000000-0000-0000-0000-000000001511/00000000-0000-0000-0000-000000001521/00000000-0000-0000-0000-000000001531/v1','vaccine_record','carnet.pdf','application/pdf',null,1024,1024,repeat('a',64),repeat('a',64),'vaccine_record','child_record','reserved','pending',repeat('b',64),'callback-upload',repeat('c',64),now(),now()+interval '5 minutes',current_date+3650,'guardian','00000000-0000-0000-0000-000000001501');

set local role service_role;
insert into public.document_callback_events(id,provider,provider_event_id,care_space_id,child_id,document_id,event_type,signature_key_id,raw_body_sha256,observed_bucket_id,observed_object_path,observed_size_bytes,observed_mime_type,observed_sha256,occurred_at,received_at,status,scan_result)
values('00000000-0000-0000-0000-000000001541','scanner','event-1','00000000-0000-0000-0000-000000001511','00000000-0000-0000-0000-000000001521','00000000-0000-0000-0000-000000001531','scan_completed','scanner-v1',repeat('d',64),'vaccine-documents','00000000-0000-0000-0000-000000001511/00000000-0000-0000-0000-000000001521/00000000-0000-0000-0000-000000001531/v1',1024,'application/pdf',repeat('a',64),now(),now(),'verified','clean');
select pg_temp.tap((select count(*)=1 from public.document_callback_events where provider_event_id='event-1'),'verified event is stored without raw body',6);
select pg_temp.tap((select raw_body_sha256=repeat('d',64) and result_metadata='{}'::jsonb from public.document_callback_events where provider_event_id='event-1'),'only bounded digest/result metadata persist',7);
do $$ begin begin
insert into public.document_callback_events(provider,provider_event_id,care_space_id,child_id,document_id,event_type,signature_key_id,raw_body_sha256,observed_bucket_id,observed_object_path,observed_size_bytes,observed_mime_type,observed_sha256,occurred_at,received_at,status)
values('scanner','event-1','00000000-0000-0000-0000-000000001511','00000000-0000-0000-0000-000000001521','00000000-0000-0000-0000-000000001531','scan_completed','scanner-v1',repeat('e',64),'vaccine-documents','00000000-0000-0000-0000-000000001511/00000000-0000-0000-0000-000000001521/00000000-0000-0000-0000-000000001531/v1',1024,'application/pdf',repeat('a',64),now(),now(),'verified');
perform pg_temp.tap(false,'provider event ID is unique',8); exception when unique_violation then perform pg_temp.tap(true,'provider event ID is unique',8); end; end $$;
select pg_temp.tap((select count(*)=1 from pg_indexes where schemaname='public' and indexname='document_callback_pending_idx'),'pending processing index exists',9);
select pg_temp.tap((select count(*)=1 from pg_trigger where tgrelid='public.document_callback_events'::regclass and tgname='document_callback_identity_immutable'),'callback identity is immutable',10);
set local role authenticated;
do $$ begin begin
perform count(*) from public.document_callback_events;
perform pg_temp.tap(false,'ledger is inaccessible to guardian',11);
exception when insufficient_privilege then perform pg_temp.tap(true,'ledger is inaccessible to guardian',11); end; end $$;
set local role postgres;
update public.documents set storage_status='deleted',deleted_at=now() where id='00000000-0000-0000-0000-000000001531';
select pg_temp.tap((select storage_status='deleted' from public.documents where id='00000000-0000-0000-0000-000000001531'),'document deletion remains monotonic',12);
select string_agg(line,E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
