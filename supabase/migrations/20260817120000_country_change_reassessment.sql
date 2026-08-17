-- Module 06 AT-06-13: country-change reassessment is one append-only Cloud transaction.

alter table public.vaccination_assessments
  add column if not exists reevaluation_run_id uuid,
  add column if not exists reevaluates_run_id uuid,
  add column if not exists country_change_event_id text;

create unique index if not exists vaccination_assessments_reevaluation_rule_idx
  on public.vaccination_assessments(care_space_id, child_id, reevaluation_run_id, rule_id)
  where reevaluation_run_id is not null;
create unique index if not exists vaccination_assessments_country_event_idx
  on public.vaccination_assessments(care_space_id, child_id, country_change_event_id)
  where country_change_event_id is not null;
create index if not exists vaccination_assessments_reevaluates_run_idx
  on public.vaccination_assessments(care_space_id, child_id, reevaluates_run_id)
  where reevaluates_run_id is not null;

create or replace function public.persist_country_change_reassessment(
  p_care_space_id uuid,
  p_child_id uuid,
  p_country_code text,
  p_country_change_event_id text,
  p_reevaluation_run_id uuid,
  p_reevaluates_run_id uuid,
  p_schedule_id uuid,
  p_database_rule_pack_id uuid,
  p_database_algorithm_id uuid,
  p_input_fingerprint text,
  p_assessments jsonb
)
returns table (reevaluation_run_id uuid, assessment_ids uuid[], outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing_fingerprint text;
  existing_event_id text;
  existing_count integer;
  requested_count integer;
  inserted_count integer;
  created_ids uuid[];
  evidence_id uuid;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then
    raise exception 'immunization_not_authorized' using errcode = '42501';
  end if;
  if p_country_code not in ('CO', 'US')
    or p_country_change_event_id is null or length(trim(p_country_change_event_id)) = 0 or length(p_country_change_event_id) > 200
    or p_reevaluation_run_id is null
    or p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_assessments) <> 'array' or jsonb_array_length(p_assessments) = 0 then
    raise exception 'country_change_reassessment_invalid' using errcode = '22023';
  end if;

  select count(*) into requested_count from jsonb_array_elements(p_assessments);
  select count(*), min(a.input_fingerprint), min(a.country_change_event_id)
    into existing_count, existing_fingerprint, existing_event_id
  from public.vaccination_assessments a
  where a.care_space_id = p_care_space_id
    and a.child_id = p_child_id
    and a.reevaluation_run_id = p_reevaluation_run_id;
  if existing_count > 0 then
    if existing_count <> requested_count
      or existing_fingerprint is distinct from p_input_fingerprint
      or existing_event_id is distinct from p_country_change_event_id then
      raise exception 'country_change_reassessment_idempotency_conflict' using errcode = '23505';
    end if;
    return query
      select p_reevaluation_run_id,
             array_agg(a.id order by a.rule_id),
             'idempotent_replay'::text
      from public.vaccination_assessments a
      where a.care_space_id = p_care_space_id
        and a.child_id = p_child_id
        and a.reevaluation_run_id = p_reevaluation_run_id;
    return;
  end if;

  if not exists (
    select 1
    from public.immunization_schedules s
    join public.clinical_rule_packs p on p.id = s.rule_pack_id
    join public.clinical_algorithms alg on alg.id = p_database_algorithm_id
    where s.id = p_schedule_id
      and s.country_code = p_country_code
      and s.rule_pack_id = p_database_rule_pack_id
      and s.status in ('approved', 'active')
      and p.status in ('approved', 'active')
      and exists (
        select 1 from public.clinical_approvals ca
        where ca.rule_pack_id = p.id
          and ca.artifact_sha256 = p.artifact_sha256
          and ca.decision = 'approved'
      )
      and alg.status in ('approved', 'active')
  ) then
    raise exception 'country_change_reassessment_pack_not_approved' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_to_recordset(p_assessments) as a(rule_id uuid, status text, as_of_date date, due_from date, due_until date, evidence_administration_ids uuid[], explanation_code text, rule_pack_version text, source_digest text, input_digest text, decision_digest text))
      <> (select count(distinct a.rule_id) from jsonb_to_recordset(p_assessments) as a(rule_id uuid, status text, as_of_date date, due_from date, due_until date, evidence_administration_ids uuid[], explanation_code text, rule_pack_version text, source_digest text, input_digest text, decision_digest text)) then
    raise exception 'country_change_reassessment_duplicate_rule' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as a(rule_id uuid, status text, as_of_date date, due_from date, due_until date, evidence_administration_ids uuid[], explanation_code text, rule_pack_version text, source_digest text, input_digest text, decision_digest text)
    where a.status not in ('applied', 'upcoming', 'due', 'overdue', 'not_applicable', 'review_required')
      or a.explanation_code is null
      or a.source_digest is null or a.source_digest !~ '^[a-f0-9]{64}$'
      or a.input_digest is null or a.input_digest !~ '^[a-f0-9]{64}$'
      or a.decision_digest is null or a.decision_digest !~ '^[a-f0-9]{64}$'
      or not exists (select 1 from public.immunization_rules r where r.id = a.rule_id and r.schedule_id = p_schedule_id)
  ) then
    raise exception 'country_change_reassessment_row_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assessments) as a(rule_id uuid, status text, as_of_date date, due_from date, due_until date, evidence_administration_ids uuid[], explanation_code text, rule_pack_version text, source_digest text, input_digest text, decision_digest text)
    cross join lateral unnest(coalesce(a.evidence_administration_ids, '{}'::uuid[])) requested(id)
    where not exists (
      select 1
      from public.vaccine_administrations va
      where va.id = requested.id
        and va.care_space_id = p_care_space_id
        and va.child_id = p_child_id
        and va.confirmation_status = 'confirmed'
    )
  ) then
    raise exception 'country_change_reassessment_evidence_invalid' using errcode = '23503';
  end if;

  insert into public.vaccination_assessments (
    care_space_id, child_id, schedule_id, rule_id, assessment_run_id,
    reevaluation_run_id, reevaluates_run_id, country_change_event_id,
    country_code, as_of_date, status, due_from, due_until,
    evidence_administration_ids, explanation_code, rule_pack_id,
    rule_pack_version, algorithm_id, source_digest, input_digest,
    decision_digest, input_fingerprint
  )
  select p_care_space_id, p_child_id, p_schedule_id, a.rule_id, p_reevaluation_run_id,
    p_reevaluation_run_id, p_reevaluates_run_id, p_country_change_event_id,
    p_country_code, a.as_of_date, a.status, a.due_from, a.due_until,
    coalesce(a.evidence_administration_ids, '{}'::uuid[]), a.explanation_code,
    p_database_rule_pack_id, a.rule_pack_version, p_database_algorithm_id,
    a.source_digest, a.input_digest, a.decision_digest, p_input_fingerprint
  from jsonb_to_recordset(p_assessments) as a(
    rule_id uuid, status text, as_of_date date, due_from date, due_until date,
    evidence_administration_ids uuid[], explanation_code text, rule_pack_version text,
    source_digest text, input_digest text, decision_digest text
  );

  select count(*), array_agg(a.id order by a.rule_id)
    into inserted_count, created_ids
  from public.vaccination_assessments a
  where a.care_space_id = p_care_space_id
    and a.child_id = p_child_id
    and a.reevaluation_run_id = p_reevaluation_run_id;
  if inserted_count <> requested_count then
    raise exception 'country_change_reassessment_incomplete' using errcode = '23505';
  end if;

  insert into public.vaccination_assessment_evidence(care_space_id, child_id, vaccination_assessment_id, vaccine_administration_id)
  select p_care_space_id, p_child_id, va.id, requested.id
  from public.vaccination_assessments va
  join jsonb_to_recordset(p_assessments) as a(rule_id uuid, status text, as_of_date date, due_from date, due_until date, evidence_administration_ids uuid[], explanation_code text, rule_pack_version text, source_digest text, input_digest text, decision_digest text)
    on a.rule_id = va.rule_id
  cross join lateral unnest(coalesce(a.evidence_administration_ids, '{}'::uuid[])) requested(id)
  where va.care_space_id = p_care_space_id
    and va.child_id = p_child_id
    and va.reevaluation_run_id = p_reevaluation_run_id;

  return query select p_reevaluation_run_id, created_ids, 'created'::text;
exception when unique_violation then
  raise exception 'country_change_reassessment_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.persist_country_change_reassessment(uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.persist_country_change_reassessment(uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
