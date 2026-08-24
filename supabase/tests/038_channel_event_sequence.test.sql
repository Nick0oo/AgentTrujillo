begin;
set local role postgres;
set local search_path = extensions, public, pg_catalog;
select plan(79);

select ok(to_regclass('public.creciendo_channel_events') is not null, 'immutable event ledger exists');
select ok(to_regclass('public.creciendo_session_commands') is not null, 'message command ledger exists');
select ok(to_regclass('public.creciendo_cancel_commands') is not null, 'cancel command ledger exists');
select ok(to_regprocedure('public.accept_creciendo_session_message(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,text,jsonb)') is not null, 'message RPC signature exists');
select ok(to_regprocedure('public.resolve_owned_creciendo_cursor(uuid,uuid,uuid,text,text)') is not null, 'cursor RPC signature exists');
select ok(to_regprocedure('public.read_owned_creciendo_events(uuid,uuid,uuid,text,bigint,integer)') is not null, 'event read RPC signature exists');
select ok(to_regprocedure('public.append_creciendo_channel_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,boolean,jsonb,timestamptz)') is not null, 'trusted append RPC signature exists');
select ok(to_regprocedure('public.accept_creciendo_session_cancel(uuid,uuid,uuid,text,uuid,text,text,text)') is not null, 'cancel accept RPC signature exists');
select ok(to_regprocedure('public.finalize_creciendo_session_cancel(uuid,uuid,uuid,text,uuid,text,text)') is not null, 'cancel finalize RPC signature exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.creciendo_channel_events'::regclass), 'events have forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.creciendo_session_commands'::regclass), 'message commands have forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.creciendo_cancel_commands'::regclass), 'cancel commands have forced RLS');
select ok(exists(select 1 from pg_trigger where tgname = 'creciendo_channel_events_immutable' and not tgisinternal), 'event immutability trigger exists');
select ok(exists(select 1 from pg_trigger where tgname = 'creciendo_session_commands_immutable' and not tgisinternal), 'command immutability trigger exists');
select ok(exists(select 1 from pg_trigger where tgname = 'creciendo_cancel_commands_protected' and not tgisinternal), 'cancel transition trigger exists');
select ok(to_regclass('public.agent_sessions_creciendo_create_idempotency_unique') is not null, 'create key has scoped uniqueness');
select ok(has_table_privilege('authenticated', 'public.creciendo_channel_events', 'SELECT'), 'authenticated can read RLS-filtered events');
select ok(not has_table_privilege('authenticated', 'public.creciendo_channel_events', 'INSERT,UPDATE,DELETE'), 'authenticated cannot write events directly');
select ok(not has_table_privilege('authenticated', 'public.creciendo_session_commands', 'SELECT,INSERT,UPDATE,DELETE'), 'message commands have no mobile table grant');
select ok(not has_table_privilege('authenticated', 'public.creciendo_cancel_commands', 'SELECT,INSERT,UPDATE,DELETE'), 'cancel commands have no mobile table grant');
select ok(has_function_privilege('authenticated', 'public.accept_creciendo_session_message(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,text,jsonb)', 'EXECUTE'), 'authenticated has narrow message RPC grant');
select ok(not has_function_privilege('anon', 'public.accept_creciendo_session_message(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,text,jsonb)', 'EXECUTE'), 'anonymous message RPC use is denied');
select ok(has_function_privilege('service_role', 'public.append_creciendo_channel_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,boolean,jsonb,timestamptz)', 'EXECUTE'), 'trusted job role has append RPC grant');
select ok(not has_function_privilege('authenticated', 'public.append_creciendo_channel_event(uuid,uuid,uuid,uuid,text,uuid,text,text,text,boolean,jsonb,timestamptz)', 'EXECUTE'), 'mobile role cannot append projections');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.create_owned_agent_session(uuid,uuid,text,timestamptz,text,text,jsonb)'::regprocedure)) > 0, 'create RPC serializes replay keys');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.accept_creciendo_session_message(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,text,jsonb)'::regprocedure)) > 0, 'message RPC serializes replay keys');
select ok(position('for update' in lower(pg_get_functiondef('app_private.append_creciendo_channel_event_locked(uuid,uuid,uuid,uuid,uuid,text,text,text,boolean,jsonb,timestamptz)'::regprocedure))) > 0, 'event append locks the session counter');
select ok(exists(select 1 from pg_constraint where conname = 'creciendo_channel_events_payload_size'), 'payload bytes are bounded');
select ok(exists(select 1 from pg_constraint where conname = 'creciendo_channel_events_terminal_kind'), 'terminal kinds are closed');
select ok(exists(select 1 from pg_constraint where conname = 'agent_sessions_channel_terminal_event_fk'), 'session terminal marker is scoped to its event');

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000110001','authenticated','authenticated','channel-a@example.invalid','fixture',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000110002','authenticated','authenticated','channel-b@example.invalid','fixture',now(),'{}','{}',now(),now());
insert into public.care_spaces (id,name,created_by)
values ('00000000-0000-0000-0000-000000110011','Channel Space','00000000-0000-0000-0000-000000110001');
insert into public.care_space_members (care_space_id,user_id,member_role,status)
values
  ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110001','owner','active'),
  ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110002','guardian','active');
insert into public.children (id,care_space_id,given_names,date_of_birth,sex_for_growth,created_by)
values
  ('00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110011','Synthetic Child','2020-01-01','female','00000000-0000-0000-0000-000000110001'),
  ('00000000-0000-0000-0000-000000110022','00000000-0000-0000-0000-000000110011','Synthetic Sibling','2021-01-01','male','00000000-0000-0000-0000-000000110001');
insert into public.child_access (care_space_id,child_id,user_id,permissions,status)
values
  ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001',array['read','record'],'active'),
  ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110022','00000000-0000-0000-0000-000000110001',array['read','record'],'active'),
  ('00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110002',array['read','record'],'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table session_one as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','es-CO','create_idempotency_sha256',repeat('a',64),'create_request_sha256',repeat('b',64))
);
create temp table session_one_replay as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '3 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','es-CO','create_idempotency_sha256',repeat('a',64),'create_request_sha256',repeat('b',64))
);
create temp table session_one_conflict as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','en-US','create_idempotency_sha256',repeat('a',64),'create_request_sha256',repeat('c',64))
);
create temp table session_emergency as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','es-CO','create_idempotency_sha256',repeat('d',64),'create_request_sha256',repeat('e',64))
);
create temp table session_cancel as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','es-CO','create_idempotency_sha256',repeat('f',64),'create_request_sha256',repeat('1',64))
);
create temp table session_sibling as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110022','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','es-CO','create_idempotency_sha256',repeat('2',64),'create_request_sha256',repeat('3',64))
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110002',true);
create temp table session_other_owner as select * from public.create_owned_agent_session(
  '00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',now()+interval '4 minutes','creciendo_mobile','gemini-3.6-flash',
  jsonb_build_object('version','creciendo.session-create.v1','channel_version','creciendo.channel.v1','locale','en-US','create_idempotency_sha256',repeat('4',64),'create_request_sha256',repeat('5',64))
);

set local role postgres;
select ok((select count(*)=1 and bool_and(eve_session_id is null) and bool_and(last_sequence=0) from session_one), 'create returns one empty product session');
select ok((select product_session_id from session_one)=(select product_session_id from session_one_replay), 'identical create replay returns the canonical row');
select is((select count(*) from session_one_conflict),0::bigint,'changed create request returns zero rows');
select is((select count(*) from public.agent_sessions where owner_user_id='00000000-0000-0000-0000-000000110001' and initial_configuration->>'create_idempotency_sha256'=repeat('a',64)),1::bigint,'create replay persists one effect');
select ok((select owner_user_id='00000000-0000-0000-0000-000000110002' from session_other_owner),'co-guardian creates a separate owned session');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table other_owner_visibility as select count(*) visible from public.agent_sessions where id=(select product_session_id from session_other_owner);
create temp table message_created as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110101',repeat('6',64),repeat('7',64),'00000000-0000-4000-8000-000000110111','continue','[{"type":"text","text":"Synthetic bounded message"}]',null,null
);
create temp table message_replay as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110101',repeat('6',64),repeat('7',64),'00000000-0000-4000-8000-000000110112','continue','[{"type":"text","text":"Synthetic bounded message"}]',null,null
);
create temp table message_conflict as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110101',repeat('6',64),repeat('8',64),'00000000-0000-4000-8000-000000110113','continue','[{"type":"text","text":"Changed"}]',null,null
);

set local role postgres;
select is((select visible from other_owner_visibility),0::bigint,'session ID never bypasses owner RLS');
select ok((select outcome='created' and dispatch_required and cursor='creciendo.initial-cursor.v1' and last_sequence=0 from message_created),'first command is accepted for one Eve dispatch');
select ok((select outcome='idempotent_replay' and not dispatch_required and message_id=(select message_id from message_created) and turn_id=(select turn_id from message_created) from message_replay),'message replay returns canonical IDs without redispatch');
select ok((select outcome='conflict' and not dispatch_required from message_conflict),'changed message replay conflicts');
select is((select count(*) from public.messages where agent_session_id=(select product_session_id from session_one)),1::bigint,'message replay persists one guardian message');
select ok((select count(*)=1 and min(parts_sha256)~'^[a-f0-9]{64}$' from public.creciendo_session_commands where agent_session_id=(select product_session_id from session_one)),'command ledger stores a bounded parts digest');
select is((select count(*) from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one)),0::bigint,'message acceptance invents no stream event');

create temp table append_one as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.one','text-delta',false,'{"text":"Synthetic public delta"}',now()
);
create temp table append_one_replay as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.one','text-delta',false,'{"text":"Synthetic public delta"}',now()
);
create temp table append_one_conflict as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.one','text-delta',false,'{"text":"Changed"}',now()
);
create temp table append_two as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'channel_projection','source.two','heartbeat',false,jsonb_build_object('observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),now()
);
create temp table append_unsafe as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.unsafe','text-delta',false,'{"reasoning":"hidden"}',now()
);
create temp table append_emergency_spoof as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.spoof','emergency-recommendation',true,'{}',now()
);
select ok((select outcome='created' and sequence=1 and last_sequence=1 from append_one),'first event receives sequence one');
select ok((select outcome='idempotent_replay' and event_id=(select event_id from append_one) and sequence=1 from append_one_replay),'duplicate source returns one immutable event');
select ok((select outcome='conflict' from append_one_conflict),'changed payload under one source conflicts');
select ok((select outcome='created' and sequence=2 and last_sequence=2 from append_two),'independent event advances the counter');
select ok((select count(*)=2 and min(sequence)=1 and max(sequence)=2 and bool_and(payload_sha256=app_private.creciendo_json_sha256(payload)) from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one)),'events are monotonic and digest-bound');
select ok((select outcome='conflict' from append_unsafe),'unsafe internal keys are rejected');
select is((select count(*) from append_emergency_spoof),0::bigint,'Eve projector cannot spoof emergency');
grant select on append_one to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table owner_events as select count(*) visible from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one);
create temp table initial_cursor as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','creciendo.initial-cursor.v1');
create temp table cross_cursor as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_sibling),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110022','m:1:a:1',(select cursor from append_one));
create temp table guessed_cursor as select * from public.resolve_owned_creciendo_cursor('00000000-0000-4000-8000-000000119999','00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','creciendo.initial-cursor.v1');
create temp table sibling_mismatch as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110022','m:1:a:1','creciendo.initial-cursor.v1');
create temp table read_after_one as select * from public.read_owned_creciendo_events((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',1,128);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110002',true);
create temp table other_owner_events as select count(*) visible from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one);
set local role postgres;
select is((select visible from owner_events),2::bigint,'owner sees its two events');
select is((select visible from other_owner_events),0::bigint,'co-guardian sees no owner event');
select ok((select outcome='valid' and after_sequence=0 and first_available_sequence=1 and last_sequence=2 from initial_cursor),'initial cursor resolves to backlog start');
select ok((select outcome='invalid' and after_sequence is null from cross_cursor),'cursor cannot cross sessions or siblings');
select is((select count(*) from guessed_cursor),0::bigint,'guessed session returns no cursor row');
select is((select count(*) from sibling_mismatch),0::bigint,'wrong child locator returns no cursor row');
select ok((select count(*)=1 and min(sequence)=2 from read_after_one),'resume reads strictly after cursor sequence');

create temp table append_terminal as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.complete','message-complete',true,jsonb_build_object('messageId','00000000-0000-4000-8000-000000110101','outcome','completed','effectState','none'),now()
);
create temp table append_terminal_replay as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'eve_event','source.complete','message-complete',true,jsonb_build_object('messageId','00000000-0000-4000-8000-000000110101','outcome','completed','effectState','none'),now()
);
create temp table append_late as select * from public.append_creciendo_channel_event(
  (select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','00000000-0000-0000-0000-000000110001','m:1:a:1',
  (select turn_id from message_created),'channel_projection','source.late','heartbeat',false,jsonb_build_object('observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),now()
);
select ok((select outcome='created' and sequence=3 and last_sequence=3 from append_terminal),'completion is the next terminal event');
select ok((select outcome='idempotent_replay' and event_id=(select event_id from append_terminal) from append_terminal_replay),'terminal replay returns the original event');
select ok((select outcome='terminal_conflict' from append_late),'nothing new appends after terminal');
select is((select count(*) from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one) and terminal),1::bigint,'session has exactly one terminal event');
grant select on append_terminal to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table emergency_created as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_emergency),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110301',repeat('9',64),repeat('0',64),'00000000-0000-4000-8000-000000110311','emergency',null,repeat('1',64),
  '{"type":"emergency-recommendation","terminal":true,"data":{"widget":{"kind":"emergency_recommendation","version":"emergency.recommendation.v1","data":{"contentType":"text/emergency.recommendation.v1","terminal":true,"locale":"es-CO","copy":{"id":"emergency-es-co","version":"emergency-copy-v1"},"text":"Acudan directamente al servicio de urgencias.","screenReaderText":"Acudan directamente al servicio de urgencias.","fallbackText":"Acudan directamente al servicio de urgencias."}}}}'
);
create temp table emergency_replay as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_emergency),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110301',repeat('9',64),repeat('0',64),'00000000-0000-4000-8000-000000110312','emergency',null,repeat('1',64),
  '{"type":"emergency-recommendation","terminal":true,"data":{"widget":{"kind":"emergency_recommendation","version":"emergency.recommendation.v1","data":{"contentType":"text/emergency.recommendation.v1","terminal":true,"locale":"es-CO","copy":{"id":"emergency-es-co","version":"emergency-copy-v1"},"text":"Acudan directamente al servicio de urgencias.","screenReaderText":"Acudan directamente al servicio de urgencias.","fallbackText":"Acudan directamente al servicio de urgencias."}}}}'
);
set local role postgres;
select ok((select outcome='created' and not dispatch_required and last_sequence=1 from emergency_created),'urgent command creates one terminal response without dispatch');
select ok((select count(*)=1 and min(event_type)='emergency-recommendation' and bool_and(terminal) from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_emergency)) and (select count(*)=0 from public.messages where agent_session_id=(select product_session_id from session_emergency)),'emergency stores one canonical event and no raw message');
select ok((select outcome='idempotent_replay' and not dispatch_required and cursor=(select cursor from emergency_created) from emergency_replay) and (select count(*)=1 from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_emergency)),'urgent replay duplicates no event or model effect');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table cancel_seed as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110401',repeat('2',64),repeat('3',64),'00000000-0000-4000-8000-000000110411','continue','[{"type":"text","text":"Cancelable"}]',null,null
);
create temp table cancel_accepted as select * from public.accept_creciendo_session_cancel((select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','00000000-0000-4000-8000-000000110421',repeat('4',64),repeat('5',64),'user_requested');
create temp table cancel_pending_message as select * from public.accept_creciendo_session_message(
  (select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',
  '00000000-0000-4000-8000-000000110402',repeat('6',64),repeat('7',64),'00000000-0000-4000-8000-000000110412','continue','[{"type":"text","text":"Blocked"}]',null,null
);
create temp table cancel_accept_replay as select * from public.accept_creciendo_session_cancel((select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','00000000-0000-4000-8000-000000110421',repeat('4',64),repeat('5',64),'user_requested');
create temp table cancel_finalized as select * from public.finalize_creciendo_session_cancel((select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','00000000-0000-4000-8000-000000110421','cancelled_before_effect','none');
create temp table cancel_finalize_replay as select * from public.finalize_creciendo_session_cancel((select product_session_id from session_cancel),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','00000000-0000-4000-8000-000000110421','cancelled_before_effect','none');
set local role postgres;
select ok((select outcome='created' and finalize_required from cancel_accepted),'cancel ticket is accepted before Eve signaling');
select ok((select outcome='conflict' from cancel_pending_message),'pending cancellation blocks new guardian effects');
select ok((select outcome='idempotent_replay' and finalize_required from cancel_accept_replay),'cancel acceptance replay is effect-free');
select ok((select outcome='created' and cancellation_outcome='cancelled_before_effect' and effect_state='none' from cancel_finalized),'cancel finalization records truthful effect state');
select ok((select outcome='idempotent_replay' and cursor=(select cursor from cancel_finalized) from cancel_finalize_replay),'cancel finalization replay returns one cursor');
select ok((select count(*)=1 and min(event_type)='session-cancelled' and bool_and(terminal) from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_cancel)),'cancel creates exactly one terminal event');

update public.agent_sessions set channel_retained_from_sequence=2 where id=(select product_session_id from session_one);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table old_cursor_gap as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',(select cursor from append_one));
create temp table initial_cursor_gap as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1','creciendo.initial-cursor.v1');
create temp table read_before_floor as select * from public.read_owned_creciendo_events((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',0,128);
set local role postgres;
select ok((select outcome='retention_gap' and after_sequence=1 and first_available_sequence=2 from old_cursor_gap),'old cursor reports retention gap');
select ok((select outcome='retention_gap' and after_sequence=0 from initial_cursor_gap),'initial cursor reports advanced retention floor');
select is((select count(*) from read_before_floor),0::bigint,'read cannot bypass retention floor');
select throws_ok(format('update public.creciendo_channel_events set payload=''{"text":"changed"}'' where id=%L',(select event_id from append_one)),'42501',null,'event update is rejected');
select throws_ok(format('delete from public.creciendo_channel_events where id=%L',(select event_id from append_one)),'42501',null,'event delete is rejected');

update public.child_access set status='revoked',revoked_at=now()
where care_space_id='00000000-0000-0000-0000-000000110011' and child_id='00000000-0000-0000-0000-000000110021' and user_id='00000000-0000-0000-0000-000000110001';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000110001',true);
create temp table revoked_cursor as select * from public.resolve_owned_creciendo_cursor((select product_session_id from session_one),'00000000-0000-0000-0000-000000110011','00000000-0000-0000-0000-000000110021','m:1:a:1',(select cursor from append_terminal));
create temp table revoked_events as select count(*) visible from public.creciendo_channel_events where agent_session_id=(select product_session_id from session_one);
set local role postgres;
select is((select count(*) from revoked_cursor),0::bigint,'revocation blocks cursor resolution');
select is((select visible from revoked_events),0::bigint,'forced RLS hides prior events immediately after revocation');
select ok(not exists(select 1 from public.creciendo_channel_events where payload::text~*'(reasoning|chain_of_thought|system_prompt|tool_arguments|service_role|continuation_token)'),'durable projection contains no prohibited internal fields');
select ok(not exists(select 1 from public.creciendo_channel_events terminal join public.creciendo_channel_events later on later.agent_session_id=terminal.agent_session_id and later.sequence>terminal.sequence where terminal.terminal),'nothing persists after any terminal event');
select ok(not exists(select 1 from (select agent_session_id,sequence,lag(sequence) over(partition by agent_session_id order by sequence) prior from public.creciendo_channel_events) ordered where prior is not null and sequence<=prior),'all event sequences are strictly monotonic');

select * from finish();
rollback;
