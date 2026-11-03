begin;
insert into auth.users(id,email,raw_user_meta_data) values
('56000000-0000-4000-8000-000000000001','functional-one@example.invalid','{}'),
('56000000-0000-4000-8000-000000000002','functional-two@example.invalid','{}');
insert into public.care_spaces(id,name,created_by) values('56000000-0000-4000-8000-000000000010','Functional fixture','56000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values
('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000001','owner'),
('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000002','guardian');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values
('56000000-0000-4000-8000-000000000020','56000000-0000-4000-8000-000000000010','Sole fixture','2025-01-01','female','56000000-0000-4000-8000-000000000001'),
('56000000-0000-4000-8000-000000000021','56000000-0000-4000-8000-000000000010','Shared fixture','2025-01-01','female','56000000-0000-4000-8000-000000000001'),
('56000000-0000-4000-8000-000000000022','56000000-0000-4000-8000-000000000010','Retained fixture','2025-01-01','female','56000000-0000-4000-8000-000000000001');
insert into public.child_access(care_space_id,child_id,user_id)
select '56000000-0000-4000-8000-000000000010',id,'56000000-0000-4000-8000-000000000001' from public.children where care_space_id='56000000-0000-4000-8000-000000000010';
insert into public.child_access(care_space_id,child_id,user_id) values('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000021','56000000-0000-4000-8000-000000000002');

insert into public.audit_events(actor_type,actor_user_id,care_space_id,child_id,action,resource_type,request_id,outcome)
values('guardian','56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000022','fixture','fixture','retained-child-audit','succeeded');

set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000001',true) is not null as actor_set;
do $$declare receipt jsonb; replay jsonb;begin
 receipt:=public.update_guardian_child_profile('56000000-0000-4000-8000-000000000020','{"name":"Confirmed fixture","allergies":"Synthetic allergy","history":"Synthetic history","bloodType":"A+","birthWeightKg":3.2,"birthHeightCm":50,"birthHeadCm":34}','profile-fixture');
 if receipt->>'status'<>'saved' then raise exception 'profile_receipt_invalid';end if;
 perform public.update_guardian_child_profile('56000000-0000-4000-8000-000000000020','{"name":"Confirmed fixture","allergies":"Synthetic allergy","history":"Synthetic history","bloodType":"A+","birthWeightKg":3.2,"birthHeightCm":50,"birthHeadCm":34}','profile-fixture');
 if (select count(*) from public.development_observations where child_id='56000000-0000-4000-8000-000000000020')<>3 then raise exception 'profile_retry_duplicated';end if;
 begin perform public.update_guardian_child_profile('56000000-0000-4000-8000-000000000020','{"name":"Changed payload"}','profile-fixture');raise exception 'profile_idempotency_conflict_missed';exception when unique_violation then null;end;
 begin perform public.update_guardian_child_profile('56000000-0000-4000-8000-000000000020','{"name":"Must rollback","birthHeightCm":0}','profile-invalid');raise exception 'invalid_birth_accepted';exception when invalid_parameter_value then null;end;
 if not exists(select from public.children where id='56000000-0000-4000-8000-000000000020' and given_names='Confirmed fixture' and birth_weight_grams=3200 and birth_length_cm=50) then raise exception 'profile_atomic_save_broken';end if;
 receipt:=public.request_child_deletion('56000000-0000-4000-8000-000000000020','remove-sole');
 replay:=public.request_child_deletion('56000000-0000-4000-8000-000000000020','remove-sole');
 if receipt->>'status'<>'queued' or receipt<>replay then raise exception 'sole_removal_not_idempotent';end if;
 if app_private.account_deletion_pending() then raise exception 'child_job_blocked_account';end if;
 if exists(select from public.children where id='56000000-0000-4000-8000-000000000020') then raise exception 'child_access_not_revoked';end if;
 if not exists(select from public.children where id='56000000-0000-4000-8000-000000000022') then raise exception 'other_child_access_revoked';end if;
 receipt:=public.request_child_deletion('56000000-0000-4000-8000-000000000021','remove-shared');
 if receipt->>'status'<>'detached' then raise exception 'shared_child_not_detached';end if;
end$$;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000002',true) is not null as other_actor_set;
do $$begin
 if not exists(select from public.children where id='56000000-0000-4000-8000-000000000021') then raise exception 'other_tutor_lost_shared_child';end if;
 begin perform public.request_child_deletion('56000000-0000-4000-8000-000000000022','foreign');raise exception 'foreign_removal_accepted';exception when insufficient_privilege then null;end;
 begin perform public.update_guardian_child_profile('56000000-0000-4000-8000-000000000022','{"name":"Foreign"}','foreign');raise exception 'foreign_profile_accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true) is not null as worker_actor_cleared;
do $$declare job record; receipt jsonb;begin
 for job in select id from app_private.account_deletion_jobs where actor='56000000-0000-4000-8000-000000000001' and kind='child' loop
  update app_private.account_deletion_jobs set lease='56000000-0000-4000-8000-000000000099',lease_until=now()+interval '1 hour' where id=job.id;
  for tick in 1..80 loop
   receipt:=public.account_deletion_batch(job.id,'56000000-0000-4000-8000-000000000099',1);
   if (receipt->>'processed')::int>1 then raise exception 'unbounded_child_batch';end if;
   exit when receipt->>'stage'='completed';
  end loop;
  if receipt->>'stage'<>'completed' then raise exception 'child_job_did_not_finish';end if;
 end loop;
 if exists(select from public.children where id='56000000-0000-4000-8000-000000000020') then raise exception 'sole_child_not_erased';end if;
 if (select count(*) from public.children where id in('56000000-0000-4000-8000-000000000021','56000000-0000-4000-8000-000000000022'))<>2 then raise exception 'unrelated_child_erased';end if;
 if not exists(select from public.guardian_profiles where user_id='56000000-0000-4000-8000-000000000001' and display_name<>'Cuenta eliminada') then raise exception 'guardian_profile_erased';end if;
 if not exists(select from public.care_space_members where user_id='56000000-0000-4000-8000-000000000001' and status='active') then raise exception 'guardian_membership_erased';end if;
 if not exists(select from public.audit_events where request_id='retained-child-audit' and actor_user_id='56000000-0000-4000-8000-000000000001' and child_id='56000000-0000-4000-8000-000000000022') then raise exception 'other_child_audit_scrubbed';end if;
end$$;
-- A completed child job must neither hide nor replay as an account-deletion job.
set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000001',true) is not null as actor_reset;
do $$declare receipt jsonb;begin
 receipt:=public.request_account_deletion('account-after-child');
 if receipt->>'version'<>'account-deletion.v1' or not app_private.account_deletion_pending() then raise exception 'account_after_child_failed';end if;
end$$;
reset role;
do $$begin
 if (select count(*) from app_private.account_deletion_jobs where actor='56000000-0000-4000-8000-000000000001' and kind='account')<>1 then raise exception 'account_job_kind_mismatch';end if;
end$$;
rollback;
