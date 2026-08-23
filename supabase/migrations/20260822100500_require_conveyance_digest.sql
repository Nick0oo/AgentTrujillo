-- PostgreSQL CHECK constraints accept UNKNOWN, so the conveyed branch must
-- assert non-null explicitly before applying the digest regex.

alter table public.clinical_approvals
  drop constraint clinical_approvals_provenance_check;

alter table public.clinical_approvals
  add constraint clinical_approvals_provenance_check check (
    (
      approval_provenance = 'verified_clinical_approver'
      and approver_subject is not null
      and conveyance_record_sha256 is null
    )
    or
    (
      approval_provenance = 'product_owner_conveyed'
      and approver_subject is null
      and approver_user_id is null
      and conveyance_record_sha256 is not null
      and conveyance_record_sha256 ~ '^[a-f0-9]{64}$'
    )
  );
