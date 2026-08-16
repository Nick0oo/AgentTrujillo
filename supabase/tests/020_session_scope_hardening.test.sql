begin;
select plan(32);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated', 'scope-a@example.invalid', 'scope-fixture', now(), '{}', '{"full_name":"Scope A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000602', 'authenticated', 'authenticated', 'scope-b@example.invalid', 'scope-fixture', now(), '{}', '{"full_name":"Scope B"}', now(), now());

insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000000611', 'Scope Space', '00000000-0000-0000-0000-000000000601');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000601', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000602', 'guardian', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000611', 'Scope Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000601'),
  ('00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000611', 'Other Child', '2021-01-01', 'male', '00000000-0000-0000-0000-000000000601');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from)
values
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000601', array['read'], 'active', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000602', array['read'], 'active', now() - interval '1 hour');

insert into public.clinical_rule_packs (id, domain, country_code, version, artifact_sha256)
values ('00000000-0000-0000-0000-000000000631', 'emergency', 'GLOBAL', 'scope-fixture', repeat('e', 64));

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, channel, initial_model)
values ('00000000-0000-0000-0000-000000000641', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000601', 'evaluation', 'fixture');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, parts)
values ('00000000-0000-0000-0000-000000000642', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000641', 1, 'agent', '[]');

insert into public.tool_executions (id, care_space_id, child_id, agent_session_id, tool_name, tool_version, authorization_scope, confirmation_status, execution_status, idempotency_key)
values ('00000000-0000-0000-0000-000000000643', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000641', 'fixture', '1', '{}', 'not_required', 'succeeded', 'scope-fixture');

insert into public.conversation_summaries (id, care_space_id, child_id, agent_session_id, generator_version, summary, source_message_ids)
values ('00000000-0000-0000-0000-000000000644', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000641', 'fixture', '{}', array['00000000-0000-0000-0000-000000000642']::uuid[]);

insert into public.safety_evaluations (id, care_space_id, child_id, agent_session_id, request_id, rule_pack_id, decision, response_mode)
values ('00000000-0000-0000-0000-000000000645', '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000641', 'scope-fixture', '00000000-0000-0000-0000-000000000631', 'not_urgent', 'continue');

select ok((select count(*) = 1 from pg_constraint where conname = 'agent_sessions_owner_fk'), 'session owner references guardian profile');
select ok((select count(*) = 1 from pg_constraint where conname = 'agent_sessions_scope_identity'), 'session scope identity exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'agent_sessions_binding_complete'), 'session Eve binding check exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'messages_session_scope_fk'), 'message session scope FK exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'tool_executions_session_scope_fk'), 'tool session scope FK exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'conversation_summaries_session_scope_fk'), 'summary session scope FK exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'safety_evaluations_session_scope_fk'), 'safety session scope FK exists');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
select ok((select count(*) = 1 from public.agent_sessions where id = '00000000-0000-0000-0000-000000000641'), 'owner sees own session');
select ok((select count(*) = 1 from public.messages where id = '00000000-0000-0000-0000-000000000642'), 'owner sees own messages');
select ok((select count(*) = 1 from public.tool_executions where id = '00000000-0000-0000-0000-000000000643'), 'owner sees own tool executions');
select ok((select count(*) = 1 from public.conversation_summaries where id = '00000000-0000-0000-0000-000000000644'), 'owner sees own summary');
select ok((select count(*) = 1 from public.safety_evaluations where id = '00000000-0000-0000-0000-000000000645'), 'owner sees own safety evaluation');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
select ok((select count(*) = 1 from public.children where id = '00000000-0000-0000-0000-000000000621'), 'co-guardian still sees child');
select ok((select count(*) = 0 from public.agent_sessions where id = '00000000-0000-0000-0000-000000000641'), 'co-guardian cannot see session');
select ok((select count(*) = 0 from public.messages where id = '00000000-0000-0000-0000-000000000642'), 'co-guardian cannot see messages');
select ok((select count(*) = 0 from public.tool_executions where id = '00000000-0000-0000-0000-000000000643'), 'co-guardian cannot see tools');
select ok((select count(*) = 0 from public.conversation_summaries where id = '00000000-0000-0000-0000-000000000644'), 'co-guardian cannot see summaries');
select ok((select count(*) = 0 from public.safety_evaluations where id = '00000000-0000-0000-0000-000000000645'), 'co-guardian cannot see safety evaluations');

set local role postgres;
select throws_ok($sql$insert into public.agent_sessions (care_space_id, child_id, owner_user_id, channel, initial_model) values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000699', 'evaluation', 'fixture')$sql$, '23503', null, 'orphan session owner is rejected');
select throws_ok($sql$update public.agent_sessions set child_id = '00000000-0000-0000-0000-000000000699' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'session child scope is immutable');
select throws_ok($sql$update public.agent_sessions set owner_user_id = '00000000-0000-0000-0000-000000000602' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'session owner is immutable');
select throws_ok($sql$update public.agent_sessions set channel = 'operator_cli' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'session channel is immutable');
select throws_ok($sql$update public.agent_sessions set initial_model = 'changed' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'session initial model is immutable');
select throws_ok($sql$update public.agent_sessions set initial_configuration = '{"changed":true}' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'session initial configuration is immutable');

update public.agent_sessions set eve_session_id = 'scope-eve', eve_session_bound_at = now() where id = '00000000-0000-0000-0000-000000000641';
select lives_ok($sql$update public.agent_sessions set eve_session_id = 'scope-eve', eve_session_bound_at = eve_session_bound_at where id = '00000000-0000-0000-0000-000000000641'$sql$, 'same Eve binding is idempotent');
select throws_ok($sql$update public.agent_sessions set eve_session_id = 'scope-eve-2' where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'Eve rebinding is rejected');
select throws_ok($sql$update public.agent_sessions set eve_session_id = null, eve_session_bound_at = null where id = '00000000-0000-0000-0000-000000000641'$sql$, '42501', null, 'Eve binding clearing is rejected');

select throws_ok($sql$insert into public.messages (care_space_id, child_id, agent_session_id, sequence, actor_type, parts) values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000641', 9, 'agent', '[]')$sql$, '23503', null, 'message scope mismatch is rejected');
select throws_ok($sql$insert into public.tool_executions (care_space_id, child_id, agent_session_id, tool_name, tool_version, authorization_scope, confirmation_status, execution_status, idempotency_key) values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000641', 'fixture', '1', '{}', 'not_required', 'succeeded', 'scope-mismatch')$sql$, '23503', null, 'tool scope mismatch is rejected');
select throws_ok($sql$insert into public.conversation_summaries (care_space_id, child_id, agent_session_id, generator_version, summary, source_message_ids) values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000641', 'fixture', '{}', '{}')$sql$, '23503', null, 'summary scope mismatch is rejected');
select throws_ok($sql$insert into public.safety_evaluations (care_space_id, child_id, agent_session_id, request_id, rule_pack_id, decision, response_mode) values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000622', '00000000-0000-0000-0000-000000000641', 'scope-mismatch', '00000000-0000-0000-0000-000000000631', 'not_urgent', 'continue')$sql$, '23503', null, 'safety scope mismatch is rejected');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.agent_sessions'::regclass), 'session table forces RLS');
select * from finish();
rollback;
