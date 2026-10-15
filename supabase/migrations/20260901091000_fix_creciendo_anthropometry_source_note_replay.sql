-- A replay returns the existing immutable row. Source-note enrichment is only
-- valid for the initial create, so a replay must not issue another UPDATE.
create or replace function public.record_confirmed_anthropometry_with_note(
  p_care_space_id uuid,
  p_child_id uuid,
  p_idempotency_key text,
  p_input_fingerprint text,
  p_confirmation_sha256 text,
  p_confirmation_expires_at timestamptz,
  p_measurement_type text,
  p_original_value_lexeme text,
  p_original_unit text,
  p_normalized_value_lexeme text,
  p_normalized_unit text,
  p_occurred_at timestamptz,
  p_local_date date,
  p_time_zone text,
  p_measurement_method text,
  p_device text,
  p_provenance_type text,
  p_conversion_version text,
  p_rounding_mode text,
  p_hmac_key_id text,
  p_capture_policy_id text,
  p_capture_policy_version text,
  p_assessments jsonb,
  p_supersedes_measurement_id uuid default null,
  p_supersession_reason text default null,
  p_source_note text default null
)
returns table (measurement_id uuid, assessment_ids uuid[], outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  result record;
begin
  if p_source_note is not null and (length(p_source_note) < 1 or length(p_source_note) > 500) then
    raise exception 'anthropometry_source_note_invalid' using errcode = '22023';
  end if;

  select * into result
  from public.record_confirmed_anthropometry(
    p_care_space_id, p_child_id, p_idempotency_key, p_input_fingerprint,
    p_confirmation_sha256, p_confirmation_expires_at, p_measurement_type,
    p_original_value_lexeme, p_original_unit, p_normalized_value_lexeme,
    p_normalized_unit, p_occurred_at, p_local_date, p_time_zone,
    p_measurement_method, p_device, p_provenance_type, p_conversion_version,
    p_rounding_mode, p_hmac_key_id, p_capture_policy_id, p_capture_policy_version,
    p_assessments, p_supersedes_measurement_id, p_supersession_reason
  );

  if p_source_note is not null and result.outcome = 'created' then
    update public.anthropometric_measurements
    set source_note = p_source_note
    where id = result.measurement_id
      and care_space_id = p_care_space_id
      and child_id = p_child_id
      and recorded_by = (select auth.uid());
  end if;

  return query select result.measurement_id, result.assessment_ids, result.outcome;
end;
$$;

revoke all on function public.record_confirmed_anthropometry_with_note(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text,
  timestamptz, date, text, text, text, text, text, text, text, text, text,
  jsonb, uuid, text, text
) from public, anon;

grant execute on function public.record_confirmed_anthropometry_with_note(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text,
  timestamptz, date, text, text, text, text, text, text, text, text, text,
  jsonb, uuid, text, text
) to authenticated;
