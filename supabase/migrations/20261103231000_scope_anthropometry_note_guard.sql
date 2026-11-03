-- The immutable-history trigger is shared with tables without source_note.
-- JSON access keeps those tables fail-closed with the intended SQLSTATE.
create or replace function app_private.prevent_anthropometry_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and TG_TABLE_SCHEMA='public' and TG_TABLE_NAME='anthropometric_measurements'
  and (to_jsonb(OLD)->>'source_note') is null
  and (to_jsonb(NEW)->>'source_note') is not null
  and (to_jsonb(OLD)-'source_note')=(to_jsonb(NEW)-'source_note') then
  return NEW;
 end if;
 raise exception 'anthropometry_history_immutable' using errcode='42501';
end;
$$;
