-- Agent persistence, private documents, medication reminders, commerce and audit.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid,
  bucket_id text not null check (bucket_id in ('avatars', 'vaccine-documents', 'clinical-attachments', 'generated-reports', 'clinical-sources')),
  object_path text not null check (object_path <> '' and object_path !~ '(^|/)\.\.(/|$)' and left(object_path, 1) <> '/'),
  document_type text not null,
  original_filename text,
  detected_mime_type text not null,
  size_bytes bigint not null check (size_bytes between 0 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'pending' check (processing_status in ('pending', 'clean', 'rejected', 'extracted', 'failed')),
  extraction_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_metadata) = 'object'),
  retention_until date,
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'generated', 'chat')),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint documents_object_unique unique (bucket_id, object_path)
);

create table public.document_links (
  document_id uuid not null references public.documents(id) on delete cascade,
  resource_type text not null check (resource_type in ('vaccine_administration', 'development_observation', 'clinical_memory', 'growth_measurement', 'medication_plan', 'generated_report')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (document_id, resource_type, resource_id)
);

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  owner_user_id uuid not null,
  eve_session_id text unique,
  channel text not null check (channel in ('creciendo_mobile', 'operator_cli', 'evaluation')),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'archived')),
  initial_model text not null,
  initial_configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(initial_configuration) = 'object'),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_sessions_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  agent_session_id uuid not null references public.agent_sessions(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  actor_type text not null check (actor_type in ('guardian', 'agent', 'tool', 'system')),
  actor_user_id uuid,
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  status text not null default 'completed' check (status in ('streaming', 'completed', 'cancelled', 'failed', 'redacted')),
  provider_message_id text,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint messages_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint messages_sequence_unique unique (agent_session_id, sequence)
);

create table public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  agent_session_id uuid not null references public.agent_sessions(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  tool_name text not null,
  tool_version text not null,
  authorization_scope jsonb not null check (jsonb_typeof(authorization_scope) = 'object'),
  redacted_input jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_input) = 'object'),
  confirmation_status text not null check (confirmation_status in ('not_required', 'pending', 'confirmed', 'declined')),
  execution_status text not null check (execution_status in ('requested', 'running', 'succeeded', 'failed', 'blocked')),
  redacted_result jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_result) = 'object'),
  idempotency_key text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tool_executions_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint tool_executions_idempotent unique (care_space_id, idempotency_key)
);

create table public.safety_evaluations (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  agent_session_id uuid references public.agent_sessions(id) on delete set null,
  request_id text not null,
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  decision text not null check (decision in ('urgent', 'not_urgent', 'indeterminate')),
  response_mode text not null check (response_mode in ('emergency_recommendation', 'continue', 'abstain')),
  matched_rule_codes text[] not null default '{}',
  approved_copy_key text,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint safety_evaluations_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint safety_evaluations_request_unique unique (care_space_id, request_id),
  constraint safety_evaluations_urgent_mode check (
    (decision = 'urgent' and response_mode = 'emergency_recommendation')
    or decision <> 'urgent'
  )
);

create table public.clinical_memory_items (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  memory_type text not null check (memory_type in ('symptom', 'history', 'allergy', 'medication', 'vaccine', 'measurement', 'development', 'preference', 'summary')),
  structured_content jsonb not null check (jsonb_typeof(structured_content) = 'object'),
  searchable_text text not null,
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat', 'system')),
  source_session_id uuid references public.agent_sessions(id) on delete set null,
  source_message_id uuid references public.messages(id) on delete set null,
  confirmation_status text not null default 'candidate' check (confirmation_status in ('candidate', 'confirmed', 'rejected', 'superseded')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_memory_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint clinical_memory_validity check (valid_until is null or valid_until > valid_from)
);

create table public.clinical_memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  memory_item_id uuid not null references public.clinical_memory_items(id) on delete cascade,
  embedding_model text not null,
  embedding_dimensions smallint not null default 768 check (embedding_dimensions = 768),
  embedding extensions.vector(768) not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint clinical_memory_embedding_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint clinical_memory_embedding_unique unique (memory_item_id, embedding_model)
);

create table public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  agent_session_id uuid not null references public.agent_sessions(id) on delete cascade,
  generator_version text not null,
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  source_message_ids uuid[] not null,
  created_at timestamptz not null default now(),
  constraint conversation_summary_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.device_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.guardian_profiles(user_id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  expo_push_token text not null unique,
  device_identifier_hash text not null,
  locale text not null,
  time_zone text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'invalid')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medication_reminders (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  medication_plan_id uuid not null references public.medication_plans(id) on delete cascade,
  medication_schedule_id uuid references public.medication_schedules(id) on delete cascade,
  next_delivery_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medication_reminders_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  device_installation_id uuid not null references public.device_installations(id) on delete cascade,
  medication_reminder_id uuid references public.medication_reminders(id) on delete cascade,
  notification_type text not null check (notification_type = 'medication_reminder'),
  provider_message_id text,
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'cancelled')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  failure_code text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_unique unique (provider, provider_customer_id),
  constraint billing_customers_space_provider unique (care_space_id, provider)
);

create table public.billing_products (
  id uuid primary key default gen_random_uuid(),
  internal_plan_code text not null,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_product_id text not null,
  provider_price_id text,
  capability_set jsonb not null check (jsonb_typeof(capability_set) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint billing_products_unique unique (provider, provider_product_id, provider_price_id)
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_redacted jsonb not null check (jsonb_typeof(payload_redacted) = 'object'),
  signature_verified boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  failure_code text,
  constraint billing_events_unique unique (provider, provider_event_id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  billing_product_id uuid not null references public.billing_products(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_purchase_id text not null,
  status text not null check (status in ('pending', 'active', 'grace_period', 'paused', 'cancelled', 'expired', 'refunded')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  verified_at timestamptz,
  source_event_id uuid references public.billing_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_unique unique (provider, provider_purchase_id)
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  capability text not null,
  status text not null check (status in ('active', 'inactive', 'grace_period')),
  source_provider text not null check (source_provider in ('free', 'stripe', 'apple', 'google', 'manual')),
  source_purchase_id uuid references public.purchases(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_unique unique (care_space_id, capability, starts_at),
  constraint entitlements_dates check (ends_at is null or ends_at > starts_at)
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  child_id uuid,
  capability text not null,
  quantity numeric(12,4) not null check (quantity > 0),
  occurred_at timestamptz not null default now(),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint usage_ledger_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint usage_ledger_idempotent unique (care_space_id, idempotency_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('guardian', 'agent', 'system', 'operator', 'webhook')),
  actor_user_id uuid,
  care_space_id uuid,
  child_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text not null,
  outcome text not null check (outcome in ('allowed', 'denied', 'succeeded', 'failed')),
  policy_code text,
  metadata_redacted jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_redacted) = 'object'),
  constraint audit_events_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create index documents_scope_idx on public.documents(care_space_id, child_id, created_at desc) where deleted_at is null;
create index agent_sessions_owner_idx on public.agent_sessions(owner_user_id, updated_at desc);
create index agent_sessions_child_idx on public.agent_sessions(child_id, updated_at desc);
create index messages_session_sequence_idx on public.messages(agent_session_id, sequence);
create index tool_executions_session_idx on public.tool_executions(agent_session_id, started_at desc);
create index safety_evaluations_child_time_idx on public.safety_evaluations(child_id, evaluated_at desc);
create index clinical_memory_items_child_idx on public.clinical_memory_items(child_id, confirmation_status, valid_from desc);
create index clinical_memory_embeddings_scope_idx on public.clinical_memory_embeddings(care_space_id, child_id);
create index clinical_memory_embeddings_hnsw_idx on public.clinical_memory_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
create index medication_reminders_due_idx on public.medication_reminders(next_delivery_at) where status = 'active';
create index billing_events_processing_idx on public.billing_events(processing_status, received_at);
create index purchases_space_status_idx on public.purchases(care_space_id, status, current_period_end);
create index entitlements_space_status_idx on public.entitlements(care_space_id, capability, status, ends_at);
create index usage_ledger_space_time_idx on public.usage_ledger(care_space_id, occurred_at desc);
create index audit_events_scope_time_idx on public.audit_events(care_space_id, child_id, occurred_at desc);
create index audit_events_request_idx on public.audit_events(request_id);

create or replace function app_private.prevent_agent_session_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.care_space_id <> old.care_space_id
    or new.child_id <> old.child_id
    or new.owner_user_id <> old.owner_user_id then
    raise exception using errcode = '42501', message = 'agent session scope is immutable';
  end if;
  return new;
end;
$$;

create trigger agent_sessions_immutable_scope
before update on public.agent_sessions
for each row execute function app_private.prevent_agent_session_scope_change();

create or replace function public.match_clinical_memory(
  p_child_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count integer default 8,
  p_match_threshold double precision default 0.65
)
returns table (
  memory_item_id uuid,
  memory_type text,
  structured_content jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.memory_type,
    m.structured_content,
    1 - (e.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.clinical_memory_embeddings e
  join public.clinical_memory_items m
    on m.id = e.memory_item_id
    and m.care_space_id = e.care_space_id
    and m.child_id = e.child_id
  where e.child_id = p_child_id
    and app_private.has_child_permission(e.care_space_id, e.child_id, 'read')
    and m.confirmation_status in ('candidate', 'confirmed')
    and m.valid_from <= now()
    and (m.valid_until is null or m.valid_until > now())
    and 1 - (e.embedding operator(extensions.<=>) p_query_embedding) >= p_match_threshold
  order by e.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

revoke all on function public.match_clinical_memory(uuid, extensions.vector, integer, double precision) from public, anon;
grant execute on function public.match_clinical_memory(uuid, extensions.vector, integer, double precision) to authenticated;

create or replace function app_private.can_access_storage_object(target_bucket_id text, target_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.bucket_id = target_bucket_id
      and d.object_path = target_object_path
      and d.deleted_at is null
      and (
        (d.bucket_id = 'avatars' and d.uploaded_by = (select auth.uid()))
        or (d.child_id is not null and app_private.has_child_permission(d.care_space_id, d.child_id, 'read'))
        or (d.child_id is null and app_private.has_space_access(d.care_space_id))
      )
  );
$$;

revoke all on function app_private.can_access_storage_object(text, text) from public;
grant execute on function app_private.can_access_storage_object(text, text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'documents', 'agent_sessions', 'messages', 'tool_executions', 'safety_evaluations',
    'clinical_memory_items', 'clinical_memory_embeddings', 'conversation_summaries',
    'medication_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.has_child_permission(care_space_id, child_id, ''read''))',
      table_name || '_child_select',
      table_name
    );
  end loop;
end;
$$;

alter table public.document_links enable row level security;
alter table public.document_links force row level security;
create policy document_links_select on public.document_links
  for select to authenticated using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and (
          (d.child_id is not null and app_private.has_child_permission(d.care_space_id, d.child_id, 'read'))
          or (d.child_id is null and app_private.has_space_access(d.care_space_id))
        )
    )
  );

alter table public.device_installations enable row level security;
alter table public.device_installations force row level security;
create policy device_installations_self_select on public.device_installations
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;
create policy notification_deliveries_self_select on public.notification_deliveries
  for select to authenticated using (
    exists (
      select 1 from public.device_installations d
      where d.id = device_installation_id and d.user_id = (select auth.uid())
    )
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_customers', 'purchases', 'entitlements', 'usage_ledger'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.has_space_access(care_space_id))',
      table_name || '_space_select',
      table_name
    );
  end loop;
end;
$$;

alter table public.billing_products enable row level security;
alter table public.billing_products force row level security;
create policy billing_products_active_select on public.billing_products
  for select to authenticated using (active);

alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'documents', 'agent_sessions', 'clinical_memory_items', 'device_installations',
    'medication_reminders', 'billing_customers', 'purchases', 'entitlements'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('vaccine-documents', 'vaccine-documents', false, 15728640, array['image/jpeg', 'image/png', 'application/pdf']),
  ('clinical-attachments', 'clinical-attachments', false, 20971520, array['image/jpeg', 'image/png', 'application/pdf']),
  ('generated-reports', 'generated-reports', false, 10485760, array['application/pdf']),
  ('clinical-sources', 'clinical-sources', false, 52428800, array['application/pdf', 'text/plain', 'text/markdown', 'application/json'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clinical_objects_select on storage.objects;
create policy clinical_objects_select on storage.objects
for select to authenticated
using (app_private.can_access_storage_object(bucket_id, name));

grant select on public.documents, public.document_links, public.agent_sessions, public.messages,
  public.tool_executions, public.safety_evaluations, public.clinical_memory_items,
  public.clinical_memory_embeddings, public.conversation_summaries to authenticated;
grant select on public.device_installations, public.medication_reminders, public.notification_deliveries to authenticated;
grant select on public.billing_customers, public.billing_products, public.purchases,
  public.entitlements, public.usage_ledger to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medication_intakes'
  ) then
    alter publication supabase_realtime add table public.medication_intakes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medication_reminders'
  ) then
    alter publication supabase_realtime add table public.medication_reminders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entitlements'
  ) then
    alter publication supabase_realtime add table public.entitlements;
  end if;
end;
$$;
