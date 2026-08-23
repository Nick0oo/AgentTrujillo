-- Return only active, confirmed memory within one currently authorized child scope.

do $$
begin
  if exists (
    select 1
    from public.clinical_memory_embeddings e
    join public.clinical_memory_items m
      on m.id = e.memory_item_id
      and m.care_space_id = e.care_space_id
      and m.child_id = e.child_id
    where e.content_sha256 <> m.content_sha256
  ) then
    raise exception 'vector search preflight failed: stale embedding digest';
  end if;
end;
$$;

create index clinical_memory_embeddings_search_scope_idx
  on public.clinical_memory_embeddings(care_space_id, child_id, embedding_model, memory_item_id);

revoke all on function public.match_clinical_memory(uuid, uuid, extensions.vector, integer, double precision)
  from public, anon, authenticated;
drop function public.match_clinical_memory(uuid, uuid, extensions.vector, integer, double precision);

create function public.match_clinical_memory(
  p_care_space_id uuid,
  p_child_id uuid,
  p_session_id uuid,
  p_authorization_version text,
  p_cutoff_at timestamptz,
  p_query_embedding extensions.vector(768),
  p_embedding_model text,
  p_match_threshold double precision default 0.65,
  p_match_count integer default 8
)
returns table (
  memory_item_id uuid,
  memory_type text,
  searchable_text text,
  provenance_type text,
  provenance_source_id text,
  provenance_captured_at timestamptz,
  confirmed_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
  with authorized_scope as materialized (
    select 1
    from public.agent_sessions s
    join public.children child
      on child.care_space_id = s.care_space_id and child.id = s.child_id
    join public.care_spaces space on space.id = s.care_space_id
    join public.care_space_members member
      on member.care_space_id = s.care_space_id and member.user_id = (select auth.uid())
    join public.child_access access
      on access.care_space_id = s.care_space_id
      and access.child_id = s.child_id
      and access.user_id = (select auth.uid())
    where s.id = p_session_id
      and s.owner_user_id = (select auth.uid())
      and s.care_space_id = p_care_space_id
      and s.child_id = p_child_id
      and s.authorization_version = p_authorization_version
      and s.status = 'active'
      and s.authorization_expires_at > pg_catalog.clock_timestamp()
      and child.status = 'active'
      and space.status = 'active'
      and member.status = 'active'
      and member.revoked_at is null
      and member.valid_from <= pg_catalog.clock_timestamp()
      and (member.valid_until is null or member.valid_until > pg_catalog.clock_timestamp())
      and access.status = 'active'
      and access.revoked_at is null
      and access.valid_from <= pg_catalog.clock_timestamp()
      and (access.valid_until is null or access.valid_until > pg_catalog.clock_timestamp())
      and 'read' = any(access.permissions)
      and p_authorization_version = pg_catalog.format('m:%s:a:%s', member.authorization_version, access.authorization_version)
      and (member.valid_until is null or s.authorization_expires_at <= member.valid_until)
      and (access.valid_until is null or s.authorization_expires_at <= access.valid_until)
    limit 1
  ), eligible as materialized (
    select
      m.id as memory_item_id,
      m.memory_type,
      pg_catalog.left(m.searchable_text, 8000) as searchable_text,
      m.provenance_type,
      m.provenance_source_id,
      m.provenance_captured_at,
      m.confirmed_at,
      e.embedding operator(extensions.<=>) p_query_embedding as distance
    from authorized_scope
    join public.clinical_memory_embeddings e on true
    join public.clinical_memory_items m
      on m.id = e.memory_item_id
      and m.care_space_id = e.care_space_id
      and m.child_id = e.child_id
    where e.care_space_id = p_care_space_id
      and e.child_id = p_child_id
      and m.care_space_id = p_care_space_id
      and m.child_id = p_child_id
      and e.embedding_model = p_embedding_model
      and e.embedding_dimensions = 768
      and e.content_sha256 = m.content_sha256
      and m.confirmation_status = 'confirmed'
      and m.lifecycle = 'active'
      and m.retrieval_eligibility = 'eligible'
      and m.confirmed_at <= p_cutoff_at
      and m.valid_from <= p_cutoff_at
      and (m.valid_until is null or m.valid_until > p_cutoff_at)
  )
  select
    eligible.memory_item_id,
    eligible.memory_type,
    eligible.searchable_text,
    eligible.provenance_type,
    eligible.provenance_source_id,
    eligible.provenance_captured_at,
    eligible.confirmed_at,
    1 - eligible.distance as similarity
  from eligible
  where p_care_space_id is not null
    and p_child_id is not null
    and p_session_id is not null
    and p_authorization_version is not null
    and p_cutoff_at is not null
    and p_cutoff_at <= pg_catalog.clock_timestamp()
    and p_query_embedding is not null
    and extensions.vector_norm(p_query_embedding) > 0
    and p_embedding_model is not null
    and pg_catalog.length(p_embedding_model) between 1 and 160
    and p_match_threshold between 0 and 1
    and eligible.distance is not null
    and 1 - eligible.distance >= p_match_threshold
  order by eligible.distance, eligible.confirmed_at desc, eligible.memory_item_id
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

revoke all on function public.match_clinical_memory(uuid, uuid, uuid, text, timestamptz, extensions.vector, text, double precision, integer)
  from public, anon;
grant execute on function public.match_clinical_memory(uuid, uuid, uuid, text, timestamptz, extensions.vector, text, double precision, integer)
  to authenticated;
