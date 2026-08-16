-- Require two-dimensional scope before clinical-memory similarity search.

do $$
begin
  if exists (
    select 1
    from public.clinical_memory_embeddings e
    left join public.clinical_memory_items m
      on m.id = e.memory_item_id
    where m.id is null
      or m.care_space_id <> e.care_space_id
      or m.child_id <> e.child_id
  ) then
    raise exception 'vector scope preflight failed: embedding/item mismatch';
  end if;
end;
$$;

alter table public.clinical_memory_items
  add constraint clinical_memory_items_scope_identity
  unique (id, care_space_id, child_id);

alter table public.clinical_memory_embeddings
  drop constraint clinical_memory_embeddings_memory_item_id_fkey;

alter table public.clinical_memory_embeddings
  add constraint clinical_memory_embeddings_scope_fk
  foreign key (memory_item_id, care_space_id, child_id)
  references public.clinical_memory_items(id, care_space_id, child_id) on delete cascade;

revoke all on function public.match_clinical_memory(uuid, extensions.vector, integer, double precision) from public, anon, authenticated;
drop function public.match_clinical_memory(uuid, extensions.vector, integer, double precision);

create function public.match_clinical_memory(
  p_care_space_id uuid,
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
  where e.care_space_id = p_care_space_id
    and e.child_id = p_child_id
    and m.care_space_id = p_care_space_id
    and m.child_id = p_child_id
    and app_private.has_child_permission(p_care_space_id, p_child_id, 'read')
    and p_match_threshold between 0 and 1
    and m.confirmation_status in ('candidate', 'confirmed')
    and m.valid_from <= now()
    and (m.valid_until is null or m.valid_until > now())
    and 1 - (e.embedding operator(extensions.<=>) p_query_embedding) >= p_match_threshold
  order by e.embedding operator(extensions.<=>) p_query_embedding, m.id
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

revoke all on function public.match_clinical_memory(uuid, uuid, extensions.vector, integer, double precision) from public, anon;
grant execute on function public.match_clinical_memory(uuid, uuid, extensions.vector, integer, double precision) to authenticated;
