begin;
select plan(30);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated', 'session-a@example.invalid', 'session-fixture', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated', 'session-b@example.invalid', 'session-fixture', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated', 'session-c@example.invalid', 'session-fixture', now(), '{}', '{}', now(), now());

insert into public.care_spaces (id, name, created_by)
values ('00000000-0000-0000-0000-000000001011', 'Session Space', '00000000-0000-0000-0000-000000001001');
insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001001', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001002', 'guardian', 'active'),
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001003', 'guardian', 'active');
insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values ('00000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000001011', 'Session Child', '2020-01-01', 'female', '00000000-0000-0000-0000-000000001001');
insert into public.child_access (care_space_id, child_id, user_id, permissions, status)
values
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000001001', array['read', 'record'], 'active'),
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000001002', array['read', 'record'], 'active'),
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000001003', array['read'], 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temp table created_session as
select * from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'gemini-3.6-flash', '{}');
select ok((select count(*) = 1 from created_session), 'authorized owner can create session');
select ok((select owner_user_id = '00000000-0000-0000-0000-000000001001' and care_space_id = '00000000-0000-0000-0000-000000001011' and child_id = '00000000-0000-0000-0000-000000001021' from created_session), 'RPC derives owner and scope');
select ok((select eve_session_id is null and status = 'active' from created_session), 'new session starts unbound and active');
select ok((select authorization_version = 'm:1:a:1' and authorization_expires_at > now() from created_session), 'session persists authorization lease');
select ok((select count(*) = 1 from public.refresh_owned_agent_session_lease((select product_session_id from created_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes 30 seconds')), 'owner can refresh an expired-or-expiring lease through the narrow RPC');
select ok((select authorization_expires_at > now() + interval '4 minutes' from public.agent_sessions where id = (select product_session_id from created_session)), 'lease refresh persists the fresh bounded expiry');
select ok((select count(*) = 1 from public.bind_owned_eve_session((select product_session_id from created_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', 'eve-fixture')), 'first Eve bind succeeds');
select ok((select count(*) = 1 from public.bind_owned_eve_session((select product_session_id from created_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', 'eve-fixture')), 'same Eve bind is idempotent');
select ok((select count(*) = 0 from public.bind_owned_eve_session((select product_session_id from created_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', 'eve-other')), 'different Eve bind is denied');
select ok((select eve_session_id = 'eve-fixture' and authorization_version = 'm:1:a:1' from public.agent_sessions where id = (select product_session_id from created_session)), 'binding remains immutable');
select throws_ok($sql$update public.agent_sessions set authorization_version = 'm:2:a:1' where id = (select product_session_id from created_session)$sql$, '42501', null, 'authorization version is immutable');
select throws_ok($sql$update public.agent_sessions set authorization_expires_at = now() + interval '5 minutes' where id = (select product_session_id from created_session)$sql$, '42501', null, 'authorization expiry is immutable');
create temp table expiring_session as
select * from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '1 second', 'evaluation', 'gemini-3.6-flash', '{}');
select ok((select count(*) = 1 from expiring_session), 'short-lived session is created for expiry coverage');
select pg_sleep(2);
select ok((select count(*) = 0 from public.bind_owned_eve_session((select product_session_id from expiring_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', 'eve-expired')), 'expired session cannot bind an Eve session');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select ok((select count(*) = 0 from public.agent_sessions where id = (select product_session_id from created_session)), 'co-guardian cannot read owner session');
select ok((select count(*) = 0 from public.bind_owned_eve_session((select product_session_id from created_session), '00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', 'eve-co-guardian')), 'co-guardian cannot bind owner session');
select ok((select owner_user_id = '00000000-0000-0000-0000-000000001002' from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'gemini-3.6-flash', '{}')), 'co-guardian can create only its own session');
select ok((select count(*) = 0 from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'not-an-approved-model', '{}')), 'RPC rejects models outside the server allowlist');
select ok((select count(*) = 0 from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '6 minutes', 'evaluation', 'gemini-3.6-flash', '{}')), 'RPC rejects leases beyond the bounded authorization window');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select ok((select count(*) = 0 from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'gemini-3.6-flash', '{}')), 'RPC requires record permission directly at the database boundary');
set local role postgres;

select ok(not has_function_privilege('anon', 'public.create_owned_agent_session(uuid,uuid,text,timestamptz,text,text,jsonb)', 'execute'), 'anonymous create grant denied');
select set_config('request.jwt.claim.sub', '', true);

select ok(to_regprocedure('public.create_owned_agent_session(uuid,uuid,text,timestamptz,text,text,jsonb)') is not null, 'create RPC exact signature exists');
select ok(to_regprocedure('public.bind_owned_eve_session(uuid,uuid,uuid,text,text)') is not null, 'bind RPC exact signature exists');
select ok(not has_function_privilege('anon', 'public.create_owned_agent_session(uuid,uuid,text,timestamptz,text,text,jsonb)', 'execute'), 'anonymous has no create RPC grant');
select ok(has_function_privilege('authenticated', 'public.bind_owned_eve_session(uuid,uuid,uuid,text,text)', 'execute'), 'authenticated has bind RPC grant');
select ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'agent_sessions' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), 'no generic session write grant');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.agent_sessions'::regclass), 'sessions keep forced RLS');
select ok((select count(*) = 1 from public.agent_sessions where eve_session_id = 'eve-fixture'), 'Eve ID remains unique and owned');
select ok((select count(*) = 0 from public.create_owned_agent_session('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000009999', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'gemini-3.6-flash', '{}')), 'cross-child create returns zero rows');
select ok((select count(*) = 0 from public.create_owned_agent_session('00000000-0000-0000-0000-000000009999', '00000000-0000-0000-0000-000000001021', 'm:1:a:1', now() + interval '4 minutes', 'evaluation', 'gemini-3.6-flash', '{}')), 'cross-space create returns zero rows');

select * from finish();
rollback;
