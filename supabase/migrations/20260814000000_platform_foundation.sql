-- Agent Trujillo / Creciendo
-- Clean platform foundation: tenancy, child access, consent and clinical governance.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.guardian_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  locale text not null default 'es-CO' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  time_zone text not null default 'America/Bogota' check (char_length(time_zone) between 3 and 64),
  phone_e164 text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.care_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  default_country_code text not null default 'CO' check (default_country_code in ('CO', 'US')),
  time_zone text not null default 'America/Bogota' check (char_length(time_zone) between 3 and 64),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.care_space_members (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete cascade,
  user_id uuid not null references public.guardian_profiles(user_id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'guardian')),
  status text not null default 'active' check (status in ('invited', 'active', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_space_members_unique unique (care_space_id, user_id),
  constraint care_space_members_validity check (valid_until is null or valid_until > valid_from),
  constraint care_space_members_revocation check ((status = 'revoked') = (revoked_at is not null))
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  given_names text not null check (char_length(given_names) between 1 and 120),
  family_names text check (family_names is null or char_length(family_names) between 1 and 120),
  preferred_name text check (preferred_name is null or char_length(preferred_name) between 1 and 80),
  date_of_birth date not null check (date_of_birth <= current_date),
  time_of_birth time,
  birth_time_zone text check (birth_time_zone is null or char_length(birth_time_zone) between 3 and 64),
  sex_for_growth text not null check (sex_for_growth in ('female', 'male')),
  country_of_care text not null default 'CO' check (country_of_care in ('CO', 'US')),
  time_zone text not null default 'America/Bogota' check (char_length(time_zone) between 3 and 64),
  gestational_age_weeks smallint check (gestational_age_weeks between 20 and 44),
  gestational_age_days smallint check (gestational_age_days between 0 and 6),
  birth_weight_grams numeric(7,2) check (birth_weight_grams is null or birth_weight_grams between 200 and 8000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint children_space_identity unique (care_space_id, id),
  constraint children_gestation_complete check (
    (gestational_age_weeks is null and gestational_age_days is null)
    or gestational_age_weeks is not null
  )
);

create table public.child_access (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  user_id uuid not null references public.guardian_profiles(user_id) on delete cascade,
  permissions text[] not null default array['read', 'record']::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  granted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_access_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete cascade,
  constraint child_access_unique unique (child_id, user_id),
  constraint child_access_permission_set check (
    cardinality(permissions) > 0
    and permissions <@ array['read', 'record', 'manage_documents', 'manage_medication', 'manage_guardians']::text[]
  ),
  constraint child_access_validity check (valid_until is null or valid_until > valid_from),
  constraint child_access_revocation check ((status = 'revoked') = (revoked_at is not null))
);

create table public.consent_definitions (
  id uuid primary key default gen_random_uuid(),
  consent_type text not null,
  jurisdiction text not null check (jurisdiction in ('CO', 'US', 'GLOBAL')),
  version text not null,
  locale text not null,
  title text not null,
  document_uri text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  constraint consent_definitions_unique unique (consent_type, jurisdiction, version, locale),
  constraint consent_definitions_dates check (effective_until is null or effective_until >= effective_from)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  child_id uuid,
  guardian_user_id uuid not null,
  consent_definition_id uuid not null references public.consent_definitions(id) on delete restrict,
  decision text not null check (decision in ('accepted', 'declined', 'revoked')),
  decided_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  constraint consent_records_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint consent_records_revoked check ((decision = 'revoked') = (revoked_at is not null))
);

create table public.clinical_sources (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  jurisdiction text not null,
  title text not null,
  source_uri text not null,
  citation text,
  published_at date,
  retrieved_at timestamptz not null,
  effective_from date,
  effective_until date,
  license text,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'candidate' check (status in ('candidate', 'reviewed', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  constraint clinical_sources_uri_version unique (source_uri, retrieved_at),
  constraint clinical_sources_dates check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create table public.clinical_rule_packs (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('growth', 'immunization', 'medication', 'development', 'nutrition', 'emergency')),
  country_code text not null check (country_code in ('CO', 'US', 'GLOBAL')),
  version text not null,
  locale text not null default 'es-CO',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'active', 'retired')),
  effective_from date,
  effective_until date,
  artifact_uri text,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_rule_packs_unique unique (domain, country_code, version, locale),
  constraint clinical_rule_packs_dates check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create table public.clinical_rule_pack_sources (
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete cascade,
  source_id uuid not null references public.clinical_sources(id) on delete restrict,
  purpose text not null,
  created_at timestamptz not null default now(),
  primary key (rule_pack_id, source_id)
);

create table public.clinical_approvals (
  id uuid primary key default gen_random_uuid(),
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  approver_name text not null,
  approver_user_id uuid,
  decision text not null check (decision in ('approved', 'rejected', 'withdrawn')),
  notes text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.clinical_algorithms (
  id uuid primary key default gen_random_uuid(),
  algorithm_key text not null,
  version text not null,
  domain text not null,
  implementation_sha256 text not null check (implementation_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'retired')),
  created_at timestamptz not null default now(),
  constraint clinical_algorithms_unique unique (algorithm_key, version)
);

create index care_space_members_user_idx on public.care_space_members(user_id, status);
create index children_space_idx on public.children(care_space_id, status);
create index child_access_user_idx on public.child_access(user_id, status, child_id);
create index child_access_space_child_idx on public.child_access(care_space_id, child_id, status);
create index consent_records_scope_idx on public.consent_records(care_space_id, child_id, guardian_user_id);
create index clinical_rule_packs_lookup_idx on public.clinical_rule_packs(domain, country_code, status, effective_from);

create or replace function app_private.has_space_access(target_care_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_space_members m
    where m.care_space_id = target_care_space_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
  );
$$;

create or replace function app_private.can_manage_space(target_care_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_space_members m
    where m.care_space_id = target_care_space_id
      and m.user_id = (select auth.uid())
      and m.member_role = 'owner'
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
  );
$$;

create or replace function app_private.has_child_permission(
  target_care_space_id uuid,
  target_child_id uuid,
  required_permission text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_space_access(target_care_space_id)
    and exists (
      select 1
      from public.child_access a
      where a.care_space_id = target_care_space_id
        and a.child_id = target_child_id
        and a.user_id = (select auth.uid())
        and a.status = 'active'
        and a.revoked_at is null
        and a.valid_from <= now()
        and (a.valid_until is null or a.valid_until > now())
        and required_permission = any(a.permissions)
    );
$$;

revoke all on function app_private.has_space_access(uuid) from public;
revoke all on function app_private.can_manage_space(uuid) from public;
revoke all on function app_private.has_child_permission(uuid, uuid, text) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.has_space_access(uuid) to authenticated;
grant execute on function app_private.can_manage_space(uuid) to authenticated;
grant execute on function app_private.has_child_permission(uuid, uuid, text) to authenticated;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.guardian_profiles (user_id, display_name, locale)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(split_part(new.email, '@', 1), ''), 'Tutor'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'es-CO')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

insert into public.guardian_profiles (user_id, display_name, locale)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(split_part(u.email, '@', 1), ''), 'Tutor'),
  coalesce(nullif(u.raw_user_meta_data ->> 'locale', ''), 'es-CO')
from auth.users u
on conflict (user_id) do nothing;

alter table public.guardian_profiles enable row level security;
alter table public.guardian_profiles force row level security;
create policy guardian_profiles_self_select on public.guardian_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy guardian_profiles_self_update on public.guardian_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.care_spaces enable row level security;
alter table public.care_spaces force row level security;
create policy care_spaces_member_select on public.care_spaces
  for select to authenticated using (app_private.has_space_access(id));

alter table public.care_space_members enable row level security;
alter table public.care_space_members force row level security;
create policy care_space_members_member_select on public.care_space_members
  for select to authenticated using (app_private.has_space_access(care_space_id));

alter table public.children enable row level security;
alter table public.children force row level security;
create policy children_explicit_access_select on public.children
  for select to authenticated using (app_private.has_child_permission(care_space_id, id, 'read'));

alter table public.child_access enable row level security;
alter table public.child_access force row level security;
create policy child_access_visible_select on public.child_access
  for select to authenticated using (
    user_id = (select auth.uid()) or app_private.can_manage_space(care_space_id)
  );

alter table public.consent_definitions enable row level security;
alter table public.consent_definitions force row level security;
create policy consent_definitions_active_select on public.consent_definitions
  for select to authenticated using (status in ('active', 'retired'));

alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;
create policy consent_records_scope_select on public.consent_records
  for select to authenticated using (
    guardian_user_id = (select auth.uid())
    and app_private.has_space_access(care_space_id)
    and (child_id is null or app_private.has_child_permission(care_space_id, child_id, 'read'))
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clinical_sources', 'clinical_rule_packs', 'clinical_rule_pack_sources',
    'clinical_approvals', 'clinical_algorithms'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_authenticated_select',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'guardian_profiles', 'care_spaces', 'care_space_members', 'children', 'child_access',
    'clinical_rule_packs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.guardian_profiles to authenticated;
grant select on public.care_spaces, public.care_space_members, public.children, public.child_access to authenticated;
grant select on public.consent_definitions, public.consent_records to authenticated;
grant select on public.clinical_sources, public.clinical_rule_packs,
  public.clinical_rule_pack_sources, public.clinical_approvals, public.clinical_algorithms to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
