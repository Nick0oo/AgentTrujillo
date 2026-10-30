begin;
insert into auth.users(id,email,raw_user_meta_data) values
('40000000-0000-4000-8000-000000000001','rls-one@example.invalid','{"display_name":"Synthetic one"}'),
('40000000-0000-4000-8000-000000000002','rls-two@example.invalid','{"display_name":"Synthetic two"}');
insert into public.care_spaces(id,name,created_by) values('40000000-0000-4000-8000-000000000010','Synthetic scope','40000000-0000-4000-8000-000000000001');
insert into public.care_space_members(care_space_id,user_id,member_role) values
('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000001','owner'),
('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000002','guardian');
insert into public.children(id,care_space_id,given_names,date_of_birth,sex_for_growth,country_of_care,time_zone,created_by) values
('40000000-0000-4000-8000-000000000020','40000000-0000-4000-8000-000000000010','Synthetic one','2025-01-01','female','CO','America/Bogota','40000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000021','40000000-0000-4000-8000-000000000010','Synthetic two','2025-01-01','female','CO','America/Bogota','40000000-0000-4000-8000-000000000002');
insert into public.child_access(care_space_id,child_id,user_id) values
('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000020','40000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000021','40000000-0000-4000-8000-000000000002');
grant select on public.children to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.children)<>1 then raise exception 'active_guardian_scope_failed'; end if;
  if exists(select from public.children where id='40000000-0000-4000-8000-000000000021') then raise exception 'foreign_child_visible'; end if;
  perform public.request_account_deletion('rls-synthetic-one');
  if exists(select from public.children) then raise exception 'pending_guardian_can_read'; end if;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.children)<>1 then raise exception 'other_guardian_access_changed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    delete from public.child_access where user_id='40000000-0000-4000-8000-000000000001';
    raise exception 'definer_delete_guard_missing';
  exception when insufficient_privilege then null; end;
  if not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
    or exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then
    raise exception 'rls_prerequisite_missing';
  end if;
end $$;
rollback;
