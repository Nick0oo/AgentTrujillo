begin;
do $$declare target text; role_name text; operation text;begin
  foreach target in array array['care_spaces','care_space_members','children','child_access'] loop
    foreach role_name in array array['anon','authenticated'] loop
      foreach operation in array array['INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(role_name,'public.'||target,operation) then
          raise exception 'identity_direct_dml_still_granted';
        end if;
      end loop;
    end loop;
    if not (select relrowsecurity from pg_class where oid=('public.'||target)::regclass) then
      raise exception 'identity_rls_disabled';
    end if;
  end loop;
  if exists(select from pg_policies where schemaname='public' and policyname in
    ('care_spaces_insert','care_space_members_insert','children_insert','child_access_insert')) then
    raise exception 'open_insert_policy_retained';
  end if;
end$$;

insert into auth.users(id,email,raw_user_meta_data) values
('55000000-0000-4000-8000-000000000001','isolation-owner@example.invalid','{}'),
('55000000-0000-4000-8000-000000000002','isolation-outsider@example.invalid','{}');
insert into public.care_spaces(id,name,created_by) values
('55000000-0000-4000-8000-000000000010','Synthetic isolation test','55000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values
('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000001','owner');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by) values
('55000000-0000-4000-8000-000000000020','55000000-0000-4000-8000-000000000010','Synthetic child','2025-01-01','female','55000000-0000-4000-8000-000000000001');
insert into public.child_access(care_space_id,child_id,user_id) values
('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000020','55000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000002',true) is not null as synthetic_actor_set;
do $$begin
  if exists(select from public.children where id='55000000-0000-4000-8000-000000000020') then raise exception 'foreign_child_visible';end if;
  begin insert into public.care_space_members(care_space_id,user_id,member_role) values('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000002','owner');raise exception 'self_membership_accepted';exception when insufficient_privilege then null;end;
  begin insert into public.child_access(care_space_id,child_id,user_id) values('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000020','55000000-0000-4000-8000-000000000002');raise exception 'self_child_access_accepted';exception when insufficient_privilege then null;end;
end$$;

select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000001',true) is not null as legitimate_actor_set;
do $$declare result record;begin
  if not exists(select from public.children where id='55000000-0000-4000-8000-000000000020') then raise exception 'legitimate_read_broken';end if;
  select * into result from public.record_development_observation('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000020',null,'general','Synthetic control','Synthetic observation','2026-11-03','observed','guardian','identity-isolation-fixture',repeat('a',64),repeat('b',64),null,'{}');
  if result.outcome<>'created' then raise exception 'legitimate_command_broken';end if;
end$$;
reset role;
rollback;
do $$begin
  if exists(select from auth.users where id in ('55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002')) then raise exception 'fixture_rollback_failed';end if;
end$$;
