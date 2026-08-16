-- Durable, scope-bound command ledger. Forward-only; no raw command payloads are stored.

do $$
begin
  if exists (
    select 1
    from public.tool_executions
    group by care_space_id, idempotency_key
    having count(*) > 1
  ) then
    raise exception 'command idempotency preflight failed: duplicate tool keys';
  end if;
end;
$$;

create table public.agent_commands (
  id uuid primary key default gen_random_uuid(),
  care_space_id uuid not null,
  child_id uuid not null,
  owner_user_id uuid not null,
  agent_session_id uuid not null,
  operation text not null check (operation ~ '^[a-z][a-z0-9_.-]{0,119}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  request_sha256 text not null constraint agent_commands_request_sha256 check (request_sha256 ~ '^[0-9a-f]{64}$'),
  confirmation_sha256 text constraint agent_commands_confirmation_sha256 check (confirmation_sha256 is null or confirmation_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'proposed' check (status in ('proposed', 'awaiting_confirmation', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  redacted_result jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_result) = 'object'),
  redacted_error jsonb not null default '{}'::jsonb check (jsonb_typeof(redacted_error) = 'object'),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  started_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_commands_scope_key_unique unique (care_space_id, child_id, owner_user_id, operation, idempotency_key),
  constraint agent_commands_scope_identity unique (id, care_space_id, child_id),
  constraint agent_commands_child_fk foreign key (care_space_id, child_id)
    references public.children(care_space_id, id) on delete restrict,
  constraint agent_commands_owner_fk foreign key (owner_user_id)
    references public.guardian_profiles(user_id) on delete restrict,
  constraint agent_commands_session_scope_fk foreign key (agent_session_id, care_space_id, child_id)
    references public.agent_sessions(id, care_space_id, child_id) on delete restrict,
  constraint agent_commands_terminal_shape check (
    (status in ('succeeded', 'failed', 'cancelled', 'expired')) = (terminal_at is not null)
  ),
  constraint agent_commands_started_shape check (
    status not in ('running', 'succeeded', 'failed') or started_at is not null
  ),
  constraint agent_commands_expiry check (expires_at > created_at)
);

create or replace function app_private.prevent_agent_command_scope_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  session_owner uuid;
begin
  select s.owner_user_id
    into session_owner
  from public.agent_sessions s
  where s.id = new.agent_session_id
    and s.care_space_id = new.care_space_id
    and s.child_id = new.child_id;

  if session_owner is distinct from new.owner_user_id then
    raise exception using errcode = '23503', message = 'agent command session scope mismatch';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'proposed' and new.status not in ('awaiting_confirmation', 'claimed', 'running', 'cancelled', 'expired')
      or old.status = 'awaiting_confirmation' and new.status not in ('claimed', 'cancelled', 'expired')
      or old.status = 'claimed' and new.status not in ('running', 'cancelled', 'expired')
      or old.status = 'running' and new.status not in ('succeeded', 'failed', 'cancelled')
      or old.status in ('succeeded', 'failed', 'cancelled', 'expired') then
      raise exception using errcode = '42501', message = 'agent command status transition is invalid';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.care_space_id is distinct from old.care_space_id
    or new.child_id is distinct from old.child_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.agent_session_id is distinct from old.agent_session_id
    or new.operation is distinct from old.operation
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_sha256 is distinct from old.request_sha256
    or new.confirmation_sha256 is distinct from old.confirmation_sha256
  ) then
    raise exception using errcode = '42501', message = 'agent command identity is immutable';
  end if;

  if new.status in ('succeeded', 'failed', 'cancelled', 'expired') and new.terminal_at is null then
    raise exception using errcode = '23514', message = 'terminal command requires terminal_at';
  end if;
  return new;
end;
$$;

create trigger agent_commands_scope_guard
before insert or update on public.agent_commands
for each row execute function app_private.prevent_agent_command_scope_mismatch();

create trigger agent_commands_set_updated_at
before update on public.agent_commands
for each row execute function app_private.set_updated_at();

create index agent_commands_owner_lookup_idx
  on public.agent_commands(owner_user_id, care_space_id, child_id, status, created_at desc);
create index agent_commands_expiry_idx
  on public.agent_commands(status, expires_at)
  where status in ('proposed', 'awaiting_confirmation', 'claimed', 'running');
create index agent_commands_session_idx
  on public.agent_commands(agent_session_id, created_at desc);

alter table public.agent_commands enable row level security;
alter table public.agent_commands force row level security;
revoke all on public.agent_commands from public, anon, authenticated;

alter table public.tool_executions
  add column command_id uuid;

alter table public.tool_executions
  add constraint tool_executions_command_scope_fk
  foreign key (command_id, care_space_id, child_id)
  references public.agent_commands(id, care_space_id, child_id) on delete restrict;

create index tool_executions_command_idx
  on public.tool_executions(command_id)
  where command_id is not null;
