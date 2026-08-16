-- Raw product rows are not a supported Realtime interface. Future invalidations belong to module 12.

do $$
declare
  expected text[] := array['messages', 'medication_intakes', 'medication_reminders', 'entitlements'];
  published text[];
  table_name text;
begin
  select coalesce(array_agg(tablename order by tablename), '{}')
    into published
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public';

  if published <> (select coalesce(array_agg(name order by name), '{}') from unnest(expected) as names(name)) then
    raise exception 'realtime preflight failed: unexpected public publication membership';
  end if;

  foreach table_name in array expected loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', table_name);
    end if;
  end loop;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  ) then
    raise exception 'realtime hardening failed: public product table remains published';
  end if;
end;
$$;
