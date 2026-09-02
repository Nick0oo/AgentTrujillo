alter table public.vaccine_administrations
  add column if not exists draft_expires_at timestamptz;

create or replace function public.create_vaccine_administration_draft(
  p_care_space_id uuid,
  p_child_id uuid,
  p_vaccine_product_id uuid,
  p_administered_on date,
  p_dose_label text,
  p_lot_number text,
  p_administration_site text,
  p_country_code text,
  p_provenance_type text,
  p_source_digest text,
  p_confirmation_sha256 text,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_draft_expires_at timestamptz,
  p_catalog_version text,
  p_catalog_digest text
)
returns table (draft_id uuid, outcome text, draft_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.vaccine_administrations;
  created public.vaccine_administrations;
begin
  if actor is null
    or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record')
    or p_country_code not in ('CO', 'US')
    or p_provenance_type <> 'guardian'
    or p_vaccine_product_id is null
    or p_administered_on is null
    or p_administered_on > current_date
    or p_draft_expires_at is null
    or p_draft_expires_at <= now()
    or p_draft_expires_at > now() + interval '10 minutes'
    or p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_confirmation_sha256 is null or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
    or p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_catalog_digest is null or p_catalog_digest !~ '^[a-f0-9]{64}$'
    or p_catalog_version is null or length(p_catalog_version) = 0 or length(p_catalog_version) > 128
    or p_idempotency_key is null or length(p_idempotency_key) = 0 or length(p_idempotency_key) > 200
    or length(coalesce(p_dose_label, '')) > 120
    or length(coalesce(p_lot_number, '')) > 120
    or length(coalesce(p_administration_site, '')) > 160
    or not exists (
      select 1 from public.children c
      where c.care_space_id = p_care_space_id and c.id = p_child_id
        and c.status = 'active' and c.date_of_birth <= p_administered_on
    )
    or not exists (
      select 1 from public.vaccine_products vp
      where vp.id = p_vaccine_product_id and vp.active
        and vp.country_code in (p_country_code, 'GLOBAL')
        and vp.effective_from <= p_administered_on
        and (vp.effective_until is null or p_administered_on <= vp.effective_until)
        and vp.catalog_version = p_catalog_version
        and vp.source_digest = p_catalog_digest
    ) then
    raise exception 'immunization_draft_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.vaccine_administrations a
  where a.care_space_id = p_care_space_id
    and a.child_id = p_child_id
    and a.recorded_by = actor
    and a.idempotency_key = p_idempotency_key
  for update;
  if found then
    if existing.input_fingerprint is distinct from p_input_fingerprint
      or existing.confirmation_status <> 'draft' then
      raise exception 'immunization_idempotency_conflict' using errcode = '23505';
    end if;
    return query select existing.id, 'idempotent_replay'::text, existing.draft_expires_at;
    return;
  end if;

  insert into public.vaccine_administrations (
    care_space_id, child_id, vaccine_product_id, administered_on,
    dose_label, lot_number, administration_site, country_code, provenance_type, confirmation_status,
    idempotency_key, recorded_by, source_digest, confirmation_sha256,
    input_fingerprint, draft_expires_at, catalog_version, catalog_digest
  ) values (
    p_care_space_id, p_child_id, p_vaccine_product_id, p_administered_on,
    p_dose_label, p_lot_number, p_administration_site, p_country_code, p_provenance_type, 'draft',
    p_idempotency_key, actor, p_source_digest, p_confirmation_sha256,
    p_input_fingerprint, p_draft_expires_at, p_catalog_version, p_catalog_digest
  ) returning * into created;

  return query select created.id, 'created'::text, created.draft_expires_at;
exception when unique_violation then
  raise exception 'immunization_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.create_vaccine_administration_draft(uuid, uuid, uuid, date, text, text, text, text, text, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.create_vaccine_administration_draft(uuid, uuid, uuid, date, text, text, text, text, text, text, text, text, text, timestamptz, text, text) to authenticated;
