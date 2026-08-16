-- Atomic authorization projection for an authenticated guardian.

alter table public.care_space_members
  add column authorization_version bigint not null default 1
  constraint care_space_members_authorization_version_check check (authorization_version > 0);

alter table public.child_access
  add column authorization_version bigint not null default 1
  constraint child_access_authorization_version_check check (authorization_version > 0);

create or replace function app_private.bump_authorization_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'care_space_members' then
    if new.member_role is distinct from old.member_role
      or new.status is distinct from old.status
      or new.valid_from is distinct from old.valid_from
      or new.valid_until is distinct from old.valid_until
      or new.revoked_at is distinct from old.revoked_at then
      new.authorization_version = old.authorization_version + 1;
    end if;
  elsif tg_table_name = 'child_access' then
    if new.permissions is distinct from old.permissions
      or new.status is distinct from old.status
      or new.valid_from is distinct from old.valid_from
      or new.valid_until is distinct from old.valid_until
      or new.revoked_at is distinct from old.revoked_at then
      new.authorization_version = old.authorization_version + 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.bump_authorization_version() from public, anon, authenticated;

create trigger care_space_members_authorization_version
before update on public.care_space_members
for each row execute function app_private.bump_authorization_version();

create trigger child_access_authorization_version
before update on public.child_access
for each row execute function app_private.bump_authorization_version();

create function public.resolve_authorized_child_scope(
  p_child_id uuid,
  p_required_permissions text[]
)
returns table (
  care_space_id uuid,
  child_id uuid,
  permissions text[],
  country_of_care text,
  timezone text,
  membership_version bigint,
  access_version bigint,
  membership_valid_until timestamptz,
  access_valid_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.care_space_id,
    a.child_id,
    a.permissions,
    c.country_of_care,
    c.time_zone,
    m.authorization_version,
    a.authorization_version,
    m.valid_until,
    a.valid_until
  from public.children c
  join public.care_space_members m
    on m.care_space_id = c.care_space_id
    and m.user_id = (select auth.uid())
  join public.child_access a
    on a.care_space_id = c.care_space_id
    and a.child_id = c.id
    and a.user_id = (select auth.uid())
  where c.id = p_child_id
    and c.status = 'active'
    and m.status = 'active'
    and m.revoked_at is null
    and m.valid_from <= now()
    and (m.valid_until is null or m.valid_until > now())
    and a.status = 'active'
    and a.revoked_at is null
    and a.valid_from <= now()
    and (a.valid_until is null or a.valid_until > now())
    and p_required_permissions is not null
    and cardinality(p_required_permissions) > 0
    and cardinality(p_required_permissions) = cardinality(array(select distinct unnest(p_required_permissions)))
    and p_required_permissions <@ array['read', 'record', 'manage_documents', 'manage_medication', 'manage_guardians']::text[]
    and not exists (
      select 1
      from unnest(p_required_permissions) required(permission)
      where required.permission <> all(a.permissions)
    );
$$;

revoke all on function public.resolve_authorized_child_scope(uuid, text[]) from public, anon, authenticated;
grant execute on function public.resolve_authorized_child_scope(uuid, text[]) to authenticated;
