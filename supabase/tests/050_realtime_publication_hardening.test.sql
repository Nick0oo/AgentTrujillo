begin;
select plan(10);

select ok(to_regclass('pg_catalog.pg_publication') is not null, 'publication catalog is available');
select ok(exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'supabase Realtime publication remains available');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), 'no public product table remains published');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('messages', 'medication_intakes', 'medication_reminders', 'entitlements')), 'all four raw baseline tables are unpublished');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like '%invalidation%'), 'no invalidation relation is premature');
select ok((select count(*) = 57 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity), 'Realtime change does not weaken forced RLS');
select ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 'Realtime change does not add anonymous grants');
select ok(to_regclass('public.agent_commands') is not null, 'command ledger remains schema-owned');
select ok(to_regclass('public.clinical_memory_embeddings') is not null, 'clinical memory remains schema-owned');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname <> 'public' and tablename in ('messages', 'medication_intakes', 'medication_reminders', 'entitlements')), 'no unexpected raw table is published');

select * from finish();
rollback;
