-- Require exact stored metadata on reservation replay and validate PNG names for every purpose.
do $migration$
declare
  definition text;
  old_png text := $old$or (p_purpose='vaccine_record' and p_declared_mime_type='image/png' and lower(p_display_name) !~ '\.png$')$old$;
  new_png text := $new$or (p_declared_mime_type='image/png' and lower(p_display_name) !~ '\.png$')$new$;
  old_replay text := $old$case when existing.reservation_request_sha256=p_request_sha256 then 'idempotent_replay' else 'conflict' end$old$;
  new_replay text := $new$case when existing.reservation_request_sha256=p_request_sha256
        and existing.bucket_id=target_bucket
        and existing.purpose=p_purpose
        and existing.original_filename=p_display_name
        and existing.declared_mime_type=p_declared_mime_type
        and existing.expected_size_bytes=p_expected_size_bytes
        and existing.expected_sha256=p_expected_sha256
        and existing.retention_class=p_retention_class
      then 'idempotent_replay' else 'conflict' end$new$;
begin
  definition := pg_get_functiondef(
    'public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)'::regprocedure
  );
  if strpos(definition, old_png) = 0 or regexp_count(definition, 'case when existing\.reservation_request_sha256=p_request_sha256') <> 2 then
    raise exception 'unexpected reserve_document_object definition; refusing replay correction';
  end if;
  definition := replace(definition, old_png, new_png);
  definition := replace(definition, old_replay, new_replay);
  execute definition;
end;
$migration$;
