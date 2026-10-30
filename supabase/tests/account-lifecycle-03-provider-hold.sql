begin;
insert into auth.users(id,email,raw_user_meta_data) values('30000000-0000-4000-8000-000000000001','fixture3@example.invalid','{"display_name":"Fixture three"}');
insert into app_private.account_deletion_jobs(id,actor,stage,eve_session_ids,lease,lease_until)
values('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000001','access',array['wrun_01M00000000000000000000000'], '30000000-0000-4000-8000-000000000020',now()+interval '5 minutes');
do $$ declare result jsonb; begin
  begin
    perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
    raise exception 'missing_archive_fence_accepted';
  exception when raise_exception then if sqlerrm<>'archive_fence_required' then raise; end if; end;
  perform public.ack_account_deletion_archive('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020','fenced');
  perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
  result:=public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
  if result->>'stage'<>'archive' then raise exception 'archive_stage_skipped'; end if;
  begin
    perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
    raise exception 'missing_archive_proof_accepted';
  exception when raise_exception then if sqlerrm<>'archive_erasure_required' then raise; end if; end;
  if has_function_privilege('authenticated','public.ack_account_deletion_archive(uuid,uuid,text)','execute') then raise exception 'guardian_archive_ack_allowed'; end if;
  perform public.ack_account_deletion_archive('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020','erased');
  perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
  perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
  result:=public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',100);
  if result->>'stage'<>'completed' then raise exception 'verified_archive_job_not_completed'; end if;
  begin perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000021',100); raise exception 'wrong_lease_accepted'; exception when no_data_found then null; end;
  begin
    perform public.account_deletion_batch('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',null);
    raise exception 'null_limit_accepted';
  exception when raise_exception then if sqlerrm<>'invalid_batch_limit' then raise; end if; end;
  perform public.release_account_deletion_job('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000020',true);
  if not exists(select from app_private.account_deletion_jobs where id='30000000-0000-4000-8000-000000000010' and lease is null and last_failure='retryable' and next_attempt_at>=now()+interval '6 hours') then raise exception 'retry_backoff_not_persisted'; end if;
end $$;
rollback;
