-- Session ownership and composite scope hardening. Forward-only; the three foundation migrations stay immutable.

do $$
begin
  if exists (
    select 1
    from public.agent_sessions s
    left join public.guardian_profiles g on g.user_id = s.owner_user_id
    where g.user_id is null
  ) then
    raise exception 'session owner preflight failed: orphan owner';
  end if;

  if exists (
    select 1
    from public.messages m
    left join public.agent_sessions s on s.id = m.agent_session_id
    where s.id is null or s.care_space_id <> m.care_space_id or s.child_id <> m.child_id
  ) then
    raise exception 'session scope preflight failed: messages mismatch';
  end if;

  if exists (
    select 1
    from public.tool_executions t
    left join public.agent_sessions s on s.id = t.agent_session_id
    where s.id is null or s.care_space_id <> t.care_space_id or s.child_id <> t.child_id
  ) then
    raise exception 'session scope preflight failed: tool executions mismatch';
  end if;

  if exists (
    select 1
    from public.conversation_summaries c
    left join public.agent_sessions s on s.id = c.agent_session_id
    where s.id is null or s.care_space_id <> c.care_space_id or s.child_id <> c.child_id
  ) then
    raise exception 'session scope preflight failed: summaries mismatch';
  end if;

  if exists (
    select 1
    from public.safety_evaluations e
    join public.agent_sessions s on s.id = e.agent_session_id
    where e.agent_session_id is not null
      and (s.care_space_id <> e.care_space_id or s.child_id <> e.child_id)
  ) then
    raise exception 'session scope preflight failed: safety evaluation mismatch';
  end if;

  if exists (
    select 1
    from public.clinical_memory_items m
    join public.agent_sessions s on s.id = m.source_session_id
    where m.source_session_id is not null
      and (s.care_space_id <> m.care_space_id or s.child_id <> m.child_id)
  ) then
    raise exception 'session provenance preflight failed: memory session mismatch';
  end if;
end;
$$;

alter table public.agent_sessions
  add column eve_session_bound_at timestamptz;

alter table public.agent_sessions
  add constraint agent_sessions_owner_fk
  foreign key (owner_user_id) references public.guardian_profiles(user_id) on delete restrict;

alter table public.agent_sessions
  add constraint agent_sessions_scope_identity
  unique (id, care_space_id, child_id);

alter table public.agent_sessions
  add constraint agent_sessions_binding_complete
  check (eve_session_id is not null or eve_session_bound_at is null);

create or replace function app_private.prevent_agent_session_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.care_space_id is distinct from old.care_space_id
    or new.child_id is distinct from old.child_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.channel is distinct from old.channel
    or new.initial_model is distinct from old.initial_model
    or new.initial_configuration is distinct from old.initial_configuration then
    raise exception using errcode = '42501', message = 'agent session scope is immutable';
  end if;

  if new.eve_session_id is distinct from old.eve_session_id then
    if not (
      old.eve_session_id is null
      and old.eve_session_bound_at is null
      and new.eve_session_id is not null
      and new.eve_session_bound_at is not null
    ) then
      raise exception using errcode = '42501', message = 'agent session Eve binding is immutable';
    end if;
  elsif new.eve_session_bound_at is distinct from old.eve_session_bound_at then
    if not (
      old.eve_session_bound_at is null
      and new.eve_session_bound_at is not null
      and new.eve_session_id is not null
      and new.eve_session_id = old.eve_session_id
    ) then
      raise exception using errcode = '42501', message = 'agent session Eve binding is immutable';
    end if;
  end if;
  return new;
end;
$$;

create index agent_sessions_owner_scope_idx
  on public.agent_sessions(owner_user_id, care_space_id, child_id, updated_at desc);

create unique index messages_scope_identity
  on public.messages(id, care_space_id, child_id);

alter table public.messages
  add constraint messages_session_scope_fk
  foreign key (agent_session_id, care_space_id, child_id)
  references public.agent_sessions(id, care_space_id, child_id) on delete cascade;

alter table public.tool_executions
  add constraint tool_executions_session_scope_fk
  foreign key (agent_session_id, care_space_id, child_id)
  references public.agent_sessions(id, care_space_id, child_id) on delete cascade;

alter table public.conversation_summaries
  add constraint conversation_summaries_session_scope_fk
  foreign key (agent_session_id, care_space_id, child_id)
  references public.agent_sessions(id, care_space_id, child_id) on delete cascade;

alter table public.safety_evaluations
  add constraint safety_evaluations_session_scope_fk
  foreign key (agent_session_id, care_space_id, child_id)
  references public.agent_sessions(id, care_space_id, child_id);

alter table public.clinical_memory_items
  add constraint clinical_memory_items_source_session_scope_fk
  foreign key (source_session_id, care_space_id, child_id)
  references public.agent_sessions(id, care_space_id, child_id);

alter table public.clinical_memory_items
  add constraint clinical_memory_items_source_message_scope_fk
  foreign key (source_message_id, care_space_id, child_id)
  references public.messages(id, care_space_id, child_id);

drop policy if exists agent_sessions_child_select on public.agent_sessions;
create policy agent_sessions_owner_select on public.agent_sessions
  for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and app_private.has_child_permission(care_space_id, child_id, 'read')
  );

drop policy if exists messages_child_select on public.messages;
create policy messages_owner_select on public.messages
  for select to authenticated
  using (
    app_private.has_child_permission(care_space_id, child_id, 'read')
    and exists (
      select 1
      from public.agent_sessions s
      where s.id = agent_session_id
        and s.care_space_id = messages.care_space_id
        and s.child_id = messages.child_id
        and s.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists tool_executions_child_select on public.tool_executions;
create policy tool_executions_owner_select on public.tool_executions
  for select to authenticated
  using (
    app_private.has_child_permission(care_space_id, child_id, 'read')
    and exists (
      select 1
      from public.agent_sessions s
      where s.id = agent_session_id
        and s.care_space_id = tool_executions.care_space_id
        and s.child_id = tool_executions.child_id
        and s.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists conversation_summaries_child_select on public.conversation_summaries;
create policy conversation_summaries_owner_select on public.conversation_summaries
  for select to authenticated
  using (
    app_private.has_child_permission(care_space_id, child_id, 'read')
    and exists (
      select 1
      from public.agent_sessions s
      where s.id = agent_session_id
        and s.care_space_id = conversation_summaries.care_space_id
        and s.child_id = conversation_summaries.child_id
        and s.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists safety_evaluations_child_select on public.safety_evaluations;
create policy safety_evaluations_owner_select on public.safety_evaluations
  for select to authenticated
  using (
    app_private.has_child_permission(care_space_id, child_id, 'read')
    and (
      agent_session_id is null
      or exists (
        select 1
        from public.agent_sessions s
        where s.id = agent_session_id
          and s.care_space_id = safety_evaluations.care_space_id
          and s.child_id = safety_evaluations.child_id
          and s.owner_user_id = (select auth.uid())
      )
    )
  );
