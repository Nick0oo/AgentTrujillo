begin;
select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'vector-a@example.invalid', 'vector-fixture', now(), '{}', '{"full_name":"Vector A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000802', 'authenticated', 'authenticated', 'vector-b@example.invalid', 'vector-fixture', now(), '{}', '{"full_name":"Vector B"}', now(), now());

insert into public.care_spaces (id, name, created_by)
values
  ('00000000-0000-0000-0000-000000000811', 'Vector Space A', '00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000812', 'Vector Space B', '00000000-0000-0000-0000-000000000802');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000801', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000802', 'guardian', 'active'),
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000802', 'owner', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000811', 'Vector Child A', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000811', 'Vector Child B', '2021-01-01', 'male', '00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000823', '00000000-0000-0000-0000-000000000812', 'Vector Child C', '2022-01-01', 'female', '00000000-0000-0000-0000-000000000802');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from)
values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000801', array['read'], 'active', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000802', array['read'], 'active', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000823', '00000000-0000-0000-0000-000000000802', array['read'], 'active', now() - interval '1 hour');

insert into public.clinical_memory_items (id, care_space_id, child_id, memory_type, structured_content, searchable_text, provenance_type, confirmation_status)
values
  ('00000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', 'history', '{"marker":"vector-a"}', 'vector a', 'guardian', 'confirmed'),
  ('00000000-0000-0000-0000-000000000832', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', 'history', '{"marker":"vector-b"}', 'vector b', 'guardian', 'confirmed'),
  ('00000000-0000-0000-0000-000000000833', '00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000823', 'history', '{"marker":"vector-c"}', 'vector c', 'guardian', 'confirmed');

insert into public.clinical_memory_embeddings (id, care_space_id, child_id, memory_item_id, embedding_model, embedding, content_sha256)
values
  ('00000000-0000-0000-0000-000000000841', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000831', 'fixture', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, repeat('a', 64)),
  ('00000000-0000-0000-0000-000000000842', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000832', 'fixture', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, repeat('b', 64)),
  ('00000000-0000-0000-0000-000000000843', '00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000823', '00000000-0000-0000-0000-000000000833', 'fixture', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, repeat('c', 64));

select ok((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_items_scope_identity'), 'memory item scope identity exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'clinical_memory_embeddings_scope_fk'), 'embedding composite scope FK exists');
select ok(to_regprocedure('public.match_clinical_memory(uuid,uuid,extensions.vector,integer,double precision)') is not null, 'new scoped RPC exists');
select ok(to_regprocedure('public.match_clinical_memory(uuid,extensions.vector,integer,double precision)') is null, 'old one-dimensional RPC is absent');
select ok(has_function_privilege('authenticated', 'public.match_clinical_memory(uuid,uuid,extensions.vector,integer,double precision)', 'execute'), 'authenticated can execute scoped RPC');
select ok(not has_function_privilege('anon', 'public.match_clinical_memory(uuid,uuid,extensions.vector,integer,double precision)', 'execute'), 'anonymous cannot execute scoped RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select ok((select count(*) = 1 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'authorized scoped query returns own child');
select ok((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'sibling child remains excluded without active context');
select ok((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000823', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'foreign space returns zero rows');
select ok((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 1.1)), 'invalid threshold returns zero rows');
select ok((select count(*) <= 1 from public.match_clinical_memory('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 0, 0)), 'match count is clamped');
select throws_ok($sql$select * from public.match_clinical_memory('00000000-0000-0000-0000-000000000821', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)$sql$, '42883', null, 'old RPC call cannot resolve');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($sql$select * from public.match_clinical_memory('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000821', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)$sql$, '42501', null, 'anonymous scoped RPC is denied');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok($sql$insert into public.clinical_memory_embeddings (care_space_id, child_id, memory_item_id, embedding_model, embedding, content_sha256) values ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000831', 'mismatch', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, repeat('d', 64))$sql$, '23503', null, 'embedding scope mismatch is rejected');
select ok((select count(*) = 0 from pg_proc p where p.proname = 'match_clinical_memory' and p.pronargs = 4), 'no old RPC overload remains');

select * from finish();
rollback;
