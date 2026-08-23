-- Revoke memory retrieval immediately and clean derived artifacts idempotently.

create table public.clinical_memory_legal_holds (
  id uuid primary key,
  care_space_id uuid not null,
  child_id uuid not null,
  memory_item_id uuid not null,
  basis_code text not null check (basis_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  basis_sha256 text not null check (basis_sha256 ~ '^[a-f0-9]{64}$'),
  starts_at timestamptz not null,
  expires_at timestamptz,
  released_at timestamptz,
  imposed_by uuid not null,
  created_at timestamptz not null default now(),
  constraint clinical_memory_legal_holds_scope_fk foreign key (memory_item_id, care_space_id, child_id)
    references public.clinical_memory_items(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_legal_holds_window check (expires_at is null or expires_at > starts_at),
  constraint clinical_memory_legal_holds_release check (released_at is null or released_at >= starts_at)
);
create unique index clinical_memory_legal_holds_active_unique
  on public.clinical_memory_legal_holds(care_space_id, child_id, memory_item_id)
  where released_at is null;

create table public.clinical_memory_deletion_requests (
  id uuid primary key,
  care_space_id uuid not null,
  child_id uuid not null,
  memory_item_id uuid not null,
  requested_by uuid,
  request_kind text not null check (request_kind in ('guardian_deletion','retention_expiry','superseded_cleanup')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('pending','legal_hold','completed')),
  legal_hold_id uuid references public.clinical_memory_legal_holds(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  proof_sha256 text check (proof_sha256 is null or proof_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now(),
  constraint clinical_memory_deletion_requests_scope_fk foreign key (memory_item_id, care_space_id, child_id)
    references public.clinical_memory_items(id, care_space_id, child_id) on delete restrict,
  constraint clinical_memory_deletion_requests_completion check (
    (status = 'completed' and completed_at is not null and proof_sha256 is not null)
    or (status <> 'completed' and completed_at is null and proof_sha256 is null)
  )
);
create unique index clinical_memory_deletion_requests_guardian_replay
  on public.clinical_memory_deletion_requests(care_space_id, child_id, requested_by, idempotency_key)
  where requested_by is not null;
create unique index clinical_memory_deletion_requests_open_item
  on public.clinical_memory_deletion_requests(care_space_id, child_id, memory_item_id)
  where status <> 'completed';
create index clinical_memory_deletion_requests_pending_idx
  on public.clinical_memory_deletion_requests(status, requested_at, id)
  where status in ('pending','legal_hold');

alter table public.clinical_memory_legal_holds enable row level security;
alter table public.clinical_memory_legal_holds force row level security;
alter table public.clinical_memory_deletion_requests enable row level security;
alter table public.clinical_memory_deletion_requests force row level security;
revoke all on public.clinical_memory_legal_holds, public.clinical_memory_deletion_requests from public, anon, authenticated;

create or replace function app_private.prevent_clinical_memory_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tombstone_sha text := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('searchable_text','[deleted]','structured_content','{}'::jsonb)::text,
    'UTF8'), 'sha256'), 'hex');
  is_tombstone_redaction boolean;
begin
  if tg_op = 'DELETE' then raise exception 'clinical_memory_item_immutable' using errcode = '42501'; end if;
  is_tombstone_redaction := old.lifecycle = 'deleted' and new.lifecycle = 'deleted'
    and old.searchable_text <> '[deleted]' and new.searchable_text = '[deleted]'
    and new.structured_content = '{}'::jsonb and new.provenance_source_id = 'deleted'
    and new.source_session_id is null and new.source_message_id is null
    and new.source_span_start = 0 and new.source_span_end = 1
    and new.extraction_confidence = 0 and new.content_sha256 = tombstone_sha;

  if new.id is distinct from old.id or new.care_space_id is distinct from old.care_space_id
    or new.child_id is distinct from old.child_id or new.memory_type is distinct from old.memory_type
    or new.provenance_type is distinct from old.provenance_type or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at or new.valid_from is distinct from old.valid_from
    or new.provenance_captured_at is distinct from old.provenance_captured_at
    or new.sensitivity is distinct from old.sensitivity or new.input_sha256 is distinct from old.input_sha256
    or new.confirmation_sha256 is distinct from old.confirmation_sha256 or new.confirmed_at is distinct from old.confirmed_at
    or new.supersedes_id is distinct from old.supersedes_id
    or (new.confirmation_status is distinct from old.confirmation_status and old.input_sha256 is not null)
  then raise exception 'clinical_memory_item_immutable' using errcode = '42501'; end if;

  if not is_tombstone_redaction and (
    new.structured_content is distinct from old.structured_content or new.searchable_text is distinct from old.searchable_text
    or new.provenance_source_id is distinct from old.provenance_source_id
    or new.source_session_id is distinct from old.source_session_id or new.source_message_id is distinct from old.source_message_id
    or new.source_span_start is distinct from old.source_span_start or new.source_span_end is distinct from old.source_span_end
    or new.extraction_confidence is distinct from old.extraction_confidence or new.content_sha256 is distinct from old.content_sha256
  ) then raise exception 'clinical_memory_item_immutable' using errcode = '42501'; end if;

  if old.lifecycle = 'deleted' and new.lifecycle is distinct from 'deleted' then raise exception 'clinical_memory_item_transition_invalid' using errcode = '42501'; end if;
  if old.lifecycle = 'superseded' and new.lifecycle not in ('superseded','deleted') then raise exception 'clinical_memory_item_transition_invalid' using errcode = '42501'; end if;
  if new.lifecycle <> 'active' and new.retrieval_eligibility <> 'ineligible' then raise exception 'clinical_memory_item_retrieval_state_invalid' using errcode = '23514'; end if;
  if old.retrieval_eligibility = 'ineligible' and new.retrieval_eligibility = 'eligible' then raise exception 'clinical_memory_item_retrieval_resurrection' using errcode = '42501'; end if;
  if new.valid_until is distinct from old.valid_until and ((old.valid_until is not null and new.valid_until is null) or (old.valid_until is not null and new.valid_until > old.valid_until))
  then raise exception 'clinical_memory_item_validity_extension' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function app_private.prevent_clinical_memory_item_mutation() from public, anon, authenticated;

create function public.request_memory_deletion(
  p_care_space_id uuid, p_child_id uuid, p_session_id uuid, p_authorization_version text,
  p_cutoff_at timestamptz, p_memory_item_id uuid, p_request_id uuid,
  p_idempotency_key text, p_request_sha256 text
)
returns table(outcome text, request_id uuid, memory_item_id uuid, care_space_id uuid, child_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid()); now_at timestamptz := pg_catalog.clock_timestamp();
  existing public.clinical_memory_deletion_requests%rowtype; hold_id uuid; item_id uuid;
begin
  if actor is null or p_cutoff_at is null or p_cutoff_at > now_at or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$' or p_request_sha256 !~ '^[a-f0-9]{64}$' then return; end if;
  perform 1 from public.agent_sessions s
  join public.children c on c.care_space_id=s.care_space_id and c.id=s.child_id
  join public.care_spaces cs on cs.id=s.care_space_id
  join public.care_space_members m on m.care_space_id=s.care_space_id and m.user_id=actor
  join public.child_access a on a.care_space_id=s.care_space_id and a.child_id=s.child_id and a.user_id=actor
  where s.id=p_session_id and s.owner_user_id=actor and s.care_space_id=p_care_space_id and s.child_id=p_child_id
    and s.authorization_version=p_authorization_version and s.status='active' and s.authorization_expires_at>now_at
    and c.status='active' and cs.status='active' and m.status='active' and m.revoked_at is null
    and m.valid_from<=now_at and (m.valid_until is null or m.valid_until>now_at)
    and a.status='active' and a.revoked_at is null and a.valid_from<=now_at and (a.valid_until is null or a.valid_until>now_at)
    and 'record'=any(a.permissions) and p_authorization_version=pg_catalog.format('m:%s:a:%s',m.authorization_version,a.authorization_version)
    and (m.valid_until is null or s.authorization_expires_at<=m.valid_until) and (a.valid_until is null or s.authorization_expires_at<=a.valid_until)
  for share;
  if not found then return; end if;

  select r.* into existing from public.clinical_memory_deletion_requests r
  where (r.id=p_request_id or (r.care_space_id=p_care_space_id and r.child_id=p_child_id and r.requested_by=actor and r.idempotency_key=p_idempotency_key)) for update;
  if found then
    if existing.id=p_request_id and existing.memory_item_id=p_memory_item_id and existing.request_sha256=p_request_sha256 then
      return query select 'idempotent_replay',existing.id,existing.memory_item_id,existing.care_space_id,existing.child_id,existing.status;
    else return query select 'conflict'::text,null::uuid,null::uuid,null::uuid,null::uuid,null::text; end if;
    return;
  end if;

  select i.id into item_id from public.clinical_memory_items i
  where i.id=p_memory_item_id and i.care_space_id=p_care_space_id and i.child_id=p_child_id and i.confirmation_status='confirmed' for update;
  if not found then return; end if;
  select h.id into hold_id from public.clinical_memory_legal_holds h
  where h.care_space_id=p_care_space_id and h.child_id=p_child_id and h.memory_item_id=p_memory_item_id
    and h.released_at is null and h.starts_at<=now_at and (h.expires_at is null or h.expires_at>now_at) limit 1;
  update public.clinical_memory_items i set lifecycle='deleted',retrieval_eligibility='ineligible',
    valid_until=case when i.valid_until is null then now_at else least(i.valid_until,now_at) end,updated_at=now_at
  where i.id=item_id and i.care_space_id=p_care_space_id and i.child_id=p_child_id;
  insert into public.clinical_memory_deletion_requests(id,care_space_id,child_id,memory_item_id,requested_by,request_kind,idempotency_key,request_sha256,status,legal_hold_id,requested_at,updated_at)
  values(p_request_id,p_care_space_id,p_child_id,p_memory_item_id,actor,'guardian_deletion',p_idempotency_key,p_request_sha256,case when hold_id is null then 'pending' else 'legal_hold' end,hold_id,now_at,now_at)
  returning * into existing;
  return query select 'created',existing.id,existing.memory_item_id,existing.care_space_id,existing.child_id,existing.status;
exception when unique_violation then
  return query select 'conflict'::text,null::uuid,null::uuid,null::uuid,null::uuid,null::text;
end;
$$;

create function public.execute_memory_deletion(
  p_care_space_id uuid, p_child_id uuid, p_request_id uuid, p_memory_item_id uuid, p_proof_sha256 text
)
returns table(outcome text, request_id uuid, memory_item_id uuid, care_space_id uuid, child_id uuid, status text, deleted_embeddings integer, deleted_links integer)
language plpgsql security definer set search_path = '' as $$
declare r public.clinical_memory_deletion_requests%rowtype; now_at timestamptz:=pg_catalog.clock_timestamp(); embedding_count integer:=0; link_count integer:=0; tombstone_sha text;
begin
  if p_proof_sha256 !~ '^[a-f0-9]{64}$' then return; end if;
  select d.* into r from public.clinical_memory_deletion_requests d
  where d.id=p_request_id and d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.memory_item_id=p_memory_item_id for update;
  if not found then return; end if;
  if r.status='completed' then
    if r.proof_sha256=p_proof_sha256 then return query select 'idempotent_replay',r.id,r.memory_item_id,r.care_space_id,r.child_id,r.status,0,0; end if;
    return;
  end if;
  if exists(select 1 from public.clinical_memory_legal_holds h where h.care_space_id=r.care_space_id and h.child_id=r.child_id and h.memory_item_id=r.memory_item_id and h.released_at is null and h.starts_at<=now_at and (h.expires_at is null or h.expires_at>now_at)) then
    update public.clinical_memory_deletion_requests set status='legal_hold',updated_at=now_at where id=r.id;
    return query select 'legal_hold',r.id,r.memory_item_id,r.care_space_id,r.child_id,'legal_hold'::text,0,0; return;
  end if;
  delete from public.clinical_memory_embeddings e where e.care_space_id=r.care_space_id and e.child_id=r.child_id and e.memory_item_id=r.memory_item_id;
  get diagnostics embedding_count = row_count;
  delete from public.document_links l where l.resource_type='clinical_memory' and l.resource_id=r.memory_item_id;
  get diagnostics link_count = row_count;
  tombstone_sha:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('searchable_text','[deleted]','structured_content','{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  update public.clinical_memory_items i set structured_content='{}'::jsonb,searchable_text='[deleted]',provenance_source_id='deleted',
    source_session_id=null,source_message_id=null,source_span_start=0,source_span_end=1,extraction_confidence=0,content_sha256=tombstone_sha,updated_at=now_at
  where i.id=r.memory_item_id and i.care_space_id=r.care_space_id and i.child_id=r.child_id and i.lifecycle='deleted';
  update public.clinical_memory_deletion_requests set status='completed',legal_hold_id=null,completed_at=now_at,proof_sha256=p_proof_sha256,updated_at=now_at where id=r.id;
  return query select 'completed',r.id,r.memory_item_id,r.care_space_id,r.child_id,'completed'::text,embedding_count,link_count;
end;
$$;

create function public.enqueue_expired_memory_deletions(p_cutoff_at timestamptz, p_limit integer default 100)
returns table(request_id uuid, memory_item_id uuid)
language plpgsql security definer set search_path = '' as $$
declare i record; rid uuid; now_at timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_cutoff_at is null or p_cutoff_at>now_at or p_limit not between 1 and 1000 then return; end if;
  for i in select m.* from public.clinical_memory_items m where m.lifecycle in ('active','superseded') and m.valid_until is not null and m.valid_until<=p_cutoff_at order by m.valid_until,m.id limit p_limit for update skip locked loop
    rid:=extensions.gen_random_uuid();
    begin
      update public.clinical_memory_items set lifecycle='deleted',retrieval_eligibility='ineligible',updated_at=now_at where id=i.id and care_space_id=i.care_space_id and child_id=i.child_id;
      insert into public.clinical_memory_deletion_requests(id,care_space_id,child_id,memory_item_id,requested_by,request_kind,idempotency_key,request_sha256,status,requested_at,updated_at)
      values(rid,i.care_space_id,i.child_id,i.id,null,case when i.lifecycle='superseded' then 'superseded_cleanup' else 'retention_expiry' end,'system:'||i.id::text,
        pg_catalog.encode(extensions.digest(pg_catalog.convert_to(i.id::text||':'||p_cutoff_at::text,'UTF8'),'sha256'),'hex'),'pending',now_at,now_at);
      return query select rid,i.id;
    exception when unique_violation then null; end;
  end loop;
end;
$$;

revoke all on function public.request_memory_deletion(uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text) from public,anon;
grant execute on function public.request_memory_deletion(uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text) to authenticated;
revoke all on function public.execute_memory_deletion(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.execute_memory_deletion(uuid,uuid,uuid,uuid,text) to service_role;
revoke all on function public.enqueue_expired_memory_deletions(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.enqueue_expired_memory_deletions(timestamptz,integer) to service_role;
