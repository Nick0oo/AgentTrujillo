begin;
set local search_path = extensions, public, pg_catalog;
select plan(15);

select ok(to_regclass('app_private.document_transfer_tickets') is not null, 'transfer ledger is private');
select ok(to_regclass('public.document_transfer_tickets') is null, 'transfer ledger is not exposed in public schema');
select ok(not has_table_privilege('authenticated', 'app_private.document_transfer_tickets', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated cannot access the transfer ledger directly');
select ok(to_regprocedure('public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text)') is not null, 'document-only reservation RPC exists');
select ok(to_regprocedure('public.register_creciendo_document_transfer_ticket(text,uuid,uuid,uuid,text,text,timestamptz,bigint,text,text,text)') is not null, 'transfer-ticket registration RPC exists');
select ok(to_regprocedure('public.get_creciendo_upload_ticket(text)') is not null, 'upload-ticket lookup RPC exists');
select ok(to_regprocedure('public.finalize_creciendo_document_upload(text,bigint,text,text)') is not null, 'upload finalization RPC exists');
select ok(position('p_session_id' in pg_get_functiondef('public.reserve_document_object(uuid,uuid,uuid,text,timestamptz,text,text,text,bigint,text,text,text,text)'::regprocedure)) > 0, 'existing session-bound reservation remains unchanged');
select ok(has_function_privilege('authenticated', 'public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text)', 'EXECUTE'), 'authenticated can use the scoped reservation RPC');
select ok(has_function_privilege('authenticated', 'public.register_creciendo_document_transfer_ticket(text,uuid,uuid,uuid,text,text,timestamptz,bigint,text,text,text)', 'EXECUTE'), 'authenticated can use ticket registration');
select ok(has_function_privilege('authenticated', 'public.get_creciendo_upload_ticket(text)', 'EXECUTE'), 'authenticated can use upload-ticket lookup');
select ok(has_function_privilege('authenticated', 'public.finalize_creciendo_document_upload(text,bigint,text,text)', 'EXECUTE'), 'authenticated can use upload finalization');
select ok(not has_function_privilege('anon', 'public.reserve_creciendo_document_object(uuid,uuid,text,text,text,text,bigint,text,text,text,text)', 'EXECUTE'), 'anonymous reservation is denied');
select ok(not has_function_privilege('anon', 'public.register_creciendo_document_transfer_ticket(text,uuid,uuid,uuid,text,text,timestamptz,bigint,text,text,text)', 'EXECUTE'), 'anonymous ticket registration is denied');
select ok(exists (select 1 from pg_trigger where tgname = 'document_transfer_ticket_identity_immutable'), 'transfer ticket identity is immutable');

select * from finish();
rollback;
