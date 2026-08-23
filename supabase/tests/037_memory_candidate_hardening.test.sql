begin;
select '1..62';

-- Every fixture is synthetic and the whole test is rolled back. Dynamic helpers
-- keep the RED run useful before the forward migration creates the new tables.
create or replace function pg_temp.exec_sql(p_sql text, p_expected_sqlstate text default null)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  execute p_sql;
  return p_expected_sqlstate is null;
exception when others then
  return sqlstate = p_expected_sqlstate;
end;
$$;

create or replace function pg_temp.query_bool(p_sql text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  result boolean;
begin
  execute p_sql into result;
  return coalesce(result, false);
exception when others then
  return false;
end;
$$;

create temp table tap_results (
  n integer primary key,
  line text not null
) on commit drop;

create or replace function pg_temp.tap(p_ok boolean, p_name text, p_number integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  output_line text;
begin
  output_line := case when p_ok
    then 'ok ' || p_number::text || ' - ' || p_name
    else 'not ok ' || p_number::text || ' - ' || p_name
  end;
  insert into pg_temp.tap_results(n, line) values (p_number, output_line);
  return output_line;
end;
$$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'memory-schema-a@example.invalid', 'memory-schema-fixture', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'memory-schema-b@example.invalid', 'memory-schema-fixture', now(), '{}', '{}', now(), now());

insert into public.care_spaces (id, name, created_by)
values
  ('00000000-0000-0000-0000-000000000911', 'Memory Schema Space A', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000912', 'Memory Schema Space B', '00000000-0000-0000-0000-000000000902');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000901', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000902', 'owner', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000911', 'Memory Schema Child A', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000912', 'Memory Schema Child B', '2021-01-01', 'male', '00000000-0000-0000-0000-000000000902'),
  ('00000000-0000-0000-0000-000000000923', '00000000-0000-0000-0000-000000000911', 'Memory Schema Sibling', '2022-01-01', 'female', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000924', '00000000-0000-0000-0000-000000000911', 'Memory Schema Revoked', '2023-01-01', 'male', '00000000-0000-0000-0000-000000000901');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from, revoked_at)
values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', array['read'], 'active', now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000924', '00000000-0000-0000-0000-000000000901', array['read'], 'revoked', now() - interval '1 hour', now());

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, channel, initial_model)
values ('00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'evaluation', 'fixture');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, parts)
values ('00000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 1, 'agent', '[]');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, channel, initial_model)
values ('00000000-0000-0000-0000-000000000933', '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000902', 'evaluation', 'fixture');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, parts)
values ('00000000-0000-0000-0000-000000000934', '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000933', 1, 'agent', '[]');

select pg_temp.tap(to_regclass('public.clinical_memory_candidates') is not null, 'candidate proposal table exists', 1);
select pg_temp.tap(to_regclass('public.clinical_memory_candidate_decisions') is not null, 'candidate decision ledger exists', 2);
select pg_temp.tap((select count(*) from pg_attribute where attrelid = to_regclass('public.clinical_memory_candidates') and attname = any(array[
  'id', 'care_space_id', 'child_id', 'created_by', 'memory_type', 'candidate_text',
  'provenance_type', 'provenance_source_id', 'provenance_captured_at', 'source_span_start',
  'source_span_end', 'source_session_id', 'source_message_id', 'extraction_confidence', 'sensitivity', 'input_sha256', 'idempotency_key',
  'lifecycle', 'expires_at', 'created_at'
])) = 20, 'candidate stores bounded provenance and replay fields', 3);
select pg_temp.tap((select count(*) from pg_attribute where attrelid = to_regclass('public.clinical_memory_candidate_decisions') and attname = any(array[
  'id', 'candidate_id', 'care_space_id', 'child_id', 'decided_by', 'decision',
  'candidate_input_sha256', 'confirmation_sha256', 'idempotency_key', 'memory_item_id', 'decided_at'
])) = 11, 'decisions store digests, idempotency, and fact link', 4);
select pg_temp.tap((select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.clinical_memory_candidates')), 'candidate table forces RLS', 5);
select pg_temp.tap((select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.clinical_memory_candidate_decisions')), 'decision table forces RLS', 6);
select pg_temp.tap(case when to_regclass('public.clinical_memory_candidates') is null then false else has_table_privilege('authenticated', 'public.clinical_memory_candidates', 'select') end, 'authenticated receives only candidate review access', 7);
select pg_temp.tap(case when to_regclass('public.clinical_memory_candidates') is null then false else not has_table_privilege('authenticated', 'public.clinical_memory_candidates', 'insert') end, 'authenticated cannot insert candidates directly', 8);
select pg_temp.tap(case when to_regclass('public.clinical_memory_candidate_decisions') is null then false else not has_table_privilege('authenticated', 'public.clinical_memory_candidate_decisions', 'select') end, 'decision ledger has no guardian grant', 9);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidates_scope_fk'), 'candidate has composite child scope FK', 10);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidates_scope_identity'), 'candidate has composite identity key', 11);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidate_decisions_candidate_scope_fk'), 'decision links candidate by composite scope', 12);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidate_decisions_memory_scope_fk'), 'decision links fact by composite scope', 13);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidates_source_session_scope_fk'), 'candidate source session has composite scope FK', 14);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidates_source_message_scope_fk'), 'candidate source message has composite scope FK', 15);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_candidates_safe_shape'), 'candidate shape constraints exist', 16);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_items_memory_shape'), 'fact lifecycle and digest constraints exist', 17);
select pg_temp.tap((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_items_confirmation_status_confirmed'), 'facts are confirmed-only', 18);
select pg_temp.tap((select count(*) = 1 from pg_trigger where tgname = 'clinical_memory_candidates_append_only'), 'candidate append-only guard exists', 19);
select pg_temp.tap((select count(*) = 1 from pg_trigger where tgname = 'clinical_memory_candidates_insert_validate'), 'candidate insert lifecycle guard exists', 20);
select pg_temp.tap((select count(*) = 1 from pg_trigger where tgname = 'clinical_memory_items_lifecycle_guard'), 'fact lifecycle guard exists', 21);
select pg_temp.tap((select count(*) = 1 from pg_trigger where tgname = 'clinical_memory_candidate_decisions_append_only'), 'decision append-only guard exists', 22);
select pg_temp.tap((select count(*) = 2 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('clinical_memory_candidates', 'clinical_memory_candidate_decisions') and not exists (
  select 1 from pg_publication_tables p where p.schemaname = n.nspname and p.tablename = c.relname
)), 'candidate and decision tables are absent from Realtime', 23);

select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    id, care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901',
    'history', 'Synthetic guardian observation', 'chat', 'source-941',
    now(), 0, 10, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932',
    0.75, 'medium', repeat('a', 64), 'memory-941', 'pending', now() + interval '1 day'
  )
$sql$), 'valid candidate proposal is accepted', 24);
select pg_temp.tap(pg_temp.query_bool($sql$select count(*) = 1 from public.clinical_memory_candidates where id = '00000000-0000-0000-0000-000000000941' and lifecycle = 'pending'$sql$), 'candidate remains unconfirmed', 25);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Replay', 'chat', 'source-941', now(),
    0, 6, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932',
    0.75, 'medium', repeat('a', 64), 'memory-941', 'pending', now() + interval '1 day'
  )
$sql$, '23505'), 'candidate idempotency key rejects duplicate proposal', 26);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Bad span', 'chat', 'source-bad-span', now(),
    4, 4, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932',
    0.75, 'medium', repeat('b', 64), 'memory-bad-span', 'pending', now() + interval '1 day'
  )
$sql$, '23514'), 'candidate source span must have positive extent', 27);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Bad confidence', 'chat', 'source-bad-confidence', now(),
    0, 3, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932',
    2, 'medium', repeat('c', 64), 'memory-bad-confidence', 'pending', now() + interval '1 day'
  )
$sql$, '23514'), 'candidate confidence is bounded', 28);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000922',
    '00000000-0000-0000-0000-000000000901', 'history', 'Cross-scope', 'chat', 'source-cross-scope', now(),
    0, 3, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932',
    0.5, 'medium', repeat('d', 64), 'memory-cross-scope', 'pending', now() + interval '1 day'
  )
$sql$, '23503'), 'candidate scope mismatch is rejected', 29);

select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, source_session_id, source_message_id,
    extraction_confidence, sensitivity, input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Cross-source scope', 'chat', 'source-cross-source', now(),
    0, 3, '00000000-0000-0000-0000-000000000933', '00000000-0000-0000-0000-000000000934',
    0.5, 'medium', repeat('e', 64), 'memory-cross-source', 'pending', now() + interval '1 day'
  )
$sql$, '23503'), 'candidate source references cannot cross child scope', 30);

select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_items (
    id, care_space_id, child_id, memory_type, structured_content, searchable_text,
    provenance_type, confirmation_status, lifecycle, retrieval_eligibility,
    provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
    extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256,
    confirmed_at, valid_from, supersedes_id, created_by
  ) values (
    '00000000-0000-0000-0000-000000000951', '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921', 'history', '{"marker":"fact-951"}', 'Synthetic confirmed fact',
    'chat', 'confirmed', 'active', 'eligible', 'source-941', now(), 0, 10, 0.75, 'medium',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), now(), now(), null,
    '00000000-0000-0000-0000-000000000901'
  )
$sql$), 'confirmed fact requires explicit confirmation material', 31);
select pg_temp.tap(pg_temp.query_bool($sql$select count(*) = 1 from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000951' and lifecycle = 'active' and retrieval_eligibility = 'eligible'$sql$), 'confirmed fact is retrieval-eligible only when active', 32);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidate_decisions (
    id, candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    '00000000-0000-0000-0000-000000000961', '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'confirm', repeat('a', 64), repeat('c', 64),
    'decision-961', '00000000-0000-0000-0000-000000000951'
  )
$sql$), 'confirmation decision links the unchanged candidate to its fact', 33);
select pg_temp.tap(pg_temp.query_bool($sql$select count(*) = 1 from public.clinical_memory_candidate_decisions where id = '00000000-0000-0000-0000-000000000961'$sql$), 'confirmation decision is append-only evidence', 34);
select pg_temp.tap(pg_temp.exec_sql($sql$set constraints all immediate$sql$), 'valid item plus decision satisfies deferred confirmation guard', 35);
set constraints all deferred;

select pg_temp.tap(pg_temp.exec_sql($sql$
do $block$
begin
  insert into public.clinical_memory_items (
    id, care_space_id, child_id, memory_type, structured_content, searchable_text,
    provenance_type, confirmation_status, lifecycle, retrieval_eligibility,
    provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
    extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256,
    confirmed_at, valid_from, created_by
  ) values (
    '00000000-0000-0000-0000-000000000952', '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921', 'history', '{"marker":"missing-decision"}', 'Missing decision',
    'chat', 'confirmed', 'active', 'eligible', 'source-952', now(), 0, 5, 0.5, 'medium',
    repeat('a', 64), repeat('b', 64), repeat('01', 32), now(), now(), '00000000-0000-0000-0000-000000000901'
  );
  set constraints all immediate;
end
$block$
$sql$, '23514'), 'fact without decision is rejected when deferred guard is forced immediate', 36);

select pg_temp.tap(pg_temp.exec_sql($sql$
do $block$
begin
  insert into public.clinical_memory_items (
    id, care_space_id, child_id, memory_type, structured_content, searchable_text,
    provenance_type, confirmation_status, lifecycle, retrieval_eligibility,
    provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
    extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256,
    confirmed_at, valid_from, created_by
  ) values (
    '00000000-0000-0000-0000-000000000953', '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921', 'history', '{"marker":"revoke-only"}', 'Revoke-only decision',
    'chat', 'confirmed', 'active', 'eligible', 'source-953', now(), 0, 5, 0.5, 'medium',
    repeat('a', 64), repeat('02', 32), repeat('03', 32), now(), now(), '00000000-0000-0000-0000-000000000901'
  );
  insert into public.clinical_memory_candidate_decisions (
    id, candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    '00000000-0000-0000-0000-000000000965', '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'revoke', repeat('a', 64), repeat('03', 32),
    'decision-965', '00000000-0000-0000-0000-000000000953'
  );
  set constraints all immediate;
end
$block$
$sql$, '23514'), 'revoke cannot create a confirmed fact', 37);

select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_items (
    care_space_id, child_id, memory_type, structured_content, searchable_text,
    provenance_type, confirmation_status, lifecycle, retrieval_eligibility,
    provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
    extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256,
    confirmed_at, valid_from, created_by
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', 'history',
    '{"diagnosis":"forbidden"}', 'Unsafe structured field', 'chat', 'candidate', 'active', 'eligible',
    'source-unsafe', now(), 0, 5, 0.5, 'high', repeat('d', 64), repeat('e', 64), repeat('f', 64), now(), now(),
    '00000000-0000-0000-0000-000000000901'
  )
$sql$, '23514'), 'facts require confirmed status and reject dangerous fields', 38);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_items (
    care_space_id, child_id, memory_type, structured_content, searchable_text,
    provenance_type, confirmation_status, lifecycle, retrieval_eligibility,
    provenance_source_id, provenance_captured_at, source_span_start, source_span_end,
    extraction_confidence, sensitivity, input_sha256, content_sha256, confirmation_sha256,
    confirmed_at, valid_from, created_by
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', 'history',
    '{"metadata":{"diagnosis":"forbidden"}}', 'Nested unsafe structured field', 'chat', 'confirmed', 'active', 'eligible',
    'source-nested-unsafe', now(), 0, 5, 0.5, 'high', repeat('04', 32), repeat('05', 32), repeat('06', 32), now(), now(),
    '00000000-0000-0000-0000-000000000901'
  )
$sql$, '23514'), 'nested dangerous fields are rejected', 39);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Direct rejected proposal', 'chat', 'source-rejected', now(),
    0, 4, 0.5, 'medium', repeat('07', 32), 'memory-rejected', 'rejected', now() + interval '1 day'
  )
$sql$, '23514'), 'rejected candidates cannot be inserted directly', 40);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'history', 'Direct expired proposal', 'chat', 'source-expired', now(),
    0, 4, 0.5, 'medium', repeat('08', 32), 'memory-expired', 'expired', now() + interval '1 day'
  )
$sql$, '23514'), 'expired candidates cannot be inserted directly', 41);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    id, care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at, created_at
  ) values (
    '00000000-0000-0000-0000-000000000947', '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'history', 'Expired by clock',
    'chat', 'source-expired-clock', now() - interval '2 days', 0, 4, 0.5, 'medium', repeat('09', 32),
    'memory-expired-clock', 'pending', now() - interval '1 day', now() - interval '2 days'
  )
$sql$), 'pending proposal can be stored before expiry is derived', 42);
select pg_temp.tap(pg_temp.query_bool($sql$select lifecycle = 'pending' and expires_at <= statement_timestamp() from public.clinical_memory_candidates where id = '00000000-0000-0000-0000-000000000947'$sql$), 'candidate expiry is derived from expires_at', 43);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidates (
    id, care_space_id, child_id, created_by, memory_type, candidate_text,
    provenance_type, provenance_source_id, provenance_captured_at,
    source_span_start, source_span_end, extraction_confidence, sensitivity,
    input_sha256, idempotency_key, lifecycle, expires_at
  ) values
    ('00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000923', '00000000-0000-0000-0000-000000000901', 'history', 'Sibling candidate', 'chat', 'source-sibling', now(), 0, 4, 0.5, 'medium', repeat('0a', 32), 'memory-sibling', 'pending', now() + interval '1 day'),
    ('00000000-0000-0000-0000-000000000943', '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000902', 'history', 'Foreign candidate', 'chat', 'source-foreign', now(), 0, 4, 0.5, 'medium', repeat('0b', 32), 'memory-foreign', 'pending', now() + interval '1 day'),
    ('00000000-0000-0000-0000-000000000944', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000924', '00000000-0000-0000-0000-000000000901', 'history', 'Revoked candidate', 'chat', 'source-revoked', now(), 0, 4, 0.5, 'medium', repeat('0c', 32), 'memory-revoked', 'pending', now() + interval '1 day')
$sql$), 'RLS review fixtures are loaded', 44);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.tap(pg_temp.query_bool($sql$select count(*) = 2 and bool_and(child_id = '00000000-0000-0000-0000-000000000921') from public.clinical_memory_candidates$sql$), 'authorized actor sees only current-child candidates', 45);
select pg_temp.tap(pg_temp.query_bool($sql$select not exists (select 1 from public.clinical_memory_candidates where child_id = '00000000-0000-0000-0000-000000000923')$sql$), 'sibling candidate is hidden by RLS', 46);
select pg_temp.tap(pg_temp.query_bool($sql$select not exists (select 1 from public.clinical_memory_candidates where child_id = '00000000-0000-0000-0000-000000000922')$sql$), 'foreign-space candidate is hidden by RLS', 47);
select pg_temp.tap(pg_temp.query_bool($sql$select not exists (select 1 from public.clinical_memory_candidates where child_id = '00000000-0000-0000-0000-000000000924')$sql$), 'revoked child candidate is hidden by RLS', 48);
set local role postgres;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('request.jwt.claim.role', '', true);

select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_candidates set candidate_text = 'rewritten' where id = '00000000-0000-0000-0000-000000000941'$sql$, '42501'), 'candidate content is immutable', 49);
select pg_temp.tap(pg_temp.exec_sql($sql$delete from public.clinical_memory_candidates where id = '00000000-0000-0000-0000-000000000941'$sql$, '42501'), 'candidate proposals cannot be deleted', 50);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_candidate_decisions set confirmation_sha256 = repeat('d', 64) where id = '00000000-0000-0000-0000-000000000961'$sql$, '42501'), 'decision evidence is immutable', 51);
select pg_temp.tap(pg_temp.exec_sql($sql$delete from public.clinical_memory_candidate_decisions where id = '00000000-0000-0000-0000-000000000961'$sql$, '42501'), 'decision evidence cannot be deleted', 52);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_items set lifecycle = 'superseded', retrieval_eligibility = 'eligible' where id = '00000000-0000-0000-0000-000000000951'$sql$, '23514'), 'invalid fact lifecycle/retrieval transition is denied', 53);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidate_decisions (
    id, candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    '00000000-0000-0000-0000-000000000962', '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'revoke', repeat('a', 64), repeat('c', 64),
    'decision-962', '00000000-0000-0000-0000-000000000951'
  )
$sql$), 'revoke decision is append-only evidence', 54);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidate_decisions (
    id, candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    '00000000-0000-0000-0000-000000000963', '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'revoke', repeat('a', 64), repeat('c', 64),
    'decision-963', '00000000-0000-0000-0000-000000000951'
  )
$sql$, '23505'), 'a memory item accepts only one effective revocation', 55);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_items set retrieval_eligibility = 'ineligible' where id = '00000000-0000-0000-0000-000000000951'$sql$), 'revocation can remove retrieval eligibility', 56);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_items set lifecycle = 'active', retrieval_eligibility = 'eligible' where id = '00000000-0000-0000-0000-000000000951'$sql$, '42501'), 'revoked fact cannot be resurrected', 57);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_candidates set lifecycle = 'rejected' where id = '00000000-0000-0000-0000-000000000941'$sql$, '42501'), 'candidate lifecycle is append-only', 58);
select pg_temp.tap(pg_temp.exec_sql($sql$update public.clinical_memory_candidates set lifecycle = 'pending' where id = '00000000-0000-0000-0000-000000000941'$sql$, '42501'), 'closed candidate cannot be reopened', 59);
select pg_temp.tap(pg_temp.exec_sql($sql$delete from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000951'$sql$, '42501'), 'confirmed facts cannot be deleted', 60);
select pg_temp.tap(pg_temp.exec_sql($sql$
  insert into public.clinical_memory_candidate_decisions (
    id, candidate_id, care_space_id, child_id, decided_by, decision,
    candidate_input_sha256, confirmation_sha256, idempotency_key, memory_item_id
  ) values (
    '00000000-0000-0000-0000-000000000964', '00000000-0000-0000-0000-000000000941',
    '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000901', 'correct', repeat('a', 64), repeat('c', 64),
    'decision-964', '00000000-0000-0000-0000-000000000951'
  )
$sql$, '23505'), 'candidate accepts only one terminal confirmation decision', 61);
select pg_temp.tap((select count(*) = 6 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and p.proname in (
  'validate_clinical_memory_candidate_decision',
  'validate_clinical_memory_candidate_insert',
  'prevent_clinical_memory_candidate_mutation',
  'prevent_clinical_memory_candidate_decision_mutation',
  'prevent_clinical_memory_item_mutation',
  'require_clinical_memory_confirmation_decision'
) and p.proconfig @> array['search_path=""']), 'candidate trigger functions fix search_path', 62);

-- The linked query path has no pgTAP extension; the TAP stream above is direct SQL.
select pg_catalog.string_agg(line, E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
