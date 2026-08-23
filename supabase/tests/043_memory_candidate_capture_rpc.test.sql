begin;
select '1..30';

-- This linked test is intentionally rollback-only. It uses synthetic rows and
-- proves the request-scoped capture/list boundary without leaving fixtures.
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

create or replace function pg_temp.capture_outcome(
  p_candidate_id uuid,
  p_text text,
  p_source_span_start integer,
  p_source_span_end integer,
  p_idempotency_key text,
  p_authorization_version text default 'm:1:a:1',
  p_session_id uuid default '00000000-0000-0000-0000-000000000931',
  p_source_message_id uuid default '00000000-0000-0000-0000-000000000932',
  p_cutoff_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  result text;
begin
  execute $query$
    select outcome
    from public.capture_memory_candidate(
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::text,
      $5::uuid,
      $6::timestamptz,
      $7::uuid,
      $8::text,
      $9::text,
      $10::integer,
      $11::integer,
      $12::numeric,
      $13::text,
      $14::text,
      $15::text,
      $16::timestamptz
    )
  $query$
  into result
  using
    '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000921',
    p_session_id,
    p_authorization_version,
    p_source_message_id,
    coalesce(p_cutoff_at, statement_timestamp()),
    p_candidate_id,
    'preference',
    p_text,
    p_source_span_start,
    p_source_span_end,
    1,
    'low',
    repeat('a', 64),
    p_idempotency_key,
    coalesce(p_expires_at, statement_timestamp() + interval '1 day');
  return result;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.pending_count()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  result bigint;
begin
  execute $query$
    select count(*)
    from public.list_pending_memory_candidates(
      '00000000-0000-0000-0000-000000000911'::uuid,
      '00000000-0000-0000-0000-000000000921'::uuid,
      '00000000-0000-0000-0000-000000000931'::uuid,
      'm:1:a:1',
      statement_timestamp()
    )
  $query$ into result;
  return result;
exception when others then
  return null;
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
values ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'memory-rpc@example.invalid', 'memory-rpc-fixture', now(), '{}', '{}', now(), now());

insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000000911', 'Memory RPC Space', '00000000-0000-0000-0000-000000000901');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000901', 'owner', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000911', 'Memory RPC Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000901');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from)
values ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', array['read', 'record'], 'active', now() - interval '1 minute');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model)
values ('00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'fixture');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts, status, created_at)
values ('00000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 1, 'guardian', '00000000-0000-0000-0000-000000000901', '["The child prefers blue cups."]', 'completed', now() - interval '30 seconds');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model, status, completed_at)
values ('00000000-0000-0000-0000-000000000933', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'fixture', 'completed', now());

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts, status, created_at)
values ('00000000-0000-0000-0000-000000000934', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000933', 1, 'guardian', '00000000-0000-0000-0000-000000000901', '["The child prefers blue cups."]', 'completed', now() - interval '30 seconds');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model, started_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000935', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'm:1:a:1', now() - interval '1 minute', 'evaluation', 'fixture', now() - interval '5 minutes', now() - interval '5 minutes', now() - interval '5 minutes');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts, status, created_at)
values ('00000000-0000-0000-0000-000000000936', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000935', 1, 'guardian', '00000000-0000-0000-0000-000000000901', '["The child prefers blue cups."]', 'completed', now() - interval '2 minutes');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts, status, created_at)
values
  ('00000000-0000-0000-0000-000000000937', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 2, 'agent', null, '[]', 'completed', now() - interval '20 seconds'),
  ('00000000-0000-0000-0000-000000000938', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 3, 'guardian', '00000000-0000-0000-0000-000000000901', '[]', 'streaming', now() - interval '15 seconds'),
  ('00000000-0000-0000-0000-000000000939', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 4, 'guardian', '00000000-0000-0000-0000-000000000902', '[]', 'completed', now() - interval '10 seconds');

select pg_temp.tap(to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)') is not null, 'capture RPC exists', 1);
select pg_temp.tap(to_regprocedure('public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)') is not null, 'list RPC exists', 2);
select pg_temp.tap(not has_table_privilege('authenticated', 'public.clinical_memory_candidates', 'insert'), 'authenticated direct candidate insert remains denied', 3);
select pg_temp.tap(not has_table_privilege('authenticated', 'public.clinical_memory_candidates', 'update'), 'authenticated direct candidate update remains denied', 4);
select pg_temp.tap(case when to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)') is null then false else has_function_privilege('authenticated', 'public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)', 'execute') end, 'authenticated can execute capture only', 5);
select pg_temp.tap(case when to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)') is null then false else not has_function_privilege('anon', 'public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)', 'execute') end, 'anonymous cannot execute capture', 6);
select pg_temp.tap(case when to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)') is null then false else not has_function_privilege('public', 'public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)', 'execute') end, 'public cannot execute capture', 7);
select pg_temp.tap((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)')), 'capture fixes search_path and uses security definer', 8);
select pg_temp.tap((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = to_regprocedure('public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)')), 'list fixes search_path and uses security definer', 9);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000941', 'The child prefers blue cups.', 0, 28, 'capture-1') = 'created', 'authorized capture creates a pending candidate', 10);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000941', 'The child prefers blue cups.', 0, 28, 'capture-1') = 'idempotent_replay', 'exact replay converges', 11);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000941', 'The child prefers blue cups.', 0, 28, 'capture-2') = 'source_replay', 'source replay differs only by idempotency key', 12);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000941', 'The child prefers red cups.', 0, 28, 'capture-1') = 'conflict', 'changed idempotency replay conflicts', 13);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000941', 'The child prefers blue cups.', 1, 28, 'capture-3') = 'conflict', 'changed source span conflicts', 14);
select pg_temp.tap(pg_temp.pending_count() = 1, 'list returns only one pending unexpired candidate', 15);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000942', 'The child prefers blue cups.', 0, 28, 'capture-4', 'm:1:a:1', '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', null, statement_timestamp() + interval '366 days') is null, 'retention is capped at 365 days after cutoff', 16);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000943', 'The child prefers blue cups.', 0, 28, 'capture-5', 'm:1:a:1', '00000000-0000-0000-0000-000000000933', '00000000-0000-0000-0000-000000000934') is null, 'terminal session fails closed', 17);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000944', 'The child prefers blue cups.', 0, 28, 'capture-6', 'm:1:a:1', '00000000-0000-0000-0000-000000000935', '00000000-0000-0000-0000-000000000936') is null, 'expired session lease fails closed', 18);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000945', 'The child prefers blue cups.', 0, 28, 'capture-7', 'm:1:a:1', '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000937') is null, 'non-guardian source fails closed', 19);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000946', 'The child prefers blue cups.', 0, 28, 'capture-8', 'm:1:a:1', '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000938') is null, 'non-completed source fails closed', 20);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000947', 'The child prefers blue cups.', 0, 28, 'capture-9', 'm:1:a:1', '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000939') is null, 'wrong-actor source fails closed', 21);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000948', 'The child prefers blue cups.', 0, 28, 'capture-10', 'm:1:a:2') is null, 'authorization-version drift fails closed', 22);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000949', 'The child prefers blue cups.', 0, 28, 'capture-11', 'm:1:a:999') is null, 'foreign or unknown session fails closed', 23);

set local role postgres;
update public.child_access
set status = 'revoked', revoked_at = clock_timestamp()
where care_space_id = '00000000-0000-0000-0000-000000000911'
  and child_id = '00000000-0000-0000-0000-000000000921'
  and user_id = '00000000-0000-0000-0000-000000000901';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select pg_temp.tap(pg_temp.capture_outcome('00000000-0000-0000-0000-000000000950', 'The child prefers blue cups.', 0, 28, 'capture-12') is null, 'revoked and version-drifted access fails closed', 24);

select pg_temp.tap(pg_temp.exec_sql($sql$delete from public.clinical_memory_candidates where id = '00000000-0000-0000-0000-000000000941'$sql$, '42501'), 'direct candidate delete remains denied', 25);
select pg_temp.tap(pg_temp.exec_sql($sql$truncate table public.clinical_memory_candidates$sql$, '42501'), 'direct candidate truncate remains denied', 26);

select pg_temp.tap(not has_function_privilege('anon', 'public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)', 'execute'), 'anonymous cannot execute list', 27);
select pg_temp.tap(not has_function_privilege('public', 'public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)', 'execute'), 'public cannot execute list', 28);

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.tap((select p.proacl is not null from pg_proc p where p.oid = to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)')), 'capture has explicit ACLs', 29);
select pg_temp.tap(pg_get_functiondef(to_regprocedure('public.capture_memory_candidate(uuid,uuid,uuid,text,uuid,timestamptz,uuid,text,text,integer,integer,numeric,text,text,text,timestamptz)')) like '%pg_advisory_xact_lock%', 'capture serializes replay with an advisory transaction lock', 30);

select string_agg(line, E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
