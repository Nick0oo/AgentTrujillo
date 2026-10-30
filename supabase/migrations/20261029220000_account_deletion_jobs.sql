-- Self-service erasure queue. No guardian may operate the privileged worker.
-- Access is revoked in the request transaction; data is erased in bounded jobs.
create table app_private.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null unique,
  stage text not null default 'access' check(stage in ('access','chats','archive','children','profile','completed')),
  child_ids uuid[] not null default '{}',
  session_ids uuid[] not null default '{}',
  eve_session_ids text[] not null default '{}',
  requested_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_failure text check(last_failure is null or last_failure='retryable'),
  completed_at timestamptz
  ,archive_fenced_at timestamptz
  ,archive_erased_at timestamptz
);
alter table app_private.account_deletion_jobs enable row level security;
revoke all on app_private.account_deletion_jobs from public,anon,authenticated;
create index account_deletion_jobs_due on app_private.account_deletion_jobs(next_attempt_at) where stage<>'completed';

-- One processing budget per UTC hour across replicas and manual schedule
-- retries. Leases alone only prevent overlap on the same individual job.
create table app_private.account_deletion_clock(id smallint primary key check(id=1),last_slot bigint not null default -1);
insert into app_private.account_deletion_clock(id) values(1);
alter table app_private.account_deletion_clock enable row level security;
revoke all on app_private.account_deletion_clock from public,anon,authenticated;

create function app_private.account_deletion_pending() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.account_deletion_jobs where actor=auth.uid());
$$;
revoke all on function app_private.account_deletion_pending() from public,anon;
grant execute on function app_private.account_deletion_pending() to authenticated;

-- Defends SECURITY DEFINER mutation paths as well as normal RLS writes.
create function app_private.guard_account_deletion_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and app_private.account_deletion_pending() then
    raise exception 'account_access_revoked' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_account_deletion_write() from public,anon,authenticated;
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  loop
    execute format('create policy account_deletion_denial on public.%I as restrictive for all to authenticated using (not app_private.account_deletion_pending()) with check (not app_private.account_deletion_pending())',t.relname);
    execute format('create trigger account_deletion_write_guard before insert or update on public.%I for each row execute function app_private.guard_account_deletion_write()',t.relname);
  end loop;
end $$;
create policy account_deletion_denial on storage.objects as restrictive for all to authenticated
  using(not app_private.account_deletion_pending()) with check(not app_private.account_deletion_pending());

-- Prevent an invitation/grant from changing an already selected erasure scope.
create function app_private.guard_pending_child_grant() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    if exists(select from app_private.account_deletion_jobs where actor=new.user_id) then
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
revoke all on function app_private.guard_pending_child_grant() from public,anon,authenticated;
create trigger pending_child_grant_guard before insert or update on public.child_access
for each row execute function app_private.guard_pending_child_grant();
create trigger pending_member_grant_guard before insert or update on public.care_space_members
for each row execute function app_private.guard_pending_child_grant();

create function public.request_account_deletion(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); job app_private.account_deletion_jobs%rowtype; children_to_delete uuid[];
begin
  if actor_id is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid_deletion_request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,29220000));
  select * into job from app_private.account_deletion_jobs where actor=actor_id for update;
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
          and not exists(select from app_private.account_deletion_jobs pending where pending.actor=other_access.user_id));
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
revoke all on function public.request_account_deletion(text) from public,anon;
grant execute on function public.request_account_deletion(text) to authenticated;

create table app_private.account_deletion_objects (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references app_private.account_deletion_jobs(id),
  bucket text not null, path text not null, unique(job_id,bucket,path)
);
alter table app_private.account_deletion_objects enable row level security;
revoke all on app_private.account_deletion_objects from public,anon,authenticated;

create function public.claim_account_deletion_job() returns jsonb
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
  return jsonb_build_object('id',job.id,'actor',job.actor,'lease',job.lease,'stage',job.stage);
end;
$$;

-- All SQL identifiers come from the trusted catalog. Predicates originate here,
-- never from the mobile request. Every DELETE preserves incoming FK rows and
-- therefore never invokes an unbounded ON DELETE CASCADE.
create function app_private.erase_account_rows(p_job uuid,p_stage text,p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype; t record; f record; parent record;
  predicate text; incoming text; relation_name text; row_count integer; total integer:=0; joined text; changed integer; trigger_name text;
  disabled_triggers text[]; remaining boolean;
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job;
  -- Erasure is its own transaction. Flush any deferred FK validation before
  -- changing append-only trigger state; FK checks stay immediate throughout.
  set constraints all immediate;
  create temporary table if not exists account_erasure_filters(rel oid primary key,predicate text) on commit drop;
  truncate pg_temp.account_erasure_filters;
  for t in select c.oid,c.relname,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','app_private') and c.relkind='r'
      and c.relname not like 'account_deletion_%'
      and c.relname not in ('audit_events','billing_customers','billing_events','billing_products','purchases','entitlements','usage_ledger','guardian_profiles','care_spaces')
  loop
    predicate:='false';
    if p_stage='chats' then
      if t.nspname='public' and t.relname='agent_sessions' then predicate:=format('t%s.id=any($2)',t.oid); end if;
      for f in select attname from pg_attribute where attrelid=t.oid and attnum>0 and not attisdropped and attname in ('agent_session_id','source_session_id') loop
        predicate:=predicate||format(' or t%s.%I=any($2)',t.oid,f.attname);
      end loop;
      if exists(select from pg_attribute where attrelid=t.oid and attname='source_message_id' and not attisdropped) then
        predicate:=predicate||format(' or t%s.source_message_id in (select id from public.messages where agent_session_id=any($2))',t.oid);
      end if;
    elsif p_stage='children' then
      if t.nspname='public' and t.relname='children' then predicate:=format('t%s.id=any($1)',t.oid); end if;
      if exists(select from pg_attribute where attrelid=t.oid and attname='child_id' and not attisdropped) then
        predicate:=predicate||format(' or t%s.child_id=any($1)',t.oid);
      end if;
    elsif p_stage='profile' then
      for f in select attname from pg_attribute where attrelid=t.oid and attnum>0 and not attisdropped and attname in ('user_id','guardian_user_id','owner_user_id') loop
        predicate:=predicate||format(' or t%s.%I=$3',t.oid,f.attname);
      end loop;
    end if;
    if predicate<>'false' then insert into pg_temp.account_erasure_filters values(t.oid,'('||predicate||')'); end if;
  end loop;
  -- Scope link/outbox/embedding tables through their existing FK. Directly
  -- scoped tables keep their predicate, avoiding expansion into another child.
  for depth in 1..16 loop
    changed:=0;
    for f in select c.* from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
      where c.contype='f' and n.nspname in ('public','app_private') and r.relname not like 'account_deletion_%'
        and r.relname not in ('audit_events','billing_customers','billing_events','billing_products','purchases','entitlements','usage_ledger','guardian_profiles','care_spaces')
        and exists(select from pg_temp.account_erasure_filters x where x.rel=c.confrelid)
        and not exists(select from pg_temp.account_erasure_filters x where x.rel=c.conrelid)
    loop
      select x.predicate,c.relname,n.nspname into parent from pg_temp.account_erasure_filters x join pg_class c on c.oid=x.rel join pg_namespace n on n.oid=c.relnamespace where x.rel=f.confrelid;
      select string_agg(format('t%s.%I=t%s.%I',f.conrelid,ca.attname,f.confrelid,pa.attname),' and ' order by k.i) into joined
        from generate_subscripts(f.conkey,1) k(i) join pg_attribute ca on ca.attrelid=f.conrelid and ca.attnum=f.conkey[k.i]
        join pg_attribute pa on pa.attrelid=f.confrelid and pa.attnum=f.confkey[k.i];
      insert into pg_temp.account_erasure_filters values(f.conrelid,format('exists(select 1 from %I.%I t%s where %s and %s)',parent.nspname,parent.relname,f.confrelid,parent.predicate,joined)) on conflict do nothing;
      get diagnostics row_count=row_count; changed:=changed+row_count;
    end loop;
    exit when changed=0;
  end loop;
  for t in select x.*,c.relname,n.nspname from pg_temp.account_erasure_filters x join pg_class c on c.oid=x.rel join pg_namespace n on n.oid=c.relnamespace order by x.rel loop
    exit when total>=p_limit;
    incoming:='';
    for f in select * from pg_constraint where contype='f' and confrelid=t.rel loop
      select string_agg(format('ref.%I=t%s.%I',ca.attname,t.rel,pa.attname),' and ' order by k.i) into joined
        from generate_subscripts(f.conkey,1) k(i) join pg_attribute ca on ca.attrelid=f.conrelid and ca.attnum=f.conkey[k.i]
        join pg_attribute pa on pa.attrelid=f.confrelid and pa.attnum=f.confkey[k.i];
      incoming:=incoming||format(' and not exists(select 1 from %s ref where %s)',f.conrelid::regclass,joined);
    end loop;
    relation_name:=format('%I.%I',t.nspname,t.relname);
    -- USER triggers implement append-only command semantics. Only this tightly
    -- scoped owner function bypasses them during erasure. FK triggers stay on.
    -- DDL lock is transaction-bound; triggers are restored before commit/error.
    disabled_triggers:=array(select tgname from pg_trigger where tgrelid=t.rel and not tgisinternal and tgenabled='O');
    foreach trigger_name in array disabled_triggers loop execute format('alter table %s disable trigger %I',relation_name,trigger_name); end loop;
    execute format('delete from %s where ctid in (select t%s.ctid from %s t%s where (%s)%s limit $4)',relation_name,t.rel,relation_name,t.rel,t.predicate,incoming)
      using job.child_ids,job.session_ids,job.actor,p_limit-total;
    get diagnostics row_count=row_count; total:=total+row_count;
    foreach trigger_name in array disabled_triggers loop execute format('alter table %s enable trigger %I',relation_name,trigger_name); end loop;
  end loop;
  if total=0 then
    for t in select x.*,c.relname,n.nspname from pg_temp.account_erasure_filters x join pg_class c on c.oid=x.rel join pg_namespace n on n.oid=c.relnamespace loop
      execute format('select exists(select 1 from %I.%I t%s where %s)',t.nspname,t.relname,t.rel,t.predicate)
        into remaining using job.child_ids,job.session_ids,job.actor;
      if remaining then raise exception 'erasure_dependency_pending'; end if;
    end loop;
  end if;
  return total;
end;
$$;
revoke all on function app_private.erase_account_rows(uuid,text,integer) from public,anon,authenticated;

-- Confirmed facts belong to the child. Removing their originating conversation
-- unlinks that source; the facts and confirmation evidence survive for another
-- guardian, or until the exclusive-child stage of the same job.
create function app_private.detach_confirmed_chat_facts(p_job uuid,p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype; table_name text; predicate text;
  disabled text[]; trigger_name text; n integer; total integer:=0;
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job;
  set constraints all immediate;
  foreach table_name in array array['clinical_memory_items','clinical_memory_candidates'] loop
    exit when total>=p_limit;
    predicate:='(t.source_session_id=any($1) or t.source_message_id in(select id from public.messages where agent_session_id=any($1)))';
    if table_name='clinical_memory_candidates' then
      predicate:=predicate||' and exists(select from public.clinical_memory_candidate_decisions d where d.candidate_id=t.id and d.memory_item_id is not null and d.decision in (''confirm'',''correct''))';
    end if;
    disabled:=array(select tgname from pg_trigger where tgrelid=('public.'||table_name)::regclass and not tgisinternal and tgenabled='O');
    foreach trigger_name in array disabled loop execute format('alter table public.%I disable trigger %I',table_name,trigger_name); end loop;
    execute format('update public.%I set source_session_id=null,source_message_id=null where ctid in(select t.ctid from public.%I t where %s limit $2)',table_name,table_name,predicate)
      using job.session_ids,p_limit-total;
    get diagnostics n=row_count; total:=total+n;
    foreach trigger_name in array disabled loop execute format('alter table public.%I enable trigger %I',table_name,trigger_name); end loop;
  end loop;
  return total;
end;
$$;
revoke all on function app_private.detach_confirmed_chat_facts(uuid,integer) from public,anon,authenticated;

-- Preserve minimal financial/audit evidence while detaching the erased subject.
-- This does not remove financial ledger entries or clinical package approvals.
create function app_private.detach_erased_subject_refs(p_job uuid,p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype; n integer; total integer:=0; trigger_name text; disabled text[];
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job;
  disabled:=array(select tgname from pg_trigger where tgrelid='public.audit_events'::regclass and not tgisinternal and tgenabled='O');
  foreach trigger_name in array disabled loop execute format('alter table public.audit_events disable trigger %I',trigger_name); end loop;
  update public.audit_events set actor_user_id=null,care_space_id=null,child_id=null,resource_id=null,metadata_redacted='{}'
    where ctid in(select ctid from public.audit_events where child_id=any(job.child_ids) or actor_user_id=job.actor limit p_limit);
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
revoke all on function app_private.detach_erased_subject_refs(uuid,integer) from public,anon,authenticated;

create function public.account_deletion_batch(p_job uuid,p_lease uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' set lock_timeout='1s' as $$
declare job app_private.account_deletion_jobs%rowtype; count_rows integer:=0; objects jsonb; affected integer;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid_batch_limit'; end if;
  select * into strict job from app_private.account_deletion_jobs where id=p_job and lease=p_lease and lease_until>now() for update;
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
          update app_private.account_deletion_jobs set stage='profile' where id=p_job;
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

-- Physical-object acknowledgements are separate from document metadata so that
-- retries never regenerate a deletion manifest for an already removed object.
alter table app_private.account_deletion_objects add column removed_at timestamptz;
create or replace function public.ack_account_deletion_objects(p_job uuid,p_lease uuid,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.account_deletion_jobs where id=p_job and lease=p_lease and lease_until>now() for update;
  if not found or p_ids is null or cardinality(p_ids)>100 then raise exception 'invalid_erasure_lease'; end if;
  update app_private.account_deletion_objects set removed_at=now() where job_id=p_job and id=any(p_ids);
end;
$$;
create function public.release_account_deletion_job(p_job uuid,p_lease uuid,p_failed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update app_private.account_deletion_jobs set lease=null,lease_until=null,
    last_failure=case when p_failed then 'retryable' else null end,
    next_attempt_at=greatest(next_attempt_at,now()+case when p_failed then interval '6 hours' else interval '1 hour' end)
    where id=p_job and lease=p_lease;
end;
$$;
create function public.account_deletion_archive_scope(p_job uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype;
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job and lease=p_lease and lease_until>now();
  return jsonb_build_object('rootIds',job.eve_session_ids);
end;
$$;
create function public.ack_account_deletion_archive(p_job uuid,p_lease uuid,p_phase text) returns void
language plpgsql security definer set search_path='' as $$
declare job app_private.account_deletion_jobs%rowtype;
begin
  select * into strict job from app_private.account_deletion_jobs where id=p_job and lease=p_lease and lease_until>now() for update;
  if p_phase='fenced' and job.stage='access' then
    update app_private.account_deletion_jobs set archive_fenced_at=coalesce(archive_fenced_at,now()) where id=p_job;
  elsif p_phase='erased' and job.stage='archive' and job.archive_fenced_at is not null then
    update app_private.account_deletion_jobs set archive_erased_at=coalesce(archive_erased_at,now()) where id=p_job;
  else raise exception 'invalid_archive_ack'; end if;
end;
$$;
do $$ declare signature text; begin
  foreach signature in array array['claim_account_deletion_job()','account_deletion_batch(uuid,uuid,integer)','ack_account_deletion_objects(uuid,uuid,uuid[])','release_account_deletion_job(uuid,uuid,boolean)','account_deletion_archive_scope(uuid,uuid)','ack_account_deletion_archive(uuid,uuid,text)'] loop
    execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
    execute 'grant execute on function public.'||signature||' to service_role';
  end loop;
end $$;
