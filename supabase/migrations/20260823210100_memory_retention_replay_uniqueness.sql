-- A deleted memory item accepts one deletion identity for its full lifetime.

do $$
begin
  if exists (
    select 1
    from public.clinical_memory_deletion_requests
    group by care_space_id, child_id, memory_item_id
    having count(*) > 1
  ) then
    raise exception 'memory deletion replay preflight failed: duplicate item requests';
  end if;
end;
$$;

create unique index clinical_memory_deletion_requests_item_unique
  on public.clinical_memory_deletion_requests(care_space_id, child_id, memory_item_id);
