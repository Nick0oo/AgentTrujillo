begin;
select plan(15);

select ok(to_regprocedure('public.record_medication_intake(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,jsonb)') is not null, 'intake RPC signature exists');
select ok(to_regprocedure('public.supersede_medication_plan(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,jsonb)') is not null, 'supersession RPC signature exists');
select ok(to_regprocedure('public.record_medication_schedule_occurrences(uuid,uuid,uuid,integer,jsonb,text,text)') is not null, 'schedule occurrence RPC signature exists');
select ok(to_regprocedure('public.correct_medication_intake(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,jsonb)') is not null, 'correction RPC signature exists');
select ok((select count(*) = 1 from pg_constraint where conname = 'medication_intake_scoped_idempotent'), 'intake key includes child and actor scope');
select ok((select count(*) = 1 from pg_constraint where conname = 'medication_plan_scope_fk'), 'schedule plan relationship is composite scoped');
select ok((select count(*) = 1 from pg_constraint where conname = 'medication_intake_occurrence_scope_fk'), 'intake occurrence relationship is composite scoped');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.medication_schedule_occurrences'::regclass), 'occurrence RLS remains forced');
select ok(not has_table_privilege('authenticated', 'public.medication_schedule_occurrences', 'INSERT'), 'occurrence insert is RPC-only');
select ok(not has_table_privilege('authenticated', 'public.medication_intakes', 'UPDATE'), 'intake correction cannot be an in-place update');
select ok((select pg_get_constraintdef(oid) like '%unknown%' from pg_constraint where conname = 'medication_intakes_status_check'), 'unknown remains a factual intake state');
select ok((select count(*) = 1 from pg_constraint where conname = 'medication_intake_taken'), 'taken timestamp invariant remains constrained');
select ok((select count(*) = 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'record_medication_intake'), 'intake write is an explicit RPC');
select ok(not has_function_privilege('anon', 'public.record_medication_intake(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,jsonb)', 'execute'), 'anonymous intake write is denied');
select ok((select count(*) = 1 from pg_trigger where tgname = 'medication_intakes_immutable'), 'intake history is append-only');

select * from finish();
rollback;
