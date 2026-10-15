select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'vaccine_administrations' and column_name = 'draft_expires_at'
) then 'ok 1 - drafts have explicit expiry' else 'not ok 1 - drafts have explicit expiry' end;

select case when exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_vaccine_administration_draft'
) then 'ok 2 - draft creation is a server function' else 'not ok 2 - draft creation is a server function' end;

select case when has_function_privilege('anon', 'public.create_vaccine_administration_draft(uuid, uuid, uuid, date, text, text, text, text, text, text, text, text, text, timestamp with time zone, text, text)', 'execute')
  = false then 'ok 3 - anonymous callers cannot create drafts' else 'not ok 3 - anonymous callers cannot create drafts' end;
