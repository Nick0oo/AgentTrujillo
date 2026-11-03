-- Guardian-confirmed declarations remain unverified drafts. They do not become
-- product/antigen facts or clinical assessments without the governed workflow.
alter table public.vaccine_administrations
 add column declared_vaccine_code text check(length(declared_vaccine_code) between 1 and 128),
 add column declared_vaccine_name text check(length(declared_vaccine_name) between 1 and 160),
 add column guardian_notes text check(length(guardian_notes)<=2000);

create function public.record_guardian_vaccine_declaration(
 p_child_id uuid,p_vaccine_code text,p_vaccine_name text,p_administered_on date,
 p_clinic text,p_lot_number text,p_notes text,p_idempotency_key text,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); child public.children%rowtype; existing public.vaccine_administrations%rowtype;
 fingerprint text; payload jsonb; outcome_text text:='created';
begin
 if actor_id is null then raise exception 'vaccine_declaration_not_authorized' using errcode='42501';end if;
 select * into child from public.children where id=p_child_id and status='active';
 if actor_id is null or child.id is null or not app_private.has_child_permission(child.care_space_id,child.id,'record') then
  raise exception 'vaccine_declaration_not_authorized' using errcode='42501';end if;
 if p_confirmed is distinct from true or p_vaccine_code is null or p_vaccine_code !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  or p_vaccine_name is null or length(btrim(p_vaccine_name)) not between 1 and 160
  or p_administered_on is null or p_administered_on<child.date_of_birth or p_administered_on>(now() at time zone child.time_zone)::date
  or length(coalesce(p_clinic,''))>200 or length(coalesce(p_lot_number,''))>120 or length(coalesce(p_notes,''))>2000
  or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,120}$' then
  raise exception 'vaccine_declaration_invalid' using errcode='22023';end if;
 payload:=jsonb_build_object('actor',actor_id,'careSpaceId',child.care_space_id,'childId',child.id,
  'code',p_vaccine_code,'label',btrim(p_vaccine_name),'date',p_administered_on,'clinic',nullif(btrim(p_clinic),''),'lot',nullif(btrim(p_lot_number),''),'notes',nullif(btrim(p_notes),''));
 fingerprint:=encode(extensions.digest(payload::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||child.id::text||':'||p_idempotency_key,3220000));
 select * into existing from public.vaccine_administrations where recorded_by=actor_id and child_id=child.id and care_space_id=child.care_space_id and idempotency_key=p_idempotency_key;
 if found then
  if existing.input_fingerprint<>fingerprint then raise exception 'vaccine_declaration_idempotency_conflict' using errcode='23505';end if;
  outcome_text:='idempotent_replay';
 else
  insert into public.vaccine_administrations(care_space_id,child_id,dose_label,administered_on,lot_number,provider_name,country_code,provenance_type,confirmation_status,
   idempotency_key,recorded_by,source_digest,confirmation_sha256,input_fingerprint,scope_fingerprint,declared_vaccine_code,declared_vaccine_name,guardian_notes)
  values(child.care_space_id,child.id,p_vaccine_code,p_administered_on,nullif(btrim(p_lot_number),''),nullif(btrim(p_clinic),''),child.country_of_care,'guardian','draft',
   p_idempotency_key,actor_id,fingerprint,encode(extensions.digest('guardian-vaccine-confirmed.v1:'||fingerprint,'sha256'),'hex'),fingerprint,
   encode(extensions.digest(child.care_space_id::text||':'||child.id::text,'sha256'),'hex'),p_vaccine_code,btrim(p_vaccine_name),nullif(btrim(p_notes),'')) returning * into existing;
 end if;
 return jsonb_build_object('version','guardian-vaccine.v1','status','declared','verification','pending','outcome',outcome_text,
  'administration',jsonb_build_object('id',existing.id,'child_id',existing.child_id,'care_space_id',existing.care_space_id,
    'dose_label',existing.dose_label,'administered_on',existing.administered_on,'declared_vaccine_code',existing.declared_vaccine_code,
    'declared_vaccine_name',existing.declared_vaccine_name,'provider_name',existing.provider_name,'lot_number',existing.lot_number,
    'guardian_notes',existing.guardian_notes,'confirmation_status',existing.confirmation_status,'provenance_type',existing.provenance_type));
end$$;
revoke all on function public.record_guardian_vaccine_declaration(uuid,text,text,date,text,text,text,text,boolean) from public,anon;
grant execute on function public.record_guardian_vaccine_declaration(uuid,text,text,date,text,text,text,text,boolean) to authenticated;
