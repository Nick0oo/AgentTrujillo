select '1..8';

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'anthropometric_measurements'
    and column_name = 'normalized_value_lexeme'
) then 'ok 1 - normalized measurement lexeme is persisted' else 'not ok 1 - normalized measurement lexeme is persisted' end;

select case when exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'anthropometry_scope_fingerprint_idx'
) then 'ok 2 - measurement fingerprints are unique per care space' else 'not ok 2 - measurement fingerprints are unique per care space' end;

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'growth_assessments'
    and column_name = 'dataset_digest'
) then 'ok 3 - dataset digest is persisted' else 'not ok 3 - dataset digest is persisted' end;

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'growth_assessments'
    and column_name = 'decision_digest'
) then 'ok 4 - decision digest is persisted' else 'not ok 4 - decision digest is persisted' end;

select case when to_regclass('public.growth_series_points') is not null
  then 'ok 5 - growth series projection exists' else 'not ok 5 - growth series projection exists' end;

select case when c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'anthropometric_measurements'
  then 'ok 6 - measurement RLS remains forced' else 'not ok 6 - measurement RLS remains forced' end;

select case when c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'growth_assessments'
  then 'ok 7 - assessment RLS remains forced' else 'not ok 7 - assessment RLS remains forced' end;

select case when has_table_privilege('anon', 'public.growth_series_points', 'select') = false
  then 'ok 8 - anonymous series access is denied' else 'not ok 8 - anonymous series access is denied' end;
