-- Extend the trusted onboarding RPC without changing the already-applied signature.
-- The old signature remains as a compatibility wrapper for older callers.

create or replace function public.create_onboarding(
  p_request_sha256 text,
  p_idempotency_key text,
  p_care_space_name text,
  p_given_names text,
  p_birth_date date,
  p_reference_sex text,
  p_country_of_care text,
  p_timezone text,
  p_is_premature boolean,
  p_gestational_age_weeks smallint,
  p_allergies text[],
  p_guardian_relationship text,
  p_consent_type text,
  p_consent_jurisdiction text,
  p_consent_locale text,
  p_family_names text,
  p_preferred_name text,
  p_time_of_birth time without time zone,
  p_birth_time_zone text,
  p_gestational_age_days smallint,
  p_birth_weight_grams numeric
)
returns table (
  outcome text,
  care_space_id uuid,
  child_id uuid,
  resource_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.onboarding_operations%rowtype;
  consent_definition uuid;
  new_space uuid;
  new_child uuid;
begin
  if actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_request_sha256 is null or p_request_sha256 !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_consent_type <> 'privacy'
    or p_consent_jurisdiction not in ('CO', 'US')
    or p_consent_locale not in ('es-CO', 'en-US')
    or p_is_premature is null
    or p_guardian_relationship not in ('mother', 'father', 'grandparent', 'guardian', 'other')
    or (p_family_names is not null and char_length(p_family_names) not between 1 and 120)
    or (p_preferred_name is not null and char_length(p_preferred_name) not between 1 and 80)
    or (p_birth_time_zone is not null and (
      char_length(p_birth_time_zone) not between 3 and 64
      or not exists (select 1 from pg_timezone_names where name = p_birth_time_zone)
    ))
    or (p_time_of_birth is null and p_birth_time_zone is not null)
    or (p_time_of_birth is not null and p_birth_time_zone is null)
    or (p_gestational_age_days is not null and p_gestational_age_days not between 0 and 6)
    or (p_birth_weight_grams is not null and (p_birth_weight_grams <= 0 or p_birth_weight_grams > 10000)) then
    raise exception 'onboarding_request_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':initial_onboarding', 0));

  select * into existing
  from app_private.onboarding_operations
  where guardian_user_id = actor
    and operation = 'initial_onboarding'
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if existing.request_sha256 <> p_request_sha256 then
      raise exception 'onboarding_idempotency_conflict' using errcode = '23505';
    end if;
    return query select 'replayed', existing.care_space_id, existing.child_id, existing.resource_version;
    return;
  end if;

  if exists (
    select 1 from public.guardian_profiles
    where user_id = actor and onboarding_completed_at is not null
  ) or exists (
    select 1 from public.care_space_members
    where user_id = actor and member_role = 'owner' and status = 'active' and revoked_at is null
  ) then
    raise exception 'onboarding_already_exists' using errcode = '23505';
  end if;

  select id into consent_definition
  from public.consent_definitions
  where consent_type = p_consent_type
    and jurisdiction = p_consent_jurisdiction
    and locale = p_consent_locale
    and status = 'active'
    and effective_from <= current_date
    and (effective_until is null or effective_until >= current_date)
  order by effective_from desc, created_at desc
  limit 1;
  if consent_definition is null then
    raise exception 'onboarding_consent_definition_unavailable' using errcode = '55000';
  end if;

  if p_is_premature and (p_gestational_age_weeks is null or p_gestational_age_weeks not between 20 and 44)
    or not p_is_premature and (p_gestational_age_weeks is not null or p_gestational_age_days is not null) then
    raise exception 'onboarding_request_invalid' using errcode = '22023';
  end if;

  insert into public.care_spaces (name, default_country_code, time_zone, created_by)
  values (p_care_space_name, p_country_of_care, p_timezone, actor)
  returning id into new_space;

  insert into public.care_space_members (care_space_id, user_id, member_role, status, invited_by)
  values (new_space, actor, 'owner', 'active', actor);

  insert into public.children (
    care_space_id, given_names, family_names, preferred_name, date_of_birth,
    time_of_birth, birth_time_zone, sex_for_growth, country_of_care,
    time_zone, gestational_age_weeks, gestational_age_days, birth_weight_grams, created_by
  ) values (
    new_space, p_given_names, p_family_names, p_preferred_name, p_birth_date,
    p_time_of_birth, p_birth_time_zone, p_reference_sex, p_country_of_care,
    p_timezone, p_gestational_age_weeks, p_gestational_age_days, p_birth_weight_grams, actor
  ) returning id into new_child;

  insert into public.child_access (care_space_id, child_id, user_id, permissions, status, granted_by)
  values (
    new_space, new_child, actor,
    array['read', 'record', 'manage_documents', 'manage_medication', 'manage_guardians']::text[],
    'active', actor
  );

  insert into public.child_food_reactions (
    care_space_id, child_id, substance_name, reaction_type, severity, status, provenance_type, recorded_by
  )
  select new_space, new_child, trim(allergy), 'allergy', 'unknown', 'declared', 'guardian', actor
  from unnest(coalesce(p_allergies, '{}'::text[])) as allergy
  where char_length(trim(allergy)) > 0;

  insert into public.consent_records (
    care_space_id, child_id, guardian_user_id, consent_definition_id, decision, evidence
  ) values (
    new_space, new_child, actor, consent_definition, 'accepted',
    jsonb_build_object('source', 'initial_onboarding', 'guardianRelationship', p_guardian_relationship)
  );

  update public.guardian_profiles
  set onboarding_completed_at = now(), updated_at = now()
  where user_id = actor;

  insert into app_private.onboarding_operations (
    guardian_user_id, operation, idempotency_key, request_sha256,
    care_space_id, child_id, status, resource_version
  ) values (actor, 'initial_onboarding', p_idempotency_key, p_request_sha256, new_space, new_child, 'created', 1);

  return query select 'created', new_space, new_child, 1;
end;
$$;

create or replace function public.create_onboarding(
  p_request_sha256 text,
  p_idempotency_key text,
  p_care_space_name text,
  p_given_names text,
  p_birth_date date,
  p_reference_sex text,
  p_country_of_care text,
  p_timezone text,
  p_is_premature boolean,
  p_gestational_age_weeks smallint,
  p_allergies text[],
  p_guardian_relationship text,
  p_consent_type text,
  p_consent_jurisdiction text,
  p_consent_locale text
)
returns table (
  outcome text,
  care_space_id uuid,
  child_id uuid,
  resource_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select * from public.create_onboarding(
    p_request_sha256, p_idempotency_key, p_care_space_name, p_given_names, p_birth_date,
    p_reference_sex, p_country_of_care, p_timezone, p_is_premature, p_gestational_age_weeks,
    p_allergies, p_guardian_relationship, p_consent_type, p_consent_jurisdiction, p_consent_locale,
    null, null, null, null, null, null
  );
end;
$$;

revoke all on function public.create_onboarding(
  text, text, text, text, date, text, text, text, boolean, smallint,
  text[], text, text, text, text, text, text, time, text, smallint, numeric
) from public, anon;
grant execute on function public.create_onboarding(
  text, text, text, text, date, text, text, text, boolean, smallint,
  text[], text, text, text, text, text, text, time, text, smallint, numeric
) to authenticated;

revoke all on function public.create_onboarding(
  text, text, text, text, date, text, text, text, boolean, smallint,
  text[], text, text, text, text
) from public, anon;
grant execute on function public.create_onboarding(
  text, text, text, text, date, text, text, text, boolean, smallint,
  text[], text, text, text, text
) to authenticated;
