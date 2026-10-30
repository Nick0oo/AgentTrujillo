begin;
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','fixture1@example.invalid','{"display_name":"Fixture one"}'),
('20000000-0000-4000-8000-000000000002','fixture2@example.invalid','{"display_name":"Fixture two"}');
insert into public.care_spaces(id,name,created_by) values('20000000-0000-4000-8000-000000000010','Fixture space','20000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','owner'),
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000002','guardian');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,country_of_care,time_zone,created_by) values
('20000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000010','Exclusive fixture','2025-01-01','female','CO','America/Bogota','20000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000010','Shared fixture','2025-01-01','female','CO','America/Bogota','20000000-0000-4000-8000-000000000001');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by)
values('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000010','Future shared fixture','2025-01-01','female','20000000-0000-4000-8000-000000000001');
insert into public.child_access(care_space_id,child_id,user_id,valid_from) values
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000001',now()),
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000002',now()+interval '1 day');
insert into public.child_access(care_space_id,child_id,user_id) values
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000002');
insert into public.agent_sessions(id,care_space_id,child_id,owner_user_id,channel,initial_model) values
('20000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','evaluation','fixture'),
('20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000002','evaluation','fixture');
insert into public.messages(care_space_id,child_id,agent_session_id,sequence,actor_type,parts)
select '20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000030',n,'guardian','[{"type":"text","text":"synthetic fixture"}]' from generate_series(1,105) n;
insert into public.anthropometric_measurements(care_space_id,child_id,measurement_type,original_value,original_unit,normalized_value,normalized_unit,occurred_at,local_date,time_zone,provenance_type,idempotency_key,recorded_by)
select '20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000020','weight',3.2,'kg',3.2,'kg','2025-01-01','2025-01-01','America/Bogota','guardian','fixture-measure-'||n,'20000000-0000-4000-8000-000000000001' from generate_series(1,105) n;
insert into public.audit_events(actor_type,actor_user_id,care_space_id,child_id,action,resource_type,request_id,outcome)
values('guardian','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000020','fixture','fixture','fixture','succeeded');
insert into public.usage_ledger(care_space_id,child_id,capability,quantity,idempotency_key)
values('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000020','fixture',1,'fixture-usage');
insert into storage.objects(bucket_id,name) values('avatars','20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000020/fixture.png');
insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,size_bytes,sha256,provenance_type,uploaded_by,
  purpose,declared_mime_type,expected_size_bytes,expected_sha256,retention_class,storage_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until)
values('20000000-0000-4000-8000-000000000040','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000020','clinical-attachments',
  '20000000-0000-4000-8000-000000000010/20000000-0000-4000-8000-000000000020/20000000-0000-4000-8000-000000000040/v1','fixture',1,repeat('a',64),'guardian','20000000-0000-4000-8000-000000000001',
  'clinical_attachment','image/png',1,repeat('a',64),'child_record','uploaded',repeat('a',64),'fixture-document',repeat('a',64),now(),now()+interval '5 minutes',current_date+1);
insert into app_private.registered_birth_dimensions(child_id,guardian_user_id,birth_length_cm,birth_head_circumference_cm)
values('20000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000001',50,34);
insert into public.clinical_memory_candidates(id,care_space_id,child_id,created_by,memory_type,candidate_text,provenance_type,provenance_source_id,provenance_captured_at,
source_span_start,source_span_end,source_session_id,source_message_id,extraction_confidence,sensitivity,input_sha256,idempotency_key,expires_at)
values('20000000-0000-4000-8000-000000000052','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','preference','synthetic fixture','chat','fixture-memory',now(),
0,17,'20000000-0000-4000-8000-000000000030',(select id from public.messages where agent_session_id='20000000-0000-4000-8000-000000000030' and sequence=1),1,'low',repeat('a',64),'fixture-memory',now()+interval '1 day');
insert into public.clinical_memory_items(id,care_space_id,child_id,memory_type,structured_content,searchable_text,provenance_type,source_session_id,source_message_id,created_by,
provenance_source_id,provenance_captured_at,source_span_start,source_span_end,extraction_confidence,sensitivity,input_sha256,content_sha256,confirmation_sha256,confirmed_at)
values('20000000-0000-4000-8000-000000000050','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','preference','{"fixture":"synthetic"}','synthetic fixture','chat',
'20000000-0000-4000-8000-000000000030',(select id from public.messages where agent_session_id='20000000-0000-4000-8000-000000000030' and sequence=1),'20000000-0000-4000-8000-000000000001',
'fixture-memory',now(),0,17,1,'low',repeat('a',64),repeat('a',64),repeat('a',64),now());
insert into public.clinical_memory_candidate_decisions(candidate_id,care_space_id,child_id,decided_by,decision,candidate_input_sha256,confirmation_sha256,idempotency_key,memory_item_id)
values('20000000-0000-4000-8000-000000000052','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','confirm',repeat('a',64),repeat('a',64),'fixture-memory-confirm','20000000-0000-4000-8000-000000000050');
insert into public.clinical_memory_legal_holds(id,care_space_id,child_id,memory_item_id,basis_code,basis_sha256,starts_at,imposed_by)
values('20000000-0000-4000-8000-000000000051','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000050','fixture_hold',repeat('a',64),now()-interval '1 day','20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$ declare receipt jsonb; replay jsonb; begin
  receipt:=public.request_account_deletion('fixture-delete-1');
  replay:=public.request_account_deletion('fixture-delete-retry');
  if receipt<>replay or receipt->>'accessRevoked'<>'true' then raise exception 'deletion_not_idempotent'; end if;
  if exists(select from public.child_access where user_id=auth.uid() and status='active') or exists(select from public.care_space_members where user_id=auth.uid() and status='active') then raise exception 'access_not_revoked'; end if;
  if not exists(select from app_private.account_deletion_jobs where actor=auth.uid() and child_ids=array['20000000-0000-4000-8000-000000000020'::uuid]) then raise exception 'shared_child_selected'; end if;
  begin update public.guardian_profiles set display_name='Reactivated' where user_id=auth.uid(); raise exception 'pending_actor_wrote'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
  begin update public.care_space_members set status='active',revoked_at=null where user_id='20000000-0000-4000-8000-000000000001'; raise exception 'pending_membership_reactivated'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select from public.guardian_profiles) or exists(select from public.children) then raise exception 'pending_actor_read'; end if;
  begin perform public.claim_account_deletion_job(); raise exception 'guardian_claimed_worker'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
-- A second due job proves the global hourly dispatch budget, not just the
-- lease on the first job. It has no clinical scope and is rolled back.
insert into app_private.account_deletion_jobs(actor,requested_at)
values('20000000-0000-4000-8000-000000000099',now()+interval '1 second');
do $$ declare job jsonb; batch jsonb; i integer; obj jsonb; hold_checked boolean:=false; memory_hold_checked boolean:=false; begin
  job:=public.claim_account_deletion_job();
  if job->>'actor'<>'20000000-0000-4000-8000-000000000001' then raise exception 'clock_fixture_wrong_job'; end if;
  if public.claim_account_deletion_job() is not null then raise exception 'lease_overlap'; end if;
  for i in 1..300 loop
    batch:=public.account_deletion_batch((job->>'id')::uuid,(job->>'lease')::uuid,1);
    if batch->>'stage'='chats' and not memory_hold_checked then
      batch:=public.account_deletion_batch((job->>'id')::uuid,(job->>'lease')::uuid,1);
      if batch->>'processed'<>'0' or (select count(*) from public.messages where agent_session_id='20000000-0000-4000-8000-000000000030')<>105 then raise exception 'memory_legal_hold_ignored'; end if;
      update public.clinical_memory_legal_holds set released_at=now() where id='20000000-0000-4000-8000-000000000051';
      memory_hold_checked:=true;
    end if;
    if batch->>'stage'='children' and not hold_checked then
      batch:=public.account_deletion_batch((job->>'id')::uuid,(job->>'lease')::uuid,1);
      if batch->>'processed'<>'0' or batch->'objects'<>'[]'::jsonb or not exists(select from public.documents where id='20000000-0000-4000-8000-000000000040') then raise exception 'retention_hold_ignored'; end if;
      update public.documents set retention_until=current_date where id='20000000-0000-4000-8000-000000000040';
      hold_checked:=true;
    end if;
    if (batch->>'processed')::integer>1 then raise exception 'batch_exceeded_limit'; end if;
    if jsonb_array_length(batch->'objects')>1 then raise exception 'object_batch_exceeded_limit'; end if;
    if jsonb_array_length(batch->'objects')>0 then
      if not exists(select from public.children where id='20000000-0000-4000-8000-000000000020') then raise exception 'metadata_removed_before_storage_ack'; end if;
      obj:=(batch->'objects')->0;
      -- This fixture has no object bytes. Simulate the successful Storage API
      -- response; runtime tests separately assert API removal precedes the ack.
      delete from storage.objects where bucket_id=obj->>'bucket' and name=obj->>'path';
      perform public.ack_account_deletion_objects((job->>'id')::uuid,(job->>'lease')::uuid,array[(obj->>'id')::uuid]);
    end if;
    if batch->>'stage' in ('completed','provider_hold') then exit; end if;
  end loop;
  if batch->>'stage'<>'completed' then raise exception 'erasure_did_not_finish'; end if;
  if exists(select from public.children where id='20000000-0000-4000-8000-000000000020') then raise exception 'exclusive_child_retained'; end if;
  if not exists(select from public.children where id='20000000-0000-4000-8000-000000000021') then raise exception 'shared_child_deleted'; end if;
  if not exists(select from public.children where id='20000000-0000-4000-8000-000000000022') then raise exception 'future_guardian_child_deleted'; end if;
  if exists(select from public.agent_sessions where id='20000000-0000-4000-8000-000000000030') or not exists(select from public.agent_sessions where id='20000000-0000-4000-8000-000000000031') then raise exception 'chat_scope_violated'; end if;
  if (select count(*) from public.audit_events where request_id='fixture' and child_id is null and actor_user_id is null)<>1 then raise exception 'minimal_audit_not_preserved'; end if;
  if (select count(*) from public.usage_ledger where idempotency_key='fixture-usage' and child_id is null and quantity=1)<>1 then raise exception 'financial_evidence_not_preserved'; end if;
  if exists(select from public.messages where agent_session_id='20000000-0000-4000-8000-000000000030') or exists(select from public.anthropometric_measurements where child_id='20000000-0000-4000-8000-000000000020') then raise exception 'clinical_rows_retained'; end if;
  if not exists(select from public.clinical_memory_items where id='20000000-0000-4000-8000-000000000050' and source_session_id is null and source_message_id is null)
    or not exists(select from public.clinical_memory_candidate_decisions where memory_item_id='20000000-0000-4000-8000-000000000050') then raise exception 'shared_confirmed_memory_not_preserved'; end if;
end $$;
rollback;
