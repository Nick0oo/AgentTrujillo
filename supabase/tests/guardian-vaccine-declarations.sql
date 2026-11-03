begin;
insert into auth.users(id,email,raw_user_meta_data) values
('57000000-0000-4000-8000-000000000001','vaccine-one@example.invalid','{}'),
('57000000-0000-4000-8000-000000000002','vaccine-two@example.invalid','{}');
insert into public.care_spaces(id,name,created_by) values('57000000-0000-4000-8000-000000000010','Vaccine fixture','57000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values
('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000001','owner'),
('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000002','guardian');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values
('57000000-0000-4000-8000-000000000020','57000000-0000-4000-8000-000000000010','Vaccine fixture','2025-01-01','female','57000000-0000-4000-8000-000000000001');
insert into public.child_access(care_space_id,child_id,user_id) values
('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000020','57000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true) is not null as actor_set;
do $$declare result jsonb; replay jsonb;begin
 begin perform public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','BCG','2026-11-03','Synthetic clinic','QA1','Synthetic note','vaccine-unconfirmed',false);raise exception 'unconfirmed_declaration_accepted';exception when invalid_parameter_value then null;end;
 result:=public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','BCG','2026-11-03','Synthetic clinic','QA1','Synthetic note','vaccine-fixture',true);
 replay:=public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','BCG','2026-11-03','Synthetic clinic','QA1','Synthetic note','vaccine-fixture',true);
 if result->>'verification'<>'pending' or replay->>'outcome'<>'idempotent_replay' or result->'administration'->>'id'<>replay->'administration'->>'id' then raise exception 'vaccine_receipt_or_replay_invalid';end if;
 if not exists(select from public.vaccine_administrations where id=(result->'administration'->>'id')::uuid and recorded_by=auth.uid() and confirmation_status='draft' and vaccine_product_id is null and guardian_notes='Synthetic note' and provider_name='Synthetic clinic' and lot_number='QA1') then raise exception 'declaration_not_preserved_as_unverified';end if;
 if exists(select from public.vaccine_administration_antigens where vaccine_administration_id=(result->'administration'->>'id')::uuid) then raise exception 'unresolved_declaration_created_antigen_facts';end if;
 begin perform public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','Changed','2026-11-03',null,null,null,'vaccine-fixture',true);raise exception 'vaccine_conflict_missed';exception when unique_violation then null;end;
 begin perform public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','BCG','2024-01-01',null,null,null,'invalid-date',true);raise exception 'pre_birth_vaccine_accepted';exception when invalid_parameter_value then null;end;
end$$;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000002',true) is not null as other_actor_set;
do $$begin
 begin perform public.record_guardian_vaccine_declaration('57000000-0000-4000-8000-000000000020','CO-PAI-BCG','BCG','2026-11-03',null,null,null,'foreign',true);raise exception 'foreign_vaccine_accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
