begin;
select '1..39';
create temp table tap_results (n integer primary key, line text not null) on commit drop;

create or replace function pg_temp.tap(p_ok boolean, p_name text, p_number integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tap_line text;
begin
  tap_line := case when p_ok
    then 'ok ' || p_number::text || ' - ' || p_name
    else 'not ok ' || p_number::text || ' - ' || p_name
  end;
  insert into pg_temp.tap_results(n, line) values (p_number, tap_line);
  return tap_line;
end;
$$;

create or replace function pg_temp.memory_content_sha(p_structured_content jsonb, p_searchable_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'searchable_text', p_searchable_text,
          'structured_content', p_structured_content
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

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

create or replace function pg_temp.decide_outcome(
  p_decision text,
  p_candidate_id uuid,
  p_candidate_input_sha256 text,
  p_memory_item_id uuid,
  p_idempotency_key text,
  p_confirmation_sha256 text,
  p_content_sha256 text,
  p_memory_type text default null,
  p_structured_content jsonb default null,
  p_searchable_text text default null,
  p_supersedes_id uuid default null
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
    from public.decide_memory_candidate(
      $1::uuid, $2::uuid, $3::uuid, $4::text, $5::timestamptz,
      $6::text, $7::uuid, $8::text, $9::text, $10::text, $11::text,
      $12::uuid, $13::text, $14::jsonb, $15::text, $16::text, $17::text,
      $18::timestamptz, $19::integer, $20::integer, $21::uuid, $22::uuid,
      $23::numeric, $24::text, $25::text, $26::timestamptz, $27::timestamptz,
      $28::uuid
    )
  $query$
  into result
  using
    '00000000-0000-0000-0000-000000000911'::uuid,
    '00000000-0000-0000-0000-000000000921'::uuid,
    '00000000-0000-0000-0000-000000000931'::uuid,
    'm:1:a:1', statement_timestamp(), p_decision, p_candidate_id,
    p_candidate_input_sha256, repeat('d', 64), p_confirmation_sha256,
    p_idempotency_key, p_memory_item_id, p_memory_type, p_structured_content,
    p_searchable_text, 'chat', '00000000-0000-0000-0000-000000000932',
    statement_timestamp() - interval '1 minute', 0, 28,
    '00000000-0000-0000-0000-000000000931'::uuid,
    '00000000-0000-0000-0000-000000000932'::uuid, 1, 'low', p_content_sha256,
    statement_timestamp(), null, p_supersedes_id;
  return result;
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end;
$$;

select pg_temp.tap(to_regprocedure('public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)') is not null, 'decision RPC exists', 1);
select pg_temp.tap(to_regprocedure('public.get_confirmed_memory(uuid,uuid,uuid,text,timestamptz,uuid)') is not null, 'get RPC exists', 2);
select pg_temp.tap(to_regprocedure('public.list_confirmed_memory(uuid,uuid,uuid,text,timestamptz)') is not null, 'list RPC exists', 3);
select pg_temp.tap(to_regclass('public.clinical_memory_outbox_events') is not null, 'opaque memory outbox exists', 4);
select pg_temp.tap((select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = 'public.clinical_memory_outbox_events'::regclass), 'outbox forces RLS', 5);
select pg_temp.tap(not has_table_privilege('authenticated', 'public.clinical_memory_outbox_events', 'select'), 'guardians cannot read outbox table', 6);
select pg_temp.tap(not has_table_privilege('authenticated', 'public.clinical_memory_candidate_decisions', 'insert'), 'direct decision insert remains denied', 7);
select pg_temp.tap(has_function_privilege('authenticated', 'public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)', 'execute'), 'authenticated can execute decision RPC', 8);
select pg_temp.tap(not has_function_privilege('anon', 'public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)', 'execute'), 'anonymous cannot execute decision RPC', 9);
select pg_temp.tap(not has_function_privilege('public', 'public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)', 'execute'), 'public cannot execute decision RPC', 10);
select pg_temp.tap((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = to_regprocedure('public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)')), 'decision fixes search_path and uses security definer', 11);
select pg_temp.tap((select pg_get_functiondef(to_regprocedure('public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)')) like '%clinical_memory_candidate_decisions%' and pg_get_functiondef(to_regprocedure('public.list_pending_memory_candidates(uuid,uuid,uuid,text,timestamptz)')) like '%not exists%'), 'pending list excludes terminal decisions', 12);
select pg_temp.tap(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clinical_memory_outbox_events' and column_name in ('candidate_text', 'searchable_text', 'structured_content')), 'outbox has no raw clinical text columns', 13);
select pg_temp.tap(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clinical_memory_outbox_events'), 'outbox is not published through Realtime', 14);
select pg_temp.tap(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'clinical_memory_outbox_events_unpublished_idx'), 'outbox has unpublished-event index', 15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'memory-confirmation@example.invalid', 'fixture', now(), '{}', '{}', now(), now());
insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000000911', 'Memory Confirmation Space', '00000000-0000-0000-0000-000000000901');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000901', 'owner', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000911', 'Memory Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000901');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from)
values ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', array['read', 'record'], 'active', now() - interval '1 minute');
insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, authorization_version, authorization_expires_at, channel, initial_model)
values ('00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'fixture');
insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts, status, created_at)
values ('00000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 1, 'guardian', '00000000-0000-0000-0000-000000000901', '["The child prefers blue cups."]', 'completed', now() - interval '1 minute');

insert into public.clinical_memory_candidates (id, care_space_id, child_id, created_by, memory_type, candidate_text, provenance_type, provenance_source_id, provenance_captured_at, source_span_start, source_span_end, source_session_id, source_message_id, extraction_confidence, sensitivity, input_sha256, idempotency_key, expires_at)
values
  ('00000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'preference', 'The child prefers blue cups.', 'chat', '00000000-0000-0000-0000-000000000932', now() - interval '1 minute', 0, 28, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', 1, 'low', repeat('a', 64), 'candidate-1', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'preference', 'The child prefers red cups.', 'chat', '00000000-0000-0000-0000-000000000932', now() - interval '1 minute', 0, 28, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', 1, 'low', repeat('e', 64), 'candidate-2', now() + interval '2 seconds'),
  ('00000000-0000-0000-0000-000000000943', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'preference', 'The child prefers green cups.', 'chat', '00000000-0000-0000-0000-000000000932', now() - interval '1 minute', 0, 28, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', 1, 'low', repeat('f', 64), 'candidate-3', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000944', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'preference', 'The child prefers red cups.', 'chat', '00000000-0000-0000-0000-000000000932', now() - interval '1 minute', 0, 27, '00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', 1, 'low', repeat('e', 64), 'candidate-4', now() + interval '1 day');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.tap(pg_temp.decide_outcome('confirm', '00000000-0000-0000-0000-000000000941', repeat('a', 64), '00000000-0000-0000-0000-000000000951', 'decision-1', repeat('c', 64), pg_temp.memory_content_sha('{"text":"The child prefers blue cups."}', 'The child prefers blue cups.'), 'preference', '{"text":"The child prefers blue cups."}', 'The child prefers blue cups.') = 'confirmed', 'authorized confirm creates fact and event', 16);
select pg_temp.tap(pg_temp.decide_outcome('confirm', '00000000-0000-0000-0000-000000000941', repeat('a', 64), '00000000-0000-0000-0000-000000000951', 'decision-1', repeat('c', 64), pg_temp.memory_content_sha('{"text":"The child prefers blue cups."}', 'The child prefers blue cups.'), 'preference', '{"text":"The child prefers blue cups."}', 'The child prefers blue cups.') = 'idempotent_replay', 'exact decision replay converges', 17);
select pg_temp.tap(pg_temp.decide_outcome('confirm', '00000000-0000-0000-0000-000000000941', repeat('a', 64), '00000000-0000-0000-0000-000000000951', 'decision-1', repeat('9', 64), pg_temp.memory_content_sha('{"text":"The child prefers blue cups."}', 'The child prefers blue cups.'), 'preference', '{"text":"The child prefers blue cups."}', 'The child prefers blue cups.') = 'conflict', 'changed replay conflicts', 18);
with result as (
  select pg_temp.decide_outcome('correct', '00000000-0000-0000-0000-000000000942', repeat('e', 64), '00000000-0000-0000-0000-000000000952', 'decision-2', repeat('c', 64), pg_temp.memory_content_sha('{"text":"The child prefers red cups."}', 'The child prefers red cups.'), 'preference', '{"text":"The child prefers red cups."}', 'The child prefers red cups.', '00000000-0000-0000-0000-000000000951') as outcome
)
select pg_temp.tap(outcome = 'corrected', 'correction supersedes prior fact atomically [' || coalesce(outcome, 'empty') || ']', 19) from result;
select pg_temp.tap(pg_temp.decide_outcome('reject', '00000000-0000-0000-0000-000000000943', repeat('f', 64), null, 'decision-3', repeat('8', 64), null) = 'rejected', 'reject creates no fact', 20);
select pg_temp.tap(pg_temp.decide_outcome('revoke', '00000000-0000-0000-0000-000000000944', repeat('e', 64), '00000000-0000-0000-0000-000000000952', 'forged-origin', repeat('7', 64), null) is null, 'revoke requires the originating candidate decision', 21);
select pg_sleep(2.1);
with result as (
  select pg_temp.decide_outcome('revoke', '00000000-0000-0000-0000-000000000942', repeat('e', 64), '00000000-0000-0000-0000-000000000952', 'decision-4', repeat('7', 64), null) as outcome
)
select pg_temp.tap(outcome = 'revoked', 'revoke stays available after candidate expiry and removes retrieval eligibility immediately [' || coalesce(outcome, 'empty') || ']', 22) from result;
select pg_temp.tap((select count(*) = 1 from public.list_pending_memory_candidates('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 'm:1:a:1', statement_timestamp())), 'pending list excludes terminal candidates only', 23);
select pg_temp.tap((select count(*) = 1 from public.get_confirmed_memory('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 'm:1:a:1', statement_timestamp(), '00000000-0000-0000-0000-000000000952')), 'get returns revoked bounded item', 24);
select pg_temp.tap((select count(*) = 1 from public.list_confirmed_memory('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000931', 'm:1:a:1', statement_timestamp()) where retrieval_eligibility = 'ineligible'), 'list preserves lifecycle projection without eligibility', 25);
set local role postgres;
select pg_temp.tap((select count(*) = 1 from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000951' and lifecycle = 'superseded' and retrieval_eligibility = 'ineligible'), 'superseded fact cannot remain retrievable', 26);
select pg_temp.tap((select count(*) = 4 from public.clinical_memory_outbox_events), 'one opaque outbox event per committed decision', 27);
select pg_temp.tap(pg_temp.decide_outcome('confirm', '00000000-0000-0000-0000-000000000944', repeat('e', 64), '00000000-0000-0000-0000-000000000954', 'bad-content-digest', repeat('6', 64), repeat('0', 64), 'preference', '{"text":"The child prefers red cups."}', 'The child prefers red cups.') is null and not exists (select 1 from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000954'), 'changed content digest rolls back without a fact', 28);
set local role authenticated;
select pg_temp.tap(pg_temp.exec_sql($sql$insert into public.clinical_memory_candidate_decisions (candidate_id, care_space_id, child_id, decided_by, decision, candidate_input_sha256, confirmation_sha256, idempotency_key) values ('00000000-0000-0000-0000-000000000943', '00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', 'reject', repeat('f', 64), repeat('8', 64), 'direct')$sql$, '42501'), 'direct decision write remains denied', 29);

set local role postgres;
update public.child_access set status = 'revoked', revoked_at = clock_timestamp()
where care_space_id = '00000000-0000-0000-0000-000000000911' and child_id = '00000000-0000-0000-0000-000000000921' and user_id = '00000000-0000-0000-0000-000000000901';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select pg_temp.tap(pg_temp.decide_outcome('confirm', '00000000-0000-0000-0000-000000000943', repeat('f', 64), '00000000-0000-0000-0000-000000000953', 'denied', repeat('1', 64), repeat('2', 64), 'preference', '{"text":"The child prefers green cups."}', 'The child prefers green cups.') is null, 'revoked access fails closed without a row', 30);

set local role postgres;
select pg_temp.tap((select p.proacl is not null from pg_proc p where p.oid = to_regprocedure('public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)')), 'decision RPC has explicit ACLs', 31);
select pg_temp.tap(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'clinical_memory_outbox_events_replay_unique'), 'outbox replay identity is unique', 32);
select pg_temp.tap(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'clinical_memory_outbox_events_decision_unique'), 'outbox decision identity is unique', 33);
select pg_temp.tap(pg_get_functiondef(to_regprocedure('public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)')) like '%auth.uid()%' and pg_get_functiondef(to_regprocedure('public.decide_memory_candidate(uuid,uuid,uuid,text,timestamptz,text,uuid,text,text,text,text,uuid,text,jsonb,text,text,text,timestamptz,integer,integer,uuid,uuid,numeric,text,text,timestamptz,timestamptz,uuid)')) like '%for update%', 'decision rechecks actor and composite locks', 34);
select pg_temp.tap((select count(*) = 0 from public.clinical_memory_outbox_events where event_kind not in ('memory_confirmed', 'memory_rejected', 'memory_corrected', 'memory_revoked')), 'outbox event kinds are bounded', 35);
select pg_temp.tap((select count(*) = 0 from public.clinical_memory_outbox_events where policy_sha256 !~ '^[a-f0-9]{64}$' or confirmation_sha256 !~ '^[a-f0-9]{64}$'), 'outbox digests have strict shape', 36);
select pg_temp.tap((select count(*) = 0 from public.clinical_memory_items where lifecycle <> 'active' and retrieval_eligibility = 'eligible'), 'inactive facts are never eligible', 37);
select pg_temp.tap((select count(*) = 0 from public.clinical_memory_outbox_events where care_space_id is null or child_id is null), 'outbox scope is composite and non-null', 38);
select pg_temp.tap(coalesce((select e.content_sha256 = pg_temp.memory_content_sha(i.structured_content, i.searchable_text)
  from public.clinical_memory_outbox_events e
  join public.clinical_memory_items i on i.id = e.memory_item_id
  where e.event_kind = 'memory_confirmed'), false), 'content digest is calculated server-side', 39);

select string_agg(line, E'\n' order by n) as tap_output from pg_temp.tap_results;
rollback;
