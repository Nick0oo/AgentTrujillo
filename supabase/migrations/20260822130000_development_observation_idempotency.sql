-- Module 08: append-only, scope-safe development observation confirmation.

alter table public.development_observations
  add column idempotency_key text,
  add column input_sha256 text,
  add column confirmation_sha256 text,
  add column payload_sha256 text,
  add column confirmed_at timestamptz,
  add column supersedes_observation_id uuid;

alter table public.development_observations
  add constraint development_observations_scope_id_unique
    unique (care_space_id, child_id, id);

alter table public.development_observations
  add constraint development_observations_supersedes_scope_fk
    foreign key (care_space_id, child_id, supersedes_observation_id)
    references public.development_observations(care_space_id, child_id, id)
    on delete restrict,
  add constraint development_observations_command_shape_check check (
    (
      idempotency_key is null
      and input_sha256 is null
      and confirmation_sha256 is null
      and payload_sha256 is null
      and confirmed_at is null
      and supersedes_observation_id is null
    )
    or (
      idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
      and input_sha256 ~ '^[a-f0-9]{64}$'
      and confirmation_sha256 ~ '^[a-f0-9]{64}$'
      and payload_sha256 ~ '^[a-f0-9]{64}$'
      and confirmed_at is not null
      and supersedes_observation_id is distinct from id
    )
  );

create unique index development_observations_actor_key_unique
  on public.development_observations(care_space_id, child_id, recorded_by, idempotency_key)
  where idempotency_key is not null;

create unique index development_observations_supersedes_unique
  on public.development_observations(care_space_id, child_id, supersedes_observation_id)
  where supersedes_observation_id is not null;

create or replace function app_private.development_observation_payload_sha256(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

revoke all on function app_private.development_observation_payload_sha256(jsonb)
  from public, anon, authenticated;

create or replace function app_private.prevent_development_observation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'development_observation_immutable' using errcode = '42501';
end;
$$;

revoke all on function app_private.prevent_development_observation_mutation()
  from public, anon, authenticated;

create trigger development_observations_immutable
before update or delete on public.development_observations
for each row execute function app_private.prevent_development_observation_mutation();

create or replace function public.record_development_observation(
  p_care_space_id uuid,
  p_child_id uuid,
  p_milestone_id uuid,
  p_domain text,
  p_title text,
  p_observation text,
  p_observed_on date,
  p_status text,
  p_provenance_type text,
  p_idempotency_key text,
  p_input_sha256 text,
  p_confirmation_sha256 text,
  p_supersedes_observation_id uuid,
  p_document_ids uuid[]
)
returns table (observation_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.development_observations%rowtype;
  created_id uuid;
  requested_document_ids uuid[] := pg_catalog.coalesce(p_document_ids, '{}'::uuid[]);
  ordered_document_ids uuid[];
  requested_document_count integer;
  valid_document_count integer;
  derived_payload_sha256 text;
begin
  if actor is null
    or p_care_space_id is null
    or p_child_id is null
    or not pg_catalog.coalesce(app_private.has_child_permission(p_care_space_id, p_child_id, 'record'), false)
  then
    raise exception 'development_observation_not_authorized' using errcode = '42501';
  end if;

  if p_domain is null or p_domain not in ('gross_motor', 'fine_motor', 'language', 'social', 'cognitive', 'adaptive', 'general')
    or p_observation is null or pg_catalog.length(pg_catalog.btrim(p_observation)) = 0 or pg_catalog.length(p_observation) > 2000
    or (p_title is not null and (pg_catalog.length(pg_catalog.btrim(p_title)) = 0 or pg_catalog.length(p_title) > 200))
    or p_observed_on is null
    or p_status is null or p_status not in ('observed', 'emerging', 'achieved', 'concern_declared', 'entered_in_error')
    or p_provenance_type is null or p_provenance_type not in ('guardian', 'professional', 'import', 'document', 'chat')
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or p_input_sha256 is null or p_input_sha256 !~ '^[a-f0-9]{64}$'
    or p_confirmation_sha256 is null or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
  then
    raise exception 'development_observation_invalid' using errcode = '22023';
  end if;

  requested_document_count := pg_catalog.cardinality(requested_document_ids);
  if requested_document_count > 10
    or requested_document_count <> (
      select pg_catalog.count(distinct requested_id)::integer
      from pg_catalog.unnest(requested_document_ids) as requested(requested_id)
    )
  then
    raise exception 'development_observation_attachments_invalid' using errcode = '22023';
  end if;

  select pg_catalog.coalesce(pg_catalog.array_agg(requested_id order by requested_id), '{}'::uuid[])
  into ordered_document_ids
  from pg_catalog.unnest(requested_document_ids) as requested(requested_id);

  derived_payload_sha256 := app_private.development_observation_payload_sha256(
    pg_catalog.jsonb_build_object(
      'careSpaceId', p_care_space_id,
      'childId', p_child_id,
      'milestoneId', p_milestone_id,
      'domain', p_domain,
      'title', p_title,
      'observation', p_observation,
      'observedOn', p_observed_on,
      'status', p_status,
      'provenanceType', p_provenance_type,
      'supersedesObservationId', p_supersedes_observation_id,
      'documentIds', pg_catalog.to_jsonb(ordered_document_ids)
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.format('%s:%s:%s:%s', p_care_space_id, p_child_id, actor, p_idempotency_key),
    0
  ));

  select observation.* into existing
  from public.development_observations observation
  where observation.care_space_id = p_care_space_id
    and observation.child_id = p_child_id
    and observation.recorded_by = actor
    and observation.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing.input_sha256 is distinct from p_input_sha256
      or existing.confirmation_sha256 is distinct from p_confirmation_sha256
      or existing.payload_sha256 is distinct from derived_payload_sha256
    then
      raise exception 'development_observation_idempotency_conflict' using errcode = '23505';
    end if;
    return query select existing.id, 'idempotent_replay'::text;
    return;
  end if;

  if p_milestone_id is not null and not exists (
    select 1
    from public.development_milestones milestone
    join public.development_frameworks framework on framework.id = milestone.framework_id
    where milestone.id = p_milestone_id
      and not milestone.professional_only
      and framework.framework_type in ('education', 'observation')
      and framework.status in ('approved', 'active')
  ) then
    raise exception 'development_observation_milestone_invalid' using errcode = '23503';
  end if;

  if p_supersedes_observation_id is not null then
    perform 1
    from public.development_observations predecessor
    where predecessor.care_space_id = p_care_space_id
      and predecessor.child_id = p_child_id
      and predecessor.id = p_supersedes_observation_id
    for update;
    if not found then
      raise exception 'development_observation_supersession_invalid' using errcode = '23503';
    end if;
    if exists (
      select 1 from public.development_observations successor
      where successor.care_space_id = p_care_space_id
        and successor.child_id = p_child_id
        and successor.supersedes_observation_id = p_supersedes_observation_id
    ) then
      raise exception 'development_observation_supersession_conflict' using errcode = '23505';
    end if;
  end if;

  if requested_document_count > 0 then
    select pg_catalog.count(*)::integer into valid_document_count
    from public.documents document
    where document.id = any(ordered_document_ids)
      and document.care_space_id = p_care_space_id
      and document.child_id = p_child_id
      and document.bucket_id = 'clinical-attachments'
      and document.processing_status in ('clean', 'extracted')
      and document.deleted_at is null;
    if valid_document_count <> requested_document_count then
      raise exception 'development_observation_attachments_invalid' using errcode = '23503';
    end if;
  end if;

  insert into public.development_observations (
    care_space_id,
    child_id,
    milestone_id,
    domain,
    title,
    observation,
    observed_on,
    status,
    provenance_type,
    recorded_by,
    idempotency_key,
    input_sha256,
    confirmation_sha256,
    payload_sha256,
    confirmed_at,
    supersedes_observation_id
  ) values (
    p_care_space_id,
    p_child_id,
    p_milestone_id,
    p_domain,
    p_title,
    p_observation,
    p_observed_on,
    p_status,
    p_provenance_type,
    actor,
    p_idempotency_key,
    p_input_sha256,
    p_confirmation_sha256,
    derived_payload_sha256,
    pg_catalog.now(),
    p_supersedes_observation_id
  )
  returning id into created_id;

  insert into public.document_links(document_id, resource_type, resource_id)
  select requested_id, 'development_observation', created_id
  from pg_catalog.unnest(ordered_document_ids) as requested(requested_id);

  return query select created_id, 'created'::text;
exception
  when unique_violation then
    raise exception 'development_observation_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_development_observation(
  uuid, uuid, uuid, text, text, text, date, text, text, text, text, text, uuid, uuid[]
) from public, anon;
grant execute on function public.record_development_observation(
  uuid, uuid, uuid, text, text, text, date, text, text, text, text, text, uuid, uuid[]
) to authenticated;

revoke insert, update, delete on public.development_observations from anon, authenticated;
revoke insert, update, delete on public.document_links from anon, authenticated;
