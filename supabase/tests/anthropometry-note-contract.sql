begin;
insert into auth.users(id,email,raw_user_meta_data) values
('58000000-0000-4000-8000-000000000001','note-one@example.invalid','{}'),
('58000000-0000-4000-8000-000000000002','note-two@example.invalid','{}');
insert into public.care_spaces(id,name,created_by) values('58000000-0000-4000-8000-000000000010','Note fixture','58000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values('58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000001','owner');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values('58000000-0000-4000-8000-000000000020','58000000-0000-4000-8000-000000000010','Note fixture','2025-01-01','female','58000000-0000-4000-8000-000000000001');
insert into public.child_access(care_space_id,child_id,user_id) values('58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000020','58000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000001',true) is not null as actor_set;
do $$declare receipt record; previous_id uuid;begin
 for attempt in 1..2 loop
  select * into receipt from public.record_confirmed_anthropometry_with_note(
   p_care_space_id=>'58000000-0000-4000-8000-000000000010',p_child_id=>'58000000-0000-4000-8000-000000000020',
   p_idempotency_key=>'note-fixture',p_input_fingerprint=>repeat('a',64),p_confirmation_sha256=>repeat('b',64),p_confirmation_expires_at=>now()+interval '5 minutes',
   p_measurement_type=>'weight',p_original_value_lexeme=>'3.200',p_original_unit=>'kg',p_normalized_value_lexeme=>'3.200',p_normalized_unit=>'kg',
   p_occurred_at=>'2026-11-03T15:00:00Z',p_local_date=>'2026-11-03',p_time_zone=>'America/Bogota',p_measurement_method=>'unknown',p_device=>null,
   p_provenance_type=>'guardian',p_conversion_version=>'units-v1',p_rounding_mode=>'none',p_hmac_key_id=>null,p_capture_policy_id=>'creciendo-anthropometry-v1',p_capture_policy_version=>'1',
   p_assessments=>'[]',p_supersedes_measurement_id=>null,p_supersession_reason=>null,p_source_note=>'Synthetic source note');
  if attempt=1 then
   if receipt.outcome<>'created' then raise exception 'note_create_failed';end if;previous_id:=receipt.measurement_id;
  elsif receipt.outcome<>'idempotent_replay' or receipt.measurement_id<>previous_id then raise exception 'note_replay_failed';end if;
 end loop;
 if (select count(*) from public.anthropometric_measurements where child_id='58000000-0000-4000-8000-000000000020' and source_note='Synthetic source note' and normalized_value_lexeme='3.200')<>1 then raise exception 'note_or_lexeme_not_preserved';end if;
end$$;
reset role;
create temporary table immutable_guard_probe(value integer);
create trigger immutable_guard_probe before update on immutable_guard_probe for each row execute function app_private.prevent_anthropometry_mutation();
insert into immutable_guard_probe values(1);
do $$begin
 begin update immutable_guard_probe set value=2;raise exception 'shared_guard_allowed_mutation';exception when insufficient_privilege then null;end;
 begin update public.anthropometric_measurements set normalized_value=4 where child_id='58000000-0000-4000-8000-000000000020';raise exception 'clinical_mutation_allowed';exception when insufficient_privilege then null;end;
 begin update public.anthropometric_measurements set source_note='Overwrite' where child_id='58000000-0000-4000-8000-000000000020';raise exception 'note_overwrite_allowed';exception when insufficient_privilege then null;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000002',true) is not null as foreign_actor_set;
do $$begin
 begin perform public.record_confirmed_anthropometry_with_note('58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000020','foreign-note',repeat('c',64),repeat('d',64),now()+interval '5 minutes','weight','3.2','kg','3.2','kg',now(),current_date,'America/Bogota','unknown',null,'guardian','units-v1','none',null,'creciendo-anthropometry-v1','1','[]',null,null,'Foreign');raise exception 'foreign_note_allowed';exception when insufficient_privilege then null;end;
end$$;
rollback;
