-- Module 07 plan/schedule/intake hardening. This migration is forward-only and
-- deliberately inserts no medication concepts, formularies, or dose ranges.

alter table public.medication_plans
  add column if not exists version integer not null default 1,
  add column if not exists supersedes_plan_id uuid references public.medication_plans(id) on delete restrict,
  add column if not exists supersession_reason text,
  add column if not exists input_fingerprint text,
  add column if not exists source_version text,
  add column if not exists source_artifact_sha256 text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid;

alter table public.medication_plans drop constraint if exists medication_plans_status_check;
alter table public.medication_plans
  add constraint medication_plans_status_check
  check (status in ('draft', 'active', 'paused', 'completed', 'cancelled', 'superseded'));

alter table public.medication_plans
  add constraint medication_plan_version_check check (version > 0),
  add constraint medication_plan_fingerprint_check check (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint medication_plan_source_digest_check check (source_artifact_sha256 is null or source_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint medication_plan_supersession_check check ((supersedes_plan_id is null) = (supersession_reason is null));

create unique index if not exists medication_plan_scope_id_idx on public.medication_plans(care_space_id, child_id, id);

alter table public.medication_schedules
  add column if not exists care_space_id uuid,
  add column if not exists child_id uuid,
  add column if not exists plan_version integer,
  add column if not exists idempotency_key text,
  add column if not exists input_fingerprint text;

update public.medication_schedules s
set care_space_id = p.care_space_id,
    child_id = p.child_id,
    plan_version = p.version
from public.medication_plans p
where p.id = s.medication_plan_id
  and (s.care_space_id is null or s.child_id is null or s.plan_version is null);

alter table public.medication_schedules
  alter column care_space_id set not null,
  alter column child_id set not null,
  alter column plan_version set not null;

alter table public.medication_schedules
  add constraint medication_schedule_plan_scope_fk
    foreign key (care_space_id, child_id, medication_plan_id)
    references public.medication_plans(care_space_id, child_id, id) on delete cascade,
  add constraint medication_schedule_version_check check (plan_version > 0),
  add constraint medication_schedule_fingerprint_check check (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$');

create unique index if not exists medication_schedule_scope_id_idx on public.medication_schedules(care_space_id, child_id, id);
create index if not exists medication_schedules_scope_plan_idx on public.medication_schedules(care_space_id, child_id, medication_plan_id, created_at desc);

alter table public.medication_intakes
  add column if not exists medication_schedule_occurrence_id uuid,
  add column if not exists input_fingerprint text,
  add column if not exists supersedes_intake_id uuid references public.medication_intakes(id) on delete restrict;

alter table public.medication_intakes drop constraint if exists medication_intakes_status_check;
alter table public.medication_intakes drop constraint if exists medication_intake_taken;
alter table public.medication_intakes
  add constraint medication_intakes_status_check check (status in ('scheduled', 'taken', 'missed', 'skipped', 'cancelled', 'unknown')),
  add constraint medication_intake_taken check ((status = 'taken') = (taken_at is not null)),
  add constraint medication_intake_fingerprint_check check (input_fingerprint is null or input_fingerprint ~ '^[a-f0-9]{64}$');

alter table public.medication_intakes drop constraint if exists medication_intake_idempotent;
alter table public.medication_intakes
  add constraint medication_intake_scoped_idempotent unique (care_space_id, child_id, recorded_by, idempotency_key),
  add constraint medication_intake_plan_scope_fk
    foreign key (care_space_id, child_id, medication_plan_id)
    references public.medication_plans(care_space_id, child_id, id) on delete cascade;

create index if not exists medication_intakes_scope_schedule_idx
  on public.medication_intakes(care_space_id, child_id, medication_plan_id, scheduled_for desc);

create table if not exists public.medication_schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  medication_plan_id uuid not null,
  medication_schedule_id uuid,
  plan_version integer not null,
  occurrence_key text not null,
  scheduled_for timestamptz not null,
  local_date date not null,
  time_zone text not null,
  source text not null check (source in ('interval', 'times_of_day')),
  created_at timestamptz not null default now(),
  constraint medication_occurrence_plan_scope_fk
    foreign key (care_space_id, child_id, medication_plan_id)
    references public.medication_plans(care_space_id, child_id, id) on delete cascade,
  constraint medication_occurrence_schedule_scope_fk
    foreign key (care_space_id, child_id, medication_schedule_id)
    references public.medication_schedules(care_space_id, child_id, id) on delete set null,
  constraint medication_occurrence_version_check check (plan_version > 0),
  constraint medication_occurrence_key_check check (length(occurrence_key) between 1 and 200),
  constraint medication_occurrence_scope_id_unique unique (care_space_id, child_id, id),
  constraint medication_occurrence_key_unique unique (care_space_id, child_id, occurrence_key)
);

alter table public.medication_intakes
  add constraint medication_intake_occurrence_scope_fk
    foreign key (care_space_id, child_id, medication_schedule_occurrence_id)
    references public.medication_schedule_occurrences(care_space_id, child_id, id) on delete set null;

create index if not exists medication_occurrences_scope_time_idx
  on public.medication_schedule_occurrences(care_space_id, child_id, medication_plan_id, scheduled_for);

create or replace function app_private.prevent_medication_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'medication_history_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists medication_intakes_immutable on public.medication_intakes;
create trigger medication_intakes_immutable
before update or delete on public.medication_intakes
for each row execute function app_private.prevent_medication_append_only_mutation();

drop trigger if exists medication_schedule_occurrences_immutable on public.medication_schedule_occurrences;
create trigger medication_schedule_occurrences_immutable
before update or delete on public.medication_schedule_occurrences
for each row execute function app_private.prevent_medication_append_only_mutation();

alter table public.medication_schedule_occurrences enable row level security;
alter table public.medication_schedule_occurrences force row level security;
drop policy if exists medication_schedule_occurrences_child_select on public.medication_schedule_occurrences;
create policy medication_schedule_occurrences_child_select
on public.medication_schedule_occurrences for select to authenticated
using (app_private.has_child_permission(care_space_id, child_id, 'read'));

grant select on public.medication_schedule_occurrences to authenticated;
