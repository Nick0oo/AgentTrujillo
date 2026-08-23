-- Store only verified, digest-bound document callbacks and their bounded processing result.

alter table public.documents
  add constraint documents_scope_id_unique unique (care_space_id, child_id, id);

create table public.document_callback_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  provider_event_id text not null check (length(provider_event_id) between 1 and 256),
  care_space_id uuid not null,
  child_id uuid not null,
  document_id uuid not null,
  event_type text not null check (event_type in ('upload_completed','scan_completed','extraction_completed','processing_failed')),
  signature_key_id text not null check (length(signature_key_id) between 1 and 128),
  raw_body_sha256 text not null check (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  observed_bucket_id text not null check (observed_bucket_id in ('avatars','vaccine-documents','clinical-attachments','generated-reports','clinical-sources')),
  observed_object_path text not null check (length(observed_object_path) between 1 and 512 and left(observed_object_path,1)<>'/' and observed_object_path !~ '(^|/)\.\.?(/|$)'),
  observed_size_bytes bigint not null check (observed_size_bytes between 1 and 52428800),
  observed_mime_type text not null check (length(observed_mime_type) between 1 and 128),
  observed_sha256 text not null check (observed_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  status text not null check (status in ('verified','processing','processed','rejected')),
  scan_result text check (scan_result is null or scan_result in ('pending','clean','infected','failed')),
  result_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(result_metadata)='object' and pg_column_size(result_metadata)<=8192),
  processed_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  created_at timestamptz not null default now(),
  constraint document_callback_document_scope_fk foreign key (care_space_id, child_id, document_id)
    references public.documents(care_space_id, child_id, id) on delete restrict,
  constraint document_callback_provider_event_unique unique (provider, provider_event_id),
  constraint document_callback_time_order check (received_at >= occurred_at - interval '1 minute'),
  constraint document_callback_result_state check (
    (status in ('verified','processing') and processed_at is null) or
    (status in ('processed','rejected') and processed_at is not null))
);

alter table public.document_callback_events enable row level security;
alter table public.document_callback_events force row level security;

create index document_callback_pending_idx
  on public.document_callback_events(status, received_at, id)
  where status in ('verified','processing');
create index document_callback_scope_idx
  on public.document_callback_events(care_space_id, child_id, document_id, occurred_at desc);

create function app_private.reject_document_callback_identity_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if row(new.id,new.provider,new.provider_event_id,new.care_space_id,new.child_id,new.document_id,new.event_type,
    new.signature_key_id,new.raw_body_sha256,new.observed_bucket_id,new.observed_object_path,
    new.observed_size_bytes,new.observed_mime_type,new.observed_sha256,new.occurred_at,new.received_at)
    is distinct from
    row(old.id,old.provider,old.provider_event_id,old.care_space_id,old.child_id,old.document_id,old.event_type,
    old.signature_key_id,old.raw_body_sha256,old.observed_bucket_id,old.observed_object_path,
    old.observed_size_bytes,old.observed_mime_type,old.observed_sha256,old.occurred_at,old.received_at)
  then raise check_violation using message='document callback identity is immutable'; end if;
  return new;
end $$;

revoke all on function app_private.reject_document_callback_identity_change() from public,anon,authenticated;
create trigger document_callback_identity_immutable before update on public.document_callback_events
for each row execute function app_private.reject_document_callback_identity_change();

revoke all on table public.document_callback_events from public,anon,authenticated;
grant select,insert,update on table public.document_callback_events to service_role;
