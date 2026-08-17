-- Append-only, provenance-complete validation storage. No clinical package is
-- activated by this migration.

alter table public.dose_validations drop constraint if exists dose_validations_result_check;
alter table public.dose_validations drop constraint if exists dose_validations_request_unique;
alter table public.dose_validations drop constraint if exists dose_validations_declared_input_check;
alter table public.dose_validations drop constraint if exists dose_validations_digest_check;
alter table public.dose_validations drop constraint if exists dose_validations_source_object_check;
alter table public.dose_validations drop constraint if exists dose_validations_scoped_request_unique;
alter table public.dose_validations
  add column if not exists validated_by uuid,
  add column if not exists package_version text,
  add column if not exists algorithm_version text,
  add column if not exists vocabulary_version text,
  add column if not exists artifact_sha256 text,
  add column if not exists input_digest text,
  add column if not exists decision_digest text,
  add column if not exists source_evidence jsonb not null default '{}'::jsonb,
  add constraint dose_validations_result_check check (result in ('within_reference_limits', 'outside_reference_limits', 'insufficient_data', 'requires_professional_review')),
  add constraint dose_validations_digest_check check (
    (artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$')
    and (input_digest is null or input_digest ~ '^[a-f0-9]{64}$')
    and (decision_digest is null or decision_digest ~ '^[a-f0-9]{64}$')
  ),
  add constraint dose_validations_source_object_check check (jsonb_typeof(source_evidence) = 'object'),
  add constraint dose_validations_declared_input_check check (not (declared_input ?| array['safe', 'unsafe', 'safeToAdminister', 'recommendedDose', 'alternativeDose', 'prescribed']));

alter table public.dose_validations
  add constraint dose_validations_scoped_request_unique unique (care_space_id, child_id, validated_by, request_id);

create unique index if not exists dose_validations_scope_id_idx
  on public.dose_validations(care_space_id, child_id, id);

create table if not exists public.dose_validation_ingredients (
  id uuid primary key default gen_random_uuid(),
  validation_id uuid not null references public.dose_validations(id) on delete cascade,
  care_space_id uuid not null,
  child_id uuid not null,
  ingredient_code text not null,
  declared_amount_lexeme text,
  declared_unit text,
  converted_amount_lexeme text,
  converted_unit text,
  arithmetic_trace jsonb not null default '{}'::jsonb check (jsonb_typeof(arithmetic_trace) = 'object'),
  created_at timestamptz not null default now(),
  constraint dose_validation_ingredient_scope_fk foreign key (care_space_id, child_id, validation_id)
    references public.dose_validations(care_space_id, child_id, id) on delete cascade
);

create table if not exists public.dose_validation_sources (
  id uuid primary key default gen_random_uuid(),
  validation_id uuid not null references public.dose_validations(id) on delete cascade,
  care_space_id uuid not null,
  child_id uuid not null,
  source_id text not null,
  source_version text not null,
  source_kind text not null check (source_kind in ('identity', 'label', 'formulary', 'algorithm')),
  source_uri text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint dose_validation_source_scope_fk foreign key (care_space_id, child_id, validation_id)
    references public.dose_validations(care_space_id, child_id, id) on delete cascade
);

create index if not exists dose_validation_ingredients_validation_idx on public.dose_validation_ingredients(validation_id, ingredient_code);
create index if not exists dose_validation_sources_validation_idx on public.dose_validation_sources(validation_id, source_id);

drop trigger if exists dose_validations_immutable on public.dose_validations;
create trigger dose_validations_immutable before update or delete on public.dose_validations for each row execute function app_private.prevent_medication_append_only_mutation();
drop trigger if exists dose_validation_ingredients_immutable on public.dose_validation_ingredients;
create trigger dose_validation_ingredients_immutable before update or delete on public.dose_validation_ingredients for each row execute function app_private.prevent_medication_append_only_mutation();
drop trigger if exists dose_validation_sources_immutable on public.dose_validation_sources;
create trigger dose_validation_sources_immutable before update or delete on public.dose_validation_sources for each row execute function app_private.prevent_medication_append_only_mutation();

alter table public.dose_validation_ingredients enable row level security;
alter table public.dose_validation_ingredients force row level security;
drop policy if exists dose_validation_ingredients_child_select on public.dose_validation_ingredients;
create policy dose_validation_ingredients_child_select on public.dose_validation_ingredients for select to authenticated using (app_private.has_child_permission(care_space_id, child_id, 'read'));
alter table public.dose_validation_sources enable row level security;
alter table public.dose_validation_sources force row level security;
drop policy if exists dose_validation_sources_child_select on public.dose_validation_sources;
create policy dose_validation_sources_child_select on public.dose_validation_sources for select to authenticated using (app_private.has_child_permission(care_space_id, child_id, 'read'));

grant select on public.dose_validation_ingredients, public.dose_validation_sources to authenticated;
grant select on public.dose_validations to authenticated;

create or replace function public.record_dose_validation(
  p_care_space_id uuid,
  p_child_id uuid,
  p_request_id text,
  p_declared_input jsonb,
  p_result text,
  p_explanation_codes text[],
  p_package_version text,
  p_algorithm_version text,
  p_vocabulary_version text,
  p_artifact_sha256 text,
  p_input_digest text,
  p_decision_digest text,
  p_source_evidence jsonb,
  p_ingredients jsonb
)
returns table (validation_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.dose_validations%rowtype;
  created_id uuid;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_request_id is null or length(p_request_id) not between 1 and 200
    or p_result not in ('within_reference_limits', 'outside_reference_limits', 'insufficient_data', 'requires_professional_review')
    or p_declared_input is null or jsonb_typeof(p_declared_input) <> 'object'
    or p_declared_input ?| array['safe', 'unsafe', 'safeToAdminister', 'recommendedDose', 'alternativeDose', 'prescribed']
    or p_source_evidence is null or jsonb_typeof(p_source_evidence) <> 'object'
    or p_input_digest !~ '^[a-f0-9]{64}$' or p_decision_digest !~ '^[a-f0-9]{64}$'
    or (p_artifact_sha256 is not null and p_artifact_sha256 !~ '^[a-f0-9]{64}$') then
    raise exception 'dose_validation_input_invalid' using errcode = '22023';
  end if;
  select * into existing from public.dose_validations
  where care_space_id = p_care_space_id and child_id = p_child_id and validated_by = actor and request_id = p_request_id;
  if existing.id is not null then
    if existing.input_digest is distinct from p_input_digest or existing.decision_digest is distinct from p_decision_digest then raise exception 'dose_validation_idempotency_conflict' using errcode = '23505'; end if;
    validation_id := existing.id; outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.dose_validations (care_space_id, child_id, declared_input, result, explanation_codes, validated_at, request_id, validated_by, package_version, algorithm_version, vocabulary_version, artifact_sha256, input_digest, decision_digest, source_evidence)
  values (p_care_space_id, p_child_id, p_declared_input, p_result, coalesce(p_explanation_codes, '{}'::text[]), now(), p_request_id, actor, p_package_version, p_algorithm_version, p_vocabulary_version, p_artifact_sha256, p_input_digest, p_decision_digest, p_source_evidence)
  returning id into created_id;
  insert into public.dose_validation_ingredients (validation_id, care_space_id, child_id, ingredient_code, declared_amount_lexeme, declared_unit, converted_amount_lexeme, converted_unit, arithmetic_trace)
  select created_id, p_care_space_id, p_child_id, row.ingredient_code, row.declared_amount_lexeme, row.declared_unit, row.converted_amount_lexeme, row.converted_unit, coalesce(row.arithmetic_trace, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_ingredients, '[]'::jsonb)) as row(ingredient_code text, declared_amount_lexeme text, declared_unit text, converted_amount_lexeme text, converted_unit text, arithmetic_trace jsonb);
  validation_id := created_id; outcome := 'created'; return next;
exception when unique_violation then raise exception 'dose_validation_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_dose_validation(uuid, uuid, text, jsonb, text, text[], text, text, text, text, text, text, jsonb, jsonb) to authenticated;
