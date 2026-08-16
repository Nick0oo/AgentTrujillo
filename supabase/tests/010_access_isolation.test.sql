begin;
select plan(45);

-- Synthetic-only fixtures. The entire file is rollbackable and never reaches Auth/Storage APIs.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'matrix-a@example.invalid', 'matrix-fixture', now(), '{}', '{"full_name":"Matrix A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'matrix-b@example.invalid', 'matrix-fixture', now(), '{}', '{"full_name":"Matrix B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'matrix-c@example.invalid', 'matrix-fixture', now(), '{}', '{"full_name":"Matrix C"}', now(), now());

insert into public.care_spaces (id, name, created_by)
values
  ('00000000-0000-0000-0000-000000000101', 'Matrix Space A', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000102', 'Matrix Space B', '00000000-0000-0000-0000-000000000203');

insert into public.care_space_members (care_space_id, user_id, member_role, status)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202', 'guardian', 'active'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000203', 'owner', 'active');

insert into public.children (id, care_space_id, given_names, date_of_birth, sex_for_growth, created_by)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'Matrix Child A', '2020-01-01', 'female', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', 'Matrix Child B', '2021-01-01', 'male', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000102', 'Matrix Child C', '2022-01-01', 'female', '00000000-0000-0000-0000-000000000203');

insert into public.child_access (care_space_id, child_id, user_id, permissions, status, valid_from, valid_until, revoked_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', array['read', 'record', 'manage_documents', 'manage_medication'], 'active', now() - interval '2 days', null, null),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', array['read'], 'active', now() - interval '3 days', now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', array['record'], 'active', now() - interval '2 days', null, null),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000203', array['read'], 'revoked', now() - interval '3 days', null, now() - interval '1 hour');

insert into public.agent_sessions (id, care_space_id, child_id, owner_user_id, eve_session_id, channel, initial_model)
values ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'matrix-session-a', 'evaluation', 'fixture');

insert into public.messages (id, care_space_id, child_id, agent_session_id, sequence, actor_type, actor_user_id, parts)
values ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000501', 1, 'guardian', '00000000-0000-0000-0000-000000000201', '[]');

insert into public.documents (id, care_space_id, child_id, bucket_id, object_path, document_type, detected_mime_type, size_bytes, sha256, provenance_type, uploaded_by)
values ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'clinical-attachments', 'matrix/child-a/fixture.bin', 'fixture', 'application/octet-stream', 1, repeat('a', 64), 'guardian', '00000000-0000-0000-0000-000000000201');

insert into public.documents (id, care_space_id, child_id, bucket_id, object_path, document_type, detected_mime_type, size_bytes, sha256, provenance_type, uploaded_by)
values ('00000000-0000-0000-0000-000000000509', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'clinical-attachments', 'matrix/child-b/fixture.bin', 'fixture', 'application/octet-stream', 1, repeat('d', 64), 'guardian', '00000000-0000-0000-0000-000000000201');

insert into public.clinical_memory_items (id, care_space_id, child_id, memory_type, structured_content, searchable_text, provenance_type, source_session_id, created_by)
values ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'history', '{"marker":"synthetic"}', 'synthetic matrix fixture', 'guardian', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000201');

insert into public.clinical_memory_embeddings (id, care_space_id, child_id, memory_item_id, embedding_model, embedding, content_sha256)
values ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000504', 'fixture', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, repeat('b', 64));

insert into public.conversation_summaries (id, care_space_id, child_id, agent_session_id, generator_version, summary, source_message_ids)
values ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000501', 'fixture', '{"marker":"synthetic"}', array['00000000-0000-0000-0000-000000000502']::uuid[]);

insert into public.entitlements (id, care_space_id, capability, status, source_provider, starts_at)
values ('00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000101', 'fixture-capability', 'active', 'free', now() - interval '1 day');

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values ('00000000-0000-0000-0000-000000000508', 'clinical-attachments', 'matrix/child-a/fixture.bin', '00000000-0000-0000-0000-000000000201', '{}');

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values ('00000000-0000-0000-0000-000000000510', 'clinical-attachments', 'matrix/child-b/fixture.bin', '00000000-0000-0000-0000-000000000201', '{}');

select ok(true, 'synthetic fixtures loaded');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok((select count(*) = 1 from public.care_spaces where id = '00000000-0000-0000-0000-000000000101'), 'authorized guardian sees care space');
select ok((select count(*) = 1 from public.care_space_members where care_space_id = '00000000-0000-0000-0000-000000000101' and user_id = '00000000-0000-0000-0000-000000000201'), 'authorized guardian sees membership');
select ok((select count(*) = 1 from public.children where id = '00000000-0000-0000-0000-000000000301'), 'authorized guardian sees child');
select ok((select count(*) = 1 from public.child_access where child_id = '00000000-0000-0000-0000-000000000301'), 'authorized guardian sees child access');
select ok((select count(*) = 1 from public.documents where id = '00000000-0000-0000-0000-000000000503'), 'authorized guardian sees document');
select ok((select count(*) = 1 from public.agent_sessions where id = '00000000-0000-0000-0000-000000000501'), 'authorized guardian sees session');
select ok((select count(*) = 1 from public.messages where id = '00000000-0000-0000-0000-000000000502'), 'authorized guardian sees message');
select ok((select count(*) = 1 from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000504'), 'authorized guardian sees memory item');
select ok((select count(*) = 1 from public.clinical_memory_embeddings where id = '00000000-0000-0000-0000-000000000505'), 'authorized guardian sees embedding');
select ok((select count(*) = 1 from public.conversation_summaries where id = '00000000-0000-0000-0000-000000000506'), 'authorized guardian sees summary');
select ok((select count(*) = 1 from public.entitlements where id = '00000000-0000-0000-0000-000000000507'), 'authorized guardian sees entitlement');
select ok((select count(*) = 1 from storage.objects where id = '00000000-0000-0000-0000-000000000508'), 'authorized guardian sees storage object through document scope');
select ok((select count(*) = 1 from public.match_clinical_memory('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'authorized guardian can execute scoped memory RPC');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select ok((select count(*) = 0 from public.children where id = '00000000-0000-0000-0000-000000000301'), 'same-space sibling child is hidden');
select ok((select count(*) = 0 from public.documents where id = '00000000-0000-0000-0000-000000000503'), 'same-space sibling document is hidden');
select ok((select count(*) = 0 from public.agent_sessions where id = '00000000-0000-0000-0000-000000000501'), 'same-space sibling session is hidden');
select ok((select count(*) = 0 from public.messages where id = '00000000-0000-0000-0000-000000000502'), 'same-space sibling message is hidden');
select ok((select count(*) = 0 from public.clinical_memory_items where id = '00000000-0000-0000-0000-000000000504'), 'same-space sibling memory is hidden');
select ok((select count(*) = 0 from public.clinical_memory_embeddings where id = '00000000-0000-0000-0000-000000000505'), 'same-space sibling embedding is hidden');
select ok((select count(*) = 0 from storage.objects where id = '00000000-0000-0000-0000-000000000508'), 'same-space sibling storage object is hidden');
select ok((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'same-space sibling memory RPC returns zero');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
select ok((select count(*) = 0 from public.children where id = '00000000-0000-0000-0000-000000000301'), 'foreign-space child is hidden');
select ok((select count(*) = 0 from public.documents where id = '00000000-0000-0000-0000-000000000503'), 'foreign-space document is hidden');
select ok((select count(*) = 0 from public.entitlements where id = '00000000-0000-0000-0000-000000000507'), 'foreign-space entitlement is hidden');
select ok((select count(*) = 0 from storage.objects where id = '00000000-0000-0000-0000-000000000508'), 'foreign-space storage object is hidden');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
select ok((select count(*) = 0 from public.children where id = '00000000-0000-0000-0000-000000000303'), 'revoked child access hides child');
select ok((select count(*) = 0 from public.documents where child_id = '00000000-0000-0000-0000-000000000303'), 'revoked child access hides documents');
select ok((select count(*) = 0 from storage.objects where id = '00000000-0000-0000-0000-000000000508'), 'revoked child access hides storage');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select ok((select count(*) = 0 from public.children where id = '00000000-0000-0000-0000-000000000302'), 'expired child access hides child');
select ok((select count(*) = 0 from public.documents where child_id = '00000000-0000-0000-0000-000000000302'), 'expired child access hides documents');
select ok((select count(*) = 0 from storage.objects where id = '00000000-0000-0000-0000-000000000510'), 'expired child access hides storage');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select ok((select count(*) = 0 from public.children where id = '00000000-0000-0000-0000-000000000302'), 'wrong permission hides child');
select ok((select count(*) = 0 from public.documents where child_id = '00000000-0000-0000-0000-000000000302'), 'wrong permission hides documents');
select ok((select count(*) = 0 from public.clinical_memory_items where child_id = '00000000-0000-0000-0000-000000000301'), 'wrong permission hides memory');
select ok((select count(*) = 0 from public.match_clinical_memory('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)), 'wrong permission memory RPC returns zero');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($matrix$select count(*) from public.care_spaces$matrix$, '42501', null, 'anonymous care-space read is denied');
select throws_ok($matrix$select count(*) from public.children$matrix$, '42501', null, 'anonymous child read is denied');
select throws_ok($matrix$select * from public.match_clinical_memory('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', format('[%s]', array_to_string(array_fill(0::real, array[768]), ','))::extensions.vector, 8, 0)$matrix$, '42501', null, 'anonymous memory RPC is denied');
select ok((select count(*) = 0 from storage.objects where id = '00000000-0000-0000-0000-000000000508'), 'anonymous storage read returns zero rows');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select throws_ok($matrix$insert into public.documents (care_space_id, child_id, bucket_id, object_path, document_type, detected_mime_type, size_bytes, sha256, provenance_type, uploaded_by) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'clinical-attachments', 'matrix/insert.bin', 'fixture', 'application/octet-stream', 1, repeat('c', 64), 'guardian', '00000000-0000-0000-0000-000000000201')$matrix$, '42501', null, 'authenticated insert is denied');
select throws_ok($matrix$update public.documents set original_filename = 'blocked' where id = '00000000-0000-0000-0000-000000000503'$matrix$, '42501', null, 'authenticated update is denied');
select throws_ok($matrix$delete from public.documents where id = '00000000-0000-0000-0000-000000000503'$matrix$, '42501', null, 'authenticated delete is denied');
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

select ok((select count(*) = 57 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity), 'all public product tables force RLS');
select ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'), 'anonymous has no public product table grants');

select * from finish();
rollback;
