-- Explicitly distinguish direct verified approval from product-owner-conveyed
-- approval. Conveyed provenance is not a personal signature or user identity,
-- but it remains bound to the exact immutable approval-record digest.

alter table public.clinical_approvals
  add column approval_provenance text not null default 'verified_clinical_approver',
  add column conveyance_record_sha256 text;

alter table public.clinical_approvals
  alter column approver_subject drop not null;

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
      and conveyance_record_sha256 ~ '^[a-f0-9]{64}$'
    )
  );

comment on column public.clinical_approvals.approval_provenance is
  'verified_clinical_approver is direct identity-bound approval; product_owner_conveyed records a relayed decision and is not a signature';
comment on column public.clinical_approvals.conveyance_record_sha256 is
  'SHA-256 of the immutable repository record that documents a product-owner-conveyed approval';
