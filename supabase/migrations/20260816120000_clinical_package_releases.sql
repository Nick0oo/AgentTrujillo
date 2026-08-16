create table public.clinical_package_releases (
  id uuid primary key default gen_random_uuid(),
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  algorithm_id uuid not null references public.clinical_algorithms(id) on delete restrict,
  approval_id uuid not null references public.clinical_approvals(id) on delete restrict,
  domain text not null check (domain in ('growth', 'immunization', 'medication', 'development', 'nutrition', 'emergency')),
  country_code text not null check (country_code in ('CO', 'US', 'GLOBAL')),
  locale text not null,
  action text not null check (action in ('release', 'rollback')),
  status text not null check (status in ('active', 'superseded')),
  activation_at timestamptz not null,
  previous_release_id uuid references public.clinical_package_releases(id) on delete restrict,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  preview_sha256 text not null check (preview_sha256 ~ '^[0-9a-f]{64}$'),
  requester_subject uuid not null,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint clinical_package_releases_previous_check check (previous_release_id is not null or action = 'release')
);

create unique index clinical_package_releases_one_active
  on public.clinical_package_releases (domain, country_code, locale)
  where status = 'active';

alter table public.clinical_package_releases enable row level security;
alter table public.clinical_package_releases force row level security;
grant select on public.clinical_package_releases to authenticated;

create or replace function app_private.prevent_clinical_release_mutation()
returns trigger language plpgsql set search_path = public, app_private as $$
begin
  if current_setting('app.release_transition', true) <> '1' then raise exception 'clinical release ledger is append-only'; end if;
  if tg_op = 'DELETE' then raise exception 'clinical release ledger cannot delete'; end if;
  return new;
end;
$$;
create trigger clinical_package_releases_append_only
before update or delete on public.clinical_package_releases
for each row execute function app_private.prevent_clinical_release_mutation();

create or replace function app_private.activate_clinical_package(
  p_rule_pack_id uuid, p_artifact_sha256 text, p_algorithm_id uuid, p_approval_id uuid,
  p_domain text, p_country_code text, p_locale text, p_activation_at timestamptz,
  p_previous_release_id uuid, p_evidence_sha256 text, p_requester_subject uuid,
  p_request_id uuid, p_action text, p_preview_sha256 text
)
returns public.clinical_package_releases
language plpgsql security definer set search_path = public, app_private
as $$
declare result public.clinical_package_releases;
begin
  perform pg_advisory_xact_lock(hashtext(format('%s:%s:%s', p_domain, p_country_code, p_locale)));
  select * into result from public.clinical_package_releases where request_id = p_request_id;
  if result.id is not null then return result; end if;
  if not exists (select 1 from public.clinical_approvals where id = p_approval_id and rule_pack_id = p_rule_pack_id and artifact_sha256 = p_artifact_sha256 and decision = 'approved') then raise exception 'release approval precondition failed'; end if;
  perform set_config('app.release_transition', '1', true);
  update public.clinical_package_releases set status = 'superseded' where domain = p_domain and country_code = p_country_code and locale = p_locale and status = 'active';
  insert into public.clinical_package_releases (rule_pack_id, artifact_sha256, algorithm_id, approval_id, domain, country_code, locale, action, status, activation_at, previous_release_id, evidence_sha256, preview_sha256, requester_subject, request_id)
  values (p_rule_pack_id, p_artifact_sha256, p_algorithm_id, p_approval_id, p_domain, p_country_code, p_locale, p_action, 'active', p_activation_at, p_previous_release_id, p_evidence_sha256, p_preview_sha256, p_requester_subject, p_request_id)
  returning * into result;
  return result;
end;
$$;
revoke all on function app_private.activate_clinical_package(uuid,text,uuid,uuid,text,text,text,timestamptz,uuid,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function app_private.activate_clinical_package(uuid,text,uuid,uuid,text,text,text,timestamptz,uuid,text,uuid,uuid,text,text) to service_role;
