-- Module 06 AT-06-15: reference catalog, exact antigen-only facts, and lint-safe Cloud RPCs.

alter table public.vaccine_antigens
  add column if not exists catalog_version text,
  add column if not exists source_digest text,
  add column if not exists effective_from date,
  add column if not exists effective_until date;

alter table public.vaccine_products
  add column if not exists catalog_version text,
  add column if not exists source_digest text,
  add column if not exists effective_from date,
  add column if not exists effective_until date,
  add column if not exists aliases text[] not null default '{}';

update public.vaccine_antigens
set catalog_version = coalesce(catalog_version, 'legacy-unversioned'),
    source_digest = coalesce(source_digest, repeat('0', 64)),
    effective_from = coalesce(effective_from, created_at::date)
where catalog_version is null or source_digest is null or effective_from is null;

update public.vaccine_products
set catalog_version = coalesce(catalog_version, 'legacy-unversioned'),
    source_digest = coalesce(source_digest, repeat('0', 64)),
    effective_from = coalesce(effective_from, created_at::date)
where catalog_version is null or source_digest is null or effective_from is null;

alter table public.vaccine_antigens
  alter column catalog_version set not null,
  alter column source_digest set not null,
  alter column effective_from set not null;

alter table public.vaccine_products
  alter column catalog_version set not null,
  alter column source_digest set not null,
  alter column effective_from set not null;

alter table public.vaccine_antigens drop constraint if exists vaccine_antigens_antigen_code_key;
alter table public.vaccine_products drop constraint if exists vaccine_products_unique;
create unique index if not exists vaccine_antigens_code_version_idx
  on public.vaccine_antigens(antigen_code, catalog_version);
create unique index if not exists vaccine_products_country_code_version_idx
  on public.vaccine_products(country_code, product_code, catalog_version);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vaccine_antigens_catalog_digest_check') then
    alter table public.vaccine_antigens add constraint vaccine_antigens_catalog_digest_check
      check (source_digest ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_antigens_effective_window_check') then
    alter table public.vaccine_antigens add constraint vaccine_antigens_effective_window_check
      check (effective_until is null or effective_until >= effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_products_catalog_digest_check') then
    alter table public.vaccine_products add constraint vaccine_products_catalog_digest_check
      check (source_digest ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_products_effective_window_check') then
    alter table public.vaccine_products add constraint vaccine_products_effective_window_check
      check (effective_until is null or effective_until >= effective_from);
  end if;
end;
$$;

insert into public.clinical_sources (
  id, authority, jurisdiction, title, source_uri, published_at, retrieved_at,
  effective_from, effective_until, license, artifact_sha256, status
)
values
  ('60000000-0000-4000-8000-000000000101', 'MINSALUD_PAI', 'CO', 'Lineamientos técnicos PAI - retrieval 2026-08-21', 'https://vacunacion.minsalud.gov.co/RT/Paginas/lineamientos-tecnicos.aspx', null, '2026-08-21T22:00:00Z', '2026-01-01', null, 'Official public-health source page', '0ca29072ae5cd2e38e299e15feaa87bef9f260fcbfaa6079cf45ff702bedb43e', 'reviewed'),
  ('60000000-0000-4000-8000-000000000102', 'MINSALUD_PAI', 'CO', 'Esquema de vacunación PAI Colombia - retrieval 2026-08-21', 'https://minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/ET/afiche-esquema-vacunacion-col.pdf', null, '2026-08-21T22:00:00Z', '2026-01-01', null, 'Official public-health artifact', '47d39fbdfbe514b18df484970aa47e63118c20debca5a944742e88380c7ed753', 'reviewed'),
  ('60000000-0000-4000-8000-000000000103', 'MINSALUD_PAI', 'CO', 'Sarampión y rubéola dosis cero, 6 a 11 meses - 2026', 'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lin-tec-op-vac-sar-rub-6-11-meses.zip', '2026-05-29', '2026-08-21T22:00:00Z', '2026-05-29', null, 'Official public-health artifact', 'f6c781eb73df09c256f193ec9fa623ed880c9485c9193ca8bd15345cbe41e39c', 'reviewed'),
  ('60000000-0000-4000-8000-000000000104', 'MINSALUD_PAI', 'CO', 'Inclusión escalonada de vacuna contra dengue - 2026', 'https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lineamientos-vacunas-dengue-ninos-9-anos-edad-municipios.zip', '2026-01-01', '2026-08-21T22:00:00Z', '2026-01-01', null, 'Official public-health artifact', 'd613557217cb967224069e932d9b236081e3e3da7d5a99f6a3fa2ce6aa492ccd', 'reviewed'),
  ('60000000-0000-4000-8000-000000000105', 'MINSALUD_PAI', 'CO', 'Niños y niñas menores de 6 años - retrieval 2026-08-21', 'https://vacunacion.minsalud.gov.co/EV/Paginas/ninos-y-ninas-menores-de-6-anos.aspx', null, '2026-08-21T22:00:00Z', '2026-01-01', null, 'Official public-health source page', '760b445acfc16c8961cc0b432029b013a32ff81f70446429e65722e96a697e51', 'reviewed'),
  ('60000000-0000-4000-8000-000000000201', 'CDC_ACIP', 'US', 'Catch-up Immunization Schedule for Children and Adolescents', 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-catch-up.html', '2025-07-02', '2026-08-21T22:00:00Z', '2025-07-02', null, 'Official public-health live page; current status rechecked', null, 'reviewed'),
  ('60000000-0000-4000-8000-000000000202', 'CDC_ACIP', 'US', 'Child and Adolescent Immunization Schedule by Medical Indication', 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-medical-indication.html', '2025-07-02', '2026-08-21T22:00:00Z', '2025-07-02', null, 'Official public-health live page; current status rechecked', null, 'reviewed'),
  ('60000000-0000-4000-8000-000000000203', 'CDC_ACIP', 'US', 'Child Immunization Schedule Addendum', 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-addendum.html', '2025-07-02', '2026-08-21T22:00:00Z', '2025-07-02', null, 'Official public-health live page; current status rechecked', null, 'reviewed')
on conflict (id) do nothing;

insert into public.vaccine_antigens (
  id, antigen_code, display_name_es, display_name_en, disease_group, active,
  catalog_version, source_digest, effective_from, effective_until
)
values
  ('60000000-0000-4000-8000-000000001001', 'BCG', 'Tuberculosis (BCG)', 'Tuberculosis (BCG)', 'tuberculosis', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001002', 'HEP_B', 'Hepatitis B', 'Hepatitis B', 'hepatitis-b', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001003', 'POLIO_IPV', 'Poliomielitis (VIP/IPV)', 'Polio (IPV)', 'polio', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001004', 'ROTAVIRUS', 'Rotavirus', 'Rotavirus', 'rotavirus', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001005', 'DIPHTHERIA', 'Difteria', 'Diphtheria', 'diphtheria', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001006', 'TETANUS', 'Tétanos', 'Tetanus', 'tetanus', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001007', 'PERTUSSIS', 'Tos ferina', 'Pertussis', 'pertussis', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001008', 'HIB', 'Haemophilus influenzae tipo b', 'Haemophilus influenzae type b', 'hib', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001009', 'PNEUMOCOCCAL', 'Neumococo', 'Pneumococcal disease', 'pneumococcal', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001010', 'INFLUENZA', 'Influenza', 'Influenza', 'influenza', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001011', 'MEASLES', 'Sarampión', 'Measles', 'measles', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001012', 'MUMPS', 'Paperas', 'Mumps', 'mumps', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001013', 'RUBELLA', 'Rubéola', 'Rubella', 'rubella', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001014', 'VARICELLA', 'Varicela', 'Varicella', 'varicella', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001015', 'HEP_A', 'Hepatitis A', 'Hepatitis A', 'hepatitis-a', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001016', 'YELLOW_FEVER', 'Fiebre amarilla', 'Yellow fever', 'yellow-fever', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001017', 'HPV', 'Virus del papiloma humano', 'Human papillomavirus', 'hpv', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001018', 'MENINGOCOCCAL_ACWY', 'Meningococo ACWY', 'Meningococcal ACWY', 'meningococcal', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001019', 'MENINGOCOCCAL_B', 'Meningococo B', 'Meningococcal B', 'meningococcal', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001020', 'COVID_19', 'COVID-19', 'COVID-19', 'covid-19', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001021', 'RSV', 'Virus sincitial respiratorio', 'Respiratory syncytial virus', 'rsv', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001022', 'DENGUE', 'Dengue', 'Dengue', 'dengue', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001023', 'MPOX', 'Mpox (viruela símica)', 'Mpox', 'mpox', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null),
  ('60000000-0000-4000-8000-000000001024', 'RABIES', 'Rabia', 'Rabies', 'rabies', true, '2026-08-21-source-bound', '667bdabab91467166fcfa65e81f06f34acaf29f6bf50f52e867e7e9c23c5437d', '2025-07-02', null)
on conflict (id) do nothing;

create or replace function public.record_confirmed_vaccine_administration(
  p_care_space_id uuid,
  p_child_id uuid,
  p_idempotency_key text,
  p_administered_on date,
  p_vaccine_product_id uuid,
  p_antigen_ids jsonb,
  p_dose_label text,
  p_lot_number text,
  p_administration_site text,
  p_provider_name text,
  p_country_code text,
  p_provenance_type text,
  p_source_digest text,
  p_confirmation_sha256 text,
  p_input_fingerprint text,
  p_supersedes_administration_id uuid default null,
  p_supersession_reason text default null
)
returns table (administration_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.vaccine_administrations;
  created public.vaccine_administrations;
  antigen_id uuid;
  resolved_catalog_version text;
  resolved_catalog_digest text;
  antigen_count integer;
  catalog_version_count integer;
  catalog_digest_count integer;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'immunization_not_authorized' using errcode = '42501';
  end if;
  if p_country_code not in ('CO', 'US')
    or p_administered_on is null or p_administered_on > current_date
    or not exists (select 1 from public.children c where c.care_space_id = p_care_space_id and c.id = p_child_id and c.date_of_birth <= p_administered_on)
    or p_idempotency_key is null or length(p_idempotency_key) = 0 or length(p_idempotency_key) > 200
    or p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_confirmation_sha256 is null or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
    or p_provenance_type not in ('guardian', 'professional', 'import', 'document', 'chat')
    or length(coalesce(p_dose_label, '')) > 120
    or length(coalesce(p_lot_number, '')) > 120
    or length(coalesce(p_administration_site, '')) > 120
    or length(coalesce(p_provider_name, '')) > 200
    or jsonb_typeof(p_antigen_ids) <> 'array' or jsonb_array_length(p_antigen_ids) = 0
    or exists (select 1 from jsonb_array_elements_text(p_antigen_ids) entry(value) where entry.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or (select count(*) <> count(distinct value) from jsonb_array_elements_text(p_antigen_ids)) then
    raise exception 'immunization_confirmation_invalid' using errcode = '22023';
  end if;

  if p_vaccine_product_id is not null then
    select vp.catalog_version, vp.source_digest
      into resolved_catalog_version, resolved_catalog_digest
    from public.vaccine_products vp
    where vp.id = p_vaccine_product_id
      and vp.active
      and vp.country_code in (p_country_code, 'GLOBAL')
      and vp.effective_from <= p_administered_on
      and (vp.effective_until is null or p_administered_on <= vp.effective_until);
    if not found then
      raise exception 'immunization_product_invalid' using errcode = '22023';
    end if;
    if exists (
      (select value::uuid from jsonb_array_elements_text(p_antigen_ids)
       except select vpa.antigen_id from public.vaccine_product_antigens vpa where vpa.vaccine_product_id = p_vaccine_product_id)
      union all
      (select vpa.antigen_id from public.vaccine_product_antigens vpa where vpa.vaccine_product_id = p_vaccine_product_id
       except select value::uuid from jsonb_array_elements_text(p_antigen_ids))
    ) then
      raise exception 'immunization_product_antigen_mismatch' using errcode = '22023';
    end if;
  else
    select count(*), count(distinct va.catalog_version), count(distinct va.source_digest), min(va.catalog_version), min(va.source_digest)
      into antigen_count, catalog_version_count, catalog_digest_count, resolved_catalog_version, resolved_catalog_digest
    from public.vaccine_antigens va
    where va.id in (select value::uuid from jsonb_array_elements_text(p_antigen_ids))
      and va.active
      and va.effective_from <= p_administered_on
      and (va.effective_until is null or p_administered_on <= va.effective_until);
    if antigen_count <> jsonb_array_length(p_antigen_ids) or catalog_version_count <> 1 or catalog_digest_count <> 1 then
      raise exception 'immunization_antigen_invalid' using errcode = '22023';
    end if;
  end if;

  if p_supersedes_administration_id is not null and not exists (
    select 1 from public.vaccine_administrations a
    where a.id = p_supersedes_administration_id and a.care_space_id = p_care_space_id and a.child_id = p_child_id
  ) then
    raise exception 'immunization_supersession_invalid' using errcode = '23503';
  end if;

  select * into existing
  from public.vaccine_administrations a
  where a.care_space_id = p_care_space_id
    and a.child_id = p_child_id
    and a.recorded_by = actor
    and a.idempotency_key = p_idempotency_key
  for update;
  if found then
    if existing.input_fingerprint is distinct from p_input_fingerprint then
      raise exception 'immunization_idempotency_conflict' using errcode = '23505';
    end if;
    return query select existing.id, 'idempotent_replay'::text;
    return;
  end if;

  insert into public.vaccine_administrations (
    care_space_id, child_id, vaccine_product_id, administered_on, dose_label,
    lot_number, administration_site, provider_name, country_code, provenance_type,
    confirmation_status, idempotency_key, recorded_by, source_digest,
    confirmation_sha256, confirmed_at, confirmed_by, input_fingerprint,
    scope_fingerprint, supersedes_administration_id, supersession_reason,
    catalog_version, catalog_digest
  ) values (
    p_care_space_id, p_child_id, p_vaccine_product_id, p_administered_on, p_dose_label,
    p_lot_number, p_administration_site, p_provider_name, p_country_code, p_provenance_type,
    'confirmed', p_idempotency_key, actor, p_source_digest, p_confirmation_sha256,
    now(), actor, p_input_fingerprint,
    encode(extensions.digest(format('%s:%s:%s', p_care_space_id, p_child_id, p_country_code), 'sha256'), 'hex'),
    p_supersedes_administration_id, p_supersession_reason,
    resolved_catalog_version, resolved_catalog_digest
  ) returning * into created;

  for antigen_id in select value::uuid from jsonb_array_elements_text(p_antigen_ids) loop
    if not exists (
      select 1 from public.vaccine_antigens va
      where va.id = antigen_id and va.active
        and va.effective_from <= p_administered_on
        and (va.effective_until is null or p_administered_on <= va.effective_until)
    ) then
      raise exception 'immunization_antigen_invalid' using errcode = '22023';
    end if;
    insert into public.vaccine_administration_antigens(care_space_id, child_id, vaccine_administration_id, antigen_id)
    values (p_care_space_id, p_child_id, created.id, antigen_id);
  end loop;
  return query select created.id, 'created'::text;
exception when unique_violation then
  raise exception 'immunization_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_confirmed_vaccine_administration(uuid, uuid, text, date, uuid, jsonb, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.record_confirmed_vaccine_administration(uuid, uuid, text, date, uuid, jsonb, text, text, text, text, text, text, text, text, text, uuid, text) to authenticated;

-- Remove the unused declaration from the previously applied RPC without rewriting its migration.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid = 'public.persist_country_change_reassessment(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if position('evidence_id uuid;' in function_definition) > 0 then
    execute regexp_replace(function_definition, E'\\n[[:space:]]*evidence_id uuid;', '', 'n');
  end if;
end;
$$;
