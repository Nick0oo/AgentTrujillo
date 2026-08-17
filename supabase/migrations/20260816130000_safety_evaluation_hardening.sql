-- Module 04 safety evidence hardening. Forward-only and Cloud-only.
-- This migration stores bounded metadata and keyed fingerprints only; no message content.

alter table public.safety_evaluations
  add column owner_user_id uuid;

update public.safety_evaluations e
set owner_user_id = s.owner_user_id
from public.agent_sessions s
where s.id = e.agent_session_id
  and e.owner_user_id is null;

do $$
begin
  if exists (select 1 from public.safety_evaluations where owner_user_id is null) then
    raise exception 'safety evaluation owner backfill failed';
  end if;
end;
$$;

alter table public.safety_evaluations
  alter column owner_user_id set not null,
  add column input_fingerprint text not null default repeat('0', 64),
  add column decision_sha256 text not null default repeat('0', 64),
  add column algorithm_key text not null default 'unknown',
  add column algorithm_version text not null default '0.0.0',
  add column copy_digest_sha256 text,
  add column evaluation_version text not null default 'safety-eval-v1',
  add column latency_ms integer;

alter table public.safety_evaluations
  add constraint safety_evaluations_owner_fk
    foreign key (owner_user_id) references public.guardian_profiles(user_id) on delete restrict,
  add constraint safety_evaluations_input_fingerprint_check
    check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint safety_evaluations_decision_sha256_check
    check (decision_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint safety_evaluations_copy_digest_check
    check (copy_digest_sha256 is null or copy_digest_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint safety_evaluations_latency_check
    check (latency_ms is null or latency_ms between 0 and 60000),
  add constraint safety_evaluations_request_id_check
    check (request_id <> '' and length(request_id) <= 128);

alter table public.safety_evaluations
  drop constraint if exists safety_evaluations_request_unique,
  drop constraint if exists safety_evaluations_decision_check,
  drop constraint if exists safety_evaluations_response_mode_check,
  drop constraint if exists safety_evaluations_urgent_mode;

alter table public.safety_evaluations
  add constraint safety_evaluations_scope_request_unique
    unique (care_space_id, child_id, owner_user_id, request_id),
  add constraint safety_evaluations_decision_check
    check (decision in ('urgent', 'clarification_required', 'professional_review', 'not_urgent', 'indeterminate')),
  add constraint safety_evaluations_response_mode_check
    check (response_mode in ('emergency_recommendation', 'clarify', 'pediatrician_recommendation', 'continue', 'abstain')),
  add constraint safety_evaluations_decision_mode_check
    check (
      (decision = 'urgent' and response_mode = 'emergency_recommendation')
      or (decision = 'clarification_required' and response_mode = 'clarify')
      or (decision = 'professional_review' and response_mode = 'pediatrician_recommendation')
      or (decision = 'not_urgent' and response_mode = 'continue')
      or (decision = 'indeterminate' and response_mode = 'abstain')
    );

create index safety_evaluations_owner_scope_idx
  on public.safety_evaluations(owner_user_id, care_space_id, child_id, evaluated_at desc);

create or replace function app_private.prevent_safety_evaluation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'safety evaluation is immutable';
end;
$$;

drop trigger if exists safety_evaluations_immutable on public.safety_evaluations;
create trigger safety_evaluations_immutable
before update or delete on public.safety_evaluations
for each row execute function app_private.prevent_safety_evaluation_mutation();

drop policy if exists safety_evaluations_child_select on public.safety_evaluations;
drop policy if exists safety_evaluations_owner_select on public.safety_evaluations;
create policy safety_evaluations_owner_select
on public.safety_evaluations
for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and app_private.has_child_permission(care_space_id, child_id, 'read')
  and (
    agent_session_id is null
    or exists (
      select 1 from public.agent_sessions s
      where s.id = agent_session_id
        and s.owner_user_id = (select auth.uid())
        and s.care_space_id = safety_evaluations.care_space_id
        and s.child_id = safety_evaluations.child_id
    )
  )
);

revoke insert, update, delete on public.safety_evaluations from anon, authenticated;

create or replace function public.record_safety_evaluation(
  p_care_space_id uuid,
  p_child_id uuid,
  p_owner_user_id uuid,
  p_agent_session_id uuid,
  p_request_id text,
  p_rule_pack_id uuid,
  p_decision text,
  p_response_mode text,
  p_matched_rule_codes text[],
  p_approved_copy_key text,
  p_input_fingerprint text,
  p_decision_sha256 text,
  p_algorithm_key text,
  p_algorithm_version text,
  p_copy_digest_sha256 text,
  p_evaluation_version text,
  p_latency_ms integer
)
returns table (evaluation_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.safety_evaluations%rowtype;
begin
  if p_agent_session_id is not null and not exists (
    select 1 from public.agent_sessions s
    where s.id = p_agent_session_id
      and s.care_space_id = p_care_space_id
      and s.child_id = p_child_id
      and s.owner_user_id = p_owner_user_id
  ) then
    raise exception using errcode = '42501', message = 'safety evaluation session scope denied';
  end if;

  insert into public.safety_evaluations (
    care_space_id, child_id, owner_user_id, agent_session_id, request_id,
    rule_pack_id, decision, response_mode, matched_rule_codes, approved_copy_key,
    input_fingerprint, decision_sha256, algorithm_key, algorithm_version,
    copy_digest_sha256, evaluation_version, latency_ms
  ) values (
    p_care_space_id, p_child_id, p_owner_user_id, p_agent_session_id, p_request_id,
    p_rule_pack_id, p_decision, p_response_mode, coalesce(p_matched_rule_codes, '{}'::text[]), p_approved_copy_key,
    p_input_fingerprint, p_decision_sha256, p_algorithm_key, p_algorithm_version,
    p_copy_digest_sha256, p_evaluation_version, p_latency_ms
  )
  on conflict (care_space_id, child_id, owner_user_id, request_id) do nothing
  returning id into evaluation_id;

  if evaluation_id is not null then
    created := true;
    return next;
    return;
  end if;

  select * into existing
  from public.safety_evaluations e
  where e.care_space_id = p_care_space_id
    and e.child_id = p_child_id
    and e.owner_user_id = p_owner_user_id
    and e.request_id = p_request_id;

  if existing.input_fingerprint is distinct from p_input_fingerprint
    or existing.decision_sha256 is distinct from p_decision_sha256 then
    raise exception using errcode = '23P01', message = 'safety evaluation fingerprint conflict';
  end if;
  evaluation_id := existing.id;
  created := false;
  return next;
end;
$$;

revoke all on function public.record_safety_evaluation(uuid, uuid, uuid, uuid, text, uuid, text, text, text[], text, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_safety_evaluation(uuid, uuid, uuid, uuid, text, uuid, text, text, text[], text, text, text, text, text, text, text, integer) to service_role;
