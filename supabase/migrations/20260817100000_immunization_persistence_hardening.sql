-- Module 06: immutable, scoped immunization facts and assessment provenance.

alter table public.vaccine_administrations
  add column if not exists source_digest text,
  add column if not exists confirmation_sha256 text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists input_fingerprint text,
  add column if not exists scope_fingerprint text,
  add column if not exists supersedes_administration_id uuid,
  add column if not exists supersession_reason text,
  add column if not exists catalog_version text,
  add column if not exists catalog_digest text;

alter table public.vaccine_administrations drop constraint if exists vaccine_administration_idempotent;
create unique index if not exists vaccine_administrations_scoped_idempotency_idx
  on public.vaccine_administrations(care_space_id, child_id, recorded_by, idempotency_key);
create unique index if not exists vaccine_administrations_scope_id_idx
  on public.vaccine_administrations(care_space_id, id);
create unique index if not exists vaccine_administrations_scope_child_id_idx
  on public.vaccine_administrations(care_space_id, child_id, id);
create index if not exists vaccine_administrations_scope_child_date_idx
  on public.vaccine_administrations(care_space_id, child_id, administered_on desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vaccine_administration_provenance_digest_check') then
    alter table public.vaccine_administrations add constraint vaccine_administration_provenance_digest_check check (
      (source_digest is null or source_digest ~ '^[a-f0-9]{64}$')
      and (confirmation_sha256 is null or confirmation_sha256 ~ '^[a-f0-9]{64}$')
      and (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$')
      and (catalog_digest is null or catalog_digest ~ '^[a-f0-9]{64}$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_administration_confirmed_provenance_check') then
    alter table public.vaccine_administrations add constraint vaccine_administration_confirmed_provenance_check check (
      confirmation_status <> 'confirmed'
      or (source_digest is not null and confirmation_sha256 is not null and input_fingerprint is not null and confirmed_at is not null and confirmed_by is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_administration_supersession_check') then
    alter table public.vaccine_administrations add constraint vaccine_administration_supersession_check check (
      supersedes_administration_id is null or supersession_reason is not null
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccine_administration_supersedes_fk') then
    alter table public.vaccine_administrations add constraint vaccine_administration_supersedes_fk
      foreign key (supersedes_administration_id) references public.vaccine_administrations(id) on delete restrict;
  end if;
end;
$$;

alter table public.vaccine_administration_antigens
  add column if not exists care_space_id uuid,
  add column if not exists child_id uuid;

update public.vaccine_administration_antigens aa
set care_space_id = a.care_space_id,
    child_id = a.child_id
from public.vaccine_administrations a
where a.id = aa.vaccine_administration_id
  and (aa.care_space_id is null or aa.child_id is null);

alter table public.vaccine_administration_antigens
  alter column care_space_id set not null,
  alter column child_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vaccine_administration_antigens_scope_fk') then
    alter table public.vaccine_administration_antigens add constraint vaccine_administration_antigens_scope_fk
      foreign key (care_space_id, child_id, vaccine_administration_id)
      references public.vaccine_administrations(care_space_id, child_id, id) on delete cascade;
  end if;
end;
$$;
create index if not exists vaccine_administration_antigens_scope_idx
  on public.vaccine_administration_antigens(care_space_id, child_id, vaccine_administration_id);

alter table public.vaccination_assessments
  add column if not exists assessment_run_id uuid default extensions.gen_random_uuid(),
  add column if not exists country_code text,
  add column if not exists rule_pack_id uuid,
  add column if not exists rule_pack_version text,
  add column if not exists algorithm_id uuid,
  add column if not exists source_digest text,
  add column if not exists input_digest text,
  add column if not exists decision_digest text,
  add column if not exists input_fingerprint text default repeat('0', 64);

alter table public.vaccination_assessments drop constraint if exists vaccination_assessment_unique;
create unique index if not exists vaccination_assessments_append_only_unique
  on public.vaccination_assessments(child_id, schedule_id, rule_id, as_of_date, input_fingerprint);
create unique index if not exists vaccination_assessments_scope_id_idx
  on public.vaccination_assessments(care_space_id, child_id, id);
create index if not exists vaccination_assessments_scope_status_idx
  on public.vaccination_assessments(care_space_id, child_id, as_of_date desc, status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vaccination_assessment_country_check') then
    alter table public.vaccination_assessments add constraint vaccination_assessment_country_check check (country_code is null or country_code in ('CO', 'US'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccination_assessment_digest_shape_check') then
    alter table public.vaccination_assessments add constraint vaccination_assessment_digest_shape_check check (
      (source_digest is null or source_digest ~ '^[a-f0-9]{64}$')
      and (input_digest is null or input_digest ~ '^[a-f0-9]{64}$')
      and (decision_digest is null or decision_digest ~ '^[a-f0-9]{64}$')
      and (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccination_assessment_rule_pack_fk') then
    alter table public.vaccination_assessments add constraint vaccination_assessment_rule_pack_fk
      foreign key (rule_pack_id) references public.clinical_rule_packs(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vaccination_assessment_algorithm_fk') then
    alter table public.vaccination_assessments add constraint vaccination_assessment_algorithm_fk
      foreign key (algorithm_id) references public.clinical_algorithms(id) on delete restrict;
  end if;
end;
$$;

create table if not exists public.vaccination_assessment_evidence (
  care_space_id uuid not null,
  child_id uuid not null,
  vaccination_assessment_id uuid not null,
  vaccine_administration_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (vaccination_assessment_id, vaccine_administration_id),
  constraint vaccination_assessment_evidence_assessment_fk foreign key (care_space_id, child_id, vaccination_assessment_id)
    references public.vaccination_assessments(care_space_id, child_id, id) on delete cascade,
  constraint vaccination_assessment_evidence_administration_fk foreign key (care_space_id, child_id, vaccine_administration_id)
    references public.vaccine_administrations(care_space_id, child_id, id) on delete restrict
);
create index if not exists vaccination_assessment_evidence_scope_idx
  on public.vaccination_assessment_evidence(care_space_id, child_id, vaccination_assessment_id);
create index if not exists vaccination_assessment_evidence_administration_idx
  on public.vaccination_assessment_evidence(vaccine_administration_id);

drop trigger if exists vaccine_administrations_set_updated_at on public.vaccine_administrations;

create or replace function app_private.prevent_immunization_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'immunization_history_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists vaccine_administrations_immutable on public.vaccine_administrations;
create trigger vaccine_administrations_immutable
  before update or delete on public.vaccine_administrations
  for each row execute function app_private.prevent_immunization_mutation();
drop trigger if exists vaccination_assessments_immutable on public.vaccination_assessments;
create trigger vaccination_assessments_immutable
  before update or delete on public.vaccination_assessments
  for each row execute function app_private.prevent_immunization_mutation();
drop trigger if exists vaccination_assessment_evidence_immutable on public.vaccination_assessment_evidence;
create trigger vaccination_assessment_evidence_immutable
  before update or delete on public.vaccination_assessment_evidence
  for each row execute function app_private.prevent_immunization_mutation();

alter table public.vaccination_assessment_evidence enable row level security;
alter table public.vaccination_assessment_evidence force row level security;
drop policy if exists vaccination_assessment_evidence_child_select on public.vaccination_assessment_evidence;
create policy vaccination_assessment_evidence_child_select on public.vaccination_assessment_evidence
  for select to authenticated using (app_private.has_child_permission(care_space_id, child_id, 'read'));
grant select on public.vaccination_assessment_evidence to authenticated;

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
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'immunization_not_authorized' using errcode = '42501';
  end if;
  if p_country_code not in ('CO', 'US')
    or p_administered_on > current_date
    or p_idempotency_key is null or length(p_idempotency_key) = 0 or length(p_idempotency_key) > 200
    or p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_confirmation_sha256 is null or p_confirmation_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_antigen_ids) <> 'array' or jsonb_array_length(p_antigen_ids) = 0 then
    raise exception 'immunization_confirmation_invalid' using errcode = '22023';
  end if;
  if p_vaccine_product_id is null or not exists (
    select 1 from public.vaccine_products vp
    where vp.id = p_vaccine_product_id and vp.active and vp.country_code in (p_country_code, 'GLOBAL')
  ) then
    raise exception 'immunization_product_invalid' using errcode = '22023';
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
    scope_fingerprint, supersedes_administration_id, supersession_reason
  ) values (
    p_care_space_id, p_child_id, p_vaccine_product_id, p_administered_on, p_dose_label,
    p_lot_number, p_administration_site, p_provider_name, p_country_code, p_provenance_type,
    'confirmed', p_idempotency_key, actor, p_source_digest, p_confirmation_sha256,
    now(), actor, p_input_fingerprint,
    encode(extensions.digest(format('%s:%s:%s', p_care_space_id, p_child_id, p_country_code), 'sha256'), 'hex'),
    p_supersedes_administration_id, p_supersession_reason
  ) returning * into created;

  for antigen_id in select value::uuid from jsonb_array_elements_text(p_antigen_ids) loop
    if not exists (select 1 from public.vaccine_antigens va where va.id = antigen_id and va.active) then
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

create or replace function public.persist_vaccination_assessment(
  p_care_space_id uuid,
  p_child_id uuid,
  p_schedule_id uuid,
  p_rule_id uuid,
  p_country_code text,
  p_as_of_date date,
  p_status text,
  p_due_from date,
  p_due_until date,
  p_evidence_administration_ids uuid[],
  p_explanation_code text,
  p_rule_pack_id uuid,
  p_rule_pack_version text,
  p_algorithm_id uuid,
  p_source_digest text,
  p_input_digest text,
  p_decision_digest text,
  p_input_fingerprint text
)
returns table (assessment_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  created_id uuid;
  evidence_id uuid;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'immunization_not_authorized' using errcode = '42501';
  end if;
  if p_country_code not in ('CO', 'US')
    or p_status not in ('applied', 'upcoming', 'due', 'overdue', 'not_applicable', 'review_required')
    or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_input_digest !~ '^[a-f0-9]{64}$'
    or p_decision_digest !~ '^[a-f0-9]{64}$'
    or p_input_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'immunization_assessment_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_evidence_administration_ids, '{}'::uuid[])) requested(id)
    where not exists (
      select 1 from public.vaccine_administrations a
      where a.id = requested.id and a.care_space_id = p_care_space_id and a.child_id = p_child_id and a.confirmation_status = 'confirmed'
    )
  ) then
    raise exception 'immunization_assessment_evidence_invalid' using errcode = '23503';
  end if;

  insert into public.vaccination_assessments (
    care_space_id, child_id, schedule_id, rule_id, country_code, as_of_date,
    status, due_from, due_until, evidence_administration_ids, explanation_code,
    rule_pack_id, rule_pack_version, algorithm_id, source_digest, input_digest,
    decision_digest, input_fingerprint
  ) values (
    p_care_space_id, p_child_id, p_schedule_id, p_rule_id, p_country_code, p_as_of_date,
    p_status, p_due_from, p_due_until, coalesce(p_evidence_administration_ids, '{}'::uuid[]), p_explanation_code,
    p_rule_pack_id, p_rule_pack_version, p_algorithm_id, p_source_digest, p_input_digest,
    p_decision_digest, p_input_fingerprint
  ) returning id into created_id;

  foreach evidence_id in array coalesce(p_evidence_administration_ids, '{}'::uuid[]) loop
    insert into public.vaccination_assessment_evidence(care_space_id, child_id, vaccination_assessment_id, vaccine_administration_id)
    values (p_care_space_id, p_child_id, created_id, evidence_id);
  end loop;
  return query select created_id, 'created'::text;
exception when unique_violation then
  raise exception 'immunization_assessment_duplicate' using errcode = '23505';
end;
$$;

do $$
declare
  function_signature regprocedure;
begin
  select p.oid::regprocedure into function_signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_confirmed_vaccine_administration';
  if function_signature is null then raise exception 'record_confirmed_vaccine_administration was not created'; end if;
  execute format('revoke all on function %s from public, anon', function_signature);
  execute format('grant execute on function %s to authenticated', function_signature);
  select p.oid::regprocedure into function_signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'persist_vaccination_assessment';
  if function_signature is null then raise exception 'persist_vaccination_assessment was not created'; end if;
  execute format('revoke all on function %s from public, anon', function_signature);
  execute format('grant execute on function %s to authenticated', function_signature);
end;
$$;
