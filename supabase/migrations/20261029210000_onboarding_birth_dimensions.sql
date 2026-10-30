-- Optional birth metadata. Existing RPCs and callers remain valid.
alter table public.children
  add column birth_length_cm numeric(5,2),
  add column birth_head_circumference_cm numeric(5,2),
  add constraint children_birth_length_cm_check check (birth_length_cm > 0 and birth_length_cm <= 999.99),
  add constraint children_birth_head_circumference_cm_check check (birth_head_circumference_cm > 0 and birth_head_circumference_cm <= 999.99);

-- Keep original registration values separate from later confirmed profile
-- corrections, so an unchanged registration retry still replays after an edit.
create table app_private.registered_birth_dimensions (
  child_id uuid primary key references public.children(id) on delete restrict,
  guardian_user_id uuid not null,
  birth_length_cm numeric(5,2),
  birth_head_circumference_cm numeric(5,2)
);
alter table app_private.registered_birth_dimensions enable row level security;
revoke all on app_private.registered_birth_dimensions from public,anon,authenticated;

create function app_private.save_registered_birth_dimensions(
  p_child_id uuid, p_care_space_id uuid, p_outcome text,
  p_birth_length_cm numeric, p_birth_head_circumference_cm numeric
)
returns void language plpgsql security definer set search_path = '' as $$
declare original app_private.registered_birth_dimensions%rowtype;
begin
  if auth.uid() is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'add_child_forbidden' using errcode = '42501';
  end if;
  if (p_birth_length_cm is not null and (p_birth_length_cm <= 0 or p_birth_length_cm > 999.99 or round(p_birth_length_cm,2) <> p_birth_length_cm))
    or (p_birth_head_circumference_cm is not null and (p_birth_head_circumference_cm <= 0 or p_birth_head_circumference_cm > 999.99 or round(p_birth_head_circumference_cm,2) <> p_birth_head_circumference_cm)) then
    raise exception 'onboarding_request_invalid' using errcode = '22023';
  end if;
  perform 1 from public.children c
    where c.id=p_child_id and c.care_space_id=p_care_space_id and c.created_by=auth.uid() for update;
  if not found then raise exception 'add_child_forbidden' using errcode = '42501'; end if;
  if p_outcome='created' then
    insert into app_private.registered_birth_dimensions(child_id,guardian_user_id,birth_length_cm,birth_head_circumference_cm)
      values(p_child_id,auth.uid(),p_birth_length_cm,p_birth_head_circumference_cm);
    update public.children set birth_length_cm=p_birth_length_cm, birth_head_circumference_cm=p_birth_head_circumference_cm
      where id=p_child_id and care_space_id=p_care_space_id;
  elsif p_outcome='replayed' then
    select * into original from app_private.registered_birth_dimensions where child_id=p_child_id and guardian_user_id=auth.uid();
    if (not found and (p_birth_length_cm is not null or p_birth_head_circumference_cm is not null))
      or original.birth_length_cm is distinct from p_birth_length_cm
      or original.birth_head_circumference_cm is distinct from p_birth_head_circumference_cm then
      raise exception 'add_child_idempotency_conflict' using errcode = '23505';
    end if;
  else
    raise exception 'onboarding_request_invalid' using errcode = '22023';
  end if;
end;
$$;
revoke all on function app_private.save_registered_birth_dimensions(uuid,uuid,text,numeric,numeric) from public,anon,authenticated;

create function public.create_onboarding_with_birth_measurements(
  p_request_sha256 text, p_idempotency_key text, p_care_space_name text, p_given_names text,
  p_birth_date date, p_reference_sex text, p_country_of_care text, p_timezone text,
  p_is_premature boolean, p_gestational_age_weeks smallint, p_allergies text[],
  p_guardian_relationship text, p_consent_type text, p_consent_jurisdiction text, p_consent_locale text,
  p_family_names text, p_preferred_name text, p_time_of_birth time without time zone,
  p_birth_time_zone text, p_gestational_age_days smallint, p_birth_weight_grams numeric,
  p_birth_length_cm numeric, p_birth_head_circumference_cm numeric
)
returns table (outcome text, care_space_id uuid, child_id uuid, resource_version integer)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  select * into strict result from public.create_onboarding(
    p_request_sha256,p_idempotency_key,p_care_space_name,p_given_names,p_birth_date,p_reference_sex,
    p_country_of_care,p_timezone,p_is_premature,p_gestational_age_weeks,p_allergies,p_guardian_relationship,
    p_consent_type,p_consent_jurisdiction,p_consent_locale,p_family_names,p_preferred_name,
    p_time_of_birth,p_birth_time_zone,p_gestational_age_days,p_birth_weight_grams);
  perform app_private.save_registered_birth_dimensions(result.child_id,result.care_space_id,result.outcome,p_birth_length_cm,p_birth_head_circumference_cm);
  return query select result.outcome,result.care_space_id,result.child_id,result.resource_version;
end;
$$;
revoke all on function public.create_onboarding_with_birth_measurements(text,text,text,text,date,text,text,text,boolean,smallint,text[],text,text,text,text,text,text,time without time zone,text,smallint,numeric,numeric,numeric) from public,anon;
grant execute on function public.create_onboarding_with_birth_measurements(text,text,text,text,date,text,text,text,boolean,smallint,text[],text,text,text,text,text,text,time without time zone,text,smallint,numeric,numeric,numeric) to authenticated;

create function public.create_child_in_care_space_with_birth_measurements(
  p_request_sha256 text, p_idempotency_key text, p_care_space_id uuid,
  p_given_names text, p_family_names text, p_preferred_name text,
  p_birth_date date, p_time_of_birth time without time zone, p_birth_time_zone text,
  p_reference_sex text, p_country_of_care text, p_timezone text,
  p_is_premature boolean, p_gestational_age_weeks smallint, p_gestational_age_days smallint,
  p_birth_weight_grams numeric, p_allergies text[], p_birth_length_cm numeric, p_birth_head_circumference_cm numeric
)
returns table (outcome text, care_space_id uuid, child_id uuid, resource_version integer)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  select * into strict result from public.create_child_in_care_space(
    p_request_sha256,p_idempotency_key,p_care_space_id,p_given_names,p_family_names,p_preferred_name,
    p_birth_date,p_time_of_birth,p_birth_time_zone,p_reference_sex,p_country_of_care,p_timezone,
    p_is_premature,p_gestational_age_weeks,p_gestational_age_days,p_birth_weight_grams,p_allergies);
  perform app_private.save_registered_birth_dimensions(result.child_id,result.care_space_id,result.outcome,p_birth_length_cm,p_birth_head_circumference_cm);
  return query select result.outcome,result.care_space_id,result.child_id,result.resource_version;
end;
$$;
revoke all on function public.create_child_in_care_space_with_birth_measurements(text,text,uuid,text,text,text,date,time without time zone,text,text,text,text,boolean,smallint,smallint,numeric,text[],numeric,numeric) from public,anon;
grant execute on function public.create_child_in_care_space_with_birth_measurements(text,text,uuid,text,text,text,date,time without time zone,text,text,text,text,boolean,smallint,smallint,numeric,text[],numeric,numeric) to authenticated;

-- Confirmed profile edits use the same canonical birth metadata, never a later
-- anthropometry entry or an unconfirmed local-only overwrite.
create function public.update_registered_birth_measurements(
  p_child_id uuid,p_birth_weight_grams numeric default null,
  p_birth_length_cm numeric default null,p_birth_head_circumference_cm numeric default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare space_id uuid;
begin
  select care_space_id into space_id from public.children where id=p_child_id;
  if auth.uid() is null or space_id is null or not app_private.has_child_permission(space_id,p_child_id,'record') then
    raise exception 'birth_metadata_forbidden' using errcode='42501';
  end if;
  if (p_birth_weight_grams is not null and (p_birth_weight_grams<200 or p_birth_weight_grams>8000 or round(p_birth_weight_grams,2)<>p_birth_weight_grams))
    or (p_birth_length_cm is not null and (p_birth_length_cm<=0 or p_birth_length_cm>999.99 or round(p_birth_length_cm,2)<>p_birth_length_cm))
    or (p_birth_head_circumference_cm is not null and (p_birth_head_circumference_cm<=0 or p_birth_head_circumference_cm>999.99 or round(p_birth_head_circumference_cm,2)<>p_birth_head_circumference_cm)) then
    raise exception 'birth_metadata_invalid' using errcode='22023';
  end if;
  update public.children set birth_weight_grams=coalesce(p_birth_weight_grams,birth_weight_grams),
    birth_length_cm=coalesce(p_birth_length_cm,birth_length_cm),
    birth_head_circumference_cm=coalesce(p_birth_head_circumference_cm,birth_head_circumference_cm)
    where id=p_child_id and care_space_id=space_id;
  return true;
end;
$$;
revoke all on function public.update_registered_birth_measurements(uuid,numeric,numeric,numeric) from public,anon;
grant execute on function public.update_registered_birth_measurements(uuid,numeric,numeric,numeric) to authenticated;
