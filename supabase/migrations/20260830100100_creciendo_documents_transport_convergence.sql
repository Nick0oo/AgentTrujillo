-- Converges local installations that applied the first AT-11-21 draft.
-- This is forward-only and intentionally does not reset, delete, or rewrite document rows.

do $$
begin
  if to_regclass('public.document_transfer_tickets') is not null
    and to_regclass('app_private.document_transfer_tickets') is null then
    alter table public.document_transfer_tickets set schema app_private;
  end if;
end;
$$;

alter table if exists app_private.document_transfer_tickets
  add column if not exists idempotency_key text;

update app_private.document_transfer_tickets
set idempotency_key = 'legacy-' || id::text
where idempotency_key is null;

alter table app_private.document_transfer_tickets
  alter column idempotency_key set not null;

create unique index if not exists document_transfer_ticket_idempotency_idx
  on app_private.document_transfer_tickets(guardian_id, document_id, kind, idempotency_key);

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
  if found then return query select case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end,existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at; return; end if;
  target_id:=gen_random_uuid();
  insert into public.documents(id,care_space_id,child_id,bucket_id,object_path,document_type,original_filename,declared_mime_type,detected_mime_type,size_bytes,expected_size_bytes,sha256,expected_sha256,purpose,retention_class,storage_status,processing_status,reservation_nonce_sha256,reservation_idempotency_key,reservation_request_sha256,reserved_at,reservation_expires_at,retention_until,provenance_type,uploaded_by)
  values(target_id,p_care_space_id,p_child_id,target_bucket,p_care_space_id::text||'/'||p_child_id::text||'/'||target_id::text||'/v1',p_purpose,p_display_name,p_declared_mime_type,null,p_expected_size_bytes,p_expected_size_bytes,p_expected_sha256,p_expected_sha256,p_purpose,p_retention_class,'reserved','pending',encode(extensions.digest(convert_to(gen_random_uuid()::text,'UTF8'),'sha256'),'hex'),p_idempotency_key,p_request_sha256,now_at,now_at+interval '5 minutes',(now_at+interval '10 years')::date,'guardian',actor) returning * into existing;
  return query select 'created',existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at;
exception when unique_violation then
  select d.* into existing from public.documents d where d.care_space_id=p_care_space_id and d.child_id=p_child_id and d.uploaded_by=actor and d.reservation_idempotency_key=p_idempotency_key;
  if found then return query select case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end,existing.id,existing.bucket_id,existing.object_path,existing.storage_status,existing.expected_size_bytes,existing.declared_mime_type,existing.expected_sha256,existing.reservation_expires_at; end if;
end;
$$;

create or replace function public.register_creciendo_document_transfer_ticket(
  p_kind text,p_document_id uuid,p_care_space_id uuid,p_child_id uuid,p_token_sha256 text,p_nonce_sha256 text,
  p_expires_at timestamptz,p_expected_size_bytes bigint,p_expected_mime_type text,p_expected_sha256 text,p_idempotency_key text)
returns table (outcome text,ticket_id uuid,nonce_sha256 text)
language plpgsql volatile security definer set search_path = '' set statement_timeout = '3s'
as $$
declare actor uuid := (select auth.uid()); existing app_private.document_transfer_tickets%rowtype; created app_private.document_transfer_tickets%rowtype;
begin
  if actor is null or p_kind not in ('upload','download') or p_token_sha256 !~ '^[0-9a-f]{64}$' or p_nonce_sha256 !~ '^[0-9a-f]{64}$' or p_expires_at <= pg_catalog.clock_timestamp() or p_expires_at > pg_catalog.clock_timestamp()+interval '5 minutes' or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' or not app_private.has_child_permission(p_care_space_id,p_child_id,case when p_kind='upload' then 'manage_documents' else 'read' end) then return; end if;
  if p_kind='upload' and (p_expected_size_bytes is null or p_expected_size_bytes not between 1 and 52428800 or p_expected_mime_type is null or p_expected_sha256 !~ '^[0-9a-f]{64}$') then return; end if;
  if p_kind='download' and (p_expected_size_bytes is not null or p_expected_mime_type is not null or p_expected_sha256 is not null) then return; end if;
  if not exists(select 1 from public.documents d where d.id=p_document_id and d.care_space_id=p_care_space_id and d.child_id=p_child_id and (p_kind='download' or d.uploaded_by=actor)) then return; end if;
  select * into existing from app_private.document_transfer_tickets t where t.guardian_id=actor and t.document_id=p_document_id and t.kind=p_kind and t.idempotency_key=p_idempotency_key for update;
  if found then return query select case when existing.token_sha256=p_token_sha256 then 'replay' else 'conflict' end,existing.id,existing.nonce_sha256; return; end if;
  insert into app_private.document_transfer_tickets(id,kind,document_id,care_space_id,child_id,guardian_id,token_sha256,nonce_sha256,expires_at,expected_size_bytes,expected_mime_type,expected_sha256,idempotency_key) values(gen_random_uuid(),p_kind,p_document_id,p_care_space_id,p_child_id,actor,p_token_sha256,p_nonce_sha256,p_expires_at,p_expected_size_bytes,p_expected_mime_type,p_expected_sha256,p_idempotency_key) returning * into created;
  return query select 'created',created.id,created.nonce_sha256;
exception when unique_violation then
  select * into existing from app_private.document_transfer_tickets t where t.guardian_id=actor and t.document_id=p_document_id and t.kind=p_kind and t.idempotency_key=p_idempotency_key;
  if found and existing.token_sha256=p_token_sha256 then return query select 'replay',existing.id,existing.nonce_sha256; end if;
end;
$$;

create or replace function public.get_creciendo_upload_ticket(p_token_sha256 text)
returns table(ticket_id uuid,document_id uuid,care_space_id uuid,child_id uuid,expires_at timestamptz,used_at timestamptz,expected_size_bytes bigint,expected_mime_type text,expected_sha256 text,bucket_id text,object_path text,storage_status text)
language sql stable security definer set search_path = ''
as $$ select t.id,t.document_id,t.care_space_id,t.child_id,t.expires_at,t.used_at,t.expected_size_bytes,t.expected_mime_type,t.expected_sha256,d.bucket_id,d.object_path,d.storage_status from app_private.document_transfer_tickets t join public.documents d on d.id=t.document_id and d.care_space_id=t.care_space_id and d.child_id=t.child_id where t.kind='upload' and t.token_sha256=p_token_sha256 and t.guardian_id=(select auth.uid()) and app_private.has_child_permission(t.care_space_id,t.child_id,'manage_documents'); $$;

create or replace function public.finalize_creciendo_document_upload(p_token_sha256 text,p_actual_size_bytes bigint,p_actual_sha256 text,p_detected_mime_type text)
returns table(outcome text,document_id uuid)
language plpgsql volatile security definer set search_path = '' set statement_timeout = '3s'
as $$
declare actor uuid := (select auth.uid()); ticket app_private.document_transfer_tickets%rowtype;
begin
  select t.* into ticket from app_private.document_transfer_tickets t where t.kind='upload' and t.token_sha256=p_token_sha256 and t.guardian_id=actor for update;
  if not found then return query select 'invalid',null::uuid; return; end if;
  if ticket.used_at is not null then if exists(select 1 from public.documents d where d.id=ticket.document_id and d.storage_status in ('uploaded','processing','active') and d.size_bytes=p_actual_size_bytes and d.sha256=p_actual_sha256) then return query select 'uploaded',ticket.document_id; else return query select 'invalid',null::uuid; end if; return; end if;
  if ticket.expires_at<=pg_catalog.clock_timestamp() or ticket.expected_size_bytes<>p_actual_size_bytes or ticket.expected_sha256<>p_actual_sha256 or ticket.expected_mime_type<>p_detected_mime_type then return query select 'invalid',null::uuid; return; end if;
  update public.documents set storage_status='uploaded',processing_status='pending',detected_mime_type=p_detected_mime_type,size_bytes=p_actual_size_bytes,sha256=p_actual_sha256,updated_at=pg_catalog.clock_timestamp() where id=ticket.document_id and care_space_id=ticket.care_space_id and child_id=ticket.child_id and storage_status='reserved' and deleted_at is null;
  if not found then return query select 'invalid',null::uuid; return; end if;
  update app_private.document_transfer_tickets set used_at=pg_catalog.clock_timestamp() where id=ticket.id;
  return query select 'uploaded',ticket.document_id;
end;
$$;

revoke all on function public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text) from public,anon;
grant execute on function public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text) to authenticated;
revoke all on function public.register_creciendo_document_transfer_ticket(text,uuid,uuid,uuid,text,text,timestamptz,bigint,text,text,text) from public,anon;
grant execute on function public.register_creciendo_document_transfer_ticket(text,uuid,uuid,uuid,text,text,timestamptz,bigint,text,text,text) to authenticated;
revoke all on function public.get_creciendo_upload_ticket(text) from public,anon;
grant execute on function public.get_creciendo_upload_ticket(text) to authenticated;
revoke all on function public.finalize_creciendo_document_upload(text,bigint,text,text) from public,anon;
grant execute on function public.finalize_creciendo_document_upload(text,bigint,text,text) to authenticated;
