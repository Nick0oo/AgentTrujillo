-- Delete derived links only when their owning document has the same composite scope.

create or replace function public.execute_memory_deletion(
  p_care_space_id uuid, p_child_id uuid, p_request_id uuid, p_memory_item_id uuid, p_proof_sha256 text
)
returns table(outcome text, request_id uuid, memory_item_id uuid, care_space_id uuid, child_id uuid, status text, deleted_embeddings integer, deleted_links integer)
language plpgsql security definer set search_path = '' as $$
declare
  r public.clinical_memory_deletion_requests%rowtype;
  now_at timestamptz := pg_catalog.clock_timestamp();
  embedding_count integer := 0;
  link_count integer := 0;
  tombstone_sha text;
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
    return query select 'legal_hold',r.id,r.memory_item_id,r.care_space_id,r.child_id,'legal_hold'::text,0,0;
    return;
  end if;
  delete from public.clinical_memory_embeddings e
  where e.care_space_id=r.care_space_id and e.child_id=r.child_id and e.memory_item_id=r.memory_item_id;
  get diagnostics embedding_count = row_count;
  delete from public.document_links l
  using public.documents d
  where d.id=l.document_id and d.care_space_id=r.care_space_id and d.child_id=r.child_id
    and l.resource_type='clinical_memory' and l.resource_id=r.memory_item_id;
  get diagnostics link_count = row_count;
  tombstone_sha:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('searchable_text','[deleted]','structured_content','{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  update public.clinical_memory_items i set structured_content='{}'::jsonb,searchable_text='[deleted]',provenance_source_id='deleted',
    source_session_id=null,source_message_id=null,source_span_start=0,source_span_end=1,extraction_confidence=0,content_sha256=tombstone_sha,updated_at=now_at
  where i.id=r.memory_item_id and i.care_space_id=r.care_space_id and i.child_id=r.child_id and i.lifecycle='deleted';
  update public.clinical_memory_deletion_requests set status='completed',legal_hold_id=null,completed_at=now_at,proof_sha256=p_proof_sha256,updated_at=now_at where id=r.id;
  return query select 'completed',r.id,r.memory_item_id,r.care_space_id,r.child_id,'completed'::text,embedding_count,link_count;
end;
$$;

revoke all on function public.execute_memory_deletion(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.execute_memory_deletion(uuid,uuid,uuid,uuid,text) to service_role;
