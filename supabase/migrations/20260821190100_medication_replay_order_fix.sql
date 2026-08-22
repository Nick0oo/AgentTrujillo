-- A same-key replay must be resolved before checking for another active fact
-- on the occurrence. This preserves exact replay while still rejecting a
-- second independently keyed active fact.

create or replace function public.record_medication_intake(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_plan_id uuid,
  p_medication_schedule_occurrence_id uuid,
  p_scheduled_for timestamptz,
  p_taken_at timestamptz,
  p_status text,
  p_actual_quantity_lexeme text,
  p_actual_unit text,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (intake_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.medication_operation_ledger%rowtype;
  created_id uuid;
  domain_payload jsonb;
  derived_digest text;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_status not in ('taken', 'skipped', 'unknown')
    or ((p_status = 'taken') <> (p_taken_at is not null))
    or ((p_actual_quantity_lexeme is null) <> (p_actual_unit is null))
    or (p_actual_quantity_lexeme is not null and p_actual_quantity_lexeme !~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]+)?)$')
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200
  then raise exception 'medication_intake_input_invalid' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.medication_plans p where p.id = p_medication_plan_id
      and p.care_space_id = p_care_space_id and p.child_id = p_child_id
  ) then return; end if;
  if p_medication_schedule_occurrence_id is not null and not exists (
    select 1 from public.medication_schedule_occurrences o
    where o.id = p_medication_schedule_occurrence_id and o.care_space_id = p_care_space_id
      and o.child_id = p_child_id and o.medication_plan_id = p_medication_plan_id
  ) then return; end if;

  domain_payload := jsonb_build_object(
    'medication_plan_id', p_medication_plan_id,
    'medication_schedule_occurrence_id', p_medication_schedule_occurrence_id,
    'scheduled_for', p_scheduled_for,
    'taken_at', p_taken_at,
    'status', p_status,
    'actual_quantity_lexeme', p_actual_quantity_lexeme,
    'actual_unit', p_actual_unit
  );
  derived_digest := app_private.medication_domain_digest(domain_payload);
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'record_intake' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> derived_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    intake_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  if p_medication_schedule_occurrence_id is not null and exists (
    select 1 from public.medication_intakes i
    where i.care_space_id = p_care_space_id and i.child_id = p_child_id
      and i.medication_schedule_occurrence_id = p_medication_schedule_occurrence_id
      and not exists (select 1 from public.medication_intakes correction where correction.supersedes_intake_id = i.id)
  ) then raise exception 'medication_occurrence_fact_conflict' using errcode = '23505'; end if;

  insert into public.medication_intakes (
    care_space_id, child_id, medication_plan_id, medication_schedule_occurrence_id,
    scheduled_for, taken_at, status, actual_quantity, actual_unit,
    idempotency_key, recorded_by, input_fingerprint
  ) values (
    p_care_space_id, p_child_id, p_medication_plan_id, p_medication_schedule_occurrence_id,
    p_scheduled_for, p_taken_at, p_status,
    case when p_actual_quantity_lexeme is null then null else p_actual_quantity_lexeme::numeric end,
    p_actual_unit, p_idempotency_key, actor, derived_digest
  ) returning id into created_id;
  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'record_intake', p_idempotency_key,
    derived_digest, 'medication_intake', created_id, domain_payload
  );
  intake_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
