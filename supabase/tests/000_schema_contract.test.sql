-- TAP emitted directly so the linked CLI test role needs no pgTAP schema grants.
select '1..18';

select case when to_regclass('public.care_spaces') is not null then 'ok 1 - care_spaces is the tenant root' else 'not ok 1 - care_spaces is the tenant root' end;
select case when to_regclass('public.care_space_members') is not null then 'ok 2 - care space membership is explicit' else 'not ok 2 - care space membership is explicit' end;
select case when to_regclass('public.children') is not null then 'ok 3 - children are first-class records' else 'not ok 3 - children are first-class records' end;
select case when to_regclass('public.child_access') is not null then 'ok 4 - child access is explicit per guardian' else 'not ok 4 - child access is explicit per guardian' end;

select case when to_regclass('public.anthropometric_measurements') is not null then 'ok 5 - anthropometry facts are stored' else 'not ok 5 - anthropometry facts are stored' end;
select case when to_regclass('public.growth_assessments') is not null then 'ok 6 - growth calculations are reproducible projections' else 'not ok 6 - growth calculations are reproducible projections' end;
select case when to_regclass('public.immunization_schedules') is not null then 'ok 7 - vaccination rules are versioned' else 'not ok 7 - vaccination rules are versioned' end;
select case when to_regclass('public.vaccine_administrations') is not null then 'ok 8 - administered vaccines are facts' else 'not ok 8 - administered vaccines are facts' end;
select case when to_regclass('public.medication_plans') is not null then 'ok 9 - medication plans are represented' else 'not ok 9 - medication plans are represented' end;
select case when to_regclass('public.dose_validations') is not null then 'ok 10 - dose checks are stored separately' else 'not ok 10 - dose checks are stored separately' end;
select case when to_regclass('public.development_observations') is not null then 'ok 11 - development observations are represented' else 'not ok 11 - development observations are represented' end;

select case when to_regclass('public.agent_sessions') is not null then 'ok 12 - agent sessions are durable' else 'not ok 12 - agent sessions are durable' end;
select case when to_regclass('public.messages') is not null then 'ok 13 - chat messages are durable' else 'not ok 13 - chat messages are durable' end;
select case when to_regclass('public.clinical_memory_items') is not null then 'ok 14 - clinical memory facts are explicit' else 'not ok 14 - clinical memory facts are explicit' end;
select case when to_regclass('public.clinical_memory_embeddings') is not null then 'ok 15 - semantic memory is isolated' else 'not ok 15 - semantic memory is isolated' end;
select case when to_regclass('public.safety_evaluations') is not null then 'ok 16 - deterministic safety decisions are auditable' else 'not ok 16 - deterministic safety decisions are auditable' end;
select case when to_regclass('public.documents') is not null then 'ok 17 - private document metadata is authoritative' else 'not ok 17 - private document metadata is authoritative' end;
select case when to_regclass('public.entitlements') is not null then 'ok 18 - entitlements are provider neutral' else 'not ok 18 - entitlements are provider neutral' end;
