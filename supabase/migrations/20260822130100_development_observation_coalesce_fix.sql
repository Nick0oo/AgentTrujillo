-- Forward-only correction: COALESCE is SQL syntax and cannot be schema-qualified.
-- The prior migration installed the exact RPC shape but its three qualified uses
-- fail at execution time. Preserve migration history and replace only that text.

do $migration$
declare
  rpc_signature constant regprocedure := 'public.record_development_observation(uuid,uuid,uuid,text,text,text,date,text,text,text,text,text,uuid,uuid[])'::regprocedure;
  prior_definition text;
  corrected_definition text;
begin
  prior_definition := pg_catalog.pg_get_functiondef(rpc_signature);
  if prior_definition is null or pg_catalog.strpos(prior_definition, 'pg_catalog.coalesce') = 0 then
    raise exception 'development_observation_rpc_expected_coalesce_qualification_missing' using errcode = '55000';
  end if;

  corrected_definition := pg_catalog.replace(prior_definition, 'pg_catalog.coalesce', 'coalesce');
  execute corrected_definition;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(rpc_signature), 'pg_catalog.coalesce'
  ) <> 0 then
    raise exception 'development_observation_rpc_coalesce_fix_failed' using errcode = '55000';
  end if;
end;
$migration$;

revoke all on function public.record_development_observation(
  uuid, uuid, uuid, text, text, text, date, text, text, text, text, text, uuid, uuid[]
) from public, anon;
grant execute on function public.record_development_observation(
  uuid, uuid, uuid, text, text, text, date, text, text, text, text, text, uuid, uuid[]
) to authenticated;
