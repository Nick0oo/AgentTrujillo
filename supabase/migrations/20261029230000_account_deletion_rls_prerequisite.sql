-- Restore the foundation's required RLS when a linked environment has drifted.
-- Existing scoped policies and grants remain authoritative. No patient rows
-- are changed and no blanket permissive policy is introduced.
create or replace function app_private.guard_account_deletion_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and app_private.account_deletion_pending() then
    raise exception 'account_access_revoked' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_account_deletion_write() from public,anon,authenticated;

do $$ declare t record; begin
  for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop
    execute format('alter table public.%I enable row level security',t.relname);
    if not exists(select from pg_policy where polrelid=t.oid and polname='account_deletion_denial') then
      execute format('create policy account_deletion_denial on public.%I as restrictive for all to authenticated using (not app_private.account_deletion_pending()) with check (not app_private.account_deletion_pending())',t.relname);
    end if;
    execute format('drop trigger if exists account_deletion_write_guard on public.%I',t.relname);
    execute format('create trigger account_deletion_write_guard before insert or update or delete on public.%I for each row execute function app_private.guard_account_deletion_write()',t.relname);
  end loop;
end $$;

-- The authenticated growth resolver already reads this non-patient catalog.
-- Preserve its active-release input when restoring RLS; clinical approval and
-- package checksum validation still occur in the existing governed resolver.
create policy clinical_package_releases_active_read on public.clinical_package_releases
  for select to authenticated using(status='active');

-- Reopen only the self-service capability suspended after failed acceptance.
-- All RLS/trigger prerequisites are installed before this transaction commits.
grant execute on function public.request_account_deletion(text) to authenticated;
