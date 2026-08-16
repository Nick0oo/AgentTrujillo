begin;
select plan(24);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'scope-rpc-a@example.invalid', 'scope-rpc-fixture', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'scope-rpc-b@example.invalid', 'scope-rpc-fixture', now(), '{}', '{}', now(), now());

insert into public.care_spaces (id, name, created_by)
values
  ('00000000-0000-0000-0000-000000000911', 'RPC Space A', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000912', 'RPC Space B', '00000000-0000-0000-0000-000000000902');

insert into public.care_space_members (care_space_id, user_id, member_role, status, valid_until)
values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000901', 'owner', 'active', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000902', 'guardian', 'active', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000902', 'owner', 'active', now() + interval '1 hour');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, country_of_care, time_zone, created_by)
values
  ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000911', 'RPC Child A', '2020-01-01', 'female', 'CO', 'America/Bogota', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000911', 'RPC Child B', '2021-01-01', 'male', 'US', 'America/New_York', '00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000923', '00000000-0000-0000-0000-000000000912', 'RPC Child C', '2022-01-01', 'female', 'CO', 'America/Bogota', '00000000-0000-0000-0000-000000000902');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_until, revoked_at)
values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000901', array['read', 'record', 'manage_documents'], 'active', now() + interval '1 hour', null),
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000901', array['read'], 'active', now() + interval '1 hour', null),
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000902', array['read'], 'revoked', now() + interval '1 hour', now()),
  ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000923', '00000000-0000-0000-0000-000000000902', array['read'], 'active', now() + interval '1 hour', null);

select ok((select authorization_version = 1 from public.care_space_members where care_space_id = '00000000-0000-0000-0000-000000000911' and user_id = '00000000-0000-0000-0000-000000000901'), 'membership version starts at one');
select ok((select authorization_version = 1 from public.child_access where child_id = '00000000-0000-0000-0000-000000000921' and user_id = '00000000-0000-0000-0000-000000000901'), 'access version starts at one');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok((select count(*) = 1 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['read'])), 'active read authorization resolves');
select ok((select permissions = array['read', 'record', 'manage_documents'] from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['record'])), 'required permission is contained in projection');
select ok((select country_of_care = 'CO' and timezone = 'America/Bogota' from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['manage_documents'])), 'country and timezone are authoritative');
select ok((select membership_version = 1 and access_version = 1 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['read'])), 'versions are returned');
select ok((select membership_valid_until > now() and access_valid_until > now() from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['read'])), 'validity bounds are returned');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['manage_medication'])), 'missing permission returns zero rows');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000922', array['record'])), 'wrong child permission returns zero rows');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000999', array['read'])), 'foreign child returns zero rows');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['read'])), 'revoked child access returns zero rows');
select ok((select count(*) = 1 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000923', array['read'])), 'foreign space owner resolves own child');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array[]::text[])), 'empty required permissions returns zero rows');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['read', 'read'])), 'duplicate required permissions returns zero rows');
select ok((select count(*) = 0 from public.resolve_authorized_child_scope('00000000-0000-0000-0000-000000000921', array['unknown'])), 'unknown required permissions return zero rows');

select ok(not has_function_privilege('anon', 'public.resolve_authorized_child_scope(uuid,text[])', 'execute'), 'anonymous RPC is denied');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.sub', '', true);

update public.care_space_members set member_role = 'guardian' where care_space_id = '00000000-0000-0000-0000-000000000911' and user_id = '00000000-0000-0000-0000-000000000901';
select ok((select authorization_version = 2 from public.care_space_members where care_space_id = '00000000-0000-0000-0000-000000000911' and user_id = '00000000-0000-0000-0000-000000000901'), 'membership version increments on authorization change');
update public.care_space_members set member_role = 'guardian' where care_space_id = '00000000-0000-0000-0000-000000000911' and user_id = '00000000-0000-0000-0000-000000000901';
select ok((select authorization_version = 2 from public.care_space_members where care_space_id = '00000000-0000-0000-0000-000000000911' and user_id = '00000000-0000-0000-0000-000000000901'), 'membership version does not change on no-op update');
update public.child_access set permissions = array['read', 'record'] where child_id = '00000000-0000-0000-0000-000000000921' and user_id = '00000000-0000-0000-0000-000000000901';
select ok((select authorization_version = 2 from public.child_access where child_id = '00000000-0000-0000-0000-000000000921' and user_id = '00000000-0000-0000-0000-000000000901'), 'access version increments on permission change');

select ok(to_regprocedure('public.resolve_authorized_child_scope(uuid,text[])') is not null, 'RPC exact signature exists');
select ok(has_function_privilege('authenticated', 'public.resolve_authorized_child_scope(uuid,text[])', 'execute'), 'authenticated has exact RPC grant');
select ok(not has_function_privilege('anon', 'public.resolve_authorized_child_scope(uuid,text[])', 'execute'), 'anonymous has no RPC grant');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.child_access'::regclass), 'child access keeps forced RLS');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'resolve_authorized_child_scope' and column_name in ('given_names', 'status', 'revoked_at')), 'RPC does not return sensitive reason columns');

select * from finish();
rollback;
