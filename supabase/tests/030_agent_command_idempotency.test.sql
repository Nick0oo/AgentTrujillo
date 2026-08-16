begin;
select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated', 'command-a@example.invalid', 'command-fixture', now(), '{}', '{"full_name":"Command A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated', 'command-b@example.invalid', 'command-fixture', now(), '{}', '{"full_name":"Command B"}', now(), now());

insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000000711', 'Command Space', '00000000-0000-0000-0000-000000000701');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000701', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000702', 'guardian', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000711', 'Command Child A', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000711', 'Command Child B', '2021-01-01', 'male', '00000000-0000-0000-0000-000000000701');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, channel, initial_model)
values
  ('00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', 'evaluation', 'fixture'),
  ('00000000-0000-0000-0000-000000000732', '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000702', 'evaluation', 'fixture');

insert into public.agent_commands (id, care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, confirmation_sha256, expires_at)
values ('00000000-0000-0000-0000-000000000741', '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'medication.reminder.create', 'same-key', repeat('a', 64), repeat('b', 64), now() + interval '1 hour');

select ok((select count(*) = 1 from pg_constraint where conname = 'agent_commands_scope_key_unique'), 'full command scope is unique');
select ok((select count(*) = 1 from pg_constraint where conname = 'agent_commands_session_scope_fk'), 'command session scope FK exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'tool_executions_command_scope_fk'), 'tool command scope FK exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.agent_commands'::regclass), 'command ledger forces RLS');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_commands'), 'command ledger has no client policy');
select ok(not has_table_privilege('authenticated', 'public.agent_commands', 'select'), 'authenticated has no command grant');
select ok(not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'agent_commands'), 'command ledger is absent from Realtime');

select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'medication.reminder.create', 'same-key', repeat('c', 64), now() + interval '1 hour')$sql$, '23505', null, 'same full key is rejected');
select lives_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'medication.reminder.update', 'same-key', repeat('c', 64), now() + interval '1 hour')$sql$, 'different operation may reuse key');
select lives_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000732', 'medication.reminder.create', 'same-key', repeat('c', 64), now() + interval '1 hour')$sql$, 'different child/owner may reuse key');

select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'bad operation', 'bad-key', repeat('a', 64), now() + interval '1 hour')$sql$, '23514', null, 'operation slug is bounded');
select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'bad', 'bad-hash', repeat('A', 64), now() + interval '1 hour')$sql$, '23514', null, 'request fingerprint is lowercase hex');
select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, confirmation_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'bad', 'bad-confirm', repeat('a', 64), repeat('z', 64), now() + interval '1 hour')$sql$, '23514', null, 'confirmation fingerprint is lowercase hex');
select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'bad', 'cross-child', repeat('a', 64), now() + interval '1 hour')$sql$, '23503', null, 'session child scope mismatch is rejected');
select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000731', 'bad', 'cross-owner', repeat('a', 64), now() + interval '1 hour')$sql$, '23503', null, 'session owner scope mismatch is rejected');

update public.agent_commands set status = 'awaiting_confirmation' where id = '00000000-0000-0000-0000-000000000741';
update public.agent_commands set status = 'claimed', claimed_at = now() where id = '00000000-0000-0000-0000-000000000741';
update public.agent_commands set status = 'running', started_at = now() where id = '00000000-0000-0000-0000-000000000741';
update public.agent_commands set status = 'succeeded', terminal_at = now(), redacted_result = '{"reference":"fixture"}' where id = '00000000-0000-0000-0000-000000000741';
select lives_ok($sql$update public.agent_commands set redacted_result = '{"reference":"fixture-2"}' where id = '00000000-0000-0000-0000-000000000741'$sql$, 'redacted result annotation remains possible');
select throws_ok($sql$update public.agent_commands set status = 'running' where id = '00000000-0000-0000-0000-000000000741'$sql$, '42501', null, 'terminal command cannot restart');
select throws_ok($sql$insert into public.agent_commands (care_space_id, child_id, owner_user_id, agent_session_id, operation, idempotency_key, request_sha256, status, expires_at) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000731', 'bad', 'terminal-shape', repeat('a', 64), 'succeeded', now() + interval '1 hour')$sql$, '23514', null, 'terminal status requires terminal timestamp');
select throws_ok($sql$update public.agent_commands set request_sha256 = repeat('c', 64) where id = '00000000-0000-0000-0000-000000000741'$sql$, '42501', null, 'command fingerprint is immutable');

insert into public.tool_executions (care_space_id, child_id, agent_session_id, command_id, tool_name, tool_version, authorization_scope, confirmation_status, execution_status, idempotency_key)
values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000741', 'fixture', '1', '{}', 'not_required', 'succeeded', 'command-execution');
select ok((select count(*) = 1 from public.tool_executions where command_id = '00000000-0000-0000-0000-000000000741'), 'tool execution links to command');
select throws_ok($sql$insert into public.tool_executions (care_space_id, child_id, agent_session_id, command_id, tool_name, tool_version, authorization_scope, confirmation_status, execution_status, idempotency_key) values ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000732', '00000000-0000-0000-0000-000000000741', 'fixture', '1', '{}', 'not_required', 'succeeded', 'command-cross-scope')$sql$, '23503', null, 'tool command scope mismatch is rejected');

select * from finish();
rollback;
