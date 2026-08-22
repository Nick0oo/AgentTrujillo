begin;

do $$
declare
  co_rules integer;
  us_rules integer;
  active_releases integer;
  conveyed_approvals integer;
begin
  select count(*) into co_rules
  from public.immunization_rules
  where schedule_id = '60000000-0000-4000-8000-000000009011';
  if co_rules <> 49 then
    raise exception 'expected 49 CO basic rules, found %', co_rules;
  end if;

  select count(*) into us_rules
  from public.immunization_rules
  where schedule_id = '60000000-0000-4000-8000-000000009012';
  if us_rules <> 6 then
    raise exception 'expected 6 US basic rules, found %', us_rules;
  end if;

  if exists (
    select 1 from public.immunization_rules
    where schedule_id in (
      '60000000-0000-4000-8000-000000009011',
      '60000000-0000-4000-8000-000000009012'
    )
    and rule_kind <> 'routine'
    and not contraindication_review_required
  ) then
    raise exception 'non-routine package rule escaped professional review';
  end if;

  if exists (
    select 1 from public.immunization_rules
    where schedule_id in (
      '60000000-0000-4000-8000-000000009011',
      '60000000-0000-4000-8000-000000009012'
    )
    and (rule_code is null or cardinality(source_reference_ids) = 0)
  ) then
    raise exception 'package rule is missing code or source provenance';
  end if;

  select count(*) into active_releases
  from public.clinical_package_releases
  where rule_pack_id in (
    '60000000-0000-4000-8000-000000009001',
    '60000000-0000-4000-8000-000000009002'
  ) and status = 'active' and action = 'release';
  if active_releases <> 2 then
    raise exception 'expected 2 active immunization releases, found %', active_releases;
  end if;

  select count(*) into conveyed_approvals
  from public.clinical_approvals
  where id in (
    '60000000-0000-4000-8000-000000009101',
    '60000000-0000-4000-8000-000000009201'
  )
  and decision = 'approved'
  and approval_provenance = 'product_owner_conveyed'
  and approver_subject is null
  and conveyance_record_sha256 = 'bd4050c1b6331bde351d3c41ee92e68b6409a9e546f1ec6f201f89913ca48b42';
  if conveyed_approvals <> 2 then
    raise exception 'expected 2 exact conveyed approvals, found %', conveyed_approvals;
  end if;

  if exists (
    select 1 from public.clinical_rule_packs
    where id in (
      '60000000-0000-4000-8000-000000009001',
      '60000000-0000-4000-8000-000000009002'
    ) and (status <> 'active' or artifact_uri is null or artifact_sha256 !~ '^[0-9a-f]{64}$')
  ) then
    raise exception 'active basic package is missing exact artifact identity';
  end if;

  if (
    select test_vector_sha256 from public.clinical_algorithms
    where id = '60000000-0000-4000-8000-000000009000'
  ) <> '74348feb9d6f08da6ef02300b6fa2496d1dd026a316c914dc6c5c4128f6f20ad' then
    raise exception 'immunization golden-vector digest mismatch';
  end if;
end;
$$;

rollback;
