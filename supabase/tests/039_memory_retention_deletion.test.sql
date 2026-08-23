begin;
select '1..26';
create temp table tap_results (n integer primary key, line text not null) on commit drop;
create or replace function pg_temp.tap(p_ok boolean, p_name text, p_number integer)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare line text;
begin line := case when p_ok then 'ok ' else 'not ok ' end || p_number || ' - ' || p_name;
  insert into pg_temp.tap_results values (p_number, line); return line; end;
$$;

select pg_temp.tap(to_regclass('public.clinical_memory_deletion_requests') is not null, 'deletion ledger exists', 1);
select pg_temp.tap(to_regclass('public.clinical_memory_legal_holds') is not null, 'legal-hold ledger exists', 2);
select pg_temp.tap(to_regprocedure('public.request_memory_deletion(uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text)') is not null, 'guardian request RPC exists', 3);
select pg_temp.tap(to_regprocedure('public.execute_memory_deletion(uuid,uuid,uuid,uuid,text)') is not null, 'privileged cleanup RPC exists', 4);
select pg_temp.tap(to_regprocedure('public.enqueue_expired_memory_deletions(timestamptz,integer)') is not null, 'retention enqueue RPC exists', 5);
select pg_temp.tap(has_function_privilege('authenticated','public.request_memory_deletion(uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text)','execute'), 'guardian request has exact grant', 6);
select pg_temp.tap(not has_function_privilege('authenticated','public.execute_memory_deletion(uuid,uuid,uuid,uuid,text)','execute'), 'guardian cannot execute cleanup', 7);
select pg_temp.tap(has_function_privilege('service_role','public.execute_memory_deletion(uuid,uuid,uuid,uuid,text)','execute'), 'service role can execute cleanup', 8);
select pg_temp.tap((select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid='public.clinical_memory_deletion_requests'::regclass), 'request ledger forces RLS', 9);
select pg_temp.tap(not has_table_privilege('authenticated','public.clinical_memory_deletion_requests','select'), 'guardian cannot query audit ledger', 10);

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000001201','authenticated','authenticated','retention@example.invalid','fixture',now(),'{}','{}',now(),now());
insert into public.care_spaces(id,name,created_by) values ('00000000-0000-0000-0000-000000001211','Retention Space','00000000-0000-0000-0000-000000001201');
insert into public.care_spaces(id,name,created_by) values ('00000000-0000-0000-0000-000000001212','Foreign Space','00000000-0000-0000-0000-000000001201');
insert into public.care_space_members(care_space_id,user_id,member_role,status) values ('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001201','owner','active');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by)
values ('00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001211','Retention Child','2020-01-01','female','00000000-0000-0000-0000-000000001201');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by)
values ('00000000-0000-0000-0000-000000001222','00000000-0000-0000-0000-000000001212','Foreign Child','2020-01-01','male','00000000-0000-0000-0000-000000001201');
insert into public.child_access(care_space_id,child_id,user_id,permissions,status,valid_from)
values ('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001201',array['read','record'],'active',now()-interval '1 minute');
insert into public.agent_sessions(id,care_space_id,child_id,owner_user_id,authorization_version,authorization_expires_at,channel,initial_model)
values ('00000000-0000-0000-0000-000000001231','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001201','m:1:a:1',now()+interval '4 minutes','evaluation','fixture');

insert into public.clinical_memory_items(id,care_space_id,child_id,memory_type,structured_content,searchable_text,provenance_type,confirmation_status,valid_from,created_by,lifecycle,retrieval_eligibility,provenance_source_id,provenance_captured_at,source_span_start,source_span_end,extraction_confidence,sensitivity,input_sha256,content_sha256,confirmation_sha256,confirmed_at)
values
 ('00000000-0000-0000-0000-000000001241','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','preference','{"text":"blue"}','blue','chat','confirmed',now()-interval '1 hour','00000000-0000-0000-0000-000000001201','active','eligible','source-1',now()-interval '1 hour',0,4,1,'low',repeat('a',64),repeat('b',64),repeat('c',64),now()-interval '1 hour'),
 ('00000000-0000-0000-0000-000000001242','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','preference','{"text":"green"}','green','chat','confirmed',now()-interval '1 hour','00000000-0000-0000-0000-000000001201','active','eligible','source-2',now()-interval '1 hour',0,5,1,'low',repeat('d',64),repeat('e',64),repeat('f',64),now()-interval '1 hour');
insert into public.clinical_memory_embeddings(id,care_space_id,child_id,memory_item_id,embedding_model,embedding,content_sha256)
values
 ('00000000-0000-0000-0000-000000001251','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001241','google.gemini-embedding-2.768.l2.cosine.v1',('['||'1,'||repeat('0,',766)||'0]')::extensions.vector(768),repeat('b',64)),
 ('00000000-0000-0000-0000-000000001252','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001242','google.gemini-embedding-2.768.l2.cosine.v1',('['||'1,'||repeat('0,',766)||'0]')::extensions.vector(768),repeat('e',64));
insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
values ('00000000-0000-0000-0000-000000001261','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','clinical-attachments','00000000-0000-0000-0000-000000001211/00000000-0000-0000-0000-000000001221/00000000-0000-0000-0000-000000001261/v1','clinical_attachment','retention.txt','text/plain','text/plain',4,4,repeat('1',64),repeat('1',64),'clinical_attachment','child_record','active','clean',repeat('3',64),'retention-doc',repeat('4',64),now(),now()+interval '5 minutes',current_date+3650,'guardian','00000000-0000-0000-0000-000000001201');
insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
values ('00000000-0000-0000-0000-000000001262','00000000-0000-0000-0000-000000001212','00000000-0000-0000-0000-000000001222','clinical-attachments','00000000-0000-0000-0000-000000001212/00000000-0000-0000-0000-000000001222/00000000-0000-0000-0000-000000001262/v1','clinical_attachment','foreign.txt','text/plain','text/plain',4,4,repeat('2',64),repeat('2',64),'clinical_attachment','child_record','active','clean',repeat('5',64),'foreign-doc',repeat('6',64),now(),now()+interval '5 minutes',current_date+3650,'guardian','00000000-0000-0000-0000-000000001201');
insert into public.document_links(document_id,resource_type,resource_id) values
 ('00000000-0000-0000-0000-000000001261','clinical_memory','00000000-0000-0000-0000-000000001241'),
 ('00000000-0000-0000-0000-000000001262','clinical_memory','00000000-0000-0000-0000-000000001241');
insert into public.clinical_memory_legal_holds(id,care_space_id,child_id,memory_item_id,basis_code,basis_sha256,starts_at,imposed_by)
values ('00000000-0000-0000-0000-000000001271','00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001242','legal_request',repeat('9',64),now()-interval '1 minute','00000000-0000-0000-0000-000000001201');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table request_one on commit drop as select * from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001241','00000000-0000-0000-0000-000000001281','delete-1',repeat('7',64));
select pg_temp.tap((select outcome='created' and status='pending' from request_one), 'guardian request creates pending cleanup', 11);
select pg_temp.tap((select lifecycle='deleted' and retrieval_eligibility='ineligible' and valid_until is not null from public.clinical_memory_items where id='00000000-0000-0000-0000-000000001241'), 'request revokes retrieval immediately', 12);
select pg_temp.tap((select not exists(select 1 from public.match_clinical_memory('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),('['||'1,'||repeat('0,',766)||'0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0,20) where memory_item_id='00000000-0000-0000-0000-000000001241')), 'revoked item cannot be retrieved before cleanup', 13);
select pg_temp.tap((select outcome='idempotent_replay' from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001241','00000000-0000-0000-0000-000000001281','delete-1',repeat('7',64))), 'exact request replay converges', 14);
select pg_temp.tap((select outcome='conflict' from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001241','00000000-0000-0000-0000-000000001281','delete-1',repeat('8',64))), 'changed replay conflicts', 15);
create temp table hold_request on commit drop as select * from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001242','00000000-0000-0000-0000-000000001282','delete-2',repeat('6',64));
select pg_temp.tap((select status='legal_hold' from hold_request), 'active legal hold is explicit', 16);
select pg_temp.tap((select retrieval_eligibility='ineligible' from public.clinical_memory_items where id='00000000-0000-0000-0000-000000001242'), 'legal hold never keeps item retrievable', 17);

set local role service_role;
create temp table cleanup_one on commit drop as select * from public.execute_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001281','00000000-0000-0000-0000-000000001241',repeat('5',64));
select pg_temp.tap((select outcome='completed' and deleted_embeddings=1 and deleted_links=1 from cleanup_one), 'cleanup deletes derived vectors and links', 18);
select pg_temp.tap((select searchable_text='[deleted]' and structured_content='{}'::jsonb from public.clinical_memory_items where id='00000000-0000-0000-0000-000000001241'), 'cleanup leaves only bounded tombstone content', 19);
select pg_temp.tap(exists(select 1 from public.document_links where document_id='00000000-0000-0000-0000-000000001262' and resource_id='00000000-0000-0000-0000-000000001241'), 'cleanup preserves forged foreign-document link for isolation review', 26);
select pg_temp.tap((select outcome='idempotent_replay' and deleted_embeddings=0 and deleted_links=0 from public.execute_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001281','00000000-0000-0000-0000-000000001241',repeat('5',64))), 'cleanup replay converges', 20);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
select pg_temp.tap((select outcome='conflict' from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001241','00000000-0000-0000-0000-000000001289','delete-new',repeat('2',64))), 'completed item rejects a new replay identity', 25);
set local role service_role;
select pg_temp.tap((select outcome='legal_hold' and deleted_embeddings=0 from public.execute_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001282','00000000-0000-0000-0000-000000001242',repeat('4',64))), 'legal hold blocks destructive cleanup', 21);
select pg_temp.tap((select count(*)=1 from public.clinical_memory_embeddings where memory_item_id='00000000-0000-0000-0000-000000001242'), 'held derived artifact is preserved but inaccessible', 22);

set local role postgres;
update public.child_access set status='revoked',revoked_at=clock_timestamp() where child_id='00000000-0000-0000-0000-000000001221' and user_id='00000000-0000-0000-0000-000000001201';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
select pg_temp.tap((select count(*)=0 from public.request_memory_deletion('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001221','00000000-0000-0000-0000-000000001231','m:1:a:1',statement_timestamp(),'00000000-0000-0000-0000-000000001242','00000000-0000-0000-0000-000000001283','delete-3',repeat('3',64))), 'revoked access fails closed', 23);
set local role postgres;
select pg_temp.tap(not exists(select 1 from public.clinical_memory_deletion_requests where status='completed' and proof_sha256 is null), 'completed deletion records bounded proof', 24);
select string_agg(line,E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
