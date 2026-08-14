-- Pediatric domain modules: growth, immunization, medication, nutrition and development.

create table public.anthropometric_measurements (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  measurement_type text not null check (measurement_type in ('weight', 'recumbent_length', 'standing_height', 'head_circumference')),
  original_value numeric(10,3) not null check (original_value > 0),
  original_unit text not null,
  normalized_value numeric(10,3) not null check (normalized_value > 0),
  normalized_unit text not null check (normalized_unit in ('kg', 'cm')),
  occurred_at timestamptz not null,
  local_date date not null,
  time_zone text not null,
  measurement_method text,
  device text,
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'excluded')),
  exclusion_reason text,
  idempotency_key text not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anthropometry_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint anthropometry_idempotent unique (care_space_id, idempotency_key),
  constraint anthropometry_exclusion check ((validation_status = 'excluded') = (exclusion_reason is not null))
);

create table public.growth_assessments (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  measurement_id uuid not null references public.anthropometric_measurements(id) on delete restrict,
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  algorithm_id uuid not null references public.clinical_algorithms(id) on delete restrict,
  standard_key text not null,
  indicator text not null,
  chronological_age_days integer not null check (chronological_age_days >= 0),
  corrected_age_days integer check (corrected_age_days is null or corrected_age_days >= 0),
  correction_applied boolean not null default false,
  z_score numeric(7,4),
  percentile numeric(8,5) check (percentile is null or percentile between 0 and 100),
  result_status text not null check (result_status in ('calculated', 'rule_unavailable', 'insufficient_data', 'excluded')),
  warnings text[] not null default '{}',
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint growth_assessment_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint growth_assessment_measurement_unique unique (measurement_id, indicator, rule_pack_id, algorithm_id)
);

create table public.vaccine_antigens (
  id uuid primary key default gen_random_uuid(),
  antigen_code text not null unique,
  display_name_es text not null,
  display_name_en text not null,
  disease_group text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vaccine_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null,
  country_code text not null check (country_code in ('CO', 'US', 'GLOBAL')),
  manufacturer text,
  brand_name text,
  presentation text,
  regulatory_identifier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint vaccine_products_unique unique (country_code, product_code)
);

create table public.vaccine_product_antigens (
  vaccine_product_id uuid not null references public.vaccine_products(id) on delete cascade,
  antigen_id uuid not null references public.vaccine_antigens(id) on delete restrict,
  primary key (vaccine_product_id, antigen_id)
);

create table public.immunization_schedules (
  id uuid primary key default gen_random_uuid(),
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  country_code text not null check (country_code in ('CO', 'US')),
  schedule_key text not null,
  display_name text not null,
  version text not null,
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immunization_schedules_unique unique (country_code, schedule_key, version),
  constraint immunization_schedules_dates check (effective_until is null or effective_until >= effective_from)
);

create table public.immunization_rules (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.immunization_schedules(id) on delete cascade,
  antigen_id uuid not null references public.vaccine_antigens(id) on delete restrict,
  series_code text not null,
  dose_code text not null,
  dose_number smallint check (dose_number is null or dose_number > 0),
  minimum_age_days integer check (minimum_age_days is null or minimum_age_days >= 0),
  target_age_days integer check (target_age_days is null or target_age_days >= 0),
  target_age_end_days integer check (target_age_end_days is null or target_age_end_days >= 0),
  minimum_interval_days integer check (minimum_interval_days is null or minimum_interval_days >= 0),
  recommended_interval_days integer check (recommended_interval_days is null or recommended_interval_days >= 0),
  catch_up boolean not null default false,
  eligibility_criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(eligibility_criteria) = 'object'),
  contraindication_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint immunization_rules_unique unique (schedule_id, series_code, dose_code),
  constraint immunization_target_window check (
    target_age_end_days is null or target_age_days is null or target_age_end_days >= target_age_days
  )
);

create table public.immunization_rule_dependencies (
  rule_id uuid not null references public.immunization_rules(id) on delete cascade,
  depends_on_rule_id uuid not null references public.immunization_rules(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('previous_dose', 'either_or', 'conditional', 'excludes')),
  minimum_interval_days integer check (minimum_interval_days is null or minimum_interval_days >= 0),
  primary key (rule_id, depends_on_rule_id),
  constraint immunization_dependency_not_self check (rule_id <> depends_on_rule_id)
);

create table public.vaccine_administrations (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  vaccine_product_id uuid references public.vaccine_products(id) on delete restrict,
  administered_on date not null check (administered_on <= current_date),
  dose_label text,
  lot_number text,
  administration_site text,
  provider_name text,
  country_code text not null check (country_code in ('CO', 'US')),
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat')),
  confirmation_status text not null default 'draft' check (confirmation_status in ('draft', 'confirmed', 'rejected')),
  idempotency_key text not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vaccine_administration_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint vaccine_administration_idempotent unique (care_space_id, idempotency_key)
);

create table public.vaccine_administration_antigens (
  vaccine_administration_id uuid not null references public.vaccine_administrations(id) on delete cascade,
  antigen_id uuid not null references public.vaccine_antigens(id) on delete restrict,
  primary key (vaccine_administration_id, antigen_id)
);

create table public.vaccination_assessments (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  schedule_id uuid not null references public.immunization_schedules(id) on delete restrict,
  rule_id uuid not null references public.immunization_rules(id) on delete restrict,
  as_of_date date not null,
  status text not null check (status in ('applied', 'upcoming', 'due', 'overdue', 'not_applicable', 'review_required')),
  due_from date,
  due_until date,
  evidence_administration_ids uuid[] not null default '{}',
  explanation_code text not null,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint vaccination_assessment_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint vaccination_assessment_unique unique (child_id, schedule_id, rule_id, as_of_date)
);

create table public.child_food_reactions (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  substance_name text not null,
  normalized_code text,
  reaction_type text not null check (reaction_type in ('allergy', 'intolerance', 'preference', 'avoidance')),
  severity text check (severity is null or severity in ('mild', 'moderate', 'severe', 'unknown')),
  status text not null default 'declared' check (status in ('declared', 'confirmed', 'resolved', 'entered_in_error')),
  notes text,
  observed_on date,
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat')),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_food_reactions_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  feeding_mode text check (feeding_mode is null or feeding_mode in ('breastfeeding', 'formula', 'mixed', 'traditional_complementary', 'blw', 'mixed_complementary', 'family_food')),
  texture_stage text,
  dietary_pattern text,
  exclusions text[] not null default '{}',
  notes text,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_profiles_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint nutrition_profiles_child_unique unique (child_id)
);

create table public.medication_concepts (
  id uuid primary key default gen_random_uuid(),
  concept_code text not null,
  coding_system text not null,
  ingredient_name text not null,
  display_name_es text not null,
  display_name_en text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint medication_concepts_unique unique (coding_system, concept_code)
);

create table public.medication_presentations (
  id uuid primary key default gen_random_uuid(),
  medication_concept_id uuid not null references public.medication_concepts(id) on delete restrict,
  country_code text not null check (country_code in ('CO', 'US', 'GLOBAL')),
  presentation_name text not null,
  concentration_numerator numeric(12,4) not null check (concentration_numerator > 0),
  concentration_numerator_unit text not null,
  concentration_denominator numeric(12,4) not null check (concentration_denominator > 0),
  concentration_denominator_unit text not null,
  route text,
  regulatory_identifier text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pediatric_formulary_versions (
  id uuid primary key default gen_random_uuid(),
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  country_code text not null check (country_code in ('CO', 'US')),
  version text not null,
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'retired')),
  created_at timestamptz not null default now(),
  constraint pediatric_formulary_unique unique (country_code, version),
  constraint pediatric_formulary_dates check (effective_until is null or effective_until >= effective_from)
);

create table public.pediatric_dose_limits (
  id uuid primary key default gen_random_uuid(),
  formulary_version_id uuid not null references public.pediatric_formulary_versions(id) on delete cascade,
  medication_concept_id uuid not null references public.medication_concepts(id) on delete restrict,
  indication_code text,
  route text not null,
  minimum_age_days integer check (minimum_age_days is null or minimum_age_days >= 0),
  maximum_age_days integer check (maximum_age_days is null or maximum_age_days >= 0),
  minimum_weight_kg numeric(7,3) check (minimum_weight_kg is null or minimum_weight_kg > 0),
  maximum_weight_kg numeric(7,3) check (maximum_weight_kg is null or maximum_weight_kg > 0),
  dose_per_kg_min numeric(10,4),
  dose_per_kg_max numeric(10,4),
  dose_unit text not null,
  max_single_dose numeric(10,4),
  max_daily_dose numeric(10,4),
  minimum_interval_hours numeric(8,2),
  exclusions jsonb not null default '{}'::jsonb check (jsonb_typeof(exclusions) = 'object'),
  created_at timestamptz not null default now(),
  constraint pediatric_dose_age_range check (maximum_age_days is null or minimum_age_days is null or maximum_age_days >= minimum_age_days),
  constraint pediatric_dose_weight_range check (maximum_weight_kg is null or minimum_weight_kg is null or maximum_weight_kg >= minimum_weight_kg),
  constraint pediatric_dose_per_kg_range check (dose_per_kg_max is null or dose_per_kg_min is null or dose_per_kg_max >= dose_per_kg_min)
);

create table public.medication_plans (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  medication_concept_id uuid not null references public.medication_concepts(id) on delete restrict,
  medication_presentation_id uuid references public.medication_presentations(id) on delete restrict,
  display_name text not null,
  declared_indication text,
  prescriber_name text,
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'cancelled')),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medication_plan_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint medication_plan_dates check (ends_at is null or ends_at > starts_at)
);

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_plan_id uuid not null references public.medication_plans(id) on delete cascade,
  dose_quantity numeric(12,4) not null check (dose_quantity > 0),
  dose_unit text not null,
  route text not null,
  frequency_kind text not null check (frequency_kind in ('interval', 'times_of_day', 'as_needed')),
  interval_hours numeric(8,2) check (interval_hours is null or interval_hours > 0),
  times_of_day time[] not null default '{}',
  time_zone text not null,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medication_schedule_frequency check (
    (frequency_kind = 'interval' and interval_hours is not null)
    or (frequency_kind = 'times_of_day' and cardinality(times_of_day) > 0)
    or frequency_kind = 'as_needed'
  )
);

create table public.medication_intakes (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  medication_plan_id uuid not null references public.medication_plans(id) on delete cascade,
  medication_schedule_id uuid references public.medication_schedules(id) on delete set null,
  scheduled_for timestamptz,
  taken_at timestamptz,
  status text not null check (status in ('scheduled', 'taken', 'missed', 'skipped', 'cancelled')),
  actual_quantity numeric(12,4) check (actual_quantity is null or actual_quantity > 0),
  actual_unit text,
  notes text,
  idempotency_key text not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medication_intake_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint medication_intake_idempotent unique (care_space_id, idempotency_key),
  constraint medication_intake_taken check ((status = 'taken') = (taken_at is not null))
);

create table public.dose_validations (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  medication_concept_id uuid references public.medication_concepts(id) on delete restrict,
  formulary_version_id uuid references public.pediatric_formulary_versions(id) on delete restrict,
  dose_limit_id uuid references public.pediatric_dose_limits(id) on delete restrict,
  weight_measurement_id uuid references public.anthropometric_measurements(id) on delete restrict,
  declared_input jsonb not null check (jsonb_typeof(declared_input) = 'object'),
  result text not null check (result in ('within_reference_limits', 'exceeds_reference_limit', 'insufficient_data', 'professional_review_required', 'rule_unavailable')),
  explanation_codes text[] not null default '{}',
  validated_at timestamptz not null default now(),
  request_id text not null,
  created_at timestamptz not null default now(),
  constraint dose_validation_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint dose_validation_request_unique unique (care_space_id, request_id)
);

create table public.development_frameworks (
  id uuid primary key default gen_random_uuid(),
  rule_pack_id uuid not null references public.clinical_rule_packs(id) on delete restrict,
  framework_key text not null,
  country_code text not null check (country_code in ('CO', 'US', 'GLOBAL')),
  version text not null,
  framework_type text not null check (framework_type in ('education', 'observation', 'professional_screening')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'retired')),
  created_at timestamptz not null default now(),
  constraint development_frameworks_unique unique (framework_key, country_code, version)
);

create table public.development_milestones (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.development_frameworks(id) on delete cascade,
  milestone_code text not null,
  domain text not null check (domain in ('gross_motor', 'fine_motor', 'language', 'social', 'cognitive', 'adaptive')),
  title text not null,
  caregiver_copy text not null,
  window_start_days integer check (window_start_days is null or window_start_days >= 0),
  window_end_days integer check (window_end_days is null or window_end_days >= 0),
  professional_only boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint development_milestones_unique unique (framework_id, milestone_code),
  constraint development_milestone_window check (window_end_days is null or window_start_days is null or window_end_days >= window_start_days)
);

create table public.development_observations (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  milestone_id uuid references public.development_milestones(id) on delete restrict,
  domain text not null check (domain in ('gross_motor', 'fine_motor', 'language', 'social', 'cognitive', 'adaptive', 'general')),
  title text,
  observation text not null,
  observed_on date not null,
  status text not null default 'observed' check (status in ('observed', 'emerging', 'achieved', 'concern_declared', 'entered_in_error')),
  provenance_type text not null check (provenance_type in ('guardian', 'professional', 'import', 'document', 'chat')),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_observation_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create table public.screening_sessions (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  framework_id uuid not null references public.development_frameworks(id) on delete restrict,
  performed_by_user_id uuid not null,
  performer_role text not null check (performer_role = 'authorized_professional'),
  status text not null check (status in ('started', 'completed', 'voided')),
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint screening_session_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict
);

create index anthropometry_child_time_idx on public.anthropometric_measurements(child_id, occurred_at desc);
create index growth_assessments_child_time_idx on public.growth_assessments(child_id, assessed_at desc);
create index immunization_rules_schedule_idx on public.immunization_rules(schedule_id, antigen_id, target_age_days);
create index vaccine_administrations_child_date_idx on public.vaccine_administrations(child_id, administered_on desc);
create index vaccination_assessments_child_status_idx on public.vaccination_assessments(child_id, as_of_date desc, status);
create index child_food_reactions_child_idx on public.child_food_reactions(child_id, status);
create index medication_plans_child_status_idx on public.medication_plans(child_id, status, starts_at desc);
create index medication_intakes_child_time_idx on public.medication_intakes(child_id, scheduled_for desc);
create index development_observations_child_date_idx on public.development_observations(child_id, observed_on desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'anthropometric_measurements', 'growth_assessments', 'vaccine_administrations',
    'vaccination_assessments', 'child_food_reactions', 'nutrition_profiles',
    'medication_plans', 'medication_intakes', 'dose_validations',
    'development_observations', 'screening_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.has_child_permission(care_space_id, child_id, ''read''))',
      table_name || '_child_select',
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
    'vaccine_antigens', 'vaccine_products', 'vaccine_product_antigens',
    'immunization_schedules', 'immunization_rules', 'immunization_rule_dependencies',
    'medication_concepts', 'medication_presentations', 'pediatric_formulary_versions',
    'pediatric_dose_limits', 'development_frameworks', 'development_milestones'
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

alter table public.vaccine_administration_antigens enable row level security;
alter table public.vaccine_administration_antigens force row level security;
create policy vaccine_administration_antigens_select on public.vaccine_administration_antigens
  for select to authenticated using (
    exists (
      select 1 from public.vaccine_administrations a
      where a.id = vaccine_administration_id
        and app_private.has_child_permission(a.care_space_id, a.child_id, 'read')
    )
  );

alter table public.medication_schedules enable row level security;
alter table public.medication_schedules force row level security;
create policy medication_schedules_select on public.medication_schedules
  for select to authenticated using (
    exists (
      select 1 from public.medication_plans p
      where p.id = medication_plan_id
        and app_private.has_child_permission(p.care_space_id, p.child_id, 'read')
    )
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'anthropometric_measurements', 'vaccine_administrations', 'child_food_reactions',
    'nutrition_profiles', 'immunization_schedules', 'medication_plans',
    'medication_schedules', 'medication_intakes', 'development_observations'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

grant select on public.anthropometric_measurements, public.growth_assessments to authenticated;
grant select on public.vaccine_antigens, public.vaccine_products, public.vaccine_product_antigens,
  public.immunization_schedules, public.immunization_rules, public.immunization_rule_dependencies,
  public.vaccine_administrations, public.vaccine_administration_antigens, public.vaccination_assessments to authenticated;
grant select on public.child_food_reactions, public.nutrition_profiles to authenticated;
grant select on public.medication_concepts, public.medication_presentations, public.pediatric_formulary_versions,
  public.pediatric_dose_limits, public.medication_plans, public.medication_schedules,
  public.medication_intakes, public.dose_validations to authenticated;
grant select on public.development_frameworks, public.development_milestones,
  public.development_observations, public.screening_sessions to authenticated;
