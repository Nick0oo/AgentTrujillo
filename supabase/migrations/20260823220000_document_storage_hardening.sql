-- Reserve one immutable, private, child-scoped object identity before issuing an upload ticket.

alter table public.documents
  add column purpose text,
  add column declared_mime_type text,
  add column expected_size_bytes bigint,
  add column expected_sha256 text,
  add column retention_class text,
  add column storage_status text,
  add column reservation_nonce_sha256 text,
  add column reservation_idempotency_key text,
  add column reservation_request_sha256 text,
  add column reserved_at timestamptz,
  add column reservation_expires_at timestamptz,
  add column reservation_cancelled_at timestamptz;

update public.documents
set purpose = case bucket_id
    when 'avatars' then 'avatar'
    when 'vaccine-documents' then 'vaccine_record'
    when 'clinical-attachments' then 'clinical_attachment'
    when 'generated-reports' then 'generated_report'
    when 'clinical-sources' then 'clinical_source'
  end,
  declared_mime_type = detected_mime_type,
  expected_size_bytes = size_bytes,
  expected_sha256 = sha256,
  retention_class = case bucket_id
    when 'generated-reports' then 'generated_artifact'
    when 'clinical-sources' then 'clinical_source'
    else 'child_record'
  end,
  storage_status = case
    when deleted_at is not null then 'deleted'
    when processing_status in ('clean','extracted') then 'active'
    when processing_status = 'rejected' then 'quarantined'
    when processing_status = 'failed' then 'failed'
    else 'uploaded'
  end,
  reservation_nonce_sha256 = encode(extensions.digest(convert_to('legacy-nonce:' || id::text,'UTF8'),'sha256'),'hex'),
  reservation_idempotency_key = 'legacy:' || id::text,
  reservation_request_sha256 = encode(extensions.digest(convert_to('legacy-request:' || id::text,'UTF8'),'sha256'),'hex'),
  reserved_at = created_at,
  reservation_expires_at = created_at + interval '5 minutes';

alter table public.documents
  alter column purpose set not null,
  alter column declared_mime_type set not null,
  alter column expected_size_bytes set not null,
  alter column expected_sha256 set not null,
  alter column retention_class set not null,
  alter column storage_status set not null,
  alter column reservation_nonce_sha256 set not null,
  alter column reservation_idempotency_key set not null,
  alter column reservation_request_sha256 set not null,
  alter column reserved_at set not null,
  alter column reservation_expires_at set not null,
  alter column detected_mime_type drop not null,
  add constraint documents_purpose_check check (purpose in ('avatar','vaccine_record','clinical_attachment','generated_report','clinical_source')),
  add constraint documents_declared_mime_check check (declared_mime_type ~ '^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$'),
  add constraint documents_expected_size_check check (expected_size_bytes between 1 and 52428800),
  add constraint documents_expected_sha_check check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint documents_retention_class_check check (retention_class in ('ephemeral_upload','child_record','generated_artifact','clinical_source')),
  add constraint documents_storage_status_check check (storage_status in ('reserved','uploaded','processing','active','quarantined','failed','deleted')),
  add constraint documents_reservation_nonce_check check (reservation_nonce_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint documents_reservation_key_check check (reservation_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  add constraint documents_reservation_request_check check (reservation_request_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint documents_reservation_window_check check (reservation_expires_at > reserved_at and reservation_expires_at <= reserved_at + interval '5 minutes'),
  add constraint documents_cancel_state_check check (reservation_cancelled_at is null or storage_status in ('failed','deleted')),
  add constraint documents_private_bucket_purpose_check check (
    (purpose='avatar' and bucket_id='avatars') or
    (purpose='vaccine_record' and bucket_id='vaccine-documents') or
    (purpose='clinical_attachment' and bucket_id='clinical-attachments') or
    (purpose='generated_report' and bucket_id='generated-reports') or
    (purpose='clinical_source' and bucket_id='clinical-sources')),
  add constraint documents_reserved_path_check check (
    child_id is null or object_path = care_space_id::text || '/' || child_id::text || '/' || id::text || '/v1');

create unique index documents_reservation_replay_idx
  on public.documents(care_space_id, child_id, uploaded_by, reservation_idempotency_key);
create index documents_storage_scope_status_idx
  on public.documents(care_space_id, child_id, storage_status, id)
  where deleted_at is null;

create function app_private.reject_document_storage_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(new.id,new.care_space_id,new.child_id,new.bucket_id,new.object_path,new.purpose,new.declared_mime_type,
      new.expected_size_bytes,new.expected_sha256,new.retention_class,new.reservation_nonce_sha256,
      new.reservation_idempotency_key,new.reservation_request_sha256,new.uploaded_by,new.reserved_at,new.reservation_expires_at)
    is distinct from
    row(old.id,old.care_space_id,old.child_id,old.bucket_id,old.object_path,old.purpose,old.declared_mime_type,
      old.expected_size_bytes,old.expected_sha256,old.retention_class,old.reservation_nonce_sha256,
      old.reservation_idempotency_key,old.reservation_request_sha256,old.uploaded_by,old.reserved_at,old.reservation_expires_at)
  then
    raise check_violation using message = 'document storage identity is immutable';
  end if;
  return new;
end;
$$;

revoke all on function app_private.reject_document_storage_identity_change() from public, anon, authenticated;
create trigger documents_immutable_storage_identity
before update on public.documents
for each row execute function app_private.reject_document_storage_identity_change();

create function public.reserve_document_object(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_cutoff_at timestamptz,
  p_purpose text,
  p_display_name text,
  p_declared_mime_type text,
  p_expected_size_bytes bigint,
  p_expected_sha256 text,
  p_retention_class text,
  p_idempotency_key text,
  p_request_sha256 text
)
returns table (
  outcome text,
  document_id uuid,
  bucket_id text,
  object_path text,
  storage_status text,
  reservation_nonce_sha256 text,
  expected_size_bytes bigint,
  declared_mime_type text,
  expected_sha256 text,
  reservation_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  actor uuid := (select auth.uid());
  target_bucket text;
  target_id uuid;
  existing public.documents%rowtype;
  current_time timestamptz := pg_catalog.clock_timestamp();
begin
  if actor is null or p_care_space_id is null or p_child_id is null or p_session_id is null
    or p_authorization_version is null or p_cutoff_at is null or p_cutoff_at > current_time
    or p_cutoff_at < current_time - interval '5 minutes'
  then return; end if;

  if not exists (
    select 1
    from public.agent_sessions s
    join public.children child on child.care_space_id=s.care_space_id and child.id=s.child_id
    join public.care_spaces space on space.id=s.care_space_id
    join public.care_space_members member on member.care_space_id=s.care_space_id and member.user_id=actor
    join public.child_access access on access.care_space_id=s.care_space_id and access.child_id=s.child_id and access.user_id=actor
    where s.id=p_session_id and s.owner_user_id=actor and s.care_space_id=p_care_space_id and s.child_id=p_child_id
      and s.authorization_version=p_authorization_version and s.status='active' and s.authorization_expires_at>current_time
      and child.status='active' and space.status='active'
      and member.status='active' and member.revoked_at is null and member.valid_from<=current_time
      and (member.valid_until is null or member.valid_until>current_time)
      and access.status='active' and access.revoked_at is null and access.valid_from<=current_time
      and (access.valid_until is null or access.valid_until>current_time)
      and 'manage_documents'=any(access.permissions)
      and p_authorization_version=pg_catalog.format('m:%s:a:%s',member.authorization_version,access.authorization_version)
      and (member.valid_until is null or s.authorization_expires_at<=member.valid_until)
      and (access.valid_until is null or s.authorization_expires_at<=access.valid_until)
  ) then return; end if;

  if p_purpose='avatar' then target_bucket := 'avatars';
  elsif p_purpose='vaccine_record' then target_bucket := 'vaccine-documents';
  elsif p_purpose='clinical_attachment' then target_bucket := 'clinical-attachments';
  else
    return query select 'invalid',null::uuid,null::text,null::text,null::text,null::text,null::bigint,null::text,null::text,null::timestamptz;
    return;
  end if;

  if p_display_name is null or pg_catalog.length(p_display_name) not between 1 and 256
    or p_display_name like '%/%' or p_display_name like '%\%' or p_display_name like '%..%'
    or p_display_name ~ '[[:cntrl:]]'
    or p_declared_mime_type not in ('application/pdf','image/jpeg','image/png')
    or (p_purpose='avatar' and p_declared_mime_type not in ('image/jpeg','image/png'))
    or (p_purpose='vaccine_record' and p_declared_mime_type='image/png' and lower(p_display_name) !~ '\.png$')
    or (p_declared_mime_type='application/pdf' and lower(p_display_name) !~ '\.pdf$')
    or (p_declared_mime_type='image/jpeg' and lower(p_display_name) !~ '\.(jpg|jpeg)$')
    or p_expected_size_bytes is null or p_expected_size_bytes < 1
    or p_expected_size_bytes > (case when p_purpose='avatar' then 5000000 else 10000000 end)
    or p_expected_sha256 !~ '^[0-9a-f]{64}$'
    or p_retention_class <> 'child_record'
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
  then
    return query select 'invalid',null::uuid,null::text,null::text,null::text,null::text,null::bigint,null::text,null::text,null::timestamptz;
    return;
  end if;

  select d.* into existing
  from public.documents d
  where d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.uploaded_by=actor
    and d.reservation_idempotency_key=p_idempotency_key
  for update;
  if found then
    return query select
      case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end,
      existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.reservation_nonce_sha256,
      existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
    return;
  end if;

  target_id := gen_random_uuid();
  insert into public.documents(
    id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,
    detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,
    storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,
    reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
  values(
    target_id,p_care_space_id,p_child_id,target_bucket,
    p_care_space_id::text||'/'||p_child_id::text||'/'||target_id::text||'/v1',p_purpose,p_display_name,p_declared_mime_type,
    null,p_expected_size_bytes,p_expected_size_bytes,p_expected_sha256,p_expected_sha256,p_purpose,p_retention_class,
    'reserved','pending',encode(extensions.digest(convert_to(gen_random_uuid()::text,'UTF8'),'sha256'),'hex'),p_idempotency_key,
    p_request_sha256,current_time,current_time+interval '5 minutes',(current_time+interval '10 years')::date,'guardian',actor)
  returning * into existing;

  return query select 'created',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,
    existing.reservation_nonce_sha256,existing.expected_size_bytes,existing.declared_mime_type,
    existing.expected_sha256,existing.reservation_expires_at;
exception when unique_violation then
  select d.* into existing from public.documents d
  where d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.uploaded_by=actor
    and d.reservation_idempotency_key=p_idempotency_key;
  if found then
    return query select
      case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end,
      existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.reservation_nonce_sha256,
      existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
  end if;
end;
$$;

revoke all on function public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)
  from public, anon;
grant execute on function public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)
  to authenticated;

revoke insert, update, delete on public.documents from authenticated;
revoke insert, update, delete on storage.objects from authenticated;
