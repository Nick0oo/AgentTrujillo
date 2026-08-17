-- Atomic, scoped medication writes. The actor is always derived from auth.uid().

create table if not exists app_private.medication_operation_ledger (
  care_space_id uuid not null,
  child_id uuid not null,
  actor_user_id uuid not null,
  operation_kind text not null check (operation_kind in ('create_plan', 'confirm_plan', 'end_plan', 'supersede_plan', 'materialize_schedule', 'record_intake', 'correct_intake')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{64}$'),
  entity_type text not null check (entity_type in ('medication_plan', 'medication_schedule_occurrence', 'medication_intake')),
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key)
);

revoke all on app_private.medication_operation_ledger from public, anon, authenticated;

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

create or replace function public.transition_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_plan_id uuid,
  p_status text,
  p_idempotency_key text,
  p_input_digest text,
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
  current_plan public.medication_plans%rowtype;
  op_kind text := case when p_status in ('completed', 'cancelled') then 'end_plan' else 'confirm_plan' end;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_digest is null or p_input_digest !~ '^[a-f0-9]{64}$' then raise exception 'medication_transition_input_invalid' using errcode = '22023'; end if;
  select * into existing from app_private.medication_operation_ledger
  where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor and operation_kind = op_kind and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  select * into current_plan from public.medication_plans where id = p_plan_id and care_space_id = p_care_space_id and child_id = p_child_id for update;
  if current_plan.id is null or p_status not in ('active', 'completed', 'cancelled') then return; end if;
  update public.medication_plans set status = p_status, confirmed_at = case when p_status = 'active' then now() else confirmed_at end, confirmed_by = case when p_status = 'active' then actor else confirmed_by end where id = current_plan.id;
  insert into app_private.medication_operation_ledger (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key, input_digest, entity_type, entity_id, payload)
  values (p_care_space_id, p_child_id, actor, op_kind, p_idempotency_key, p_input_digest, 'medication_plan', current_plan.id, coalesce(p_input_payload, '{}'::jsonb));
  plan_id := current_plan.id; outcome := 'created'; return next;
exception when unique_violation then raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

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
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_status not in ('taken', 'skipped', 'unknown') or (p_status = 'taken' and p_taken_at is null) or p_input_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'medication_intake_input_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.medication_plans p where p.id = p_medication_plan_id and p.care_space_id = p_care_space_id and p.child_id = p_child_id) then return; end if;
  if p_medication_schedule_occurrence_id is not null and not exists (select 1 from public.medication_schedule_occurrences o where o.id = p_medication_schedule_occurrence_id and o.care_space_id = p_care_space_id and o.child_id = p_child_id and o.medication_plan_id = p_medication_plan_id) then return; end if;
  select * into existing from app_private.medication_operation_ledger where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor and operation_kind = 'record_intake' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_fingerprint then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    intake_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.medication_intakes (care_space_id, child_id, medication_plan_id, medication_schedule_occurrence_id, scheduled_for, taken_at, status, actual_quantity, actual_unit, idempotency_key, recorded_by, input_fingerprint)
  values (p_care_space_id, p_child_id, p_medication_plan_id, p_medication_schedule_occurrence_id, p_scheduled_for, p_taken_at, p_status, case when p_actual_quantity_lexeme is null then null else p_actual_quantity_lexeme::numeric end, p_actual_unit, p_idempotency_key, actor, p_input_fingerprint)
  returning id into created_id;
  insert into app_private.medication_operation_ledger (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key, input_digest, entity_type, entity_id, payload)
  values (p_care_space_id, p_child_id, actor, 'record_intake', p_idempotency_key, p_input_fingerprint, 'medication_intake', created_id, coalesce(p_input_payload, '{}'::jsonb));
  intake_id := created_id; outcome := 'created'; return next;
exception when unique_violation then raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.supersede_medication_plan(
  p_care_space_id uuid,
  p_child_id uuid,
  p_plan_id uuid,
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
  previous public.medication_plans%rowtype;
  created_id uuid;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'medication_supersession_input_invalid' using errcode = '22023'; end if;
  select * into existing from app_private.medication_operation_ledger where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor and operation_kind = 'supersede_plan' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_fingerprint then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    plan_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  select * into previous from public.medication_plans where id = p_plan_id and care_space_id = p_care_space_id and child_id = p_child_id for update;
  if previous.id is null then return; end if;
  update public.medication_plans set status = 'superseded', supersession_reason = 'caregiver_declared_replacement' where id = previous.id;
  insert into public.medication_plans (care_space_id, child_id, medication_concept_id, medication_presentation_id, display_name, declared_indication, provenance_type, starts_at, ends_at, status, recorded_by, version, supersedes_plan_id, supersession_reason, input_fingerprint)
  values (p_care_space_id, p_child_id, p_medication_concept_id, p_medication_presentation_id, p_display_name, p_declared_indication, 'guardian', p_starts_at, p_ends_at, 'draft', actor, previous.version + 1, previous.id, 'caregiver_declared_replacement', p_input_fingerprint)
  returning id into created_id;
  insert into app_private.medication_operation_ledger (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key, input_digest, entity_type, entity_id, payload)
  values (p_care_space_id, p_child_id, actor, 'supersede_plan', p_idempotency_key, p_input_fingerprint, 'medication_plan', created_id, coalesce(p_input_payload, '{}'::jsonb));
  plan_id := created_id; outcome := 'created'; return next;
exception when unique_violation then raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.record_medication_schedule_occurrences(
  p_care_space_id uuid,
  p_child_id uuid,
  p_medication_plan_id uuid,
  p_plan_version integer,
  p_occurrences jsonb,
  p_input_digest text,
  p_idempotency_key text
)
returns table (saved_count integer, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing app_private.medication_operation_ledger%rowtype;
  saved integer := 0;
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'manage_medication') then return; end if;
  if p_input_digest is null or p_input_digest !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_occurrences) <> 'array' then raise exception 'medication_schedule_input_invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.medication_plans p where p.id = p_medication_plan_id and p.care_space_id = p_care_space_id and p.child_id = p_child_id and p.version = p_plan_version) then return; end if;
  select * into existing from app_private.medication_operation_ledger where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor and operation_kind = 'materialize_schedule' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_digest then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    saved_count := coalesce((existing.payload->>'saved_count')::integer, 0); outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.medication_schedule_occurrences (care_space_id, child_id, medication_plan_id, plan_version, occurrence_key, scheduled_for, local_date, time_zone, source)
  select p_care_space_id, p_child_id, p_medication_plan_id, p_plan_version, row.occurrence_key, row.scheduled_for, row.local_date, row.time_zone, row.source
  from jsonb_to_recordset(p_occurrences) as row(occurrence_key text, scheduled_for timestamptz, local_date date, time_zone text, source text)
  on conflict (care_space_id, child_id, occurrence_key) do nothing;
  get diagnostics saved = row_count;
  insert into app_private.medication_operation_ledger (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key, input_digest, entity_type, payload)
  values (p_care_space_id, p_child_id, actor, 'materialize_schedule', p_idempotency_key, p_input_digest, 'medication_schedule_occurrence', jsonb_build_object('saved_count', saved));
  saved_count := saved; outcome := 'created'; return next;
exception when unique_violation then raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

create or replace function public.correct_medication_intake(
  p_care_space_id uuid,
  p_child_id uuid,
  p_original_intake_id uuid,
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
begin
  if actor is null or not app_private.has_child_permission(p_care_space_id, p_child_id, 'record') then return; end if;
  if p_status not in ('taken', 'skipped', 'unknown') or (p_status = 'taken' and p_taken_at is null) or p_input_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'medication_intake_input_invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.medication_intakes i where i.id = p_original_intake_id and i.care_space_id = p_care_space_id and i.child_id = p_child_id and i.medication_plan_id = p_medication_plan_id) then return; end if;
  select * into existing from app_private.medication_operation_ledger where care_space_id = p_care_space_id and child_id = p_child_id and actor_user_id = actor and operation_kind = 'correct_intake' and idempotency_key = p_idempotency_key;
  if existing.idempotency_key is not null then
    if existing.input_digest <> p_input_fingerprint then raise exception 'medication_idempotency_conflict' using errcode = '23505'; end if;
    intake_id := existing.entity_id; outcome := 'idempotent_replay'; return next; return;
  end if;
  insert into public.medication_intakes (care_space_id, child_id, medication_plan_id, medication_schedule_occurrence_id, scheduled_for, taken_at, status, actual_quantity, actual_unit, idempotency_key, recorded_by, input_fingerprint, supersedes_intake_id)
  values (p_care_space_id, p_child_id, p_medication_plan_id, p_medication_schedule_occurrence_id, p_scheduled_for, p_taken_at, p_status, case when p_actual_quantity_lexeme is null then null else p_actual_quantity_lexeme::numeric end, p_actual_unit, p_idempotency_key, actor, p_input_fingerprint, p_original_intake_id)
  returning id into created_id;
  insert into app_private.medication_operation_ledger (care_space_id, child_id, actor_user_id, operation_kind, idempotency_key, input_digest, entity_type, entity_id, payload)
  values (p_care_space_id, p_child_id, actor, 'correct_intake', p_idempotency_key, p_input_fingerprint, 'medication_intake', created_id, coalesce(p_input_payload, '{}'::jsonb));
  intake_id := created_id; outcome := 'created'; return next;
exception when unique_violation then raise exception 'medication_idempotency_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) from public, anon;
revoke all on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_medication_plan(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.transition_medication_plan(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.record_medication_intake(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.supersede_medication_plan(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.record_medication_schedule_occurrences(uuid, uuid, uuid, integer, jsonb, text, text) to authenticated;
grant execute on function public.correct_medication_intake(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb) to authenticated;
