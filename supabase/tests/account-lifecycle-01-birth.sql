begin;
insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-4000-8000-000000000001','fixture@example.invalid','{"display_name":"Fixture"}');
insert into public.consent_definitions(consent_type,jurisdiction,version,locale,title,content_sha256,document_uri,effective_from,status)
values('privacy','CO','fixture-v1','es-CO','Fixture privacy',repeat('a',64),'https://example.invalid/privacy','2020-01-01','active');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare created record; replay record; sibling record; begin
  select * into created from public.create_onboarding_with_birth_measurements(
    repeat('a',64),'birth-fixture-1','Fixture','Fixture child','2025-01-01','female','CO','America/Bogota',false,null::smallint,'{}'::text[],'mother','privacy','CO','es-CO',
    'Fixture family','Fixture preferred',null::time,null,null::smallint,3200,50.25,34.5);
  if created.outcome<>'created' or not exists(select from public.children where id=created.child_id and family_names='Fixture family' and preferred_name='Fixture preferred' and birth_length_cm=50.25 and birth_head_circumference_cm=34.5) then raise exception 'birth_metadata_not_persisted'; end if;
  select * into replay from public.create_onboarding_with_birth_measurements(
    repeat('a',64),'birth-fixture-1','Fixture','Fixture child','2025-01-01','female','CO','America/Bogota',false,null::smallint,'{}'::text[],'mother','privacy','CO','es-CO',
    'Fixture family','Fixture preferred',null::time,null,null::smallint,3200,50.25,34.5);
  if replay.outcome<>'replayed' or replay.child_id<>created.child_id then raise exception 'replay_changed_identity'; end if;
  begin
    perform public.create_onboarding_with_birth_measurements(repeat('a',64),'birth-fixture-1','Fixture','Fixture child','2025-01-01','female','CO','America/Bogota',false,null::smallint,'{}'::text[],'mother','privacy','CO','es-CO','Fixture family','Fixture preferred',null::time,null,null::smallint,3200,51,34.5);
    raise exception 'changed_dimensions_replayed';
  exception when unique_violation then null; end;
  select * into sibling from public.create_child_in_care_space_with_birth_measurements(repeat('b',64),'sibling-fixture-1',created.care_space_id,'Fixture sibling','Fixture family',null,'2025-02-01',null::time,null,'male','CO','America/Bogota',false,null::smallint,null::smallint,3300,'{}',51,35);
  if sibling.outcome<>'created' or not exists(select from public.children where id=sibling.child_id and birth_length_cm=51 and birth_head_circumference_cm=35) then raise exception 'sibling_metadata_not_persisted'; end if;
  begin
    perform public.create_child_in_care_space_with_birth_measurements(repeat('c',64),'sibling-invalid',created.care_space_id,'Fixture invalid',null,null,'2025-02-01',null::time,null,'male','CO','America/Bogota',false,null::smallint,null::smallint,3300,'{}',0,35);
    raise exception 'invalid_dimensions_accepted';
  exception when invalid_parameter_value then null; end;
  if exists(select from public.children where given_names='Fixture invalid') then raise exception 'atomic_rollback_failed'; end if;
  perform public.update_registered_birth_measurements(sibling.child_id,3400,51.5,35.25);
  if not exists(select from public.children where id=sibling.child_id and birth_weight_grams=3400 and birth_length_cm=51.5 and birth_head_circumference_cm=35.25) then raise exception 'birth_edit_not_persisted'; end if;
  select * into replay from public.create_child_in_care_space_with_birth_measurements(repeat('b',64),'sibling-fixture-1',created.care_space_id,'Fixture sibling','Fixture family',null,'2025-02-01',null::time,null,'male','CO','America/Bogota',false,null::smallint,null::smallint,3300,'{}',51,35);
  if replay.outcome<>'replayed' then raise exception 'birth_edit_broke_registration_retry'; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  begin perform public.update_registered_birth_measurements(sibling.child_id,3400,52,35); raise exception 'foreign_birth_edit_accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
