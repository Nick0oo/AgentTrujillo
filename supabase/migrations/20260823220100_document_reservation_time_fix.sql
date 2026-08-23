-- Disambiguate the reservation timestamp variable from PostgreSQL CURRENT_TIME.
do $migration$
declare
  definition text;
begin
  definition := pg_get_functiondef(
    'public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)'::regprocedure
  );
  if regexp_count(definition, 'current_time') <> 11 then
    raise exception 'unexpected reserve_document_object definition; refusing automatic correction';
  end if;
  execute replace(definition, 'current_time', 'v_now');
end;
$migration$;
