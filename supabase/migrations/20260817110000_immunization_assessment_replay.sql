-- Module 06 follow-up: identical assessment retries converge without mutating history.

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
  existing public.vaccination_assessments;
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
  select * into existing
  from public.vaccination_assessments a
  where a.care_space_id = p_care_space_id
    and a.child_id = p_child_id
    and a.schedule_id = p_schedule_id
    and a.rule_id = p_rule_id
    and a.as_of_date = p_as_of_date
    and a.input_fingerprint = p_input_fingerprint
  for update;
  if found then
    if existing.input_digest is distinct from p_input_digest or existing.decision_digest is distinct from p_decision_digest then
      raise exception 'immunization_assessment_idempotency_conflict' using errcode = '23505';
    end if;
    return query select existing.id, 'idempotent_replay'::text;
    return;
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
  raise exception 'immunization_assessment_idempotency_conflict' using errcode = '23505';
end;
$$;
