-- Keep the deployed plan operation compatible with the medication presentation schema.

create or replace function public.record_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_concept_id uuid,
  p_medication_presentation_id uuid,
  p_display_name text,
  p_declared_indication text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_input_fingerprint text,
  p_idempotency_key text,
  p_input_payload jsonb
)
returns table (plan_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.medication_operation_ledger%rowtype;
  created_id uuid;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then
    return;
  end if;
  if p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$' or p_input_payload is null or jsonb_typeof(p_input_payload) <> 'object' then
    raise exception 'medication_plan_input_invalid' using errcode = '22023';
  end if;
  if p_medication_presentation_id is not null and not exists (
    select 1 from public.medication_presentations mp
    where mp.id = p_medication_presentation_id and mp.medication_concept_id = p_medication_concept_id
  ) then
    return;
  end if;

  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor
    and operation_kind = 'create_plan' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_fingerprint then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;

  insert into public.medication_plans (
    care_space_id, child_id, medication_concept_id, medication_presentation_id,
    display_name, declared_indication, provenance_type, starts_at, ends_at,
    status, recorded_by, version, input_fingerprint, confirmed_at, confirmed_by
  ) values (
    p_care_space_id, p_child_id, p_medication_concept_id, p_medication_presentation_id,
    p_display_name, p_declared_indication, 'guardian', p_starts_at, p_ends_at,
    'draft', actor, 1, p_input_fingerprint, null, null
  ) returning id into created_id;

  insert into app_private.medication_operation_ledger (
    care_space_id, child_id, actor_user_id, operation_kind, idempotency_key,
    input_digest, entity_type, entity_id, payload
  ) values (
    p_care_space_id, p_child_id, actor, 'create_plan', p_idempotency_key,
    p_input_fingerprint, 'medication_plan', created_id, p_input_payload
  );
  plan_id := created_id; outcome := 'created'; return next;
exception when unique_violation then
  raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;
