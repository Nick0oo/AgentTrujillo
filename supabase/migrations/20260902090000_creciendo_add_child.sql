-- Add a child to an already-authorized care space. This is deliberately separate
-- from create_onboarding, which remains a one-time account bootstrap operation.
create table app_private.child_onboarding_operations (
  guardian_user_id uuid not null references public.guardian_profiles(user_id) on delete restrict,
  care_space_id uuid not null references public.care_spaces(id) on delete restrict,
  operation text not null check (operation = 'add_child'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  child_id uuid not null,
  status text not null check (status = 'created'),
  resource_version integer not null default 1 check (resource_version > 0),
  created_at timestamptz not null default now(),
  primary key (guardian_user_id, care_space_id, operation, idempotency_key)
);

revoke all on app_private.child_onboarding_operations from public, anon, authenticated;

create or replace function public.create_child_in_care_space(
  p_request_sha256 text,
  p_idempotency_key text,
  p_care_space_id uuid,
  p_given_names text,
  p_family_names text,
  p_preferred_name text,
  p_birth_date date,
  p_time_of_birth time without time zone,
  p_birth_time_zone text,
  p_reference_sex text,
  p_country_of_care text,
  p_timezone text,
  p_is_premature boolean,
  p_gestational_age_weeks smallint,
  p_gestational_age_days smallint,
  p_birth_weight_grams numeric,
  p_allergies text[]
)
returns table (outcome text, care_space_id uuid, child_id uuid, resource_version integer)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.child_onboarding_operations%rowtype;
  consent_definition uuid;
  new_child uuid;
begin
  if actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_request_sha256 is null or p_request_sha256 !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_care_space_id is null or p_given_names is null or char_length(trim(p_given_names)) not between 1 and 120
    or (p_family_names is not null and char_length(trim(p_family_names)) not between 1 and 120)
    or (p_preferred_name is not null and char_length(trim(p_preferred_name)) not between 1 and 80)
    or p_birth_date is null or p_birth_date > current_date
    or p_reference_sex not in ('female', 'male') or p_country_of_care not in ('CO', 'US')
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
    or (p_birth_time_zone is not null and not exists (select 1 from pg_timezone_names where name = p_birth_time_zone))
    or (p_time_of_birth is null and p_birth_time_zone is not null)
    or (p_time_of_birth is not null and p_birth_time_zone is null)
    or p_is_premature is null
    or (p_is_premature and (p_gestational_age_weeks is null or p_gestational_age_weeks not between 20 and 44))
    or (not p_is_premature and (p_gestational_age_weeks is not null or p_gestational_age_days is not null))
    or (p_gestational_age_days is not null and p_gestational_age_days not between 0 and 6)
    or (p_birth_weight_grams is not null and p_birth_weight_grams not between 200 and 8000) then
    raise exception 'add_child_request_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_care_space_id::text || ':add_child', 0));
  select * into existing from app_private.child_onboarding_operations
    where guardian_user_id = actor and care_space_id = p_care_space_id and operation = 'add_child' and idempotency_key = p_idempotency_key for update;
  if found then
    if existing.request_sha256 <> p_request_sha256 then raise exception 'add_child_idempotency_conflict' using errcode = '23505'; end if;
    return query select 'replayed', existing.care_space_id, existing.child_id, existing.resource_version; return;
  end if;

  if not exists (select 1 from public.care_space_members where care_space_id = p_care_space_id and user_id = actor and member_role = 'owner' and status = 'active' and revoked_at is null)
    or not exists (select 1 from public.care_spaces where id = p_care_space_id and status = 'active') then
    raise exception 'add_child_forbidden' using errcode = '42501';
  end if;
  select id into consent_definition from public.consent_definitions
    where consent_type = 'privacy' and jurisdiction = p_country_of_care
      and locale = case when p_country_of_care = 'CO' then 'es-CO' else 'en-US' end
      and status = 'active' and effective_from <= current_date and (effective_until is null or effective_until >= current_date)
    order by effective_from desc, created_at desc limit 1;
  if consent_definition is null then raise exception 'add_child_consent_required' using errcode = '55000'; end if;
  if not exists (select 1 from public.consent_records where care_space_id = p_care_space_id and guardian_user_id = actor and decision = 'accepted' and revoked_at is null) then
    raise exception 'add_child_consent_required' using errcode = '55000';
  end if;

  insert into public.children (care_space_id, given_names, family_names, preferred_name, date_of_birth, time_of_birth, birth_time_zone, sex_for_growth, country_of_care, time_zone, gestational_age_weeks, gestational_age_days, birth_weight_grams, created_by)
  values (p_care_space_id, trim(p_given_names), nullif(trim(p_family_names), ''), nullif(trim(p_preferred_name), ''), p_birth_date, p_time_of_birth, p_birth_time_zone, p_reference_sex, p_country_of_care, p_timezone, p_gestational_age_weeks, p_gestational_age_days, p_birth_weight_grams, actor)
  returning id into new_child;
  insert into public.child_access (care_space_id, child_id, user_id, permissions, status, granted_by)
    values (p_care_space_id, new_child, actor, array['read', 'record', 'manage_documents', 'manage_medication', 'manage_guardians']::text[], 'active', actor);
  insert into public.child_food_reactions (care_space_id, child_id, substance_name, reaction_type, severity, status, provenance_type, recorded_by)
    select p_care_space_id, new_child, trim(allergy), 'allergy', 'unknown', 'declared', 'guardian', actor from unnest(coalesce(p_allergies, '{}'::text[])) allergy where char_length(trim(allergy)) > 0;
  insert into public.consent_records (care_space_id, child_id, guardian_user_id, consent_definition_id, decision, evidence)
    values (p_care_space_id, new_child, actor, consent_definition, 'accepted', jsonb_build_object('source', 'add_sibling', 'accountConsentReused', true));
  insert into app_private.child_onboarding_operations (guardian_user_id, care_space_id, operation, idempotency_key, request_sha256, child_id, status, resource_version)
    values (actor, p_care_space_id, 'add_child', p_idempotency_key, p_request_sha256, new_child, 'created', 1);
  return query select 'created', p_care_space_id, new_child, 1;
end;
$$;

revoke all on function public.create_child_in_care_space(text, text, uuid, text, text, text, date, time without time zone, text, text, text, text, boolean, smallint, smallint, numeric, text[]) from public, anon;
grant execute on function public.create_child_in_care_space(text, text, uuid, text, text, text, date, time without time zone, text, text, text, text, boolean, smallint, smallint, numeric, text[]) to authenticated;
