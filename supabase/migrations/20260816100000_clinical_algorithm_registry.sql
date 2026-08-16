alter table public.clinical_algorithms
  add column artifact_schema_versions text[] not null default array['1']::text[],
  add column entrypoint text not null default 'unknown',
  add column runtime text not null default 'node24',
  add column test_vector_sha256 text not null default repeat('0', 64),
  add column approved_at timestamptz,
  add column activated_at timestamptz,
  add column retired_at timestamptz,
  add column updated_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from public.clinical_algorithms where domain is null) then
    raise exception 'clinical_algorithms rows require an explicit domain before module 03 registry migration';
  end if;
end;
$$;

alter table public.clinical_algorithms
  alter column domain set not null,
  alter column entrypoint drop default,
  alter column test_vector_sha256 drop default;

alter table public.clinical_algorithms
  drop constraint clinical_algorithms_unique,
  add constraint clinical_algorithms_identity_unique unique (domain, algorithm_key, version),
  add constraint clinical_algorithms_domain_check check (domain in ('growth', 'immunization', 'medication', 'development', 'nutrition', 'emergency')),
  add constraint clinical_algorithms_version_check check (version ~ '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'),
  add constraint clinical_algorithms_schema_versions_check check (cardinality(artifact_schema_versions) > 0 and array_to_string(artifact_schema_versions, ',') ~ '^\d+(,\d+)*$'),
  add constraint clinical_algorithms_entrypoint_check check (entrypoint ~ '^[A-Za-z_][A-Za-z0-9_.-]{0,127}$'),
  add constraint clinical_algorithms_runtime_check check (runtime ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  add constraint clinical_algorithms_vector_digest_check check (test_vector_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint clinical_algorithms_lifecycle_check check (
    (status = 'draft' and approved_at is null and activated_at is null and retired_at is null)
    or (status = 'approved' and approved_at is not null and activated_at is null and retired_at is null)
    or (status = 'active' and approved_at is not null and activated_at is not null and retired_at is null)
    or (status = 'retired' and retired_at is not null)
  );

create or replace function app_private.guard_clinical_algorithm_transition()
returns trigger
language plpgsql
set search_path = public, app_private
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.domain, new.algorithm_key, new.version, new.implementation_sha256, new.artifact_schema_versions,
        new.entrypoint, new.runtime, new.test_vector_sha256)
       is distinct from
       (old.domain, old.algorithm_key, old.version, old.implementation_sha256, old.artifact_schema_versions,
        old.entrypoint, old.runtime, old.test_vector_sha256) then
      raise exception 'clinical algorithm identity is immutable';
    end if;
    if old.status = 'draft' and new.status not in ('draft', 'approved') then
      raise exception 'invalid clinical algorithm lifecycle transition';
    elsif old.status = 'approved' and new.status not in ('approved', 'active', 'retired') then
      raise exception 'invalid clinical algorithm lifecycle transition';
    elsif old.status = 'active' and new.status not in ('active', 'retired') then
      raise exception 'invalid clinical algorithm lifecycle transition';
    elsif old.status = 'retired' and new.status <> 'retired' then
      raise exception 'retired clinical algorithm cannot be reactivated';
    end if;
  end if;
  if new.status = 'approved' and new.approved_at is null then new.approved_at = coalesce(old.approved_at, now()); end if;
  if new.status = 'active' and new.activated_at is null then new.activated_at = coalesce(old.activated_at, now()); end if;
  if new.status = 'retired' and new.retired_at is null then new.retired_at = coalesce(old.retired_at, now()); end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clinical_algorithms_transition_guard on public.clinical_algorithms;
create trigger clinical_algorithms_transition_guard
before update on public.clinical_algorithms
for each row execute function app_private.guard_clinical_algorithm_transition();
