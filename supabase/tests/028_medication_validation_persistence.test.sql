begin;
select plan(17);

select ok((select pg_get_constraintdef(oid) like '%within_reference_limits%' and pg_get_constraintdef(oid) like '%outside_reference_limits%' and pg_get_constraintdef(oid) like '%insufficient_data%' and pg_get_constraintdef(oid) like '%requires_professional_review%' from pg_constraint where conname = 'dose_validations_result_check'), 'validation has exactly the four public outcomes');
select ok((select pg_get_constraintdef(oid) not like '%rule_unavailable%' from pg_constraint where conname = 'dose_validations_result_check'), 'rule unavailable is not persisted as a public outcome');
select ok((select count(*) = 1 from pg_constraint where conname = 'dose_validations_scoped_request_unique'), 'validation request is child and actor scoped');
select ok((select count(*) = 1 from pg_constraint where conname = 'dose_validations_declared_input_check'), 'declared input rejects authority and recommendation keys');
select ok(to_regclass('public.dose_validation_ingredients') is not null, 'ingredient trace table exists');
select ok(to_regclass('public.dose_validation_sources') is not null, 'source trace table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.dose_validation_ingredients'::regclass), 'ingredient traces keep forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.dose_validation_sources'::regclass), 'source traces keep forced RLS');
select ok(not has_table_privilege('authenticated', 'public.dose_validation_ingredients', 'INSERT'), 'ingredient traces are not generic client writes');
select ok(not has_table_privilege('authenticated', 'public.dose_validation_sources', 'INSERT'), 'source traces are not generic client writes');
select ok((select count(*) = 1 from pg_trigger where tgname = 'dose_validations_immutable'), 'validation decisions are immutable');
select ok((select count(*) = 1 from pg_trigger where tgname = 'dose_validation_ingredients_immutable'), 'ingredient traces are immutable');
select ok((select count(*) = 1 from pg_trigger where tgname = 'dose_validation_sources_immutable'), 'source traces are immutable');
select ok((select count(*) = 1 from pg_constraint where conname = 'dose_validations_digest_check'), 'validation provenance digests are constrained');
select ok((select count(*) = 1 from pg_class where relname = 'dose_validations'), 'validation table remains durable');
select ok((select count(*) = 0 from public.dose_validations), 'Cloud baseline contains no fabricated validation decisions');
select ok(to_regprocedure('public.record_dose_validation(uuid,uuid,text,jsonb,text,text[],text,text,text,text,text,text,jsonb,jsonb)') is not null, 'validation persistence RPC signature exists');

select * from finish();
rollback;
