select '1..12';

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'vaccine_administrations' and column_name = 'confirmation_sha256'
) then 'ok 1 - confirmations are persisted' else 'not ok 1 - confirmations are persisted' end;

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'vaccine_administrations' and column_name = 'input_fingerprint'
) then 'ok 2 - administration input fingerprints are persisted' else 'not ok 2 - administration input fingerprints are persisted' end;

select case when exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'vaccine_administrations_scoped_idempotency_idx'
) then 'ok 3 - administration idempotency is scoped' else 'not ok 3 - administration idempotency is scoped' end;

select case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'vaccination_assessments' and column_name = 'decision_digest'
) then 'ok 4 - assessment decision digest is persisted' else 'not ok 4 - assessment decision digest is persisted' end;

select case when to_regclass('public.vaccination_assessment_evidence') is not null
  then 'ok 5 - normalized assessment evidence exists' else 'not ok 5 - normalized assessment evidence exists' end;

select case when to_regprocedure('public.record_confirmed_vaccine_administration(uuid,uuid,text,date,uuid,jsonb,text,text,text,text,text,text,text,text,text,uuid,text)') is not null
  then 'ok 6 - atomic administration RPC exists' else 'not ok 6 - atomic administration RPC exists' end;

select case when to_regprocedure('public.persist_vaccination_assessment(uuid,uuid,uuid,uuid,text,date,text,date,date,uuid[],text,uuid,text,uuid,text,text,text,text)') is not null
  then 'ok 7 - atomic assessment RPC exists' else 'not ok 7 - atomic assessment RPC exists' end;

select case when exists (
  select 1 from pg_trigger where tgname = 'vaccine_administrations_immutable'
) then 'ok 8 - administrations are immutable' else 'not ok 8 - administrations are immutable' end;

select case when exists (
  select 1 from pg_trigger where tgname = 'vaccination_assessments_immutable'
) then 'ok 9 - assessments are immutable' else 'not ok 9 - assessments are immutable' end;

select case when exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'vaccination_assessment_evidence'
    and c.relrowsecurity and c.relforcerowsecurity
)
  then 'ok 10 - normalized evidence RLS remains forced' else 'not ok 10 - normalized evidence RLS remains forced' end;

select case when has_table_privilege('anon', 'public.vaccination_assessment_evidence', 'select') = false
  then 'ok 11 - anonymous evidence access is denied' else 'not ok 11 - anonymous evidence access is denied' end;

select case when exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'vaccination_assessment_evidence_scope_idx'
) then 'ok 12 - normalized evidence has scoped access index' else 'not ok 12 - normalized evidence has scoped access index' end;
