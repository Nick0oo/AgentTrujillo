begin;

do $$
declare
  required text[] := array[
    'owner_user_id', 'input_fingerprint', 'decision_sha256', 'algorithm_key',
    'algorithm_version', 'copy_digest_sha256', 'evaluation_version', 'latency_ms'
  ];
  required_column text;
begin
  foreach required_column in array required loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'safety_evaluations' and information_schema.columns.column_name = required_column
    ) then
      raise exception 'missing safety evaluation column %', required_column;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'safety_evaluations_immutable') then
    raise exception 'missing immutable safety evaluation trigger';
  end if;
  if not exists (select 1 from pg_proc where proname = 'record_safety_evaluation') then
    raise exception 'missing idempotent safety evaluation RPC';
  end if;
end;
$$;

select count(*) as redacted_rows, count(*) filter (where input_fingerprint !~ '^[0-9a-f]{64}$') as bad_fingerprints
from public.safety_evaluations;

rollback;
