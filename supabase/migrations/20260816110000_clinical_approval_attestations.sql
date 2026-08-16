alter table public.clinical_approvals
  add column attestation_version integer not null default 1,
  add column algorithm_id uuid references public.clinical_algorithms(id) on delete restrict,
  add column algorithm_implementation_sha256 text,
  add column source_set_sha256 text,
  add column manifest_sha256 text,
  add column approver_subject uuid,
  add column approver_role text,
  add column withdrawal_of uuid references public.clinical_approvals(id) on delete restrict,
  add column request_id uuid;

do $$
begin
  if exists (select 1 from public.clinical_approvals) then
    raise exception 'clinical_approvals rows require controlled attestation backfill before module 03 hardening';
  end if;
end;
$$;

alter table public.clinical_approvals
  alter column algorithm_id set not null,
  alter column algorithm_implementation_sha256 set not null,
  alter column source_set_sha256 set not null,
  alter column manifest_sha256 set not null,
  alter column approver_subject set not null,
  alter column approver_role set not null,
  alter column request_id set not null;

alter table public.clinical_approvals
  add constraint clinical_approvals_attestation_version_check check (attestation_version = 1),
  add constraint clinical_approvals_algorithm_digest_check check (algorithm_implementation_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint clinical_approvals_source_set_digest_check check (source_set_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint clinical_approvals_manifest_digest_check check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint clinical_approvals_approver_role_check check (approver_role = 'clinical_approver'),
  add constraint clinical_approvals_withdrawal_check check ((decision = 'withdrawn') = (withdrawal_of is not null)),
  add constraint clinical_approvals_request_unique unique (request_id);

create unique index clinical_approvals_current_approval_idx
  on public.clinical_approvals (rule_pack_id, artifact_sha256, manifest_sha256)
  where decision = 'approved';

create or replace function app_private.prevent_clinical_approval_mutation()
returns trigger
language plpgsql
set search_path = public, app_private
as $$
begin
  raise exception 'clinical approval attestations are append-only';
end;
$$;

drop trigger if exists clinical_approvals_append_only on public.clinical_approvals;
create trigger clinical_approvals_append_only
before update or delete on public.clinical_approvals
for each row execute function app_private.prevent_clinical_approval_mutation();
