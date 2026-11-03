-- Atomic, confirmed profile changes. No generic client UPDATE policy.
create table app_private.child_profile_commands (
 care_space_id uuid not null, child_id uuid not null, actor uuid not null,
 idempotency_key text not null, fingerprint text not null, created_at timestamptz not null default now(),
 primary key(actor,child_id,idempotency_key),
 foreign key(care_space_id,child_id) references public.children(care_space_id,id) on delete restrict
);
alter table app_private.child_profile_commands enable row level security;
revoke all on app_private.child_profile_commands from public,anon,authenticated;

create function public.update_guardian_child_profile(p_child_id uuid,p_patch jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); space_id uuid; input_hash text; previous_hash text;
 field text; title_text text; value_text text; predecessor uuid; observed_date date;
begin
 if actor_id is null then raise exception 'profile_not_authorized' using errcode='42501';end if;
 select care_space_id into space_id from public.children where id=p_child_id and status='active' for update;
 if actor_id is null or space_id is null or not app_private.has_child_permission(space_id,p_child_id,'record') then
  raise exception 'profile_not_authorized' using errcode='42501'; end if;
 if app_private.account_deletion_pending() then raise exception 'profile_not_authorized' using errcode='42501';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_idempotency_key is null
   or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,90}$'
   or exists(select from jsonb_object_keys(p_patch) k where k not in ('name','allergies','history','bloodType','birthWeightKg','birthHeightCm','birthHeadCm')) then
  raise exception 'profile_invalid' using errcode='22023';end if;
 foreach field in array array['name','allergies','history','bloodType'] loop
  if p_patch?field and (jsonb_typeof(p_patch->field)<>'string' or length(btrim(p_patch->>field))=0 or length(p_patch->>field)>1900) then
   raise exception 'profile_invalid' using errcode='22023';end if;
 end loop;
 foreach field in array array['birthWeightKg','birthHeightCm','birthHeadCm'] loop
  if p_patch?field and jsonb_typeof(p_patch->field)<>'number' then raise exception 'profile_invalid' using errcode='22023';end if;
 end loop;
 if p_patch?'name' and (length(btrim(p_patch->>'name'))>120 or not (app_private.can_manage_space(space_id) or app_private.has_child_permission(space_id,p_child_id,'manage_guardians'))) then
  raise exception 'profile_name_not_authorized' using errcode='42501';end if;
 if p_patch?'bloodType' and p_patch->>'bloodType' not in ('A+','A-','B+','B-','AB+','AB-','O+','O-','Desconocido','No sé') then
  raise exception 'profile_invalid' using errcode='22023';end if;
 input_hash:=encode(extensions.digest(p_patch::text,'sha256'),'hex');
 select fingerprint into previous_hash from app_private.child_profile_commands where actor=actor_id and child_id=p_child_id and idempotency_key=p_idempotency_key;
 if found then
  if previous_hash<>input_hash then raise exception 'profile_idempotency_conflict' using errcode='23505';end if;
  return jsonb_build_object('version','child-profile.v1','status','saved','childId',p_child_id);
 end if;
 if p_patch?'name' then update public.children set given_names=btrim(p_patch->>'name'),updated_at=now() where id=p_child_id and care_space_id=space_id;end if;
 if p_patch?'birthWeightKg' or p_patch?'birthHeightCm' or p_patch?'birthHeadCm' then
  perform public.update_registered_birth_measurements(p_child_id,(p_patch->>'birthWeightKg')::numeric*1000,(p_patch->>'birthHeightCm')::numeric,(p_patch->>'birthHeadCm')::numeric);
 end if;
 select (now() at time zone time_zone)::date into observed_date from public.children where id=p_child_id;
 foreach field in array array['allergies','history','bloodType'] loop
  if not p_patch?field then continue;end if;
  title_text:=case field when 'allergies' then 'Alergias' when 'history' then 'Antecedentes' else 'Tipo de sangre' end;
  value_text:=btrim(p_patch->>field);
  select o.id into predecessor from public.development_observations o where o.child_id=p_child_id and o.care_space_id=space_id and o.title=title_text
   and not exists(select from public.development_observations s where s.supersedes_observation_id=o.id) order by o.created_at desc,o.id desc limit 1;
  perform public.record_development_observation(space_id,p_child_id,null,'general',title_text,value_text,observed_date,'observed','guardian',
   p_idempotency_key||':'||field,input_hash,encode(extensions.digest('profile-confirmed.v1:'||input_hash,'sha256'),'hex'),predecessor,'{}');
 end loop;
 insert into app_private.child_profile_commands(care_space_id,child_id,actor,idempotency_key,fingerprint) values(space_id,p_child_id,actor_id,p_idempotency_key,input_hash);
 return jsonb_build_object('version','child-profile.v1','status','saved','childId',p_child_id);
end$$;
revoke all on function public.update_guardian_child_profile(uuid,jsonb,text) from public,anon;
grant execute on function public.update_guardian_child_profile(uuid,jsonb,text) to authenticated;
