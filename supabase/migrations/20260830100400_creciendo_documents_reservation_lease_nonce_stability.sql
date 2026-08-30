-- Renew only the lease timestamps; the reservation nonce remains immutable.

create or replace function public.reserve_creciendo_document_object(
  p_care_space_id uuid, p_child_id uuid, p_authorization_version text, p_purpose text,
  p_display_name text, p_declared_mime_type text, p_expected_size_bytes bigint,
  p_expected_sha256 text, p_retention_class text, p_idempotency_key text, p_request_sha256 text)
returns table (outcome text, document_id uuid, bucket_id text, object_path text, storage_status text,
  expected_size_bytes bigint, declared_mime_type text, expected_sha256 text, reservation_expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' set statement_timeout = '3s'
as $$
declare actor uuid := (select auth.uid()); target_bucket text; target_id uuid; existing public.documents%rowtype; now_at timestamptz := pg_catalog.clock_timestamp();
begin
  if actor is null or p_care_space_id is null or p_child_id is null or p_authorization_version !~ '^m:[1-9][0-9]*:a:[1-9][0-9]*$' then return; end if;
  if not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_documents') then return; end if;
  if not exists (select 1 from public.care_space_members member where member.care_space_id=p_care_space_id and member.user_id=actor and member.status='active' and member.revoked_at is null and p_authorization_version=pg_catalog.format('m:%s:a:%s',member.authorization_version,(select access.authorization_version from public.child_access access where access.care_space_id=p_care_space_id and access.child_id=p_child_id and access.user_id=actor and access.status='active' and access.revoked_at is null limit 1))) then return; end if;
  if p_purpose='avatar' then target_bucket:='avatars'; elsif p_purpose='vaccine_record' then target_bucket:='vaccine-documents'; elsif p_purpose='clinical_attachment' then target_bucket:='clinical-attachments'; else return query select 'invalid',null::uuid,null::text,null::text,null::text,null::bigint,null::text,null::text,null::timestamptz; return; end if;
  if p_display_name is null or pg_catalog.length(p_display_name) not between 1 and 256 or p_display_name like '%/%' or p_display_name like '%\%' or p_display_name like '%..%' or p_display_name ~ '[[:cntrl:]]' or p_declared_mime_type not in ('application/pdf','image/jpeg','image/png') or (p_purpose='avatar' and p_declared_mime_type not in ('image/jpeg','image/png')) or p_expected_size_bytes is null or p_expected_size_bytes < 1 or p_expected_size_bytes > (case when p_purpose='avatar' then 5000000 else 10000000 end) or p_expected_sha256 !~ '^[0-9a-f]{64}$' or p_retention_class <> 'child_record' or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' or p_request_sha256 !~ '^[0-9a-f]{64}$' then return query select 'invalid',null::uuid,null::text,null::text,null::text,null::bigint,null::text,null::text,null::timestamptz; return; end if;
  select d.* into existing from public.documents d where d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.uploaded_by=actor and d.reservation_idempotency_key=p_idempotency_key for update;
  if found then
    if existing.reservation_request_sha256 <> p_request_sha256 then
      return query select 'conflict',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
    elsif existing.storage_status = 'reserved' and existing.reservation_expires_at <= now_at then
      update public.documents set reserved_at=now_at, reservation_expires_at=now_at+interval '5 minutes' where id=existing.id;
      select d.* into existing from public.documents d where d.id=existing.id;
      return query select 'recovered',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
    else
      return query select 'idempotent_replay',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
    end if;
    return;
  end if;
  target_id:=gen_random_uuid();
  insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
  values(target_id,p_care_space_id,p_child_id,target_bucket,p_care_space_id::text||'/'||p_child_id::text||'/'||target_id::text||'/v1',p_purpose,p_display_name,p_declared_mime_type,null,p_expected_size_bytes,p_expected_size_bytes,p_expected_sha256,p_expected_sha256,p_purpose,p_retention_class,'reserved','pending',encode(extensions.digest(convert_to(gen_random_uuid()::text,'UTF8'),'sha256'),'hex'),p_idempotency_key,p_request_sha256,now_at,now_at+interval '5 minutes',(now_at+interval '10 years')::date,'guardian',actor) returning * into existing;
  return query select 'created',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
exception when unique_violation then
  select d.* into existing from public.documents d where d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.uploaded_by=actor and d.reservation_idempotency_key=p_idempotency_key;
  if found then return query select case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end,existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at; end if;
end;
$$;

revoke all on function public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text) from public,anon;
grant execute on function public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text) to authenticated;
