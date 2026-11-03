-- Child removal shares the existing one-job/hour erasure budget and fences.
alter table app_private.account_deletion_jobs add column kind text not null default 'account' check(kind in ('account','child'));
alter table app_private.account_deletion_jobs add column subject_child_id uuid;
alter table app_private.account_deletion_jobs add constraint child_erasure_subject_shape check((kind='account' and subject_child_id is null) or (kind='child' and subject_child_id is not null));
alter table app_private.account_deletion_jobs drop constraint account_deletion_jobs_actor_key;
create unique index account_deletion_actor_unique on app_private.account_deletion_jobs(actor) where kind='account';
create unique index child_deletion_actor_subject_unique on app_private.account_deletion_jobs(actor,subject_child_id) where kind='child';

create or replace function app_private.account_deletion_pending() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.account_deletion_jobs where actor=auth.uid() and kind='account');
$$;

create or replace function app_private.guard_pending_child_grant() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    if exists(select from app_private.account_deletion_jobs where actor=new.user_id and kind='account') then
      raise exception 'account_access_revoked' using errcode='42501';
    end if;
    if tg_table_name='child_access' then
      if exists(select from app_private.account_deletion_jobs where (to_jsonb(new)->>'child_id')::uuid=any(child_ids)) then raise exception 'account_access_revoked' using errcode='42501'; end if;
    else
      if exists(select from app_private.account_deletion_jobs j join public.child_access a on a.child_id=any(j.child_ids)
        where a.user_id=new.user_id and a.care_space_id=new.care_space_id and a.status='active') then
        raise exception 'account_access_revoked' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.request_account_deletion(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); job app_private.account_deletion_jobs%rowtype; children_to_delete uuid[];
begin
  if actor_id is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid_deletion_request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,29220000));
  select * into job from app_private.account_deletion_jobs where actor=actor_id and kind='account' for update;
  if not found then
    -- Serialize with concurrent grants. No child is selected from a client ID.
    lock table public.child_access in share row exclusive mode;
    lock table public.care_space_members in share row exclusive mode;
    select coalesce(array_agg(a.child_id),'{}') into children_to_delete
      from public.child_access a join public.care_space_members m on m.care_space_id=a.care_space_id and m.user_id=a.user_id
      where a.user_id=actor_id and a.status='active' and m.status='active'
      and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())
      and m.valid_from<=now() and (m.valid_until is null or m.valid_until>now())
      and not exists(select 1 from public.child_access other_access
        join public.care_space_members other_member on other_member.care_space_id=other_access.care_space_id and other_member.user_id=other_access.user_id
        where other_access.child_id=a.child_id and other_access.user_id<>actor_id
          and other_access.status='active' and other_member.status in ('active','invited')
          and (other_access.valid_until is null or other_access.valid_until>now())
          and (other_member.valid_until is null or other_member.valid_until>now())
          and not exists(select from app_private.account_deletion_jobs pending where pending.actor=other_access.user_id and pending.kind='account'));
    -- Revoke before installing the write guard's tombstone.
    update public.child_access set status='revoked',revoked_at=now() where user_id=actor_id and status<>'revoked';
    update public.care_space_members set status='revoked',revoked_at=now() where user_id=actor_id and status<>'revoked';
    update public.agent_sessions set status='cancelled' where (owner_user_id=actor_id or child_id=any(children_to_delete)) and status='active';
    update public.device_installations set status='disabled' where user_id=actor_id and status='active';
    update public.notification_deliveries set status='cancelled' where status='queued'
      and device_installation_id in(select id from public.device_installations where user_id=actor_id);
    update public.medication_reminders set status='cancelled' where child_id=any(children_to_delete) and status='active';
    insert into app_private.account_deletion_jobs(actor,child_ids,session_ids,eve_session_ids)
      values(actor_id,children_to_delete,
        array(select id from public.agent_sessions where owner_user_id=actor_id or child_id=any(children_to_delete)),
        array(select distinct eve_session_id from public.agent_sessions where (owner_user_id=actor_id or child_id=any(children_to_delete)) and eve_session_id is not null))
      returning * into job;
  end if;
  return jsonb_build_object('version','account-deletion.v1','status','queued','requestId',job.id,'accessRevoked',true);
end;
$$;

create or replace function public.claim_account_deletion_job() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype; previous_slot bigint; current_slot bigint:=floor(extract(epoch from now())/3600)::bigint;
begin
  select last_slot into previous_slot from app_private.account_deletion_clock where id=1 for update skip locked;
  if not found or previous_slot>=current_slot then return null; end if;
  update app_private.account_deletion_clock set last_slot=current_slot where id=1;
  select * into job from app_private.account_deletion_jobs
    where stage<>'completed' and next_attempt_at<=now() and (lease_until is null or lease_until<now())
    order by next_attempt_at,requested_at for update skip locked limit 1;
  if not found then return null; end if;
  update app_private.account_deletion_jobs set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes', attempts=attempts+1
    where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'actor',job.actor,'lease',job.lease,'stage',job.stage,'kind',job.kind);
end;
$$;

create or replace function app_private.detach_erased_subject_refs(p_job uuid,p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype; n integer; total integer:=0; trigger_name text; disabled text[];
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job;
  disabled:=array(select tgname from pg_trigger where tgrelid='public.audit_events'::regclass and not tgisinternal and tgenabled='O');
  foreach trigger_name in array disabled loop execute format('alter table public.audit_events disable trigger %I',trigger_name); end loop;
  update public.audit_events set actor_user_id=null,care_space_id=null,child_id=null,resource_id=null,metadata_redacted='{}'
    where ctid in(select ctid from public.audit_events where child_id=any(job.child_ids) or (job.kind='account' and actor_user_id=job.actor) limit p_limit);
  get diagnostics n=row_count; total:=total+n;
  foreach trigger_name in array disabled loop execute format('alter table public.audit_events enable trigger %I',trigger_name); end loop;
  disabled:=array(select tgname from pg_trigger where tgrelid='public.usage_ledger'::regclass and not tgisinternal and tgenabled='O');
  foreach trigger_name in array disabled loop execute format('alter table public.usage_ledger disable trigger %I',trigger_name); end loop;
  update public.usage_ledger set child_id=null,metadata='{}' where ctid in(select ctid from public.usage_ledger where child_id=any(job.child_ids) limit p_limit-total);
  get diagnostics n=row_count; total:=total+n;
  foreach trigger_name in array disabled loop execute format('alter table public.usage_ledger enable trigger %I',trigger_name); end loop;
  return total;
end;
$$;

create or replace function public.account_deletion_batch(p_job uuid,p_lease uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' set lock_timeout='1s' as $$
declare job app_private.account_deletion_jobs%rowtype; count_rows integer:=0; objects jsonb; affected integer;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid_batch_limit'; end if;
  select * into strict job from app_private.account_deletion_jobs where id=p_job and lease=p_lease and lease_until>now() for update;
  if job.kind='child' and job.stage='profile' then
    update app_private.account_deletion_jobs set stage='completed',completed_at=now() where id=p_job;
    return jsonb_build_object('stage','completed','processed',0,'objects','[]'::jsonb);
  end if;
  if job.stage='access' then
    if cardinality(job.eve_session_ids)>0 and job.archive_fenced_at is null then raise exception 'archive_fence_required'; end if;
    update public.agent_sessions set status='cancelled' where id=any(job.session_ids) and status='active';
    update app_private.account_deletion_jobs set stage='chats' where id=p_job;
  elsif job.stage='chats' then
    if exists(select from public.clinical_memory_legal_holds h join public.clinical_memory_items m on m.id=h.memory_item_id
      where (h.child_id=any(job.child_ids) or m.source_session_id=any(job.session_ids)
        or m.source_message_id in(select id from public.messages where agent_session_id=any(job.session_ids)))
        and h.released_at is null and h.starts_at<=now() and (h.expires_at is null or h.expires_at>now())) then
      update app_private.account_deletion_jobs set next_attempt_at=now()+interval '1 day' where id=p_job;
      return jsonb_build_object('stage','chats','processed',0,'objects','[]'::jsonb);
    end if;
    count_rows:=app_private.detach_confirmed_chat_facts(p_job,p_limit);
    if count_rows<p_limit then count_rows:=count_rows+app_private.erase_account_rows(p_job,'chats',p_limit-count_rows); end if;
    if count_rows=0 then
      if exists(select from public.agent_sessions where id=any(job.session_ids)) then raise exception 'erasure_dependency_pending'; end if;
      update app_private.account_deletion_jobs set stage=case when cardinality(eve_session_ids)>0 then 'archive' else 'children' end where id=p_job;
    end if;
  elsif job.stage='archive' then
    if job.archive_erased_at is null then raise exception 'archive_erasure_required'; end if;
    update app_private.account_deletion_jobs set stage='children' where id=p_job;
  elsif job.stage='children' then
    -- Respect explicit document retention holds. Never remove metadata before
    -- the Storage API confirms physical object deletion.
    if exists(select from public.documents where child_id=any(job.child_ids) and retention_until>current_date)
      or exists(select from public.clinical_memory_legal_holds where child_id=any(job.child_ids) and released_at is null and starts_at<=now() and (expires_at is null or expires_at>now())) then
      update app_private.account_deletion_jobs set next_attempt_at=now()+interval '1 day' where id=p_job;
    else
      insert into app_private.account_deletion_objects(job_id,bucket,path)
        select p_job,d.bucket_id,d.object_path from public.documents d where child_id=any(job.child_ids)
          and not exists(select from app_private.account_deletion_objects o where o.job_id=p_job and o.bucket=d.bucket_id and o.path=d.object_path) limit p_limit on conflict do nothing;
      -- Avatar identities are scoped to the child directory, not to filenames
      -- from a mobile request. Includes replaced/orphaned uploads in that scope.
      insert into app_private.account_deletion_objects(job_id,bucket,path)
        select p_job,bucket_id,name from storage.objects o where bucket_id='avatars'
          and split_part(o.name,'/',2)=any(array(select unnest(job.child_ids)::text))
          and not exists(select from app_private.account_deletion_objects a where a.job_id=p_job and a.bucket=o.bucket_id and a.path=o.name) limit p_limit on conflict do nothing;
      select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket,'path',path)),'[]') into objects
        from (select * from app_private.account_deletion_objects where job_id=p_job and removed_at is null limit p_limit) q;
      if objects='[]'::jsonb then
        count_rows:=app_private.detach_erased_subject_refs(p_job,p_limit);
        if count_rows<p_limit then count_rows:=count_rows+app_private.erase_account_rows(p_job,'children',p_limit-count_rows); end if;
        if count_rows=0 then
          if exists(select from public.children where id=any(job.child_ids)) then raise exception 'erasure_dependency_pending'; end if;
          update app_private.account_deletion_jobs set stage=case when kind='child' then 'completed' else 'profile' end,
            completed_at=case when kind='child' then now() else completed_at end where id=p_job;
        end if;
      end if;
    end if;
  elsif job.stage='profile' then
    if cardinality(job.eve_session_ids)>0 and job.archive_erased_at is null then raise exception 'archive_erasure_required'; end if;
    count_rows:=app_private.erase_account_rows(p_job,'profile',p_limit);
    if count_rows=0 then
      -- Pseudonymous profile key remains only where another guardian's records
      -- require referential integrity. Auth soft deletion removes login identity.
      update public.guardian_profiles set display_name='Cuenta eliminada',phone_e164=null,locale='es-CO',time_zone='UTC',onboarding_completed_at=null
        where user_id=job.actor and (display_name<>'Cuenta eliminada' or phone_e164 is not null or time_zone<>'UTC' or onboarding_completed_at is not null);
      get diagnostics count_rows=row_count;
      update public.care_spaces set name='Espacio cerrado',status='closed' where ctid in (
        select s.ctid from public.care_spaces s where created_by=job.actor and (status<>'closed' or name<>'Espacio cerrado')
          and not exists(select from public.care_space_members m where m.care_space_id=s.id and m.status='active')
          and not exists(select from public.children c where c.care_space_id=s.id) limit p_limit-count_rows);
      get diagnostics affected=row_count; count_rows:=count_rows+affected;
      if not exists(select from public.care_spaces s where created_by=job.actor and (status<>'closed' or name<>'Espacio cerrado')
        and not exists(select from public.care_space_members m where m.care_space_id=s.id and m.status='active')
        and not exists(select from public.children c where c.care_space_id=s.id)) then
        update app_private.account_deletion_jobs set stage='completed',completed_at=now() where id=p_job;
      end if;
    end if;
  end if;
  return jsonb_build_object('stage',(select stage from app_private.account_deletion_jobs where id=p_job),'processed',count_rows,'objects',coalesce(objects,'[]'::jsonb));
end;
$$;

create function public.request_child_deletion(p_child_id uuid,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); space_id uuid; job app_private.account_deletion_jobs%rowtype; shared boolean;
begin
 if actor_id is null or app_private.account_deletion_pending() then raise exception 'child_removal_not_authorized' using errcode='42501';end if;
 if p_child_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'child_removal_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||p_child_id::text,3210000));
 select * into job from app_private.account_deletion_jobs where actor=actor_id and kind='child' and subject_child_id=p_child_id for update;
 if not found then
  lock table public.child_access in share row exclusive mode;
  lock table public.care_space_members in share row exclusive mode;
  select care_space_id into space_id from public.children where id=p_child_id and status='active' for update;
  if space_id is null or not app_private.has_child_permission(space_id,p_child_id,'read') then raise exception 'child_removal_not_authorized' using errcode='42501';end if;
  select exists(select from public.child_access a join public.care_space_members m on m.care_space_id=a.care_space_id and m.user_id=a.user_id
    where a.child_id=p_child_id and a.user_id<>actor_id and a.status='active' and m.status in ('active','invited')
      and (a.valid_until is null or a.valid_until>now()) and (m.valid_until is null or m.valid_until>now())
      and not exists(select from app_private.account_deletion_jobs pending where pending.actor=a.user_id and pending.kind='account')) into shared;
  if not shared and not (app_private.can_manage_space(space_id) or app_private.has_child_permission(space_id,p_child_id,'manage_guardians')) then
    raise exception 'child_removal_not_authorized' using errcode='42501';end if;
  update public.child_access set status='revoked',revoked_at=now() where child_id=p_child_id and user_id=actor_id and status='active';
  if not shared then
    update public.children set status='archived',updated_at=now() where id=p_child_id;
    update public.medication_reminders set status='cancelled' where child_id=p_child_id and status='active';
  end if;
  update public.agent_sessions set status='cancelled' where child_id=p_child_id and (not shared or owner_user_id=actor_id) and status='active';
  insert into app_private.account_deletion_jobs(actor,kind,subject_child_id,child_ids,session_ids,eve_session_ids)
   values(actor_id,'child',p_child_id,case when shared then '{}'::uuid[] else array[p_child_id] end,
    array(select id from public.agent_sessions where child_id=p_child_id and (not shared or owner_user_id=actor_id)),
    array(select distinct eve_session_id from public.agent_sessions where child_id=p_child_id and (not shared or owner_user_id=actor_id) and eve_session_id is not null)) returning * into job;
 end if;
 return jsonb_build_object('version','child-deletion.v1','status',case when cardinality(job.child_ids)=0 then 'detached' else 'queued' end,
   'requestId',job.id,'childId',p_child_id,'accessRevoked',true);
end$$;
revoke all on function public.request_child_deletion(uuid,text) from public,anon;
grant execute on function public.request_child_deletion(uuid,text) to authenticated;
