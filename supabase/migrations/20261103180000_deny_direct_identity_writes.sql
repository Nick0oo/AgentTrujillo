-- Forward isolation repair approved by the user on 2026-11-03.
-- Identity creation remains behind existing SECURITY DEFINER onboarding commands.
begin;
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and policyname in ('care_spaces_insert','care_space_members_insert','children_insert','child_access_insert')
      and (cmd<>'INSERT' or permissive<>'PERMISSIVE' or with_check<>'true')
  ) then raise exception 'identity_insert_policy_drift'; end if;
end $$;

drop policy if exists care_spaces_insert on public.care_spaces;
drop policy if exists care_space_members_insert on public.care_space_members;
drop policy if exists children_insert on public.children;
drop policy if exists child_access_insert on public.child_access;

revoke insert, update, delete on public.care_spaces, public.care_space_members,
  public.children, public.child_access from public, anon, authenticated;

-- Keep RLS, existing SELECT policies, pending-account denials and triggers.
-- No profile, membership, observation or account data is modified.
commit;
