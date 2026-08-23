begin;
select '1..18';
create temp table tap_results (n integer primary key, line text not null) on commit drop;

create or replace function pg_temp.tap(p_ok boolean, p_name text, p_number integer)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare tap_line text;
begin
  tap_line := case when p_ok then 'ok ' else 'not ok ' end || p_number || ' - ' || p_name;
  insert into pg_temp.tap_results values (p_number, tap_line);
  return tap_line;
end;
$$;

select pg_temp.tap(to_regprocedure('public.match_clinical_memory(uuid,uuid,uuid,text,timestamptz,extensions.vector,text,double precision,integer)') is not null, 'hardened search RPC exists', 1);
select pg_temp.tap(to_regprocedure('public.match_clinical_memory(uuid,uuid,extensions.vector,integer,double precision)') is null, 'legacy search RPC is absent', 2);
select pg_temp.tap(has_function_privilege('authenticated', 'public.match_clinical_memory(uuid,uuid,uuid,text,timestamptz,extensions.vector,text,double precision,integer)', 'execute'), 'authenticated may execute exact RPC', 3);
select pg_temp.tap(not has_function_privilege('anon', 'public.match_clinical_memory(uuid,uuid,uuid,text,timestamptz,extensions.vector,text,double precision,integer)', 'execute'), 'anon cannot execute RPC', 4);
select pg_temp.tap(not has_function_privilege('public', 'public.match_clinical_memory(uuid,uuid,uuid,text,timestamptz,extensions.vector,text,double precision,integer)', 'execute'), 'public cannot execute RPC', 5);
select pg_temp.tap((select not p.prosecdef and p.proconfig @> array['search_path=""'] and p.proconfig @> array['statement_timeout=2s'] from pg_proc p where p.oid = to_regprocedure('public.match_clinical_memory(uuid,uuid,uuid,text,timestamptz,extensions.vector,text,double precision,integer)')), 'RPC is security invoker with fixed path and timeout', 6);
select pg_temp.tap(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'clinical_memory_embeddings_search_scope_idx'), 'search scope/model index exists', 7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'memory-search@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000000811', 'Memory Search Space', '00000000-0000-0000-0000-000000000801');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000801', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000811', 'Search Child A', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000811', 'Search Child B', '2020-01-01', 'male', '00000000-0000-0000-0000-000000000801');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from)
values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000801', array['read'], 'active', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000801', array['read'], 'active', now() - interval '1 minute');
insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model)
values ('00000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000801', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'fixture');

insert into public.clinical_memory_items (
  id, care_space_id, child_id, memory_type, structured_content, searchable_text, provenance_type,
  confirmation_status, valid_from, valid_until, created_by, lifecycle, retrieval_eligibility,
  provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
  extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256, confirmed_at
) values
  ('00000000-0000-0000-0000-000000000841', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', 'preference', '{}', 'eligible-a', 'chat', 'confirmed', now() - interval '1 hour', null, '00000000-0000-0000-0000-000000000801', 'active', 'eligible', 'source-a', now() - interval '1 hour', 0, 10, 1, 'low', repeat('a',64), repeat('b',64), repeat('c',64), now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000842', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', 'preference', '{}', 'sibling-b', 'chat', 'confirmed', now() - interval '1 hour', null, '00000000-0000-0000-0000-000000000801', 'active', 'eligible', 'source-b', now() - interval '1 hour', 0, 9, 1, 'low', repeat('d',64), repeat('e',64), repeat('f',64), now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000843', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', 'preference', '{}', 'ineligible-a', 'chat', 'confirmed', now() - interval '1 hour', null, '00000000-0000-0000-0000-000000000801', 'active', 'ineligible', 'source-c', now() - interval '1 hour', 0, 12, 1, 'low', repeat('1',64), repeat('2',64), repeat('3',64), now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000844', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', 'preference', '{}', 'expired-a', 'chat', 'confirmed', now() - interval '2 hours', now() - interval '1 hour', '00000000-0000-0000-0000-000000000801', 'active', 'eligible', 'source-d', now() - interval '2 hours', 0, 9, 1, 'low', repeat('4',64), repeat('5',64), repeat('6',64), now() - interval '2 hours');

insert into public.clinical_memory_embeddings (id, care_space_id, child_id, memory_item_id, embedding_model, embedding, content_sha256)
select values_table.id, values_table.space_id, values_table.child_id, values_table.item_id, values_table.model,
  ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768), values_table.digest
from (values
  ('00000000-0000-0000-0000-000000000851'::uuid, '00000000-0000-0000-0000-000000000811'::uuid, '00000000-0000-0000-0000-000000000821'::uuid, '00000000-0000-0000-0000-000000000841'::uuid, 'google.gemini-embedding-2.768.l2.cosine.v1', repeat('b',64)),
  ('00000000-0000-0000-0000-000000000852'::uuid, '00000000-0000-0000-0000-000000000811'::uuid, '00000000-0000-0000-0000-000000000822'::uuid, '00000000-0000-0000-0000-000000000842'::uuid, 'google.gemini-embedding-2.768.l2.cosine.v1', repeat('e',64)),
  ('00000000-0000-0000-0000-000000000853'::uuid, '00000000-0000-0000-0000-000000000811'::uuid, '00000000-0000-0000-0000-000000000821'::uuid, '00000000-0000-0000-0000-000000000843'::uuid, 'google.gemini-embedding-2.768.l2.cosine.v1', repeat('2',64)),
  ('00000000-0000-0000-0000-000000000854'::uuid, '00000000-0000-0000-0000-000000000811'::uuid, '00000000-0000-0000-0000-000000000821'::uuid, '00000000-0000-0000-0000-000000000844'::uuid, 'google.gemini-embedding-2.768.l2.cosine.v1', repeat('5',64))
) values_table(id, space_id, child_id, item_id, model, digest);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table own_hits on commit drop as
select * from public.match_clinical_memory(
  '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821',
  '00000000-0000-0000-0000-000000000831', 'm:1:a:1', statement_timestamp(),
  ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),
  'google.gemini-embedding-2.768.l2.cosine.v1', 0.7, 20
);
select pg_temp.tap((select count(*) = 1 and bool_and(memory_item_id = '00000000-0000-0000-0000-000000000841') from own_hits), 'scope and eligibility filter before similarity', 8);
select pg_temp.tap((select min(searchable_text) = 'eligible-a' and min(similarity) = 1 from own_hits), 'returns bounded citation-ready hit', 9);
select pg_temp.tap(not exists (select 1 from own_hits where searchable_text in ('sibling-b','ineligible-a','expired-a')), 'sibling and stale rows never leak', 10);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000822','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0.7,20)), 'session cannot be retargeted to sibling', 11);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:9:a:9',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0.7,20)), 'stale authorization version returns zero', 12);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'other-model',0.7,20)), 'model-version mismatch returns zero', 13);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || repeat('0,', 767) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0.7,20)), 'zero vector fails closed', 14);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',-1,20)), 'invalid threshold fails closed', 15);
select pg_temp.tap((select count(*) <= 20 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0,9999)), 'huge limit is bounded', 16);

set local role postgres;
update public.child_access set status = 'revoked', revoked_at = clock_timestamp()
where care_space_id = '00000000-0000-0000-0000-000000000811' and child_id = '00000000-0000-0000-0000-000000000821' and user_id = '00000000-0000-0000-0000-000000000801';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp(),('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0.7,20)), 'revocation takes effect immediately', 17);
select pg_temp.tap((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000821','00000000-0000-0000-0000-000000000831','m:1:a:1',statement_timestamp() + interval '1 day',('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768),'google.gemini-embedding-2.768.l2.cosine.v1',0.7,20)), 'future cutoff fails closed', 18);

set local role postgres;
select string_agg(line, E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
